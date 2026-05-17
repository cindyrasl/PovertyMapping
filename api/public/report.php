<?php
// ============================================================
// api/public/report.php — Public report submission (no auth)
//
// POST /api/public/report.php               — submit report
// GET  /api/public/report.php?action=list   — list pending (for admin)
// POST /api/public/report.php?action=approve&id=N
// POST /api/public/report.php?action=reject&id=N
// POST /api/public/report.php?action=delete&id=N
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ($method === 'GET' ? 'list' : 'submit');
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    // ================================================================
    // SUBMIT — public-facing, no auth, rate limited
    // ================================================================
    case 'POST:submit':
    case 'POST:': {
        $ip   = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $pdo  = Database::get();

        // ---- Rate limiting: max 3 per hour per IP ------------------
        try {
            $rateStmt = $pdo->prepare("
                SELECT COUNT(*) FROM public_reports
                WHERE ip_address = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            ");
            $rateStmt->execute([$ip]);
            $recentCount = (int)$rateStmt->fetchColumn();

            if ($recentCount >= 3) {
                Response::error(
                    'Terlalu banyak laporan dari IP ini. Coba lagi dalam 1 jam.',
                    429
                );
            }
        } catch (\Throwable $e) {
            // Table may not exist yet — let through
        }

        // ---- Validate ----------------------------------------------
        $data = Validator::json();
        $v = Validator::make($data, [
            'head_name'   => 'required|string|maxlen:150',
            'address'     => 'required|string',
            'latitude'    => 'required|latitude',
            'longitude'   => 'required|longitude',
            'description' => 'required|string',
        ]);
        $v->validate_or_fail();

        // ---- Store -------------------------------------------------
        $stmt = $pdo->prepare("
            INSERT INTO public_reports
                (reporter_name, reporter_phone, head_name, address,
                 latitude, longitude, description, status, ip_address)
            VALUES (?,?,?,?,?,?,?,'pending',?)
        ");
        $stmt->execute([
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

    // ================================================================
    // LIST — for admin panel
    // ================================================================
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
            SELECT pr.*,
                h.head_name AS converted_head_name,
                h.id        AS converted_id
            FROM public_reports pr
            LEFT JOIN households h ON h.id = pr.converted_household_id
            WHERE $whereSQL
            ORDER BY
                FIELD(pr.status,'pending','approved','rejected'),
                pr.created_at DESC
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

    // ================================================================
    // APPROVE — convert to household
    // ================================================================
    case 'POST:approve': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo  = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM public_reports WHERE id=? AND status=?');
        $stmt->execute([$id, 'pending']);
        $report = $stmt->fetch();
        if (!$report) Response::error('Laporan tidak ditemukan atau sudah diproses.', 404);

        $data = Validator::json();  // optional admin notes + override values

        // Auto-calculate poverty with defaults
        $income    = (int)($data['income']          ?? 0);
        $dependents= (int)($data['dependents']      ?? 1);
        $condition = $data['house_condition']        ?? 'tidak_layak';
        $education = $data['education']              ?? 'sd';
        $landOwn   = $data['land_ownership']         ?? 'numpang';

        // Resolve managing center
        $managingId = null;
        $centerStmt = $pdo->prepare("
            SELECT rc.id,
                (6371000 * ACOS(
                    COS(RADIANS(?)) * COS(RADIANS(rc.latitude)) *
                    COS(RADIANS(rc.longitude) - RADIANS(?)) +
                    SIN(RADIANS(?)) * SIN(RADIANS(rc.latitude))
                )) AS distance_m
            FROM religious_centers rc
            WHERE rc.is_active = 1
            HAVING distance_m <= rc.radius
            ORDER BY distance_m ASC LIMIT 1
        ");
        $centerStmt->execute([$report['latitude'], $report['longitude'], $report['latitude']]);
        $center = $centerStmt->fetch();
        if ($center) $managingId = (int)$center['id'];

        // Create household from report data
        $povertyCalc = calcPovertySimple($income, $dependents, $condition, $education, $landOwn);

        $insertStmt = $pdo->prepare("
            INSERT INTO households
                (head_name, address, latitude, longitude,
                 dependents, income, house_condition, land_ownership, education,
                 poverty_status, aid_status, managing_center_id, description)
            VALUES (?,?,?,?,?,?,?,?,?,?,'not_yet',?,?)
        ");
        $insertStmt->execute([
            Validator::sanitizeString($report['head_name']),
            Validator::sanitizeString($report['address']),
            (float)$report['latitude'],
            (float)$report['longitude'],
            $dependents,
            $income,
            $condition,
            $landOwn,
            $education,
            $povertyCalc,
            $managingId,
            Validator::sanitizeString(
                'Dari laporan publik #' . $id . '. ' . ($report['description'] ?? '')
            ),
        ]);

        $newHouseholdId = (int)$pdo->lastInsertId();

        // Update public report status
        $pdo->prepare("
            UPDATE public_reports
            SET status='approved', reviewed_at=NOW(),
                admin_notes=?, converted_household_id=?
            WHERE id=?
        ")->execute([
            !empty($data['admin_notes']) ? Validator::sanitizeString($data['admin_notes']) : null,
            $newHouseholdId,
            $id,
        ]);

        AuditLog::record('Setujui Laporan Publik', 'public_reports', $id, $report, ['household_id' => $newHouseholdId]);
        Response::success([
            'household_id'   => $newHouseholdId,
            'poverty_status' => $povertyCalc,
        ], 'Laporan disetujui. Rumah tangga baru telah ditambahkan ke peta.');
        break;
    }

    // ================================================================
    // REJECT
    // ================================================================
    case 'POST:reject': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo  = Database::get();
        $chk  = $pdo->prepare("SELECT id FROM public_reports WHERE id=? AND status='pending'");
        $chk->execute([$id]);
        if (!$chk->fetch()) Response::error('Laporan tidak ditemukan atau sudah diproses.', 404);

        $data = Validator::json();

        $pdo->prepare("
            UPDATE public_reports
            SET status='rejected', reviewed_at=NOW(), admin_notes=?
            WHERE id=?
        ")->execute([
            !empty($data['admin_notes']) ? Validator::sanitizeString($data['admin_notes']) : null,
            $id,
        ]);

        AuditLog::record('Tolak Laporan Publik', 'public_reports', $id);
        Response::success(null, 'Laporan ditolak.');
        break;
    }

    // ================================================================
    // DELETE
    // ================================================================
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

// Simple poverty classification for report approval defaults
function calcPovertySimple(int $income, int $dependents, string $condition, string $education, string $landOwn): string
{
    $pts = 0;
    $members   = max(1, $dependents);
    $perCapita = $income / $members;

    if ($perCapita < 400_000)    $pts += 3;
    elseif ($perCapita < 700_000) $pts += 2;
    elseif ($perCapita < 1_200_000) $pts += 1;

    if ($dependents >= 7) $pts += 3;
    elseif ($dependents >= 5) $pts += 2;
    elseif ($dependents >= 4) $pts += 1;

    if ($condition === 'tidak_layak') $pts += 3;

    $eduPts = ['tidak_sekolah'=>3,'sd'=>2,'smp'=>1];
    $pts   += $eduPts[$education] ?? 0;

    if ($landOwn === 'numpang') $pts += 2;
    elseif ($landOwn === 'sewa') $pts += 1;

    return match(true) {
        $pts >= 7 => 'sangat_miskin',
        $pts >= 4 => 'miskin',
        $pts >= 1 => 'rentan_miskin',
        default   => 'terdata',
    };
}
