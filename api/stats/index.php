<?php
// api/stats/index.php — Dashboard Statistics
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

requireAuth();
$pdo = Database::get();
$action = $_GET['action'] ?? 'overview';

switch ($action) {

    case 'overview': {
        $centers = (int)$pdo->query("SELECT COUNT(*) FROM religious_centers WHERE is_active = 1")->fetchColumn();
        $households = (int)$pdo->query("SELECT COUNT(*) FROM households WHERE is_active = 1")->fetchColumn();
        
        // Total population (head + members)
        $members = (int)$pdo->query("SELECT COUNT(*) FROM household_members")->fetchColumn();
        $population = $households + $members;
        
        // Aid received (based on aid_history)
        $aidReceived = (int)$pdo->query("SELECT COUNT(DISTINCT household_id) FROM aid_history")->fetchColumn();
        
        // Open emergency reports
        $openReports = 0;
        try {
            $openReports = (int)$pdo->query("SELECT COUNT(*) FROM emergency_reports WHERE status IN ('open', 'in_progress')")->fetchColumn();
        } catch (\Throwable) {}
        
        // Pending public reports
        $pendingPublic = 0;
        try {
            $pendingPublic = (int)$pdo->query("SELECT COUNT(*) FROM public_reports WHERE status = 'pending'")->fetchColumn();
        } catch (\Throwable) {}
        
        // Poverty breakdown
        $povertyBreakdown = $pdo->query("
            SELECT poverty_status, COUNT(*) AS cnt 
            FROM households WHERE is_active = 1 
            GROUP BY poverty_status
        ")->fetchAll(\PDO::FETCH_KEY_PAIR);
        
        // Condition breakdown
        $conditionBreakdown = $pdo->query("
            SELECT house_condition, COUNT(*) AS cnt 
            FROM households WHERE is_active = 1 
            GROUP BY house_condition
        ")->fetchAll(\PDO::FETCH_KEY_PAIR);
        
        Response::success([
            'centers' => $centers,
            'households' => $households,
            'population' => $population,
            'aid_received' => $aidReceived,
            'aid_not_yet' => max(0, $households - $aidReceived),
            'open_reports' => $openReports,
            'pending_public' => $pendingPublic,
            'poverty_breakdown' => [
                'sangat_miskin' => (int)($povertyBreakdown['sangat_miskin'] ?? 0),
                'miskin' => (int)($povertyBreakdown['miskin'] ?? 0),
                'rentan_miskin' => (int)($povertyBreakdown['rentan_miskin'] ?? 0),
                'terdata' => (int)($povertyBreakdown['terdata'] ?? 0),
            ],
            'condition_breakdown' => [
                'layak' => (int)($conditionBreakdown['layak'] ?? 0),
                'tidak_layak' => (int)($conditionBreakdown['tidak_layak'] ?? 0),
            ],
        ]);
        break;
    }

    case 'trend': {
        $rows = $pdo->query("
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') AS month,
                COUNT(*) AS new_households,
                SUM(CASE WHEN aid_status = 'received' THEN 1 ELSE 0 END) AS aided,
                ROUND(AVG(poverty_score), 1) AS avg_score
            FROM households 
            WHERE is_active = 1 
                AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY month 
            ORDER BY month
        ")->fetchAll();
        
        foreach ($rows as &$r) {
            $r['new_households'] = (int)$r['new_households'];
            $r['aided'] = (int)$r['aided'];
            $r['avg_score'] = (float)$r['avg_score'];
        }
        unset($r);
        
        Response::success(['trend' => $rows]);
        break;
    }

    case 'poverty_chart': {
        $breakdown = $pdo->query("
            SELECT poverty_status, COUNT(*) AS count,
                   ROUND(AVG(poverty_score), 1) AS avg_score
            FROM households WHERE is_active = 1
            GROUP BY poverty_status
            ORDER BY FIELD(poverty_status, 'sangat_miskin', 'miskin', 'rentan_miskin', 'terdata')
        ")->fetchAll();
        
        Response::success(['breakdown' => $breakdown]);
        break;
    }

    case 'aid_chart': {
        $byType = $pdo->query("
            SELECT aid_type, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total_amount
            FROM aid_history 
            GROUP BY aid_type 
            ORDER BY cnt DESC
        ")->fetchAll();
        
        $total = (int)$pdo->query("SELECT COUNT(*) FROM aid_history")->fetchColumn();
        
        Response::success([
            'by_type' => $byType,
            'summary' => ['total_distributions' => $total],
        ]);
        break;
    }

    case 'age_distribution': {
        $headQuery = "
            SELECT 
                CASE 
                    WHEN TIMESTAMPDIFF(YEAR, head_date_of_birth, CURDATE()) < 12 THEN 'anak'
                    WHEN TIMESTAMPDIFF(YEAR, head_date_of_birth, CURDATE()) BETWEEN 12 AND 17 THEN 'remaja'
                    WHEN TIMESTAMPDIFF(YEAR, head_date_of_birth, CURDATE()) BETWEEN 18 AND 30 THEN 'pemuda'
                    WHEN TIMESTAMPDIFF(YEAR, head_date_of_birth, CURDATE()) BETWEEN 31 AND 59 THEN 'dewasa'
                    WHEN TIMESTAMPDIFF(YEAR, head_date_of_birth, CURDATE()) >= 60 THEN 'lansia'
                    ELSE NULL
                END AS age_group
            FROM households 
            WHERE is_active = 1 AND head_date_of_birth IS NOT NULL
        ";

        $memberQuery = "
            SELECT 
                CASE 
                    WHEN TIMESTAMPDIFF(YEAR, hm.date_of_birth, CURDATE()) < 12 THEN 'anak'
                    WHEN TIMESTAMPDIFF(YEAR, hm.date_of_birth, CURDATE()) BETWEEN 12 AND 17 THEN 'remaja'
                    WHEN TIMESTAMPDIFF(YEAR, hm.date_of_birth, CURDATE()) BETWEEN 18 AND 30 THEN 'pemuda'
                    WHEN TIMESTAMPDIFF(YEAR, hm.date_of_birth, CURDATE()) BETWEEN 31 AND 59 THEN 'dewasa'
                    WHEN TIMESTAMPDIFF(YEAR, hm.date_of_birth, CURDATE()) >= 60 THEN 'lansia'
                    ELSE NULL
                END AS age_group
            FROM household_members hm
            INNER JOIN households h ON h.id = hm.household_id
            WHERE h.is_active = 1 AND hm.date_of_birth IS NOT NULL
        ";

        $combinedQuery = "
            SELECT age_group, COUNT(*) as total
            FROM (
                $headQuery
                UNION ALL
                $memberQuery
            ) AS all_persons
            WHERE age_group IS NOT NULL
            GROUP BY age_group
        ";
        
        $result = $pdo->query($combinedQuery);
        $rows = $result->fetchAll(\PDO::FETCH_ASSOC);
        
        // Inisialisasi array dengan nilai default 0
        $distribution = [
            'anak' => 0,      // < 12 tahun
            'remaja' => 0,    // 12-17 tahun
            'pemuda' => 0,    // 18-30 tahun
            'dewasa' => 0,    // 31-59 tahun
            'lansia' => 0,    // >= 60 tahun
            'unknown' => 0,   // data tanggal lahir tidak tersedia
        ];
        
        // Hitung jumlah orang tanpa tanggal lahir
        $unknownCount = 0;
        
        // Hitung kepala keluarga tanpa tanggal lahir
        $stmt = $pdo->query("SELECT COUNT(*) FROM households WHERE is_active = 1 AND head_date_of_birth IS NULL");
        $unknownCount += (int)$stmt->fetchColumn();
        
        // Hitung anggota keluarga tanpa tanggal lahir
        $stmt = $pdo->query("
            SELECT COUNT(*) FROM household_members hm 
            INNER JOIN households h ON h.id = hm.household_id 
            WHERE h.is_active = 1 AND hm.date_of_birth IS NULL
        ");
        $unknownCount += (int)$stmt->fetchColumn();
        $distribution['unknown'] = $unknownCount;
        
        // Isi hasil query ke array distribution
        foreach ($rows as $row) {
            if (isset($distribution[$row['age_group']])) {
                $distribution[$row['age_group']] = (int)$row['total'];
            }
        }
        
        // Hitung total keseluruhan untuk debugging (opsional)
        $totalPeople = array_sum($distribution) - $distribution['unknown'];
        
        Response::success([
            'age_distribution' => $distribution,
            'total_people' => $totalPeople,
            'includes_members' => true  // Indikator bahwa sudah termasuk anggota keluarga
        ]);
        break;
    }

    default:
        Response::error('Unknown stats action.', 400);
}

