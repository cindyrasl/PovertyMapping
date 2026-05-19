<?php
// ============================================================
// api/houses/index.php — Households CRUD
// FIX: resolveManagingCenter uses subquery, not HAVING alias
//      (MariaDB 10.4 doesn't support HAVING with computed alias)
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    // ================================================================
    // LIST
    // ================================================================
    case 'GET:list':
    case 'GET:': {
        $pdo    = Database::get();
        $where  = ['h.is_active = 1'];
        $params = [];

        if (!empty($_GET['poverty_status'])) {
            $allowed = ['terdata','rentan_miskin','miskin','sangat_miskin'];
            if (in_array($_GET['poverty_status'], $allowed, true)) {
                $where[]  = 'h.poverty_status = ?';
                $params[] = $_GET['poverty_status'];
            }
        }
        if (!empty($_GET['aid_status'])) {
            if (in_array($_GET['aid_status'], ['not_yet','received'], true)) {
                $where[]  = 'h.aid_status = ?';
                $params[] = $_GET['aid_status'];
            }
        }
        if (!empty($_GET['house_condition'])) {
            if (in_array($_GET['house_condition'], ['layak','tidak_layak'], true)) {
                $where[]  = 'h.house_condition = ?';
                $params[] = $_GET['house_condition'];
            }
        }
        if (!empty($_GET['center_id'])) {
            $where[]  = 'h.managing_center_id = ?';
            $params[] = (int)$_GET['center_id'];
        }
        if (!empty($_GET['q'])) {
            $where[]  = '(h.head_name LIKE ? OR h.address LIKE ? OR h.nik LIKE ?)';
            $q = '%' . $_GET['q'] . '%';
            $params[] = $q; $params[] = $q; $params[] = $q;
        }
        // Age-category filter (computed from date_of_birth)
        if (!empty($_GET['age_category'])) {
            $ageSql = ageCategoryFilter($_GET['age_category']);
            if ($ageSql) $where[] = $ageSql;
        }

        $whereSQL = implode(' AND ', $where);
        $limit    = min((int)($_GET['limit'] ?? PAGE_SIZE), PAGE_SIZE);
        $offset   = max(0, (int)($_GET['offset'] ?? 0));

        $stmt = $pdo->prepare("
            SELECT h.*,
                TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) AS age,
                rc.name         AS center_name,
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

        foreach ($rows as &$r) { castHousehold($r); }
        unset($r);

        Response::success(['households' => $rows, 'total' => (int)$cntStmt->fetchColumn()]);
        break;
    }

    // ================================================================
    // SHOW
    // ================================================================
    case 'GET:show': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo  = Database::get();
        $stmt = $pdo->prepare("
            SELECT h.*,
                TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) AS age,
                rc.name         AS center_name,
                rc.worship_type AS center_type,
                rc.latitude     AS center_lat,
                rc.longitude    AS center_lng,
                rc.radius       AS center_radius
            FROM households h
            LEFT JOIN religious_centers rc ON rc.id = h.managing_center_id
            WHERE h.id = ? AND h.is_active = 1
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) Response::notFound('Household not found.');

        castHousehold($row);

        // Aid history
        $aidStmt = $pdo->prepare("
            SELECT ah.*, rc.name AS center_name
            FROM aid_history ah
            LEFT JOIN religious_centers rc ON rc.id = ah.center_id
            WHERE ah.household_id = ?
            ORDER BY ah.aid_date DESC
            LIMIT 20
        ");
        $aidStmt->execute([$id]);
        $row['aid_history'] = $aidStmt->fetchAll();

        // Household members
        try {
            $depStmt = $pdo->prepare("SELECT * FROM household_members WHERE household_id = ? ORDER BY id");
            $depStmt->execute([$id]);
            $row['household_members'] = $depStmt->fetchAll();
        } catch (\Throwable) {
            $row['household_members'] = [];
        }

        Response::success($row);
        break;
    }

    // ================================================================
    // CREATE
    // ================================================================
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
            (int)($data['income']         ?? 0),
            (int)($data['dependents']     ?? 1),
            $data['house_condition']      ?? 'layak',
            $data['education']            ?? 'sd',
            $data['land_ownership']       ?? 'milik'
        );

        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $stmt = $pdo->prepare("
            INSERT INTO households
                (head_name, nik, date_of_birth, gender, education,
                 dependents, income, job, house_condition, land_ownership,
                 poverty_score, poverty_status, aid_status, managing_center_id,
                 address, latitude, longitude, description)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ");
        $stmt->execute([
            Validator::sanitizeString($data['head_name']),
            Validator::sanitizeString($data['nik']),
            !empty($data['date_of_birth']) ? $data['date_of_birth'] : null,
            $data['gender']          ?? 'male',
            $data['education']       ?? 'sd',
            (int)($data['dependents']?? 0),
            (int)($data['income']    ?? 0),
            !empty($data['job'])     ? Validator::sanitizeString($data['job']) : null,
            $data['house_condition'] ?? 'layak',
            $data['land_ownership']  ?? 'milik',
            $calc['score']  ?? 0,
            $calc['status'],
            $data['aid_status']      ?? 'not_yet',
            $managingId,
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            !empty($data['description']) ? Validator::sanitizeString($data['description']) : null,
        ]);

        $newId = (int)$pdo->lastInsertId();

        // Save members if provided
        if (!empty($data['household_members']) && is_array($data['household_members'])) {
            saveMembers($pdo, $newId, $data['household_members']);
        }

        AuditLog::record('Tambah Rumah', 'households', $newId, null, $data);
        Response::created([
            'id'             => $newId,
            'poverty_status' => $calc['status'],
            'poverty_label'  => $calc['label'],
            'marker_color'   => PovertyCalculator::markerColor($calc['status']),
            'managing_center_id' => $managingId,
        ], 'Rumah berhasil ditambahkan.');
        break;
    }

    // ================================================================
    // UPDATE
    // ================================================================
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
            (int)($data['income']         ?? 0),
            (int)($data['dependents']     ?? 1),
            $data['house_condition']      ?? 'layak',
            $data['education']            ?? 'sd',
            $data['land_ownership']       ?? 'milik'
        );

        $managingId = resolveManagingCenter($pdo, (float)$data['latitude'], (float)$data['longitude']);

        $pdo->prepare("
            UPDATE households SET
                head_name=?, nik=?, date_of_birth=?, gender=?, education=?,
                dependents=?, income=?, job=?, house_condition=?, land_ownership=?,
                poverty_score=?, poverty_status=?, aid_status=?, managing_center_id=?,
                address=?, latitude=?, longitude=?, description=?
            WHERE id=? AND is_active=1
        ")->execute([
            Validator::sanitizeString($data['head_name']),
            Validator::sanitizeString($data['nik']),
            !empty($data['date_of_birth']) ? $data['date_of_birth'] : null,
            $data['gender']          ?? 'male',
            $data['education']       ?? 'sd',
            (int)($data['dependents']?? 0),
            (int)($data['income']    ?? 0),
            !empty($data['job'])     ? Validator::sanitizeString($data['job']) : null,
            $data['house_condition'] ?? 'layak',
            $data['land_ownership']  ?? 'milik',
            $calc['score']  ?? 0,
            $calc['status'],
            $data['aid_status']      ?? 'not_yet',
            $managingId,
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            !empty($data['description']) ? Validator::sanitizeString($data['description']) : null,
            $id,
        ]);

        if (isset($data['household_members']) && is_array($data['household_members'])) {
            saveMembers($pdo, $id, $data['household_members']);
        }

        AuditLog::record('Update Rumah', 'households', $id, $oldRow, $data);
        Response::success([
            'id'             => $id,
            'poverty_status' => $calc['status'],
            'poverty_label'  => $calc['label'],
            'marker_color'   => PovertyCalculator::markerColor($calc['status']),
            'managing_center_id' => $managingId,
        ], 'Data rumah diperbarui.');
        break;
    }

    // ================================================================
    // PATCH — position only (map drag)
    // ================================================================
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

        AuditLog::record('Pindah Posisi Rumah', 'households', $id, null, $data);
        Response::success(['managing_center_id' => $managingId], 'Posisi diperbarui.');
        break;
    }

    // ================================================================
    // DELETE (soft)
    // ================================================================
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
// HELPERS
// ================================================================

/** Build SQL fragment for age category filter (no bind params needed) */
function ageCategoryFilter(string $cat): string
{
    return match($cat) {
        'anak'   => 'TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) < 12',
        'remaja' => 'TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) BETWEEN 12 AND 17',
        'pemuda' => 'TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) BETWEEN 18 AND 30',
        'dewasa' => 'TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) BETWEEN 31 AND 59',
        'lansia' => 'TIMESTAMPDIFF(YEAR, h.date_of_birth, CURDATE()) >= 60',
        default  => '',
    };
}

function castHousehold(array &$r): void
{
    $r['latitude']     = (float)$r['latitude'];
    $r['longitude']    = (float)$r['longitude'];
    $r['dependents']   = (int)$r['dependents'];
    $r['income']       = (int)$r['income'];
    $r['age']          = isset($r['age']) ? (int)$r['age'] : null;
    $r['is_active']    = (bool)$r['is_active'];
    $r['marker_color'] = PovertyCalculator::markerColor($r['poverty_status'] ?? '');
    $r['poverty_label']= PovertyCalculator::label($r['poverty_status']  ?? '');
}

/**
 * FIX: Use a subquery to compute distance so HAVING works correctly
 * in MariaDB 10.4 which doesn't allow HAVING to reference a SELECT alias
 * that wraps an aggregate-like expression.
 *
 * The correct pattern for MariaDB:
 *   SELECT * FROM (SELECT ..., expr AS distance_m FROM ...) sub WHERE distance_m <= radius
 *
 * When there are multiple centers whose radius covers the point,
 * pick the one with the fewest managed households (load-balance).
 */
function resolveManagingCenter(\PDO $pdo, float $lat, float $lng): ?int
{
    $stmt = $pdo->prepare("
        SELECT sub.id
        FROM (
            SELECT rc.id, rc.radius,
                (6371000 * ACOS(
                    COS(RADIANS(:lat1)) * COS(RADIANS(rc.latitude)) *
                    COS(RADIANS(rc.longitude) - RADIANS(:lng1)) +
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
    $stmt->execute([
        ':lat1' => $lat,
        ':lng1' => $lng,
        ':lat2' => $lat,
    ]);
    $row = $stmt->fetch();
    return $row ? (int)$row['id'] : null;
}

function saveMembers(\PDO $pdo, int $householdId, array $data): void
{
    try {
        $pdo->prepare('DELETE FROM household_members WHERE household_id=?')->execute([$householdId]);
        $stmt = $pdo->prepare("
            INSERT INTO household_members (household_id, name, nik, gender, date_of_birth, education)
            VALUES (?,?,?,?,?,?)
        ");
        foreach ($data as $dep) {
            $name = trim($dep['name'] ?? '');
            if (!$name) continue;
            $stmt->execute([
                $householdId,
                $name,
                !empty($dep['nik'])          ? $dep['nik']          : null,
                $dep['gender']               ?? 'male',
                !empty($dep['date_of_birth'])? $dep['date_of_birth']: null,
                $dep['education']            ?? 'sd',
            ]);
        }
    } catch (\Throwable) {
        // household_members may not exist — silently ignore
    }
}
