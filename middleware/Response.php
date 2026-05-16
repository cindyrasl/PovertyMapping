<?php
// ============================================================
// middleware/Response.php
// ============================================================
declare(strict_types=1);

class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        // Clear any output buffer first
        if (ob_get_level()) {
            ob_end_clean();
        }
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(mixed $data = null, string $message = 'OK', int $status = 200): never
    {
        self::json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    public static function created(mixed $data, string $message = 'Created'): never
    {
        self::success($data, $message, 201);
    }

    public static function error(string $message, int $status = 400, mixed $errors = null): never
    {
        $body = ['success' => false, 'message' => $message];
        if ($errors !== null) $body['errors'] = $errors;
        self::json($body, $status);
    }

    public static function notFound(string $message = 'Resource not found'): never
    {
        self::error($message, 404);
    }

    public static function methodNotAllowed(): never
    {
        self::error('Method not allowed', 405);
    }
}