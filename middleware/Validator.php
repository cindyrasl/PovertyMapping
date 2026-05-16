<?php
// ============================================================
// middleware/Validator.php
// ============================================================
declare(strict_types=1);

class Validator
{
    private array $errors = [];
    private array $data;

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public static function make(array $data, array $rules): self
    {
        $v = new self($data);
        $v->validate($rules);
        return $v;
    }

    private function validate(array $rules): void
    {
        foreach ($rules as $field => $ruleStr) {
            $parts = explode('|', $ruleStr);
            $value = $this->data[$field] ?? null;

            foreach ($parts as $rule) {
                [$ruleName, $ruleParam] = array_pad(explode(':', $rule, 2), 2, null);

                switch ($ruleName) {
                    case 'required':
                        if ($value === null || $value === '' || $value === []) {
                            $this->errors[$field][] = "Field '{$field}' is required.";
                        }
                        break;

                    case 'string':
                        if ($value !== null && !is_string($value)) {
                            $this->errors[$field][] = "'{$field}' must be a string.";
                        }
                        break;

                    case 'integer':
                        if ($value !== null && $value !== '' && filter_var($value, FILTER_VALIDATE_INT) === false) {
                            $this->errors[$field][] = "'{$field}' must be an integer.";
                        }
                        break;

                    case 'min':
                        if ($value !== null && is_numeric($value) && (float)$value < (float)$ruleParam) {
                            $this->errors[$field][] = "'{$field}' must be at least {$ruleParam}.";
                        }
                        break;

                    case 'max':
                        if ($value !== null && is_numeric($value) && (float)$value > (float)$ruleParam) {
                            $this->errors[$field][] = "'{$field}' must be at most {$ruleParam}.";
                        }
                        break;

                    case 'maxlen':
                        if ($value !== null && is_string($value) && mb_strlen($value) > (int)$ruleParam) {
                            $this->errors[$field][] = "'{$field}' must not exceed {$ruleParam} characters.";
                        }
                        break;

                    case 'in':
                        $allowed = explode(',', $ruleParam ?? '');
                        if ($value !== null && $value !== '' && !in_array((string)$value, $allowed, true)) {
                            $this->errors[$field][] = "'{$field}' must be one of: {$ruleParam}.";
                        }
                        break;

                    case 'email':
                        if ($value !== null && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                            $this->errors[$field][] = "'{$field}' must be a valid email address.";
                        }
                        break;

                    case 'latitude':
                        if ($value !== null && $value !== '' && (
                            !is_numeric($value) || (float)$value < -90 || (float)$value > 90
                        )) {
                            $this->errors[$field][] = "'{$field}' must be between -90 and 90.";
                        }
                        break;

                    case 'longitude':
                        if ($value !== null && $value !== '' && (
                            !is_numeric($value) || (float)$value < -180 || (float)$value > 180
                        )) {
                            $this->errors[$field][] = "'{$field}' must be between -180 and 180.";
                        }
                        break;

                    case 'date':
                        if ($value !== null && $value !== '') {
                            $d = \DateTime::createFromFormat('Y-m-d', $value);
                            if (!$d || $d->format('Y-m-d') !== $value) {
                                $this->errors[$field][] = "'{$field}' must be a valid date (YYYY-MM-DD).";
                            }
                        }
                        break;
                }
            }
        }
    }

    public function fails(): bool   { return !empty($this->errors); }
    public function passes(): bool  { return empty($this->errors); }
    public function errors(): array { return $this->errors; }

    public function validate_or_fail(): void
    {
        if ($this->fails()) {
            Response::error('Validation failed.', 422, $this->errors);
        }
    }

    public static function json(): array
    {
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw ?: '{}', true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            Response::error('Invalid JSON payload: ' . json_last_error_msg(), 400);
        }
        return is_array($data) ? $data : [];
    }

    public static function sanitizeString(?string $s): string
    {
        return trim(htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'));
    }
}