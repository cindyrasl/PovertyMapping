<?php
// debug_api.php - Cek error API
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once 'config/database.php';

echo "<h2>Debug API Centers</h2>";

try {
    $pdo = Database::get();
    echo "<p>✅ Database connected</p>";
    
    // Cek tabel religious_centers
    $stmt = $pdo->query("SHOW TABLES LIKE 'religious_centers'");
    if ($stmt->rowCount() > 0) {
        echo "<p>✅ Table religious_centers exists</p>";
        
        // Cek data
        $stmt = $pdo->query("SELECT COUNT(*) FROM religious_centers WHERE is_active = 1");
        $count = $stmt->fetchColumn();
        echo "<p>📊 Religious centers count: $count</p>";
        
        // Cek struktur kolom
        $stmt = $pdo->query("DESCRIBE religious_centers");
        $columns = $stmt->fetchAll();
        echo "<p>📋 Columns: " . implode(', ', array_column($columns, 'Field')) . "</p>";
        
    } else {
        echo "<p>❌ Table religious_centers NOT found!</p>";
    }
    
    // Test query yang digunakan di API
    echo "<h3>Test Query:</h3>";
    $testQuery = "
        SELECT rc.*,
            (SELECT COUNT(*) FROM households h WHERE h.managing_center_id = rc.id AND h.is_active=1) AS household_count,
            (SELECT COUNT(*) FROM households h WHERE h.managing_center_id = rc.id AND h.is_active=1 AND h.aid_status='not_yet') AS pending_aid_count
        FROM religious_centers rc 
        WHERE rc.is_active = 1 
        ORDER BY rc.name
    ";
    
    $stmt = $pdo->query($testQuery);
    $rows = $stmt->fetchAll();
    echo "<p>✅ Query executed, returned " . count($rows) . " rows</p>";
    
    if (count($rows) > 0) {
        echo "<pre>";
        print_r($rows[0]);
        echo "</pre>";
    }
    
} catch (Exception $e) {
    echo "<p style='color:red'>❌ Error: " . $e->getMessage() . "</p>";
    echo "<p>File: " . $e->getFile() . " line " . $e->getLine() . "</p>";
}