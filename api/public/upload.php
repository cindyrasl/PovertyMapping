<?php
// ===== DEBUG MODE - FULL ERROR REPORTING =====
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

$debug = [
    'step' => 1,
    'timestamp' => date('Y-m-d H:i:s'),
];

try {
    // Step 2: Cek method
    $debug['step'] = 2;
    $debug['method'] = $_SERVER['REQUEST_METHOD'];
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Method not allowed. Use POST.');
    }
    
    // Step 3: Cek parameters
    $debug['step'] = 3;
    $debug['get'] = $_GET;
    $target = $_GET['target'] ?? '';
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    $debug['target'] = $target;
    $debug['id'] = $id;
    
    if (!in_array($target, ['report', 'house'], true) || $id <= 0) {
        throw new Exception('Invalid target or id. target=' . $target . ', id=' . $id);
    }
    
    // Step 4: Load bootstrap
    $debug['step'] = 4;
    $bootstrap_path = __DIR__ . '/../../config/bootstrap.php';
    $debug['bootstrap_path'] = $bootstrap_path;
    $debug['bootstrap_exists'] = file_exists($bootstrap_path);
    
    if (!file_exists($bootstrap_path)) {
        throw new Exception('Bootstrap not found at: ' . $bootstrap_path);
    }
    
    require_once $bootstrap_path;
    $debug['step'] = 5;
    $debug['bootstrap_loaded'] = true;
    
    // Step 5: Authentication for house target
    $debug['step'] = 6;
    if ($target === 'house') {
        $user = requireAuth();
        $debug['auth_user'] = $user['name'] ?? 'unknown';
    }
    
    // Step 6: Setup directories
    $debug['step'] = 7;
    $dir = $target === 'report' ? 'reports' : 'houses';
    $table = $target === 'report' ? 'public_reports' : 'households';
    $dest = __DIR__ . '/../../uploads/' . $dir . '/';
    $debug['dest'] = $dest;
    $debug['dest_exists'] = is_dir($dest);
    $debug['dest_writable'] = is_writable($dest);
    
    if (!is_dir($dest)) {
        mkdir($dest, 0777, true);
        $debug['dest_created'] = true;
    }
    
    // Step 7: Check record exists
    $debug['step'] = 8;
    $pdo = Database::get();
    $colName = $target === 'report' ? 'proof_photos' : 'house_photos';
    
    $stmt = $pdo->prepare("SELECT id, $colName FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);
    $debug['record_exists'] = !empty($record);
    
    if (!$record) {
        throw new Exception("Record with id $id not found in $table");
    }
    
    $existing = json_decode($record[$colName] ?? '[]', true) ?: [];
    $debug['existing_photos'] = count($existing);
    
    // Step 8: Check uploaded files
    $debug['step'] = 9;
    $files = $_FILES['photos'] ?? null;
    $debug['has_files'] = !empty($files);
    $debug['files_count'] = $files ? count($files['name']) : 0;
    
    if (!$files || empty($files['name'][0])) {
        throw new Exception('No files uploaded');
    }
    
    // Step 9: Process files
    $debug['step'] = 10;
    $saved = [];
    
    foreach ($files['name'] as $i => $originalName) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) {
            throw new Exception('Upload error for file: ' . $originalName);
        }
        
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $unique = bin2hex(random_bytes(12));
        $filename = "{$dir}_{$id}_{$unique}.{$ext}";
        $fullPath = $dest . $filename;
        
        if (move_uploaded_file($files['tmp_name'][$i], $fullPath)) {
            $saved[] = $filename;
            $debug['saved'][] = $filename;
        } else {
            throw new Exception('Failed to move uploaded file: ' . $originalName);
        }
    }
    
    // Step 10: Update database
    $debug['step'] = 11;
    $all = array_merge($existing, $saved);
    $upd = $pdo->prepare("UPDATE $table SET $colName = ? WHERE id = ?");
    $upd->execute([json_encode($all, JSON_UNESCAPED_UNICODE), $id]);
    $debug['db_updated'] = true;
    
    // Success response
    echo json_encode([
        'success' => true,
        'message' => 'Foto berhasil diunggah',
        'data' => [
            'filenames' => $saved,
            'all_photos' => $all
        ],
        'debug' => $debug
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    $debug['error'] = $e->getMessage();
    $debug['trace'] = $e->getTraceAsString();
    
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'debug' => $debug
    ], JSON_PRETTY_PRINT);
}