<?php
declare(strict_types=1);
require_once __DIR__ . '/config/bootstrap.php';

try {
    $pdo = Database::get();
    Response::success(['message' => 'API is working', 'db' => 'connected']);
} catch (Throwable $e) {
    Response::error($e->getMessage(), 500);
}