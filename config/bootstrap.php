<?php
// ============================================================
// config/bootstrap.php — with session support
// ============================================================
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/../middleware/Response.php';
require_once __DIR__ . '/../middleware/Validator.php';
require_once __DIR__ . '/../models/AuditLog.php';
require_once __DIR__ . '/../models/PovertyCalculator.php';

// ---- Error handling ----------------------------------------
if (APP_DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

set_exception_handler(function (Throwable $e) {
    $message = APP_DEBUG ? $e->getMessage() : 'Internal server error';
    Response::error($message, 500);
});

// ---- CORS & Security Headers --------------------------------
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if (APP_ENV === 'development') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

ob_start();

// ---- Session bootstrap (shared by all APIs) -----------------
if (session_status() === PHP_SESSION_NONE) {
    session_name('webgis_sess');
    session_set_cookie_params([
        'lifetime' => 0,           // until browser closes
        'path'     => '/',
        'secure'   => false,       // set true if using HTTPS
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ---- Session helper functions --------------------------------

/** Return current logged-in user array or null */
function currentUser(): ?array
{
    if (empty($_SESSION['user_id']) || empty($_SESSION['role'])) {
        return null;
    }
    return [
        'id'    => (int)$_SESSION['user_id'],
        'name'  => $_SESSION['name']  ?? '',
        'email' => $_SESSION['email'] ?? '',
        'role'  => $_SESSION['role'],
    ];
}

/** Require authentication — returns user or sends 401 */
function requireAuth(): array
{
    $user = currentUser();
    if (!$user) {
        Response::error('Silakan login terlebih dahulu.', 401);
    }
    return $user;
}

/** Require admin role — returns user or sends 403 */
function requireAdmin(): array
{
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        Response::error('Akses ditolak. Hanya admin yang dapat melakukan tindakan ini.', 403);
    }
    return $user;
}