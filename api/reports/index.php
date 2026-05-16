<?php
// ============================================================
// api/reports/index.php — Emergency Reports CRUD
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

switch ("$method:$action") {

    case 'GET:list':
    case 'GET:': {
        $pdo    = Database::get();
        $where  = ['1=1'];
        $params = [];

        if (!empty($_GET['status']))   { $where[] = 'er.status = ?';       $params[] = $_GET['status'];              }
        if (!empty($_GET['severity'])) { $where[] = 'er.severity = ?';     $params[] = $_GET['severity'];            }
        if (!empty($_GET['household_id'])) { $where[] = 'er.household_id = ?'; $params[] = (int)$_GET['household_id']; }
        if (!empty($_GET['type']))     { $where[] = 'er.type = ?';         $params[] = $_GET['type'];                }

        $whereSQL = implode(' AND ', $where);
        $limit    = min((int)($_GET['limit'] ?? 50), 200);
        $offset   = max(0, (int)($_GET['offset'] ?? 0));

        $stmt = $pdo->prepare("
            SELECT er.*, h.head_name, h.address, h.latitude, h.longitude, h.nik
            FROM emergency_reports er
            LEFT JOIN households h ON h.id = er.household_id
            WHERE $whereSQL
            ORDER BY FIELD(er.severity,'kritis','berat','sedang','ringan'),
                     FIELD(er.status,'open','in_progress','resolved','closed'),
                     er.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM emergency_reports er WHERE $whereSQL");
        $cntStmt->execute($params);

        foreach ($rows as &$r) { $r['severity_color'] = severityColor($r['severity']); }
        unset($r);

        Response::success(['reports' => $rows, 'total' => (int)$cntStmt->fetchColumn()]);
        break;
    }

    case 'GET:show': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo  = Database::get();
        $stmt = $pdo->prepare("
            SELECT er.*, h.head_name, h.address, h.latitude, h.longitude, h.nik,
                   h.poverty_status, h.dependents, h.income, h.house_condition
            FROM emergency_reports er
            LEFT JOIN households h ON h.id = er.household_id
            WHERE er.id = ?
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) Response::notFound('Report not found.');
        
        $row['severity_color'] = severityColor($row['severity']);
        Response::success($row);
        break;
    }

    case 'POST:create': {
        $data = Validator::json();
        $v = Validator::make($data, [
            'household_id' => 'required|integer',
            'type'         => 'required|in:sakit,kecelakaan,bencana,kehilangan_pekerjaan,kematian,lainnya',
            'severity'     => 'required|in:ringan,sedang,berat,kritis',
            'description'  => 'required|string',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        
        // Check if household exists and is active
        $hh = $pdo->prepare('SELECT id, head_name FROM households WHERE id=? AND is_active=1');
        $hh->execute([(int)$data['household_id']]);
        $household = $hh->fetch();
        if (!$household) Response::notFound('Household not found.');

        // Check for existing active report (not resolved or closed)
        $existing = $pdo->prepare("
            SELECT id, type, severity, status, created_at 
            FROM emergency_reports 
            WHERE household_id = ? AND status IN ('open', 'in_progress')
            ORDER BY created_at DESC LIMIT 1
        ");
        $existing->execute([(int)$data['household_id']]);
        $activeReport = $existing->fetch();
        
        if ($activeReport) {
            $typeLabels = [
                'sakit' => 'Sakit', 'kecelakaan' => 'Kecelakaan', 
                'bencana' => 'Bencana', 'kehilangan_pekerjaan' => 'Kehilangan Pekerjaan',
                'kematian' => 'Kematian', 'lainnya' => 'Lainnya'
            ];
            Response::error(
                'Rumah tangga ini sudah memiliki laporan darurat aktif: ' . 
                ($typeLabels[$activeReport['type']] ?? $activeReport['type']) . 
                ' (status: ' . $activeReport['status'] . '). ' .
                'Selesaikan laporan yang ada terlebih dahulu sebelum membuat laporan baru.',
                409
            );
        }

        $stmt = $pdo->prepare("
            INSERT INTO emergency_reports (household_id, type, severity, description, status)
            VALUES (?,?,?,?,'open')
        ");
        $stmt->execute([
            (int)$data['household_id'],
            $data['type'],
            $data['severity'],
            Validator::sanitizeString($data['description']),
        ]);

        $newId = (int)$pdo->lastInsertId();
        AuditLog::record('Tambah Laporan Darurat', 'emergency_reports', $newId, null, $data);
        Response::created(['id' => $newId], 'Laporan darurat berhasil dibuat.');
        break;
    }

    case 'POST:update': {
        if (!$id) Response::error('ID is required.', 400);

        $data = Validator::json();
        $v = Validator::make($data, [
            'status'   => 'required|in:open,in_progress,resolved,closed',
            'severity' => 'in:ringan,sedang,berat,kritis',
            'description' => 'string',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        
        // Get existing report
        $old = $pdo->prepare('SELECT * FROM emergency_reports WHERE id=?');
        $old->execute([$id]);
        $oldRow = $old->fetch();
        if (!$oldRow) Response::notFound('Report not found.');

        // Build update fields
        $fields = ['status = ?'];
        $params = [$data['status']];
        
        if (isset($data['severity']) && $data['severity'] !== '') {
            $fields[] = 'severity = ?';
            $params[] = $data['severity'];
        }
        
        if (isset($data['description']) && $data['description'] !== '') {
            $fields[] = 'description = ?';
            $params[] = Validator::sanitizeString($data['description']);
        }
        
        // If resolving, set resolved_at
        if (in_array($data['status'], ['resolved', 'closed']) && !$oldRow['resolved_at']) {
            $fields[] = 'resolved_at = NOW()';
        }
        
        $params[] = $id;
        
        $pdo->prepare("UPDATE emergency_reports SET " . implode(', ', $fields) . " WHERE id=?")
            ->execute($params);

        AuditLog::record('Update Laporan Darurat', 'emergency_reports', $id, $oldRow, $data);
        Response::success(['id' => $id], 'Laporan berhasil diperbarui.');
        break;
    }

    case 'POST:delete': {
        if (!$id) Response::error('ID is required.', 400);

        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM emergency_reports WHERE id=?');
        $old->execute([$id]);
        $row = $old->fetch();
        if (!$row) Response::notFound('Report not found.');

        $pdo->prepare('DELETE FROM emergency_reports WHERE id=?')->execute([$id]);
        AuditLog::record('Hapus Laporan Darurat', 'emergency_reports', $id, $row);
        Response::success(null, 'Laporan berhasil dihapus.');
        break;
    }

    default:
        Response::methodNotAllowed();
}

function severityColor(string $s): string
{
    return match($s) {
        'kritis' => '#d63230', 'berat' => '#f76707',
        'sedang' => '#f59e0b', 'ringan' => '#0b9e73',
        default  => '#9ba4b5',
    };
}