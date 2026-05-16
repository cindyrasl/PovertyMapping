<?php
// ============================================================
// models/AuditLog.php
// Simplified — no user_id
// ============================================================
declare(strict_types=1);

class AuditLog
{
    public static function record(
        string   $action,
        string   $tableName,
        ?int     $recordId  = null,
        ?array   $oldValues = null,
        ?array   $newValues = null,
    ): void {
        try {
            $pdo = Database::get();

            $pdo->prepare("
                INSERT INTO audit_logs
                    (action, table_name, record_id, old_values, new_values, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                $action,
                $tableName,
                $recordId,
                $oldValues ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null,
                $newValues ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null,
                $_SERVER['REMOTE_ADDR'] ?? '',
                $_SERVER['HTTP_USER_AGENT'] ?? '',
            ]);
        } catch (\Throwable) {
            // Audit log failure must never break the main request
        }
    }
}