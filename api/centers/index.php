<?php
// api/centers/index.php - FINAL VERSION
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

// sendJSON function removed in favor of Response::success and Response::error

try {
    switch ("$method:$action") {

        case 'GET:list':
        case 'GET:': {
            $pdo = Database::get();
            
            $where = ['rc.is_active = 1'];
            $params = [];

            if (!empty($_GET['type'])) {
                $allowed = ['masjid','gereja','klenteng','pura','vihara'];
                if (in_array($_GET['type'], $allowed, true)) {
                    $where[] = 'rc.worship_type = ?';
                    $params[] = $_GET['type'];
                }
            }
            if (!empty($_GET['q'])) {
                $where[] = '(rc.name LIKE ? OR rc.address LIKE ?)';
                $q = '%' . $_GET['q'] . '%';
                $params[] = $q; $params[] = $q;
            }

            $whereSQL = implode(' AND ', $where);
            
            // Query tanpa subquery yang bermasalah
            $stmt = $pdo->prepare("
                SELECT 
                    rc.id, rc.name, rc.worship_type, rc.address, 
                    rc.kelurahan, rc.kecamatan,
                    rc.latitude, rc.longitude, rc.radius, 
                    rc.contact_person, rc.contact_phone, rc.notes,
                    rc.is_active, rc.created_at, rc.updated_at
                FROM religious_centers rc 
                WHERE $whereSQL 
                ORDER BY rc.name
            ");
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            // Hitung household_count dan pending_aid_count secara terpisah
            foreach ($rows as &$r) {
                $r['latitude'] = (float)$r['latitude'];
                $r['longitude'] = (float)$r['longitude'];
                $r['radius'] = (int)$r['radius'];
                
                // Hitung jumlah rumah yang dikelola center ini
                $countStmt = $pdo->prepare("
                    SELECT COUNT(*) FROM households 
                    WHERE managing_center_id = ? AND is_active = 1
                ");
                $countStmt->execute([$r['id']]);
                $r['household_count'] = (int)$countStmt->fetchColumn();
                
                // Hitung jumlah rumah yang belum terima bantuan
                $pendingStmt = $pdo->prepare("
                    SELECT COUNT(*) FROM households 
                    WHERE managing_center_id = ? AND is_active = 1 AND aid_status = 'not_yet'
                ");
                $pendingStmt->execute([$r['id']]);
                $r['pending_aid_count'] = (int)$pendingStmt->fetchColumn();
            }
            unset($r);

            Response::success(['centers' => $rows, 'total' => count($rows)]);
            break;
        }

        case 'GET:show': {
            if (!$id) Response::error('ID required', 400);
            
            $pdo = Database::get();
            $stmt = $pdo->prepare("
                SELECT * FROM religious_centers 
                WHERE id = ? AND is_active = 1
            ");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            
            if (!$row) {
                Response::notFound('Not found');
            }
            
            $row['latitude'] = (float)$row['latitude'];
            $row['longitude'] = (float)$row['longitude'];
            $row['radius'] = (int)$row['radius'];
            
            Response::success($row);
            break;
        }

        case 'GET:nearby': {
            $lat = (float)($_GET['lat'] ?? 0);
            $lng = (float)($_GET['lng'] ?? 0);
            $km = min(50, (float)($_GET['km'] ?? 5));
            
            if ($lat === 0.0 && $lng === 0.0) {
                Response::error('lat and lng required', 400);
            }
            
            $pdo = Database::get();
            $stmt = $pdo->prepare("
                SELECT 
                    id, name, worship_type, address, 
                    latitude, longitude, radius,
                    (6371 * ACOS(
                        COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                        COS(RADIANS(longitude) - RADIANS(?)) +
                        SIN(RADIANS(?)) * SIN(RADIANS(latitude))
                    )) AS distance_km
                FROM religious_centers 
                WHERE is_active = 1 
                HAVING distance_km <= ? 
                ORDER BY distance_km 
                LIMIT 10
            ");
            $stmt->execute([$lat, $lng, $lat, $km]);
            $rows = $stmt->fetchAll();
            
            foreach ($rows as &$r) {
                $r['latitude'] = (float)$r['latitude'];
                $r['longitude'] = (float)$r['longitude'];
                $r['radius'] = (int)$r['radius'];
                $r['distance_km'] = round((float)$r['distance_km'], 3);
            }
            unset($r);
            
            Response::success(['centers' => $rows]);
            break;
        }

        case 'GET:coverage': {
            if (!$id) Response::error('ID required', 400);
            
            $pdo = Database::get();
            $center = $pdo->prepare("SELECT * FROM religious_centers WHERE id = ? AND is_active = 1");
            $center->execute([$id]);
            $c = $center->fetch();
            
            if (!$c) {
                Response::notFound('Center not found');
            }
            
            $stmt = $pdo->prepare("
                SELECT 
                    id, head_name, full_address, latitude, longitude,
                    poverty_status, aid_status
                FROM households 
                WHERE is_active = 1
            ");
            $stmt->execute();
            $allHouseholds = $stmt->fetchAll();
            
            $households = [];
            foreach ($allHouseholds as $h) {
                $distance = haversineDistance(
                    (float)$c['latitude'], (float)$c['longitude'],
                    (float)$h['latitude'], (float)$h['longitude']
                );
                if ($distance <= (float)$c['radius']) {
                    $h['distance_m'] = round($distance, 1);
                    $h['latitude'] = (float)$h['latitude'];
                    $h['longitude'] = (float)$h['longitude'];
                    $households[] = $h;
                }
            }
            
            usort($households, function($a, $b) {
                return $a['distance_m'] <=> $b['distance_m'];
            });
            
            Response::success([
                'center' => $c,
                'households' => $households,
                'count' => count($households)
            ]);
            break;
        }

        case 'POST:create': {
            requireAuth();
            $data = Validator::json();
            
            $pdo = Database::get();
            $stmt = $pdo->prepare("
                INSERT INTO religious_centers 
                    (name, worship_type, address, latitude, longitude, radius, 
                     contact_person, contact_phone, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['worship_type'] ?? 'masjid',
                $data['address'] ?? '',
                (float)($data['latitude'] ?? 0),
                (float)($data['longitude'] ?? 0),
                (int)($data['radius'] ?? 300),
                $data['contact_person'] ?? null,
                $data['contact_phone'] ?? null,
                $data['notes'] ?? null
            ]);
            
            $newId = (int)$pdo->lastInsertId();
            AuditLog::record('Tambah Tempat Ibadah', 'religious_centers', $newId, null, $data);
            Response::created(['id' => $newId], 'Center created');
            break;
        }

        case 'POST:update': {
            requireAuth();
            if (!$id) Response::error('ID required', 400);
            
            $data = Validator::json();
            
            $pdo = Database::get();
            $old = $pdo->prepare("SELECT * FROM religious_centers WHERE id = ? AND is_active = 1");
            $old->execute([$id]);
            $oldRow = $old->fetch();
            
            if (!$oldRow) {
                Response::notFound('Not found');
            }
            
            $stmt = $pdo->prepare("
                UPDATE religious_centers SET
                    name = ?, worship_type = ?, address = ?,
                    latitude = ?, longitude = ?, radius = ?,
                    contact_person = ?, contact_phone = ?, notes = ?
                WHERE id = ? AND is_active = 1
            ");
            $stmt->execute([
                $data['name'] ?? $oldRow['name'],
                $data['worship_type'] ?? $oldRow['worship_type'],
                $data['address'] ?? $oldRow['address'],
                (float)($data['latitude'] ?? $oldRow['latitude']),
                (float)($data['longitude'] ?? $oldRow['longitude']),
                (int)($data['radius'] ?? $oldRow['radius']),
                $data['contact_person'] ?? $oldRow['contact_person'],
                $data['contact_phone'] ?? $oldRow['contact_phone'],
                $data['notes'] ?? $oldRow['notes'],
                $id
            ]);
            
            AuditLog::record('Update Tempat Ibadah', 'religious_centers', $id, $oldRow, $data);
            Response::success(null, 'Updated');
            break;
        }

        case 'POST:patch': {
            requireAuth();
            if (!$id) Response::error('ID required', 400);
            
            $data = Validator::json();
            $fields = [];
            $params = [];
            
            if (isset($data['radius'])) {
                $fields[] = 'radius = ?';
                $params[] = (int)$data['radius'];
            }
            if (isset($data['latitude']) && isset($data['longitude'])) {
                $fields[] = 'latitude = ?';
                $params[] = (float)$data['latitude'];
                $fields[] = 'longitude = ?';
                $params[] = (float)$data['longitude'];
                if (isset($data['address'])) {
                    $fields[] = 'address = ?';
                    $params[] = $data['address'];
                }
            }
            
            if (empty($fields)) {
                Response::error('No fields to update', 400);
            }
            
            $params[] = $id;
            $sql = "UPDATE religious_centers SET " . implode(', ', $fields) . " WHERE id = ? AND is_active = 1";
            
            $pdo = Database::get();
            $pdo->prepare($sql)->execute($params);
            
            AuditLog::record('Geser/Resize Tempat Ibadah', 'religious_centers', $id, null, $data);
            Response::success(null, 'Patched');
            break;
        }

        case 'POST:delete': {
            requireAdmin();
            if (!$id) Response::error('ID required', 400);
            
            $pdo = Database::get();
            $old = $pdo->prepare("SELECT * FROM religious_centers WHERE id = ? AND is_active = 1");
            $old->execute([$id]);
            $oldRow = $old->fetch();
            
            if (!$oldRow) {
                Response::notFound('Not found');
            }
            
            $pdo->prepare("UPDATE religious_centers SET is_active = 0 WHERE id = ?")->execute([$id]);
            AuditLog::record('Hapus Tempat Ibadah', 'religious_centers', $id, $oldRow);
            Response::success(null, 'Deleted');
            break;
        }

        default:
            Response::methodNotAllowed();
    }
} catch (Exception $e) {
    $message = APP_DEBUG ? $e->getMessage() : 'Internal Server Error';
    Response::error($message, 500);
}

function haversineDistance($lat1, $lon1, $lat2, $lon2) {
    $R = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat/2) * sin($dLat/2) +
         cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
         sin($dLon/2) * sin($dLon/2);
    $c = 2 * atan2(sqrt($a), sqrt(1-$a));
    return $R * $c;
}