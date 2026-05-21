<?php
// ============================================================
// api/houses/index.php — Households CRUD (Adapted for new schema)
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    // ================================================================
    // LIST — untuk map markers
    // ================================================================
    case 'GET:list':
    case 'GET:': {
        requireAuth();
        $pdo = Database::get();
        $where = ['h.is_active = 1'];
        $params = [];

        if (!empty($_GET['poverty_status'])) {
            $allowed = ['terdata','rentan_miskin','miskin','sangat_miskin'];
            if (in_array($_GET['poverty_status'], $allowed, true)) {
                $where[] = 'h.poverty_status = ?';
                $params[] = $_GET['poverty_status'];
            }
        }
        if (!empty($_GET['aid_status'])) {
            if (in_array($_GET['aid_status'], ['not_yet','received'], true)) {
                $where[] = 'h.aid_status = ?';
                $params[] = $_GET['aid_status'];
            }
        }
        if (!empty($_GET['house_condition'])) {
            if (in_array($_GET['house_condition'], ['layak','tidak_layak'], true)) {
                $where[] = 'h.house_condition = ?';
                $params[] = $_GET['house_condition'];
            }
        }
        if (!empty($_GET['center_id'])) {
            $where[] = 'h.managing_center_id = ?';
            $params[] = (int)$_GET['center_id'];
        }
        if (!empty($_GET['q'])) {
            $where[] = '(h.head_name LIKE ? OR h.full_address LIKE ? OR h.head_nik LIKE ?)';
            $q = '%' . $_GET['q'] . '%';
            $params[] = $q; $params[] = $q; $params[] = $q;
        }

        $whereSQL = implode(' AND ', $where);
        $limit = min((int)($_GET['limit'] ?? PAGE_SIZE), PAGE_SIZE);
        $offset = max(0, (int)($_GET['offset'] ?? 0));

        $stmt = $pdo->prepare("
            SELECT 
                h.*,
                rc.name AS center_name,
                (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = h.id) AS member_count,
                (SELECT COUNT(*) FROM aid_history ah WHERE ah.household_id = h.id) AS aid_count
            FROM households h
            LEFT JOIN religious_centers rc ON rc.id = h.managing_center_id
            WHERE $whereSQL
            ORDER BY h.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM households h WHERE $whereSQL");
        $cntStmt->execute($params);
        $total = (int)$cntStmt->fetchColumn();

        foreach ($rows as &$r) {
            castHousehold($r);
        }
        unset($r);

        Response::success(['households' => $rows, 'total' => $total]);
        break;
    }

    // ================================================================
    // SHOW — detail with aid history and family members
    // ================================================================
    case 'GET:show': {
        requireAuth();
        if (!$id) Response::error('ID is required.', 400);

        $pdo = Database::get();
        $stmt = $pdo->prepare("
            SELECT 
                h.*,
                TIMESTAMPDIFF(YEAR, h.head_date_of_birth, CURDATE()) AS age,
                rc.name AS center_name,
                rc.worship_type AS center_type,
                rc.latitude AS center_lat,
                rc.longitude AS center_lng,
                rc.radius AS center_radius
            FROM households h
            LEFT JOIN religious_centers rc ON rc.id = h.managing_center_id
            WHERE h.id = ? AND h.is_active = 1
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) Response::notFound('Household not found.');

        castHousehold($row);

        // ⭐ FIX: Pastikan aid_history selalu diambil dengan lengkap
        $aidStmt = $pdo->prepare("
            SELECT 
                ah.*, 
                rc.name AS center_name,
                DATE_FORMAT(ah.aid_date, '%Y-%m-%d') AS aid_date_formatted
            FROM aid_history ah
            LEFT JOIN religious_centers rc ON rc.id = ah.center_id
            WHERE ah.household_id = ?
            ORDER BY ah.aid_date DESC
            LIMIT 20
        ");
        $aidStmt->execute([$id]);
        $aidHistory = $aidStmt->fetchAll();
        
        // ⭐ Pastikan format data bantuan konsisten
        foreach ($aidHistory as &$aid) {
            $aid['aid_type_label'] = match($aid['aid_type'] ?? '') {
                'sembako' => 'Sembako',
                'pendanaan' => 'Pendanaan',
                'pelatihan' => 'Pelatihan',
                'sembako_pendanaan' => 'Sembako + Pendanaan',
                'sembako_pelatihan' => 'Sembako + Pelatihan',
                'pendanaan_pelatihan' => 'Pendanaan + Pelatihan',
                'lengkap' => 'Lengkap (Semua)',
                default => $aid['aid_type'] ?? 'Bantuan'
            };
        }
        unset($aid);
        
        $row['aid_history'] = $aidHistory;

        // Family members
        $depStmt = $pdo->prepare("
            SELECT * FROM household_members 
            WHERE household_id = ? 
            ORDER BY id
        ");
        $depStmt->execute([$id]);
        $row['household_members'] = $depStmt->fetchAll();

        Response::success($row);
        break;
    }

    // ================================================================
    // CREATE
    // ================================================================
    case 'POST:create': {
        requireAuth();
        $data = Validator::json();

        $v = Validator::make($data, [
            'head_name' => 'required|string|maxlen:150',
            'head_nik' => 'required|string|maxlen:16',
            'full_address' => 'required|string',
            'latitude' => 'required|latitude',
            'longitude' => 'required|longitude',
            'house_condition' => 'in:layak,tidak_layak',
            'head_education' => 'in:tidak_sekolah,sd,smp,sma,diploma,sarjana,pascasarjana',
            'aid_status' => 'in:not_yet,received',
            'head_gender' => 'in:male,female',
            'head_date_of_birth' => 'date',
            'land_ownership' => 'in:milik,sewa,numpang,lainnya',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();

        $calc = PovertyCalculator::calculate(
            (int)($data['head_monthly_income'] ?? $data['income'] ?? 0),
            (int)($data['dependents'] ?? 1),
            $data['house_condition'] ?? 'layak',
            $data['head_education'] ?? 'sd',
            $data['land_ownership'] ?? 'milik'
        );

        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $stmt = $pdo->prepare("
            INSERT INTO households (
                rt, rw, kelurahan, kecamatan, full_address,
                latitude, longitude, house_condition, managing_center_id,
                head_name, head_nik, head_gender, head_date_of_birth, head_education,
                head_employment_status, head_job_name, head_institution_name, head_monthly_income,
                poverty_score, poverty_status, aid_status, notes
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ");
        $stmt->execute([
            $data['rt'] ?? null,
            $data['rw'] ?? null,
            $data['kelurahan'] ?? null,
            $data['kecamatan'] ?? null,
            $data['full_address'],
            (float)$data['latitude'],
            (float)$data['longitude'],
            $data['house_condition'] ?? 'layak',
            $managingId,
            $data['head_name'],
            $data['head_nik'],
            $data['head_gender'] ?? 'male',
            $data['head_date_of_birth'],
            $data['head_education'] ?? 'sd',
            $data['head_employment_status'] ?? 'unemployed',
            $data['head_job_name'] ?? null,
            $data['head_institution_name'] ?? null,
            (int)($data['head_monthly_income'] ?? $data['income'] ?? 0),
            $calc['score'] ?? 0,
            $calc['status'],
            $data['aid_status'] ?? 'not_yet',
            $data['notes'] ?? $data['description'] ?? null,
        ]);

        $newId = (int)$pdo->lastInsertId();

        // Save family members
        if (!empty($data['household_members']) && is_array($data['household_members'])) {
            saveMembers($pdo, $newId, $data['household_members']);
        }

        AuditLog::record('Tambah Rumah', 'households', $newId, null, $data);
        Response::created([
            'id' => $newId,
            'poverty_status' => $calc['status'],
            'poverty_label' => $calc['label'],
            'marker_color' => PovertyCalculator::markerColor($calc['status']),
            'managing_center_id' => $managingId,
        ], 'Rumah berhasil ditambahkan.');
        break;
    }

    // ================================================================
    // UPDATE
    // ================================================================
    case 'POST:update': {
        requireAuth();
        if (!$id) Response::error('ID is required.', 400);

        $data = Validator::json();
        $v = Validator::make($data, [
            'head_name' => 'required|string|maxlen:150',
            'head_nik' => 'required|string|maxlen:16',
            'full_address' => 'required|string',
            'latitude' => 'required|latitude',
            'longitude' => 'required|longitude',
            'house_condition' => 'in:layak,tidak_layak',
            'head_education' => 'in:tidak_sekolah,sd,smp,sma,diploma,sarjana,pascasarjana',
            'aid_status' => 'in:not_yet,received',
            'head_gender' => 'in:male,female',
            'head_date_of_birth' => 'date',
            'land_ownership' => 'in:milik,sewa,numpang,lainnya',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        $old = $pdo->prepare("SELECT * FROM households WHERE id = ? AND is_active = 1");
        $old->execute([$id]);
        $oldRow = $old->fetch();
        if (!$oldRow) Response::notFound('Household not found.');

        $calc = PovertyCalculator::calculate(
            (int)($data['head_monthly_income'] ?? $data['income'] ?? 0),
            (int)($data['dependents'] ?? 1),
            $data['house_condition'] ?? 'layak',
            $data['head_education'] ?? 'sd',
            $data['land_ownership'] ?? 'milik'
        );

        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $pdo->prepare("
            UPDATE households SET
                rt = ?, rw = ?, kelurahan = ?, kecamatan = ?, full_address = ?,
                latitude = ?, longitude = ?, house_condition = ?, managing_center_id = ?,
                head_name = ?, head_nik = ?, head_gender = ?, head_date_of_birth = ?, head_education = ?,
                head_employment_status = ?, head_job_name = ?, head_institution_name = ?, head_monthly_income = ?,
                poverty_score = ?, poverty_status = ?, aid_status = ?, notes = ?
            WHERE id = ? AND is_active = 1
        ")->execute([
            $data['rt'] ?? $oldRow['rt'],
            $data['rw'] ?? $oldRow['rw'],
            $data['kelurahan'] ?? $oldRow['kelurahan'],
            $data['kecamatan'] ?? $oldRow['kecamatan'],
            $data['full_address'],
            (float)$data['latitude'],
            (float)$data['longitude'],
            $data['house_condition'] ?? 'layak',
            $managingId,
            $data['head_name'],
            $data['head_nik'],
            $data['head_gender'] ?? 'male',
            $data['head_date_of_birth'],
            $data['head_education'] ?? 'sd',
            $data['head_employment_status'] ?? 'unemployed',
            $data['head_job_name'] ?? null,
            $data['head_institution_name'] ?? null,
            (int)($data['head_monthly_income'] ?? $data['income'] ?? 0),
            $calc['score'] ?? 0,
            $calc['status'],
            $data['aid_status'] ?? 'not_yet',
            $data['notes'] ?? $data['description'] ?? null,
            $id,
        ]);

        if (isset($data['household_members']) && is_array($data['household_members'])) {
            saveMembers($pdo, $id, $data['household_members']);
        }

        AuditLog::record('Update Rumah', 'households', $id, $oldRow, $data);
        Response::success([
            'id' => $id,
            'poverty_status' => $calc['status'],
            'poverty_label' => $calc['label'],
            'marker_color' => PovertyCalculator::markerColor($calc['status']),
            'managing_center_id' => $managingId,
        ], 'Data rumah diperbarui.');
        break;
    }

    // ================================================================
    // PATCH — untuk drag marker
    // ================================================================
    case 'POST:patch': {
        requireAuth();
        if (!$id) Response::error('ID is required.', 400);

        $data = Validator::json();
        Validator::make($data, [
            'latitude' => 'required|latitude',
            'longitude' => 'required|longitude',
        ])->validate_or_fail();

        $pdo = Database::get();
        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $pdo->prepare("
            UPDATE households SET
                latitude = ?,
                longitude = ?,
                full_address = COALESCE(NULLIF(?, ''), full_address),
                managing_center_id = ?
            WHERE id = ? AND is_active = 1
        ")->execute([
            (float)$data['latitude'],
            (float)$data['longitude'],
            !empty($data['full_address']) ? Validator::sanitizeString($data['full_address']) : null,
            $managingId,
            $id,
        ]);

        AuditLog::record('Pindah Posisi Rumah', 'households', $id, null, $data);
        Response::success(['managing_center_id' => $managingId], 'Posisi diperbarui.');
        break;
    }

    // ================================================================
    // DELETE (soft delete)
    // ================================================================
    case 'POST:delete': {
        requireAdmin();
        if (!$id) Response::error('ID is required.', 400);

        $pdo = Database::get();
        $old = $pdo->prepare("SELECT * FROM households WHERE id = ? AND is_active = 1");
        $old->execute([$id]);
        $oldRow = $old->fetch();
        if (!$oldRow) Response::notFound('Household not found.');

        $pdo->prepare("UPDATE households SET is_active = 0 WHERE id = ?")->execute([$id]);
        AuditLog::record('Hapus Rumah', 'households', $id, $oldRow);
        Response::success(null, 'Data rumah dihapus.');
        break;
    }

    default:
        Response::methodNotAllowed();
}

// ================================================================
// HELPERS
// ================================================================

function castHousehold(array &$r): void
{
    $r['latitude'] = (float)$r['latitude'];
    $r['longitude'] = (float)$r['longitude'];
    $r['age'] = isset($r['age']) ? (int)$r['age'] : null;
    $r['is_active'] = (bool)$r['is_active'];
    $r['marker_color'] = PovertyCalculator::markerColor($r['poverty_status'] ?? '');
    $r['poverty_label'] = PovertyCalculator::label($r['poverty_status'] ?? '');
    
    // Backward compatibility untuk frontend lama
    $r['address'] = $r['full_address'] ?? '';
    $r['nik'] = $r['head_nik'] ?? '';
    $r['head_name'] = $r['head_name'] ?? '';
    $r['head_nik'] = $r['head_nik'] ?? '';
    $r['head_education'] = $r['head_education'] ?? 'sd';
    $r['head_employment_status'] = $r['head_employment_status'] ?? 'unemployed';
    $r['head_job_name'] = $r['head_job_name'] ?? '';
    $r['head_monthly_income'] = (int)($r['head_monthly_income'] ?? 0);
    $r['house_condition'] = $r['house_condition'] ?? 'layak';
    $r['aid_status'] = $r['aid_status'] ?? 'not_yet';
    $r['notes'] = $r['notes'] ?? '';
    $r['dependents'] = (int)($r['family_members_count'] ?? 0) + 1;
    $r['income'] = $r['head_monthly_income'] ?? 0;
    $r['job'] = $r['head_job_name'] ?? '';
}

function resolveManagingCenter(\PDO $pdo, float $lat, float $lng): ?int
{
    $stmt = $pdo->prepare("
        SELECT sub.id FROM (
            SELECT 
                rc.id, 
                rc.radius,
                (6371000 * ACOS(
                    COS(RADIANS(:lat1)) * COS(RADIANS(rc.latitude)) *
                    COS(RADIANS(rc.longitude) - RADIANS(:lng)) +
                    SIN(RADIANS(:lat2)) * SIN(RADIANS(rc.latitude))
                )) AS distance_m,
                (SELECT COUNT(*) FROM households hh 
                 WHERE hh.managing_center_id = rc.id AND hh.is_active = 1) AS load_count
            FROM religious_centers rc 
            WHERE rc.is_active = 1
        ) sub
        WHERE sub.distance_m <= sub.radius
        ORDER BY sub.load_count ASC, sub.distance_m ASC
        LIMIT 1
    ");
    $stmt->execute([':lat1' => $lat, ':lng' => $lng, ':lat2' => $lat]);
    $row = $stmt->fetch();
    return $row ? (int)$row['id'] : null;
}

function saveMembers(\PDO $pdo, int $householdId, array $data): void
{
    try {
        // Delete existing members
        $pdo->prepare("DELETE FROM household_members WHERE household_id = ?")->execute([$householdId]);
        
        $stmt = $pdo->prepare("
            INSERT INTO household_members 
                (household_id, name, nik, gender, date_of_birth, education, 
                 relationship, employment_status, job_name, institution_name, monthly_income)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ");
        
        foreach ($data as $member) {
            $name = trim($member['name'] ?? '');
            if (!$name) continue;
            
            $stmt->execute([
                $householdId,
                $name,
                $member['nik'] ?? null,
                $member['gender'] ?? 'male',
                $member['date_of_birth'] ?? null,
                $member['education'] ?? 'sd',
                $member['relationship'] ?? 'lainnya',
                $member['employment_status'] ?? 'unemployed',
                $member['job_name'] ?? null,
                $member['institution_name'] ?? null,
                (int)($member['monthly_income'] ?? 0),
            ]);
        }
    } catch (\Throwable $e) {
        error_log('Save members error: ' . $e->getMessage());
    }
}