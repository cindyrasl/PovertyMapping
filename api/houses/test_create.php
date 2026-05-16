<?php
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

// Simulate a POST request with JSON body
$testData = [
    'head_name' => 'Test KK',
    'nik' => '1234567890123456',
    'gender' => 'male',
    'date_of_birth' => '1990-01-01',
    'education' => 'sma',
    'dependents' => 1,
    'income' => 2000000,
    'job' => 'Wiraswasta',
    'house_condition' => 'layak',
    'land_ownership' => 'milik',
    'address' => 'Test Address',
    'latitude' => -0.0317,
    'longitude' => 109.3374,
    'description' => 'Test',
    'aid_status' => 'not_yet',
    'dependents_data' => [
        [
            'nik' => '9876543210987654',
            'name' => 'Test Dependent',
            'gender' => 'female',
            'date_of_birth' => '1995-05-05',
            'education' => 'sma'
        ]
    ]
];

try {
    $pdo = Database::get();
    
    $calc = PovertyCalculator::calculate(2000000, 1, 'layak', 'sma');
    
    $stmt = $pdo->prepare("
        INSERT INTO households
            (head_name, nik, date_of_birth, gender, education,
             dependents, dependents_data, income, job, house_condition, land_ownership,
             poverty_score, poverty_status, aid_status, managing_center_id,
             address, latitude, longitude, description)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    
    $stmt->execute([
        $testData['head_name'],
        $testData['nik'],
        $testData['date_of_birth'],
        $testData['gender'],
        $testData['education'],
        $testData['dependents'],
        json_encode($testData['dependents_data']),
        $testData['income'],
        $testData['job'],
        $testData['house_condition'],
        $testData['land_ownership'],
        $calc['score'],
        $calc['status'],
        $testData['aid_status'],
        null, // managing_center_id
        $testData['address'],
        $testData['latitude'],
        $testData['longitude'],
        $testData['description'],
    ]);
    
    $newId = $pdo->lastInsertId();
    
    Response::success([
        'message' => 'Test insert successful',
        'id' => $newId,
        'poverty_score' => $calc['score'],
        'poverty_status' => $calc['status']
    ]);
    
} catch (\PDOException $e) {
    Response::error('Database error: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    Response::error('Error: ' . $e->getMessage() . ' at line ' . $e->getLine(), 500);
}