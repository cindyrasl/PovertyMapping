<?php
// ============================================================
// api/centers/index.php — Religious Centers CRUD (no auth)
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    case 'GET:list':
    case 'GET:': {
        $pdo = Database::get();
        $where  = ['rc.is_active = 1'];
        $params = [];

        if (!empty($_GET['type'])) {
            $allowed = ['masjid','gereja','klenteng','pura','vihara'];
            if (in_array($_GET['type'], $allowed, true)) {
                $where[]  = 'rc.worship_type = ?';
                $params[] = $_GET['type'];
            }
        }
        if (!empty($_GET['q'])) {
            $where[]  = '(rc.name LIKE ? OR rc.address LIKE ?)';
            $q = '%' . $_GET['q'] . '%';
            $params[] = $q; $params[] = $q;
        }

        $whereSQL = implode(' AND ', $where);

        $stmt = $pdo->prepare("
            SELECT rc.*,
                (SELECT COUNT(*) FROM households h
                    WHERE h.managing_center_id = rc.id AND h.is_active=1) AS household_count,
                (SELECT COUNT(*) FROM households h
                    WHERE h.managing_center_id = rc.id AND h.is_active=1
                    AND h.aid_status='not_yet') AS pending_aid_count
            FROM religious_centers rc
            WHERE $whereSQL
            ORDER BY rc.name
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$r) {
            $r['latitude']          = (float)$r['latitude'];
            $r['longitude']         = (float)$r['longitude'];
            $r['radius']            = (int)$r['radius'];
            $r['household_count']   = (int)$r['household_count'];
            $r['pending_aid_count'] = (int)$r['pending_aid_count'];
        }
        unset($r);

        Response::success(['centers' => $rows, 'total' => count($rows)]);
        break;
    }

    case 'GET:show': {
        if (!$id) Response::error('ID is required.', 400);
        $pdo  = Database::get();
        $stmt = $pdo->prepare("SELECT rc.* FROM religious_centers rc WHERE rc.id = ? AND rc.is_active = 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) Response::notFound('Religious center not found.');
        $row['latitude']  = (float)$row['latitude'];
        $row['longitude'] = (float)$row['longitude'];
        $row['radius']    = (int)$row['radius'];
        Response::success($row);
        break;
    }

    case 'GET:nearby': {
        $lat = (float)($_GET['lat'] ?? 0);
        $lng = (float)($_GET['lng'] ?? 0);
        $km  = min(50, (float)($_GET['km'] ?? 5));
        if ($lat === 0.0 && $lng === 0.0) Response::error('lat and lng are required.', 400);

        $pdo  = Database::get();
        $stmt = $pdo->prepare("
            SELECT rc.*,
                (6371 * ACOS(
                    COS(RADIANS(?)) * COS(RADIANS(rc.latitude)) *
                    COS(RADIANS(rc.longitude) - RADIANS(?)) +
                    SIN(RADIANS(?)) * SIN(RADIANS(rc.latitude))
                )) AS distance_km
            FROM religious_centers rc
            WHERE rc.is_active = 1
            HAVING distance_km <= ?
            ORDER BY distance_km LIMIT 10
        ");
        $stmt->execute([$lat, $lng, $lat, $km]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['latitude']    = (float)$r['latitude'];
            $r['longitude']   = (float)$r['longitude'];
            $r['distance_km'] = round((float)$r['distance_km'], 3);
        }
        unset($r);
        Response::success(['centers' => $rows]);
        break;
    }

    case 'GET:coverage': {
        if (!$id) Response::error('ID is required.', 400);
        $pdo    = Database::get();
        $center = $pdo->prepare('SELECT * FROM religious_centers WHERE id=? AND is_active=1');
        $center->execute([$id]);
        $c = $center->fetch();
        if (!$c) Response::notFound('Religious center not found.');

        // FIX: Use subquery for distance calc (MariaDB HAVING-alias compat)
        $stmt = $pdo->prepare("
            SELECT sub.*
            FROM (
                SELECT h.id, h.head_name, h.latitude, h.longitude,
                       h.poverty_status, h.aid_status, h.dependents,
                       (6371000 * ACOS(
                           COS(RADIANS(:lat1)) * COS(RADIANS(h.latitude)) *
                           COS(RADIANS(h.longitude) - RADIANS(:lng)) +
                           SIN(RADIANS(:lat2)) * SIN(RADIANS(h.latitude))
                       )) AS distance_m
                FROM households h
                WHERE h.is_active = 1
            ) sub
            WHERE sub.distance_m <= :radius
            ORDER BY sub.distance_m
        ");
        $stmt->execute([
            ':lat1'   => (float)$c['latitude'],
            ':lng'    => (float)$c['longitude'],
            ':lat2'   => (float)$c['latitude'],
            ':radius' => (float)$c['radius'],
        ]);
        $households = $stmt->fetchAll();

        foreach ($households as &$h) {
            $h['latitude']    = (float)$h['latitude'];
            $h['longitude']   = (float)$h['longitude'];
            $h['distance_m']  = round((float)$h['distance_m'], 1);
            $h['marker_color']= PovertyCalculator::markerColor($h['poverty_status']);
        }
        unset($h);

        Response::success(['center' => $c, 'households' => $households, 'count' => count($households)]);
        break;
    }

    case 'POST:create': {
        $data = Validator::json();
        $v = Validator::make($data, [
            'name'         => 'required|string|maxlen:200',
            'worship_type' => 'required|in:masjid,gereja,klenteng,pura,vihara',
            'address'      => 'required|string',
            'latitude'     => 'required|latitude',
            'longitude'    => 'required|longitude',
            'radius'       => 'integer|min:50|max:5000',
        ]);
        $v->validate_or_fail();

        $pdo  = Database::get();
        $stmt = $pdo->prepare("
            INSERT INTO religious_centers
                (name, worship_type, address, latitude, longitude, radius,
                 contact_person, contact_phone, notes)
            VALUES (?,?,?,?,?,?,?,?,?)
        ");
        $stmt->execute([
            Validator::sanitizeString($data['name']),
            $data['worship_type'],
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            (int)($data['radius'] ?? 300),
            !empty($data['contact_person']) ? Validator::sanitizeString($data['contact_person']) : null,
            !empty($data['contact_phone'])  ? Validator::sanitizeString($data['contact_phone'])  : null,
            !empty($data['notes'])          ? Validator::sanitizeString($data['notes'])          : null,
        ]);

        $newId = (int)$pdo->lastInsertId();
        AuditLog::record('Tambah Tempat Ibadah', 'religious_centers', $newId, null, $data);
        Response::created(['id' => $newId], 'Tempat ibadah berhasil ditambahkan.');
        break;
    }

    case 'POST:update': {
        if (!$id) Response::error('ID is required.', 400);

        $data = Validator::json();
        $v = Validator::make($data, [
            'name'         => 'required|string|maxlen:200',
            'worship_type' => 'required|in:masjid,gereja,klenteng,pura,vihara',
            'address'      => 'required|string',
            'latitude'     => 'required|latitude',
            'longitude'    => 'required|longitude',
            'radius'       => 'integer|min:50|max:5000',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM religious_centers WHERE id=? AND is_active=1');
        $old->execute([$id]);
        $oldRow = $old->fetch();
        if (!$oldRow) Response::notFound('Religious center not found.');

        $pdo->prepare("
            UPDATE religious_centers SET
                name=?, worship_type=?, address=?, latitude=?, longitude=?, radius=?,
                contact_person=?, contact_phone=?, notes=?
            WHERE id=?
        ")->execute([
            Validator::sanitizeString($data['name']),
            $data['worship_type'],
            Validator::sanitizeString($data['address']),
            (float)$data['latitude'],
            (float)$data['longitude'],
            (int)($data['radius'] ?? 300),
            !empty($data['contact_person']) ? Validator::sanitizeString($data['contact_person']) : null,
            !empty($data['contact_phone'])  ? Validator::sanitizeString($data['contact_phone'])  : null,
            !empty($data['notes'])          ? Validator::sanitizeString($data['notes'])          : null,
            $id,
        ]);

        AuditLog::record('Update Tempat Ibadah', 'religious_centers', $id, $oldRow, $data);
        Response::success(['id' => $id], 'Tempat ibadah diperbarui.');
        break;
    }

    case 'POST:patch': {
        if (!$id) Response::error('ID is required.', 400);
        $data   = Validator::json();
        $fields = [];
        $params = [];

        if (isset($data['radius'])) {
            Validator::make($data, ['radius' => 'required|integer|min:50|max:5000'])->validate_or_fail();
            $fields[] = 'radius = ?'; $params[] = (int)$data['radius'];
        }
        if (isset($data['latitude'], $data['longitude'])) {
            Validator::make($data, ['latitude'=>'required|latitude','longitude'=>'required|longitude'])->validate_or_fail();
            $fields[] = 'latitude = ?';  $params[] = (float)$data['latitude'];
            $fields[] = 'longitude = ?'; $params[] = (float)$data['longitude'];
            if (!empty($data['address'])) { $fields[] = 'address = ?'; $params[] = Validator::sanitizeString($data['address']); }
        }
        if (empty($fields)) Response::error('No patchable fields provided.', 400);

        $params[] = $id;
        Database::get()
            ->prepare('UPDATE religious_centers SET ' . implode(', ', $fields) . ' WHERE id=? AND is_active=1')
            ->execute($params);

        AuditLog::record('Geser/Resize Tempat Ibadah', 'religious_centers', $id, null, $data);
        Response::success(null, 'Center patched.');
        break;
    }

    case 'POST:delete': {
        if (!$id) Response::error('ID is required.', 400);
        $pdo  = Database::get();
        $stmt = $pdo->prepare('UPDATE religious_centers SET is_active=0 WHERE id=? AND is_active=1');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) Response::notFound('Religious center not found.');
        AuditLog::record('Hapus Tempat Ibadah', 'religious_centers', $id);
        Response::success(null, 'Tempat ibadah dihapus.');
        break;
    }

    default:
        Response::methodNotAllowed();
}
