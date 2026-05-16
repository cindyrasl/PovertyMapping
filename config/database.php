<?php
// ============================================================
// config/database.php  — PDO singleton
// ============================================================
declare(strict_types=1);

require_once __DIR__ . '/config.php';

class Database
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
            );
            self::$instance = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        }
        return self::$instance;
    }

    /** Prevent cloning / serialisation */
    private function __clone() {}
    public function __wakeup(): never { throw new \Exception('Cannot unserialize singleton.'); }
}