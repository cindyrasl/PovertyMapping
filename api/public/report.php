<?php
// ============================================================
// api/public/report.php — Public report submission & admin mgmt
// FIX: approve uses subquery for HAVING (MariaDB 10.4 compat)
//      INSERT column list matches real households schema
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ($method === 'GET' ? 'list' : 'submit');
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    case 'POST:submit':
    case 'POST:': {
        $ip  = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $pdo = Database::get();

        try {
            $rateStmt = $pdo->prepare("
                SELECT COUNT(*) FROM public_reports
                WHERE ip_address = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            ");
            $rateStmt->execute([$ip]);
            if ((int)$rateStmt->fetchColumn() >= 3) {
                Response::error('Terlalu banyak laporan dari IP ini. Coba lagi dalam 1 jam.', 429);
            }
        } catch (\Throwable) {}

        $data = Validator::json();
        Validator::make($data, [
            'head_name'   => 'required|string|maxlen:150',
            'address'     => 'required|string',
            'latitude'    => 'required|latitude',
            'longitude'   => 'required|longitude',
            'description' => 'required|string',
        ])->validate_or_fail();

        $pdo->prepare("
            INSERT INTO public_reports
                (reporter_name, reporter_phone, head_name, address,
                 latitude, longitude, description, status, ip_address)
            VALUES (?,?,?,?,?,?,?,'pending',?)
        ")->execute([
            !empty($data['reporter_name'])  ? Validator::sanitizeString($data['reporter_name'])  : null,
            !empty($data['reporter_phone']) ? Validator::sanitizeString($data['reporter_phone']) : null,
            Validator::sanitizeString($data['head_name']),
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            Validator::sanitizeString($data['description']),
            $ip,
        ]);

        $newId = (int)$pdo->lastInsertId();
        AuditLog::record('Laporan Publik Masuk', 'public_reports', $newId, null, $data);
        Response::created(['id' => $newId], 'Laporan berhasil dikirim. Terima kasih atas informasinya.');
        break;
    }

    case 'GET:list': {
        $pdo    = Database::get();
        $where  = ['1=1'];
        $params = [];

        if (!empty($_GET['status'])) {
            if (in_array($_GET['status'], ['pending','approved','rejected'], true)) {
                $where[]  = 'status = ?';
                $params[] = $_GET['status'];
            }
        }

        $whereSQL = implode(' AND ', $where);
        $limit    = min((int)($_GET['limit'] ?? 100), 500);
        $offset   = max(0, (int)($_GET['offset'] ?? 0));

        $stmt = $pdo->prepare("
            SELECT pr.*, h.id AS converted_id
            FROM public_reports pr
            LEFT JOIN households h ON h.id = pr.converted_household_id
            WHERE $whereSQL
            ORDER BY FIELD(pr.status,'pending','approved','rejected'), pr.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM public_reports WHERE $whereSQL");
        $cntStmt->execute($params);

        foreach ($rows as &$r) {
            $r['latitude']  = (float)$r['latitude'];
            $r['longitude'] = (float)$r['longitude'];
        }
        unset($r);

        Response::success(['reports' => $rows, 'total' => (int)$cntStmt->fetchColumn()]);
        break;
    }

    case 'POST:approve': {
        $user = requireAuth();

        if (!$id) Response::error('ID is required.', 400);

        $pdo  = Database::get();
        $stmt = $pdo->prepare("SELECT * FROM public_reports WHERE id=? AND status='pending'");
        $stmt->execute([$id]);
        $report = $stmt->fetch();
        if (!$report) Response::error('Laporan tidak ditemukan atau sudah diproses.', 404);

        $data      = Validator::json();
        $income    = (int)($data['income']     ?? 0);
        $dependents= (int)($data['dependents'] ?? 1);
        $condition = $data['house_condition']   ?? 'tidak_layak';
        $education = $data['education']         ?? 'sd';
        $landOwn   = $data['land_ownership']    ?? 'numpang';

        // Resolve center — FIX: subquery avoids MariaDB HAVING-alias bug
        $managingId = null;
        $cStmt = $pdo->prepare("
            SELECT sub.id FROM (
                SELECT rc.id, rc.radius,
                    (6371000 * ACOS(
                        COS(RADIANS(:lat1)) * COS(RADIANS(rc.latitude)) *
                        COS(RADIANS(rc.longitude) - RADIANS(:lng)) +
                        SIN(RADIANS(:lat2)) * SIN(RADIANS(rc.latitude))
                    )) AS dist
                FROM religious_centers rc WHERE rc.is_active = 1
            ) sub
            WHERE sub.dist <= sub.radius
            ORDER BY sub.dist ASC LIMIT 1
        ");
        $cStmt->execute([
            ':lat1' => (float)$report['latitude'],
            ':lng'  => (float)$report['longitude'],
            ':lat2' => (float)$report['latitude'],
        ]);
        $cRow = $cStmt->fetch();
        if ($cRow) $managingId = (int)$cRow['id'];

        $povertyStatus = calcPoverty($income, $dependents, $condition, $education, $landOwn);

        // Compute a simple score integer to store in poverty_score column (schema: NOT NULL)
        $povertyScore = calcPovertyScore($income, $dependents, $condition, $education, $landOwn);

        // INSERT matches actual webgis5 households schema exactly
        $pdo->prepare("
            INSERT INTO households
                (head_name, nik, address, latitude, longitude,
                 dependents, income, house_condition, land_ownership, education,
                 poverty_score, poverty_status, aid_status, managing_center_id,
                 description, is_active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'not_yet',?,?,1)
        ")->execute([
            Validator::sanitizeString($report['head_name']),
            '',  // nik: public reports have no NIK; NOT NULL schema → empty string
            Validator::sanitizeString($report['address']),
            (float)$report['latitude'],
            (float)$report['longitude'],
            $dependents,
            $income,
            $condition,
            $landOwn,
            $education,
            $povertyScore,
            $povertyStatus,
            $managingId,
            Validator::sanitizeString('Dari laporan publik #' . $id . '. ' . ($report['description'] ?? '')),
        ]);

        $newHouseholdId = (int)$pdo->lastInsertId();

        $pdo->prepare("
            UPDATE public_reports
            SET status='approved', reviewed_at=NOW(), admin_notes=?, converted_household_id=?
            WHERE id=?
        ")->execute([
            !empty($data['admin_notes']) ? Validator::sanitizeString($data['admin_notes']) : null,
            $newHouseholdId,
            $id,
        ]);

        AuditLog::record('Setujui Laporan Publik', 'public_reports', $id, $report, ['household_id' => $newHouseholdId]);
        Response::success([
            'household_id'   => $newHouseholdId,
            'poverty_status' => $povertyStatus,
        ], 'Laporan disetujui. Rumah tangga baru telah ditambahkan ke peta.');
        break;
    }

    case 'POST:reject': {
        $user = requireAuth();
        
        if (!$id) Response::error('ID is required.', 400);
        $pdo = Database::get();
        $chk = $pdo->prepare("SELECT id FROM public_reports WHERE id=? AND status='pending'");
        $chk->execute([$id]);
        if (!$chk->fetch()) Response::error('Laporan tidak ditemukan atau sudah diproses.', 404);
        $data = Validator::json();
        $pdo->prepare("UPDATE public_reports SET status='rejected', reviewed_at=NOW(), admin_notes=? WHERE id=?")
            ->execute([
                !empty($data['admin_notes']) ? Validator::sanitizeString($data['admin_notes']) : null,
                $id,
            ]);
        AuditLog::record('Tolak Laporan Publik', 'public_reports', $id);
        Response::success(null, 'Laporan ditolak.');
        break;
    }

    case 'POST:delete': {
        if (!$id) Response::error('ID is required.', 400);
        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM public_reports WHERE id=?');
        $old->execute([$id]);
        $row = $old->fetch();
        if (!$row) Response::notFound('Laporan tidak ditemukan.');
        $pdo->prepare('DELETE FROM public_reports WHERE id=?')->execute([$id]);
        AuditLog::record('Hapus Laporan Publik', 'public_reports', $id, $row);
        Response::success(null, 'Laporan dihapus.');
        break;
    }

    default:
        Response::methodNotAllowed();
}

function calcPoverty(int $income, int $dep, string $cond, string $edu, string $land): string
{
    $pts  = 0;
    $pc   = $income / max(1, $dep);
    if ($pc < 400_000) $pts += 3; elseif ($pc < 700_000) $pts += 2; elseif ($pc < 1_200_000) $pts += 1;
    if ($dep >= 7) $pts += 3; elseif ($dep >= 5) $pts += 2; elseif ($dep >= 4) $pts += 1;
    if ($cond === 'tidak_layak') $pts += 3;
    $pts += ['tidak_sekolah' => 3, 'sd' => 2, 'smp' => 1][$edu] ?? 0;
    if ($land === 'numpang') $pts += 2; elseif ($land === 'sewa') $pts += 1;
    return match(true) { $pts >= 7 => 'sangat_miskin', $pts >= 4 => 'miskin', $pts >= 1 => 'rentan_miskin', default => 'terdata' };
}

/** Map indicator severity points to a 0-100 score for poverty_score column */
function calcPovertyScore(int $income, int $dep, string $cond, string $edu, string $land): int
{
    $pts  = 0;
    $pc   = $income / max(1, $dep);
    if ($pc < 400_000) $pts += 3; elseif ($pc < 700_000) $pts += 2; elseif ($pc < 1_200_000) $pts += 1;
    if ($dep >= 7) $pts += 3; elseif ($dep >= 5) $pts += 2; elseif ($dep >= 4) $pts += 1;
    if ($cond === 'tidak_layak') $pts += 3;
    $pts += ['tidak_sekolah' => 3, 'sd' => 2, 'smp' => 1][$edu] ?? 0;
    if ($land === 'numpang') $pts += 2; elseif ($land === 'sewa') $pts += 1;
    // Scale: max pts = 14, map to 0-100
    return (int)min(100, round(($pts / 14) * 100));
}
