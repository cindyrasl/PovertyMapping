<?php
// fix_all_passwords.php
require_once 'config/database.php';

echo "=== MEMPERBAIKI PASSWORD USER ===<br><br>";

// Data user yang akan diperbaiki
$users = [
    ['email' => 'admin@webgis.local', 'password' => 'Admin@12345', 'name' => 'Admin'],
    ['email' => 'petugas@webgis.local', 'password' => 'Petugas@12345', 'name' => 'Petugas']
];

$pdo = Database::get();
$success = true;

foreach ($users as $user) {
    // Generate hash baru
    $newHash = password_hash($user['password'], PASSWORD_BCRYPT);
    
    // Update database
    $stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE email = ?");
    $stmt->execute([$newHash, $user['email']]);
    
    // Verifikasi
    $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE email = ?");
    $stmt->execute([$user['email']]);
    $row = $stmt->fetch();
    
    if (password_verify($user['password'], $row['password_hash'])) {
        echo "✅ " . $user['name'] . " (" . $user['email'] . ") - BERHASIL!<br>";
    } else {
        echo "❌ " . $user['name'] . " (" . $user['email'] . ") - GAGAL!<br>";
        $success = false;
    }
}

echo "<br>=========================<br>";
if ($success) {
    echo "✅ SEMUA PASSWORD BERHASIL DIPERBAIKI!<br><br>";
    echo "SILAKAN LOGIN DENGAN:<br>";
    echo "- Admin: admin@webgis.local / Admin@12345<br>";
    echo "- Petugas: petugas@webgis.local / Petugas@12345";
} else {
    echo "❌ ADA YANG GAGAL. Silakan cek koneksi database.";
}
?>