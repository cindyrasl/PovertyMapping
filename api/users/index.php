<?php
// ============================================================
// api/users/index.php — Stub (user management removed from UI)
// Returns empty list to prevent frontend 500 errors
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

// Return empty user list — no longer used by admin UI
Response::success(['users' => [], 'total' => 0]);
