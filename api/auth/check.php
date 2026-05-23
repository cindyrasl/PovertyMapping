<?php
// ============================================================
// api/auth/check.php — Session check & login/logout
//
// GET  /api/auth/check.php              → check session
// POST /api/auth/check.php?action=login → login
// POST /api/auth/check.php?action=logout→ logout
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

session_name('webgis_sess');
session_start();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'check';

// ================================================================
// CHECK — return current session state
// ================================================================
if ($method === 'GET' || $action === 'check') {
    if (!empty($_SESSION['user_id']) && !empty($_SESSION['role'])) {
        Response::success([
            'logged_in' => true,
            'user_id'   => (int)$_SESSION['user_id'],
            'name'      => $_SESSION['name']  ?? '',
            'email'     => $_SESSION['email'] ?? '',
            'role'      => $_SESSION['role'],
        ]);
    } else {
        Response::success(['logged_in' => false]);
    }
}

// ================================================================
// LOGIN
// ================================================================
if ($method === 'POST' && $action === 'login') {
    $data = Validator::json();
    $v    = Validator::make($data, [
        'email'    => 'required|email',
        'password' => 'required',
    ]);
    $v->validate_or_fail();

    $pdo  = Database::get();
    $stmt = $pdo->prepare(
        'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1'
    );
    $stmt->execute([strtolower(trim($data['email']))]);
    $user = $stmt->fetch();

    if (!$user || !$user['is_active']) {
        AuditLog::record('auth.login_failed', 'users', null, null, ['email' => $data['email']]);
        Response::error('Email atau password salah.', 401);
    }

    if (!password_verify($data['password'], $user['password_hash'])) {
        AuditLog::record('auth.login_failed', 'users', null, null, ['email' => $data['email']]);
        Response::error('Email atau password salah.', 401);
    }

    // Regenerate session ID to prevent fixation
    session_regenerate_id(true);

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['name']    = $user['name'];
    $_SESSION['email']   = $user['email'];
    $_SESSION['role']    = $user['role'];

    // Update last_login_at
    try {
        $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')
            ->execute([$user['id']]);
    } catch (\Throwable) {}

    AuditLog::record('auth.login', 'users', (int)$user['id']);

    Response::success([
        'user_id' => (int)$user['id'],
        'name'    => $user['name'],
        'email'   => $user['email'],
        'role'    => $user['role'],
    ], 'Login berhasil.');
}

// ================================================================
// LOGOUT
// ================================================================
if ($method === 'POST' && $action === 'logout') {
    $userId = $_SESSION['user_id'] ?? null;
    AuditLog::record('auth.logout', 'users', $userId ? (int)$userId : null);
    $_SESSION = [];
    session_destroy();
    Response::success(null, 'Logout berhasil.');
}

Response::methodNotAllowed();