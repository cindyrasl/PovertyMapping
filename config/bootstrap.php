<?php
// ============================================================
// config/bootstrap.php  — Single-admin simplified version
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

// ---- Global exception handler ------------------------------
set_exception_handler(function (Throwable $e) {
    $message = APP_DEBUG ? $e->getMessage() : 'Internal server error';
    $code = $e->getCode() ?: 500;
    Response::error($message, $code);
});

// ---- CORS & Headers ---------------------------------------
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if (APP_ENV === 'development') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---- Output buffering (prevents accidental output) --------
ob_start();