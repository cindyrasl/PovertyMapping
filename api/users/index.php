<?php
// ============================================================
// api/users/index.php — Simplified user management
// Single-admin version
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

        $where  = ['1=1'];
        $params = [];
        if (!empty($_GET['q'])) { $where[] = '(name LIKE ? OR email LIKE ?)'; $q = '%'.$_GET['q'].'%'; $params[] = $q; $params[] = $q; }

        $whereSQL = implode(' AND ', $where);
        $stmt = $pdo->prepare("
            SELECT id, name, email, last_login_at, created_at
            FROM users WHERE $whereSQL AND is_active=1 ORDER BY name
        ");
        $stmt->execute($params);
        Response::success(['users' => $stmt->fetchAll()]);
    }

    default:
        Response::methodNotAllowed();
}