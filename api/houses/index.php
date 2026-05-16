<?php
// ============================================================
// api/houses/index.php — Households CRUD
// ============================================================
declare(strict_types=1);

ob_start();

try {
    require_once __DIR__ . '/../../config/bootstrap.php';

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? 'list';
    $id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

    switch ("$method:$action") {

        // ============================================================
        // LIST
        // ============================================================
        case 'GET:list':
        case 'GET:': {
            $pdo    = Database::get();
            $where  = ['h.is_active = 1'];
            $params = [];

            if (!empty($_GET['poverty_status'])) {
                $allowed = ['tidak_miskin','hampir_miskin','miskin','sangat_miskin'];
                if (in_array($_GET['poverty_status'], $allowed, true)) {
                    $where[]  = 'h.poverty_status = ?';
                    $params[] = $_GET['poverty_status'];
                }
            }
            if (!empty($_GET['aid_status'])) {
                $where[]  = 'h.aid_status = ?';
                $params[] = $_GET['aid_status'];
            }
            if (!empty($_GET['center_id'])) {
                $where[]  = 'h.managing_center_id = ?';
                $params[] = (int)$_GET['center_id'];
            }
            if (!empty($_GET['condition'])) {
                $where[]  = 'h.house_condition = ?';
                $params[] = $_GET['condition'];
            }
            if (!empty($_GET['q'])) {
                $where[]  = '(h.head_name LIKE ? OR h.address LIKE ? OR h.nik LIKE ?)';
                $q = '%' . $_GET['q'] . '%';
                $params[] = $q; $params[] = $q; $params[] = $q;
            }

            $whereSQL = implode(' AND ', $where);
            $limit    = min((int)($_GET['limit'] ?? PAGE_SIZE), PAGE_SIZE);
            $offset   = max(0, (int)($_GET['offset'] ?? 0));

            $stmt = $pdo->prepare("
                SELECT h.*,
                    TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) AS age,
                    rc.name  AS center_name,
                    rc.worship_type AS center_type
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

            Response::success(['households' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset]);
            break;
        }

        // ============================================================
        // MARKERS (lightweight for map)
        // ============================================================
        case 'GET:markers': {
            $pdo    = Database::get();
            $where  = ['h.is_active = 1'];
            $params = [];

            if (!empty($_GET['poverty_status'])) {
                $allowed = ['tidak_miskin','hampir_miskin','miskin','sangat_miskin'];
                if (in_array($_GET['poverty_status'], $allowed, true)) {
                    $where[] = 'h.poverty_status = ?'; $params[] = $_GET['poverty_status'];
                }
            }
            if (!empty($_GET['aid_status'])) { 
                $where[] = 'h.aid_status = ?'; 
                $params[] = $_GET['aid_status']; 
            }

            $whereSQL = implode(' AND ', $where);
            $stmt = $pdo->prepare("
                SELECT h.id, h.head_name, h.latitude, h.longitude,
                       h.poverty_status, h.poverty_score, h.aid_status,
                       h.house_condition, h.managing_center_id
                FROM households h
                WHERE $whereSQL
                ORDER BY h.poverty_score DESC
                LIMIT " . PAGE_SIZE
            );
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            foreach ($rows as &$r) {
                $r['latitude']      = (float)$r['latitude'];
                $r['longitude']     = (float)$r['longitude'];
                $r['poverty_score'] = (int)$r['poverty_score'];
                $r['marker_color']  = PovertyCalculator::markerColor($r['poverty_status']);
                $r['poverty_label'] = PovertyCalculator::label($r['poverty_status']);
            }
            unset($r);

            Response::success(['markers' => $rows, 'total' => count($rows)]);
            break;
        }

        // ============================================================
        // SHOW (detail with aid history + dependents)
        // ============================================================
        case 'GET:show': {
            if (!$id) Response::error('ID is required.', 400);

            $pdo  = Database::get();
            $stmt = $pdo->prepare("
                SELECT h.*,
                    TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) AS age,
                    rc.name AS center_name,
                    rc.worship_type AS center_type
                FROM households h
                LEFT JOIN religious_centers rc ON rc.id = h.managing_center_id
                WHERE h.id = ? AND h.is_active = 1
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) Response::notFound('Household not found.');

            castHousehold($row);
            
            $row['dependents_data'] = !empty($row['dependents_data']) 
                ? json_decode($row['dependents_data'], true) 
                : [];

            $aidStmt = $pdo->prepare("
                SELECT ah.*, rc.name AS center_name
                FROM aid_history ah
                LEFT JOIN religious_centers rc ON rc.id = ah.center_id
                WHERE ah.household_id = ?
                ORDER BY ah.aid_date DESC LIMIT 10
            ");
            $aidStmt->execute([$id]);
            $row['aid_history'] = $aidStmt->fetchAll();

            Response::success($row);
            break;
        }

        // ============================================================
        // CREATE
        // ============================================================
        case 'POST:create': {
            $data = Validator::json();
            
            $v = Validator::make($data, [
                'head_name'      => 'required|string|maxlen:150',
                'address'        => 'required|string',
                'latitude'       => 'required|latitude',
                'longitude'      => 'required|longitude',
            ]);
            $v->validate_or_fail();

            $pdo = Database::get();

            $calc = PovertyCalculator::calculate(
                (int)($data['income']          ?? 0),
                (int)($data['dependents']      ?? 1),
                $data['house_condition']       ?? 'layak',
                $data['education']             ?? 'sd'
            );

            $managingId = resolveManagingCenter(
                $pdo,
                (float)$data['latitude'],
                (float)$data['longitude']
            );

            $nik = !empty($data['nik']) ? trim($data['nik']) : '0000000000000000';
            
            $dependentsData = !empty($data['dependents_data']) 
                ? json_encode($data['dependents_data'], JSON_UNESCAPED_UNICODE) 
                : null;

            $stmt = $pdo->prepare("
                INSERT INTO households
                    (head_name, nik, date_of_birth, gender, education,
                     dependents, dependents_data, income, job, house_condition, land_ownership,
                     poverty_score, poverty_status, aid_status, managing_center_id,
                     address, latitude, longitude, description)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ");
            $stmt->execute([
                Validator::sanitizeString($data['head_name']),
                $nik,
                !empty($data['date_of_birth']) ? $data['date_of_birth'] : null,
                $data['gender']              ?? 'male',
                $data['education']           ?? 'sd',
                (int)($data['dependents']    ?? 0),
                $dependentsData,
                (int)($data['income']        ?? 0),
                !empty($data['job'])         ? Validator::sanitizeString($data['job']) : null,
                $data['house_condition']     ?? 'layak',
                $data['land_ownership']      ?? 'milik',
                $calc['severity'] ?? 0,
                $calc['status'],
                $data['aid_status']          ?? 'not_yet',
                $managingId,
                Validator::sanitizeString($data['address']),
                (float)$data['latitude'],
                (float)$data['longitude'],
                !empty($data['description']) ? Validator::sanitizeString($data['description']) : null,
            ]);

            $newId = (int)$pdo->lastInsertId();
            AuditLog::record('Tambah Rumah', 'households', $newId, null, $data);
            Response::created([
                'id'             => $newId,
                'poverty_score' => $calc['severity'] ?? 0,
                'poverty_status' => $calc['status'],
            ], 'Rumah berhasil ditambahkan.');
            break;
        }

        // ============================================================
        // UPDATE
        // ============================================================
        case 'POST:update': {
            if (!$id) Response::error('ID is required.', 400);

            $data = Validator::json();
            $v = Validator::make($data, [
                'head_name'      => 'required|string|maxlen:150',
                'address'        => 'required|string',
                'latitude'       => 'required|latitude',
                'longitude'      => 'required|longitude',
            ]);
            $v->validate_or_fail();

            $pdo = Database::get();
            
            // Get old data for audit log
            $old = $pdo->prepare('SELECT * FROM households WHERE id=? AND is_active=1');
            $old->execute([$id]);
            $oldRow = $old->fetch();
            if (!$oldRow) Response::notFound('Household not found.');

            $calc = PovertyCalculator::calculate(
                (int)($data['income']          ?? 0),
                (int)($data['dependents']      ?? 1),
                $data['house_condition']       ?? 'layak',
                $data['education']             ?? 'sd'
            );

            $managingId = resolveManagingCenter(
                $pdo,
                (float)$data['latitude'],
                (float)$data['longitude']
            );

            $nik = !empty($data['nik']) ? trim($data['nik']) : $oldRow['nik'];
            
            $dependentsData = !empty($data['dependents_data']) 
                ? json_encode($data['dependents_data'], JSON_UNESCAPED_UNICODE) 
                : $oldRow['dependents_data'];

            $stmt = $pdo->prepare("
                UPDATE households SET
                    head_name=?, nik=?, date_of_birth=?, gender=?, education=?,
                    dependents=?, dependents_data=?, income=?, job=?, 
                    house_condition=?, land_ownership=?,
                    poverty_score=?, poverty_status=?, aid_status=?, 
                    managing_center_id=?,
                    address=?, latitude=?, longitude=?, description=?
                WHERE id=? AND is_active=1
            ");
            $stmt->execute([
                Validator::sanitizeString($data['head_name']),
                $nik,
                !empty($data['date_of_birth']) ? $data['date_of_birth'] : null,
                $data['gender']              ?? $oldRow['gender'],
                $data['education']           ?? $oldRow['education'],
                (int)($data['dependents']    ?? $oldRow['dependents']),
                $dependentsData,
                (int)($data['income']        ?? $oldRow['income']),
                !empty($data['job'])         ? Validator::sanitizeString($data['job']) : $oldRow['job'],
                $data['house_condition']     ?? $oldRow['house_condition'],
                $data['land_ownership']      ?? $oldRow['land_ownership'],
                $calc['severity'] ?? 0,
                $calc['status'],
                $data['aid_status']          ?? $oldRow['aid_status'],
                $managingId,
                Validator::sanitizeString($data['address']),
                (float)$data['latitude'],
                (float)$data['longitude'],
                !empty($data['description']) ? Validator::sanitizeString($data['description']) : $oldRow['description'],
                $id,
            ]);

            AuditLog::record('Update Rumah', 'households', $id, $oldRow, $data);
            Response::success([
                'id'             => $id,
                'poverty_score' => $calc['severity'] ?? 0,
                'poverty_status' => $calc['status'],
            ], 'Rumah berhasil diperbarui.');
            break;
        }

        // ============================================================
        // PATCH (position only — for drag)
        // ============================================================
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
                    latitude=?, longitude=?, address=COALESCE(NULLIF(?, ''), address), managing_center_id=?
                WHERE id=? AND is_active=1
            ")->execute([
                (float)$data['latitude'],
                (float)$data['longitude'],
                !empty($data['address']) ? Validator::sanitizeString($data['address']) : null,
                $managingId,
                $id,
            ]);

            AuditLog::record('Pindah Posisi Rumah', 'households', $id, null, $data);
            Response::success(['managing_center_id' => $managingId], 'Posisi berhasil diperbarui.');
            break;
        }

        // ============================================================
        // DELETE (soft delete)
        // ============================================================
        case 'POST:delete': {
            if (!$id) Response::error('ID is required.', 400);

            $pdo  = Database::get();
            
            // Get old data for audit log
            $old = $pdo->prepare('SELECT * FROM households WHERE id=? AND is_active=1');
            $old->execute([$id]);
            $oldRow = $old->fetch();
            if (!$oldRow) Response::notFound('Household not found.');

            $pdo->prepare('UPDATE households SET is_active=0 WHERE id=?')->execute([$id]);
            
            AuditLog::record('Hapus Rumah', 'households', $id, $oldRow);
            Response::success(null, 'Rumah berhasil dihapus.');
            break;
        }

        default:
            Response::methodNotAllowed();
    }

} catch (\PDOException $e) {
    ob_end_clean();
    Response::error('Database error: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    ob_end_clean();
    Response::error('Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine(), 500);
}

// ================================================================
// Helpers
// ================================================================

function castHousehold(array &$r): void
{
    $r['latitude']      = (float)$r['latitude'];
    $r['longitude']     = (float)$r['longitude'];
    $r['dependents']    = (int)$r['dependents'];
    $r['income']        = (int)$r['income'];
    $r['poverty_score'] = (int)$r['poverty_score'];
    $r['marker_color']  = PovertyCalculator::markerColor($r['poverty_status']);
    $r['poverty_label'] = PovertyCalculator::label($r['poverty_status']);
    $r['age']           = isset($r['age']) ? (int)$r['age'] : null;
}

function resolveManagingCenter(\PDO $pdo, float $lat, float $lng, ?int $explicit = null): ?int
{
    if ($explicit !== null) {
        $chk = $pdo->prepare('SELECT id FROM religious_centers WHERE id=? AND is_active=1');
        $chk->execute([$explicit]);
        if ($chk->fetch()) return $explicit;
    }

    $centers = $pdo->query("
        SELECT rc.id, rc.latitude, rc.longitude, rc.radius,
            (SELECT COUNT(*) FROM households hh WHERE hh.managing_center_id = rc.id AND hh.is_active=1) AS load_count
        FROM religious_centers rc
        WHERE rc.is_active = 1
        ORDER BY load_count ASC
    ")->fetchAll();

    $bestCenterId = null;
    $bestDistance = PHP_FLOAT_MAX;

    foreach ($centers as $center) {
        $distance = haversineDistance(
            $lat, $lng,
            (float)$center['latitude'], (float)$center['longitude']
        );
        
        if ($distance <= (float)$center['radius'] && $distance < $bestDistance) {
            $bestDistance = $distance;
            $bestCenterId = (int)$center['id'];
        }
    }

    return $bestCenterId;
}

function haversineDistance(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $earthRadius = 6371000;
    $lat1 = deg2rad($lat1);
    $lng1 = deg2rad($lng1);
    $lat2 = deg2rad($lat2);
    $lng2 = deg2rad($lng2);
    $deltaLat = $lat2 - $lat1;
    $deltaLng = $lng2 - $lng1;
    $a = sin($deltaLat / 2) * sin($deltaLat / 2) +
         cos($lat1) * cos($lat2) *
         sin($deltaLng / 2) * sin($deltaLng / 2);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $earthRadius * $c;
}