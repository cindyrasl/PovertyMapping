<?php
/**
 * api/public/report.php
 * Public poverty reports — create (lapor.html) + admin CRUD.
 */

// Matikan semua error reporting ke output
error_reporting(0);
ini_set('display_errors', 0);

// Bersihkan buffer
while (ob_get_level()) ob_end_clean();
ob_start();

// Load bootstrap (sudah include requireAuth() dan requireAdmin())
if (!file_exists(__DIR__ . '/../../config/bootstrap.php')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Konfigurasi server tidak lengkap.']);
    exit;
}

require_once __DIR__ . '/../../config/bootstrap.php';

// Pastikan tidak ada output sebelum JSON
if (ob_get_length()) ob_clean();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

try {
    // POST tanpa action = create (dari lapor.html)
    if ($method === 'POST' && ($action === '' || $action === 'create')) {
        handleCreate();
    }
    // GET list
    elseif ($method === 'GET' && $action === 'list') {
        handleList();
    }
    // GET show
    elseif ($method === 'GET' && $action === 'show' && $id) {
        handleShow($id);
    }
    // POST approve (admin) - requireAdmin() dari bootstrap.php
    elseif ($method === 'POST' && $action === 'approve' && $id) {
        requireAdmin();
        handleApprove($id);
    }
    // POST reject (admin)
    elseif ($method === 'POST' && $action === 'reject' && $id) {
        requireAdmin();
        handleReject($id);
    }
    // POST delete (admin)
    elseif ($method === 'POST' && $action === 'delete' && $id) {
        requireAdmin();
        handleDelete($id);
    }
    elseif ($method === 'POST' && $action === 'delete_photo' && $id) {
        requireAuth(); // at minimum logged in
        handleDeletePhoto($id, 'public_reports', 'proof_photos',
            __DIR__ . '/../../uploads/reports/');
    }
    else {
        jsonError('Method or action not allowed', 405);
    }
} catch (PDOException $e) {
    error_log('[public/report.php] PDO: ' . $e->getMessage());
    jsonError('Terjadi kesalahan database. Silakan coba lagi.', 500);
} catch (Exception $e) {
    error_log('[public/report.php] ' . $e->getMessage());
    jsonError('Terjadi kesalahan server.', 500);
}

// ============================================================
// CREATE — public submission, all fields required
// ============================================================
function handleCreate(): void
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    
    if (!is_array($data)) {
        jsonError('Data tidak valid.', 400);
    }
    
    $errors = [];
    
    // Required fields
    $required = [
        'reporter_name' => 'Nama pelapor',
        'reporter_phone' => 'Nomor telepon',
        'head_name' => 'Nama kepala keluarga',
        'address' => 'Alamat',
        'kelurahan' => 'Kelurahan',
        'kecamatan' => 'Kecamatan',
        'description' => 'Deskripsi',
        'latitude' => 'Latitude',
        'longitude' => 'Longitude',
        'severity' => 'Tingkat urgensi'
    ];
    
    foreach ($required as $field => $label) {
        $value = trim($data[$field] ?? '');
        if ($value === '') {
            $errors[$field] = "$label wajib diisi.";
        }
    }
    
    // RT/RW juga required
    if (trim($data['rt'] ?? '') === '') {
        $errors['rt'] = 'RT wajib diisi.';
    }
    if (trim($data['rw'] ?? '') === '') {
        $errors['rw'] = 'RW wajib diisi.';
    }
    
    if (!empty($errors)) {
        $firstError = reset($errors);
        jsonError($firstError, 422, ['validation_errors' => $errors]);
    }
    
    // Phone validation
    $phone = preg_replace('/[\s\-\(\)\+]/', '', $data['reporter_phone']);
    if (!preg_match('/^\d{8,15}$/', $phone)) {
        jsonError('Nomor telepon tidak valid (8-15 digit).', 422);
    }
    
    // Description min 20 chars
    if (mb_strlen($data['description']) < 20) {
        jsonError('Deskripsi minimal 20 karakter.', 422);
    }
    
    // Coordinates
    $lat = (float)$data['latitude'];
    $lng = (float)$data['longitude'];
    if ($lat < -90 || $lat > 90 || $lat == 0) {
        jsonError('Latitude tidak valid.', 422);
    }
    if ($lng < -180 || $lng > 180 || $lng == 0) {
        jsonError('Longitude tidak valid.', 422);
    }
    
    // Severity validation
    $allowedSeverity = ['ringan', 'sedang', 'berat', 'kritis'];
    if (!in_array($data['severity'], $allowedSeverity)) {
        jsonError('Tingkat urgensi tidak valid.', 422);
    }
    // Photo requirement 
    $photoCount = (int)($data['proof_photo_count'] ?? -1);
    if ($photoCount === 0) {
        jsonError('Foto bukti wajib diunggah minimal 1 foto.', 422);
    }
    
    // Rate limit
    $pdo = Database::get();
    $ip = getClientIP();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM public_reports WHERE ip_address = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    $stmt->execute([$ip]);
    if ((int)$stmt->fetchColumn() >= 5) {
        jsonError('Terlalu banyak laporan. Coba lagi besok.', 429);
    }
    
    // Sanitize
    $sanitize = fn($s) => htmlspecialchars(strip_tags(trim($s)), ENT_QUOTES, 'UTF-8');
    
    // Insert
    $stmt = $pdo->prepare("
        INSERT INTO public_reports 
        (reporter_name, reporter_phone, rt, rw, head_name, address, kelurahan, kecamatan, 
         latitude, longitude, description, severity, urgent_need, status, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())
    ");
    
    $stmt->execute([
        $sanitize($data['reporter_name']),
        $sanitize($data['reporter_phone']),
        $sanitize($data['rt'] ?? ''),
        $sanitize($data['rw'] ?? ''),
        $sanitize($data['head_name']),
        $sanitize($data['address']),
        $sanitize($data['kelurahan']),
        $sanitize($data['kecamatan']),
        round($lat, 7),
        round($lng, 7),
        $sanitize($data['description']),
        $data['severity'],
        $sanitize($data['urgent_need'] ?? ''),
        $ip
    ]);
    
    $newId = (int)$pdo->lastInsertId();
    
    jsonSuccess(['id' => $newId], 'Laporan berhasil dikirim. Petugas akan segera memverifikasi.', 201);
}

// ============================================================
// LIST
// ============================================================
function handleList(): void
{
    $pdo = Database::get();
    $where = ['1=1'];
    $params = [];
    
    if (!empty($_GET['status'])) {
        $where[] = 'status = ?';
        $params[] = $_GET['status'];
    }
    
    $whereSQL = implode(' AND ', $where);
    $limit = min((int)($_GET['limit'] ?? 100), 500);
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    
    $stmt = $pdo->prepare("
        SELECT * FROM public_reports 
        WHERE $whereSQL 
        ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), created_at DESC 
        LIMIT $limit OFFSET $offset
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $cnt = $pdo->prepare("SELECT COUNT(*) FROM public_reports WHERE $whereSQL");
    $cnt->execute($params);
    
    jsonSuccess(['reports' => $rows, 'total' => (int)$cnt->fetchColumn()]);
}

// ============================================================
// SHOW
// ============================================================
function handleShow(int $id): void
{
    $pdo = Database::get();
    $stmt = $pdo->prepare("SELECT * FROM public_reports WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row) {
        jsonError('Laporan tidak ditemukan.', 404);
    }
    
    jsonSuccess($row);
}

// ============================================================
// APPROVE
// ============================================================
function handleApprove(int $id): void
{
    $pdo = Database::get();
    
    // Get report
    $stmt = $pdo->prepare("SELECT * FROM public_reports WHERE id = ? AND status = 'pending'");
    $stmt->execute([$id]);
    $report = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$report) {
        jsonError('Laporan tidak ditemukan atau sudah diproses.', 404);
    }
    
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    
    $pdo->beginTransaction();
    
    try {
        // Create household
        $income = (int)($data['income'] ?? 0);
        $condition = $data['house_condition'] ?? 'tidak_layak';
        $education = $data['education'] ?? 'sd';
        
        // Simple poverty score
        $score = 0;
        if ($income < 500000) $score += 30;
        elseif ($income < 1500000) $score += 20;
        elseif ($income < 3000000) $score += 10;
        if ($condition === 'tidak_layak') $score += 20;
        
        $povertyStatus = match(true) {
            $score >= 60 => 'sangat_miskin',
            $score >= 40 => 'miskin',
            $score >= 20 => 'rentan_miskin',
            default => 'terdata'
        };
        
        $stmt = $pdo->prepare("
            INSERT INTO households 
            (full_address, kelurahan, kecamatan, latitude, longitude, head_name, 
             head_education, head_monthly_income, house_condition, land_ownership,
             poverty_score, poverty_status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'numpang', ?, ?, ?)
        ");
        
        $stmt->execute([
            $report['address'],
            $report['kelurahan'] ?? '',
            $report['kecamatan'] ?? '',
            $report['latitude'],
            $report['longitude'],
            $report['head_name'],
            $education,
            $income,
            $condition,
            $score,
            $povertyStatus,
            'Dari laporan publik #' . $id
        ]);
        
        $householdId = (int)$pdo->lastInsertId();
        
        // Update report
        $stmt = $pdo->prepare("
            UPDATE public_reports 
            SET status = 'approved', converted_household_id = ?, admin_notes = ?, reviewed_at = NOW() 
            WHERE id = ?
        ");
        $stmt->execute([$householdId, $data['admin_notes'] ?? null, $id]);
        
        $pdo->commit();
        
        jsonSuccess(['household_id' => $householdId], 'Laporan disetujui.');
        
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
}

// ============================================================
// REJECT
// ============================================================
function handleReject(int $id): void
{
    $pdo = Database::get();
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    
    $stmt = $pdo->prepare("UPDATE public_reports SET status = 'rejected', admin_notes = ?, reviewed_at = NOW() WHERE id = ? AND status = 'pending'");
    $stmt->execute([$data['admin_notes'] ?? null, $id]);
    
    if ($stmt->rowCount() === 0) {
        jsonError('Laporan tidak ditemukan atau sudah diproses.', 404);
    }
    
    jsonSuccess(null, 'Laporan ditolak.');
}

// ============================================================
// DELETE SINGLE PHOTO (shared by report & house endpoints)
// ============================================================
function handleDeletePhoto(int $id, string $table, string $col, string $dir): void
{
    // Role guard: admin or field_officer only
    $user = requireAuth();
    $role = $user['role'] ?? '';
    if (!in_array($role, ['admin', 'field_officer'], true)) {
        jsonError('Akses ditolak. Hanya admin atau petugas lapangan.', 403);
    }

    $data     = json_decode(file_get_contents('php://input'), true) ?? [];
    $filename = trim($data['filename'] ?? '');

    // Security: filename must be a plain filename with no path separators
    if ($filename === '' || preg_match('/[\/\\\\]/', $filename) ||
        !preg_match('/^[a-zA-Z0-9_\-\.]+$/', $filename)) {
        jsonError('Nama file tidak valid.', 400);
    }

    // Must end with allowed extension
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
        jsonError('Ekstensi file tidak diizinkan.', 400);
    }

    $pdo  = Database::get();
    $stmt = $pdo->prepare("SELECT $col FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        jsonError('Data tidak ditemukan.', 404);
    }

    $photos = json_decode($row[$col] ?? '[]', true) ?: [];

    // Check file is actually in this record's photo list (prevents arbitrary deletion)
    if (!in_array($filename, $photos, true)) {
        jsonError('File tidak ditemukan dalam data ini.', 404);
    }

    // Remove from array
    $photos = array_values(array_filter($photos, fn($p) => $p !== $filename));

    // Update DB
    $upd = $pdo->prepare("UPDATE $table SET $col = ? WHERE id = ?");
    $upd->execute([json_encode($photos, JSON_UNESCAPED_UNICODE), $id]);

    // Delete physical file — realpath check prevents traversal
    $fullPath = realpath($dir . $filename);
    $realDir  = realpath($dir);
    if ($fullPath && $realDir && str_starts_with($fullPath, $realDir)) {
        @unlink($fullPath);
    }

    jsonSuccess(['remaining' => $photos], 'Foto berhasil dihapus.');
}

// ============================================================
// DELETE
// ============================================================
function handleDelete(int $id): void
{
    $pdo = Database::get();
    $stmt = $pdo->prepare("DELETE FROM public_reports WHERE id = ?");
    $stmt->execute([$id]);
    
    if ($stmt->rowCount() === 0) {
        jsonError('Laporan tidak ditemukan.', 404);
    }
    
    jsonSuccess(null, 'Laporan dihapus.');
}

// ============================================================
// HELPERS (Hanya fungsi yang tidak ada di bootstrap.php)
// ============================================================

// getClientIP - tidak ada di bootstrap, aman didefinisikan
function getClientIP(): string
{
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return trim(explode(',', $ip)[0]);
}

// jsonSuccess dan jsonError - fungsi custom untuk response JSON
function jsonSuccess($data, string $message = 'OK', int $code = 200): void
{
    http_response_code($code);
    echo json_encode([
        'success' => true,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonError(string $message, int $code = 400, array $extra = []): void
{
    http_response_code($code);
    $response = ['success' => false, 'message' => $message];
    if (!empty($extra)) {
        $response = array_merge($response, $extra);
    }
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}