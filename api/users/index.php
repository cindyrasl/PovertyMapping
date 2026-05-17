<?php
// ============================================================
// api/users/index.php — Simplified (no auth, read-only list)
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$pdo  = Database::get();
$q    = $_GET['q'] ?? '';
$where  = ['is_active = 1'];
$params = [];

if ($q) {
    $where[]  = '(name LIKE ? OR email LIKE ?)';
    $l = '%' . $q . '%';
    $params[] = $l; $params[] = $l;
}

$stmt = $pdo->prepare("
    SELECT id, name, email, last_login_at, created_at
    FROM users WHERE " . implode(' AND ', $where) . " ORDER BY name
");
$stmt->execute($params);
Response::success(['users' => $stmt->fetchAll()]);
