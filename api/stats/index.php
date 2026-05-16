<?php
// ============================================================
// api/stats/index.php — Dashboard Statistics
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$pdo    = Database::get();
$action = $_GET['action'] ?? 'overview';

switch ($action) {

    case 'overview': {
        $centers    = (int)$pdo->query("SELECT COUNT(*) FROM religious_centers WHERE is_active=1")->fetchColumn();
        $households = (int)$pdo->query("SELECT COUNT(*) FROM households WHERE is_active=1")->fetchColumn();
        $population = (int)$pdo->query("SELECT COALESCE(SUM(dependents),0) FROM households WHERE is_active=1")->fetchColumn();
        $aidReceived= (int)$pdo->query("SELECT COUNT(*) FROM households WHERE is_active=1 AND aid_status='received'")->fetchColumn();
        $notYet     = $households - $aidReceived;

        $povertyBreakdown = $pdo->query("
            SELECT poverty_status, COUNT(*) AS cnt
            FROM households WHERE is_active=1
            GROUP BY poverty_status
        ")->fetchAll(\PDO::FETCH_KEY_PAIR);

        $conditionBreakdown = $pdo->query("
            SELECT house_condition, COUNT(*) AS cnt
            FROM households WHERE is_active=1
            GROUP BY house_condition
        ")->fetchAll(\PDO::FETCH_KEY_PAIR);

        $openReports = (int)$pdo->query("SELECT COUNT(*) FROM emergency_reports WHERE status IN ('open','in_progress')")->fetchColumn();
        $unverified = (int)$pdo->query("SELECT COUNT(*) FROM households WHERE is_active=1 AND verified_at IS NULL")->fetchColumn();

        Response::success([
            'centers'          => $centers,
            'households'       => $households,
            'population'       => $population,
            'aid_received'     => $aidReceived,
            'aid_not_yet'      => $notYet,
            'open_reports'     => $openReports,
            'unverified'       => $unverified,
            'poverty_breakdown'=> [
                'sangat_miskin' => (int)($povertyBreakdown['sangat_miskin'] ?? 0),
                'miskin'        => (int)($povertyBreakdown['miskin']        ?? 0),
                'hampir_miskin' => (int)($povertyBreakdown['hampir_miskin'] ?? 0),
                'tidak_miskin'  => (int)($povertyBreakdown['tidak_miskin']  ?? 0),
            ],
            'condition_breakdown' => [
                'layak'      => (int)($conditionBreakdown['layak']      ?? 0),
                'tidak_layak'=> (int)($conditionBreakdown['tidak_layak']?? 0),
            ],
        ]);
    }

    case 'trend': {
        $rows = $pdo->query("
            SELECT
                DATE_FORMAT(created_at,'%Y-%m') AS month,
                COUNT(*) AS new_households,
                SUM(CASE WHEN aid_status='received' THEN 1 ELSE 0 END) AS aided,
                AVG(poverty_score) AS avg_score
            FROM households
            WHERE is_active=1
              AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY month
            ORDER BY month
        ")->fetchAll();

        foreach ($rows as &$r) {
            $r['new_households'] = (int)$r['new_households'];
            $r['aided']          = (int)$r['aided'];
            $r['avg_score']      = round((float)$r['avg_score'], 1);
        }
        unset($r);

        Response::success(['trend' => $rows]);
    }

    case 'poverty_chart': {
        $breakdown = $pdo->query("
            SELECT poverty_status,
                   COUNT(*) AS count,
                   ROUND(AVG(poverty_score),1) AS avg_score,
                   ROUND(AVG(income),0) AS avg_income
            FROM households WHERE is_active=1
            GROUP BY poverty_status
            ORDER BY FIELD(poverty_status,'sangat_miskin','miskin','hampir_miskin','tidak_miskin')
        ")->fetchAll();

        $buckets = $pdo->query("
            SELECT FLOOR(poverty_score/10)*10 AS bucket, COUNT(*) AS cnt
            FROM households WHERE is_active=1
            GROUP BY bucket ORDER BY bucket
        ")->fetchAll();

        Response::success(['breakdown' => $breakdown, 'score_buckets' => $buckets]);
    }

    case 'aid_chart': {
    // Monthly aid distribution (last 12 months)
        $monthly = $pdo->query("
            SELECT 
                DATE_FORMAT(aid_date, '%Y-%m') AS month,
                aid_type,
                COUNT(*) AS cnt,
                COALESCE(SUM(amount), 0) AS total_amount
            FROM aid_history
            WHERE aid_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY month, aid_type
            ORDER BY month ASC, aid_type
        ")->fetchAll();

        // Aid by type (all time)
        $byType = $pdo->query("
            SELECT 
                aid_type, 
                COUNT(*) AS cnt,
                COALESCE(SUM(amount), 0) AS total_amount
            FROM aid_history 
            GROUP BY aid_type 
            ORDER BY cnt DESC
        ")->fetchAll();

        // Total distributions
        $totalDistributions = (int)$pdo->query("SELECT COUNT(*) FROM aid_history")->fetchColumn();
        $totalAmount = (int)$pdo->query("SELECT COALESCE(SUM(amount), 0) FROM aid_history")->fetchColumn();
        $householdsAided = (int)$pdo->query("SELECT COUNT(DISTINCT household_id) FROM aid_history")->fetchColumn();

        Response::success([
            'monthly' => $monthly,
            'by_type' => $byType,
            'summary' => [
                'total_distributions' => $totalDistributions,
                'total_amount' => $totalAmount,
                'households_aided' => $householdsAided,
            ],
        ]);
        break;
    }

    case 'age_distribution': {
        // Age distribution of DEPENDENTS only (not KK)
        // Parse dependents_data JSON and count ages
        $allDependents = $pdo->query("
            SELECT dependents_data 
            FROM households 
            WHERE is_active = 1 AND dependents_data IS NOT NULL
        ")->fetchAll();
        
        $ageGroups = [
            'anak' => 0,    // <12
            'remaja' => 0,  // 12-17
            'pemuda' => 0,  // 18-30
            'dewasa' => 0,  // 31-59
            'lansia' => 0,  // 60+
        ];
        
        foreach ($allDependents as $row) {
            $deps = json_decode($row['dependents_data'], true);
            if (!is_array($deps)) continue;
            
            foreach ($deps as $dep) {
                if (empty($dep['date_of_birth'])) continue;
                
                $dob = new DateTime($dep['date_of_birth']);
                $now = new DateTime();
                $age = $dob->diff($now)->y;
                
                if ($age < 12) {
                    $ageGroups['anak']++;
                } elseif ($age < 18) {
                    $ageGroups['remaja']++;
                } elseif ($age < 31) {
                    $ageGroups['pemuda']++;
                } elseif ($age < 60) {
                    $ageGroups['dewasa']++;
                } else {
                    $ageGroups['lansia']++;
                }
            }
        }
        
        Response::success(['age_distribution' => $ageGroups]);
        break;
    }

    case 'education': {
        $rows = $pdo->query("
            SELECT education, COUNT(*) AS cnt
            FROM households WHERE is_active=1
            GROUP BY education
            ORDER BY FIELD(education,'pascasarjana','sarjana','diploma','sma','smp','sd','tidak_sekolah')
        ")->fetchAll();
        Response::success(['education' => $rows]);
    }

    case 'emergency_summary': {
        $bySeverity = $pdo->query("
            SELECT severity, status, COUNT(*) AS cnt
            FROM emergency_reports
            GROUP BY severity, status
        ")->fetchAll();

        $byType = $pdo->query("
            SELECT type, COUNT(*) AS cnt FROM emergency_reports GROUP BY type ORDER BY cnt DESC
        ")->fetchAll();

        $monthly = $pdo->query("
            SELECT DATE_FORMAT(created_at,'%Y-%m') AS month, COUNT(*) AS cnt
            FROM emergency_reports
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY month ORDER BY month
        ")->fetchAll();

        Response::success([
            'by_severity' => $bySeverity,
            'by_type'     => $byType,
            'monthly'     => $monthly,
        ]);
    }

    default:
        Response::error('Unknown stats action.', 400);
}