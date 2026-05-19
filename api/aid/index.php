<?php
// ============================================================
// api/aid/index.php — Aid History (no auth)
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

        if (!empty($_GET['household_id'])) { $where[] = 'ah.household_id = ?'; $params[] = (int)$_GET['household_id']; }
        if (!empty($_GET['center_id']))    { $where[] = 'ah.center_id = ?';    $params[] = (int)$_GET['center_id'];    }
        if (!empty($_GET['aid_type']))     { $where[] = 'ah.aid_type = ?';     $params[] = $_GET['aid_type'];           }
        if (!empty($_GET['from']))         { $where[] = 'ah.aid_date >= ?';    $params[] = $_GET['from'];               }
        if (!empty($_GET['to']))           { $where[] = 'ah.aid_date <= ?';    $params[] = $_GET['to'];                 }

        $whereSQL = implode(' AND ', $where);
        $limit  = min((int)($_GET['limit'] ?? 100), 500);
        $offset = max(0, (int)($_GET['offset'] ?? 0));

        $stmt = $pdo->prepare("
            SELECT ah.*, h.head_name, h.poverty_status, rc.name AS center_name
            FROM aid_history ah
            LEFT JOIN households h          ON h.id  = ah.household_id
            LEFT JOIN religious_centers rc  ON rc.id = ah.center_id
            WHERE $whereSQL
            ORDER BY ah.aid_date DESC, ah.created_at DESC
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);

        $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM aid_history ah WHERE $whereSQL");
        $cntStmt->execute($params);

        Response::success(['aid_history' => $stmt->fetchAll(), 'total' => (int)$cntStmt->fetchColumn()]);
        break;
    }

    case 'GET:show': {
        if (!$id) Response::error('ID is required.', 400);
        $pdo  = Database::get();
        $stmt = $pdo->prepare("
            SELECT ah.*, h.head_name, rc.name AS center_name
            FROM aid_history ah
            LEFT JOIN households h         ON h.id  = ah.household_id
            LEFT JOIN religious_centers rc ON rc.id = ah.center_id
            WHERE ah.id = ?
        ");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) Response::notFound('Aid record not found.');
        Response::success($row);
        break;
    }

    case 'POST:create': {
        $data = Validator::json();
        $v = Validator::make($data, [
            'household_id' => 'required|integer',
            'aid_type'     => 'required|in:sembako,pendanaan,pelatihan,sembako_pendanaan,sembako_pelatihan,pendanaan_pelatihan,lengkap',
            'aid_date'     => 'required|date',
            'amount'       => 'integer|min:0',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        $hh  = $pdo->prepare('SELECT id FROM households WHERE id=? AND is_active=1');
        $hh->execute([(int)$data['household_id']]);
        if (!$hh->fetch()) Response::notFound('Household not found.');

        $stmt = $pdo->prepare("
            INSERT INTO aid_history (household_id, center_id, aid_type, aid_date, amount, notes)
            VALUES (?,?,?,?,?,?)
        ");
        $stmt->execute([
            (int)$data['household_id'],
            !empty($data['center_id']) ? (int)$data['center_id'] : null,
            $data['aid_type'],
            $data['aid_date'],
            !empty($data['amount']) ? (int)$data['amount'] : null,
            !empty($data['notes'])  ? Validator::sanitizeString($data['notes']) : null,
        ]);

        $newId = (int)$pdo->lastInsertId();
        $pdo->prepare("UPDATE households SET aid_status='received' WHERE id=?")
            ->execute([(int)$data['household_id']]);

        AuditLog::record('Catat Bantuan', 'aid_history', $newId, null, $data);
        Response::created(['id' => $newId], 'Bantuan berhasil dicatat.');
        break;
    }

    case 'POST:update': {
        if (!$id) Response::error('ID is required.', 400);
        $data = Validator::json();
        $v = Validator::make($data, [
            'aid_type' => 'required|in:sembako,pendanaan,pelatihan,sembako_pendanaan,sembako_pelatihan,pendanaan_pelatihan,lengkap',
            'aid_date' => 'required|date',
            'amount'   => 'integer|min:0',
        ]);
        $v->validate_or_fail();

        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM aid_history WHERE id=?');
        $old->execute([$id]);
        $row = $old->fetch();
        if (!$row) Response::notFound('Aid record not found.');

        $pdo->prepare("UPDATE aid_history SET aid_type=?, aid_date=?, amount=?, notes=?, center_id=? WHERE id=?")
            ->execute([
                $data['aid_type'],
                $data['aid_date'],
                !empty($data['amount'])    ? (int)$data['amount']                         : null,
                !empty($data['notes'])     ? Validator::sanitizeString($data['notes'])     : null,
                !empty($data['center_id']) ? (int)$data['center_id']                      : null,
                $id,
            ]);

        AuditLog::record('Update Bantuan', 'aid_history', $id, $row, $data);
        Response::success(null, 'Bantuan diperbarui.');
        break;
    }

    case 'POST:delete': {
        if (!$id) Response::error('ID is required.', 400);
        $pdo = Database::get();
        $old = $pdo->prepare('SELECT * FROM aid_history WHERE id=?');
        $old->execute([$id]);
        $row = $old->fetch();
        if (!$row) Response::notFound('Aid record not found.');
        $pdo->prepare('DELETE FROM aid_history WHERE id=?')->execute([$id]);
        AuditLog::record('Hapus Bantuan', 'aid_history', $id, $row);
        Response::success(null, 'Bantuan dihapus.');
        break;
    }

    case 'GET:stats': {
        $pdo    = Database::get();
        $byType = $pdo->query("
            SELECT aid_type, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total_amount
            FROM aid_history GROUP BY aid_type ORDER BY cnt DESC
        ")->fetchAll();

        $monthly = $pdo->query("
            SELECT DATE_FORMAT(aid_date,'%Y-%m') AS month,
                   COUNT(*) AS distributions,
                   COALESCE(SUM(amount),0) AS total_amount
            FROM aid_history
            GROUP BY month ORDER BY month DESC LIMIT 12
        ")->fetchAll();

        $total = (int)$pdo->query("SELECT COUNT(DISTINCT household_id) FROM aid_history")->fetchColumn();
        $totalDist = (int)$pdo->query("SELECT COUNT(*) FROM aid_history")->fetchColumn();

        Response::success([
            'by_type' => $byType,
            'monthly' => array_reverse($monthly),
            'summary' => ['total_distributions' => $totalDist, 'total_households_aided' => $total],
        ]);
        break;
    }

    default:
        Response::methodNotAllowed();
}
