<?php
// api/houses/index.php
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    case 'GET:list':
    case 'GET:': {
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
            $where[] = '(h.head_name LIKE ? OR h.address LIKE ? OR h.nik LIKE ?)';
            $q = '%' . $_GET['q'] . '%';
            $params[] = $q; $params[] = $q; $params[] = $q;
        }

        $whereSQL = implode(' AND ', $where);
        $limit = min((int)($_GET['limit'] ?? PAGE_SIZE), PAGE_SIZE);
        $offset = max(0, (int)($_GET['offset'] ?? 0));

        $stmt = $pdo->prepare("
            SELECT h.*,
                TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) AS age,
                rc.name AS center_name,
                rc.worship_type AS center_type,
                rc.latitude AS center_lat,
                rc.longitude AS center_lng,
                rc.radius AS center_radius
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

    case 'GET:show': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo = Database::get();
        $stmt = $pdo->prepare("
            SELECT h.*,
                TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) AS age,
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

        // Ambil anggota keluarga dari tabel household_members
        $depStmt = $pdo->prepare("SELECT * FROM household_members WHERE household_id = ? ORDER BY id");
        $depStmt->execute([$id]);
        $row['household_members'] = $depStmt->fetchAll();

        // Aid history
        $aidStmt = $pdo->prepare("
            SELECT ah.*, rc.name AS center_name
            FROM aid_history ah
            LEFT JOIN religious_centers rc ON rc.id = ah.center_id
            WHERE ah.household_id = ?
            ORDER BY ah.aid_date DESC LIMIT 20
        ");
        $aidStmt->execute([$id]);
        $row['aid_history'] = $aidStmt->fetchAll();

        // Emergency reports
        $erStmt = $pdo->prepare("
            SELECT id, type, severity, status, description, created_at, resolved_at
            FROM emergency_reports
            WHERE household_id = ?
            ORDER BY created_at DESC LIMIT 5
        ");
        $erStmt->execute([$id]);
        $row['emergency_reports'] = $erStmt->fetchAll();

        Response::success($row);
        break;
    }

    case 'POST:create': {
        $data = Validator::json();
        $v = Validator::make($data, [
            'head_name'      => 'required|string|maxlen:150',
            'nik'            => 'required|string|maxlen:16',
            'address'        => 'required|string',
            'latitude'       => 'required|latitude',
            'longitude'      => 'required|longitude',
            'dependents'     => 'integer|min:0',
            'income'         => 'integer|min:0',
            'house_condition'=> 'in:layak,tidak_layak',
            'education'      => 'in:tidak_sekolah,sd,smp,sma,diploma,sarjana,pascasarjana',
            'aid_status'     => 'in:not_yet,received',
            'gender'         => 'in:male,female',
            'date_of_birth'  => 'date',
            'land_ownership' => 'in:milik,sewa,numpang,lainnya',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();

        $calc = PovertyCalculator::calculate(
            (int)($data['income'] ?? 0),
            (int)($data['dependents'] ?? 1),
            $data['house_condition'] ?? 'layak',
            $data['education'] ?? 'sd',
            $data['land_ownership'] ?? 'milik'
        );

        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $stmt = $pdo->prepare("
            INSERT INTO households
                (head_name, nik, date_of_birth, gender, education,
                 dependents, income, job, house_condition, land_ownership,
                 poverty_status, aid_status, managing_center_id,
                 address, latitude, longitude, description)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ");
        $stmt->execute([
            Validator::sanitizeString($data['head_name']),
            Validator::sanitizeString($data['nik']),
            !empty($data['date_of_birth']) ? $data['date_of_birth'] : null,
            $data['gender'] ?? 'male',
            $data['education'] ?? 'sd',
            (int)($data['dependents'] ?? 0),
            (int)($data['income'] ?? 0),
            !empty($data['job']) ? Validator::sanitizeString($data['job']) : null,
            $data['house_condition'] ?? 'layak',
            $data['land_ownership'] ?? 'milik',
            $calc['status'],
            $data['aid_status'] ?? 'not_yet',
            $managingId,
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            !empty($data['description']) ? Validator::sanitizeString($data['description']) : null,
        ]);

        $newId = (int)$pdo->lastInsertId();

        // Simpan anggota keluarga ke household_members
        if (!empty($data['household_members']) && is_array($data['household_members'])) {
            saveHouseholdMembers($pdo, $newId, $data['household_members']);
        }

        AuditLog::record('Tambah Rumah', 'households', $newId, null, $data);
        Response::created([
            'id'               => $newId,
            'poverty_status'   => $calc['status'],
            'poverty_label'    => $calc['label'],
            'marker_color'     => PovertyCalculator::markerColor($calc['status']),
            'managing_center_id' => $managingId,
        ], 'Rumah berhasil ditambahkan.');
        break;
    }

    case 'POST:update': {
        if (!$id) Response::error('ID is required.', 400);

        $data = Validator::json();
        $v = Validator::make($data, [
            'head_name'      => 'required|string|maxlen:150',
            'nik'            => 'required|string|maxlen:16',
            'address'        => 'required|string',
            'latitude'       => 'required|latitude',
            'longitude'      => 'required|longitude',
            'dependents'     => 'integer|min:0',
            'income'         => 'integer|min:0',
            'house_condition'=> 'in:layak,tidak_layak',
            'education'      => 'in:tidak_sekolah,sd,smp,sma,diploma,sarjana,pascasarjana',
            'aid_status'     => 'in:not_yet,received',
            'gender'         => 'in:male,female',
            'date_of_birth'  => 'date',
            'land_ownership' => 'in:milik,sewa,numpang,lainnya',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM households WHERE id=? AND is_active=1');
        $old->execute([$id]);
        $oldRow = $old->fetch();
        if (!$oldRow) Response::notFound('Household not found.');

        $calc = PovertyCalculator::calculate(
            (int)($data['income'] ?? 0),
            (int)($data['dependents'] ?? 1),
            $data['house_condition'] ?? 'layak',
            $data['education'] ?? 'sd',
            $data['land_ownership'] ?? 'milik'
        );

        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $pdo->prepare("
            UPDATE households SET
                head_name=?, nik=?, date_of_birth=?, gender=?, education=?,
                dependents=?, income=?, job=?, house_condition=?, land_ownership=?,
                poverty_status=?, aid_status=?, managing_center_id=?,
                address=?, latitude=?, longitude=?, description=?
            WHERE id=? AND is_active=1
        ")->execute([
            Validator::sanitizeString($data['head_name']),
            Validator::sanitizeString($data['nik']),
            !empty($data['date_of_birth']) ? $data['date_of_birth'] : null,
            $data['gender'] ?? 'male',
            $data['education'] ?? 'sd',
            (int)($data['dependents'] ?? 0),
            (int)($data['income'] ?? 0),
            !empty($data['job']) ? Validator::sanitizeString($data['job']) : null,
            $data['house_condition'] ?? 'layak',
            $data['land_ownership'] ?? 'milik',
            $calc['status'],
            $data['aid_status'] ?? 'not_yet',
            $managingId,
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            !empty($data['description']) ? Validator::sanitizeString($data['description']) : null,
            $id,
        ]);

        // Update anggota keluarga
        if (isset($data['household_members']) && is_array($data['household_members'])) {
            saveHouseholdMembers($pdo, $id, $data['household_members']);
        }

        AuditLog::record('Update Rumah', 'households', $id, $oldRow, $data);
        Response::success([
            'id'               => $id,
            'poverty_status'   => $calc['status'],
            'poverty_label'    => $calc['label'],
            'marker_color'     => PovertyCalculator::markerColor($calc['status']),
            'managing_center_id' => $managingId,
        ], 'Data rumah diperbarui.');
        break;
    }

    case 'POST:patch': {
        if (!$id) Response::error('ID is required.', 400);

        $data = Validator::json();
        $v = Validator::make($data, [
            'latitude'  => 'required|latitude',
            'longitude' => 'required|longitude',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $pdo->prepare("
            UPDATE households SET
                latitude=?, longitude=?,
                address=COALESCE(NULLIF(?,''), address),
                managing_center_id=?
            WHERE id=? AND is_active=1
        ")->execute([
            (float)$data['latitude'],
            (float)$data['longitude'],
            !empty($data['address']) ? Validator::sanitizeString($data['address']) : null,
            $managingId,
            $id,
        ]);

        AuditLog::record('Geser Posisi Rumah', 'households', $id, null, $data);
        Response::success(['managing_center_id' => $managingId], 'Posisi diperbarui.');
        break;
    }

    case 'POST:delete': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM households WHERE id=? AND is_active=1');
        $old->execute([$id]);
        $oldRow = $old->fetch();
        if (!$oldRow) Response::notFound('Household not found.');

        $pdo->prepare('UPDATE households SET is_active=0 WHERE id=?')->execute([$id]);
        AuditLog::record('Hapus Rumah', 'households', $id, $oldRow);
        Response::success(null, 'Data rumah dihapus.');
        break;
    }

    default:
        Response::methodNotAllowed();
}

// ================================================================
// Helper Functions
// ================================================================

function castHousehold(array &$r): void
{
    $r['latitude']     = (float)$r['latitude'];
    $r['longitude']    = (float)$r['longitude'];
    $r['dependents']   = (int)$r['dependents'];
    $r['income']       = (int)$r['income'];
    $r['age']          = isset($r['age']) ? (int)$r['age'] : null;
    $r['marker_color'] = PovertyCalculator::markerColor($r['poverty_status'] ?? '');
    $r['poverty_label'] = PovertyCalculator::label($r['poverty_status'] ?? '');
    $r['is_active']    = (bool)$r['is_active'];
}

function resolveManagingCenter(\PDO $pdo, float $lat, float $lng): ?int
{
    $stmt = $pdo->prepare("
        SELECT rc.id,
            (6371000 * ACOS(
                COS(RADIANS(?)) * COS(RADIANS(rc.latitude)) *
                COS(RADIANS(rc.longitude) - RADIANS(?)) +
                SIN(RADIANS(?)) * SIN(RADIANS(rc.latitude))
            )) AS distance_m,
            (SELECT COUNT(*) FROM households hh
                WHERE hh.managing_center_id = rc.id AND hh.is_active=1) AS load_count
        FROM religious_centers rc
        WHERE rc.is_active = 1
        HAVING distance_m <= radius 
        ORDER BY load_count ASC, distance_m ASC
        LIMIT 1
    ");
    $stmt->execute([$lat, $lng, $lat]);
    $row = $stmt->fetch();
    return $row ? (int)$row['id'] : null;
}

function saveHouseholdMembers(\PDO $pdo, int $householdId, array $members): void
{
    // Hapus semua anggota lama
    $pdo->prepare('DELETE FROM household_members WHERE household_id=?')->execute([$householdId]);
    
    $stmt = $pdo->prepare("
        INSERT INTO household_members (household_id, name, nik, gender, date_of_birth, education)
        VALUES (?,?,?,?,?,?)
    ");
    
    foreach ($members as $member) {
        $name = trim($member['name'] ?? '');
        if (!$name) continue;
        
        $stmt->execute([
            $householdId,
            $name,
            !empty($member['nik']) ? $member['nik'] : null,
            $member['gender'] ?? 'male',
            !empty($member['date_of_birth']) ? $member['date_of_birth'] : null,
            $member['education'] ?? 'sd',
        ]);
    }
}