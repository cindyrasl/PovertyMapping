<?php
// ============================================================
// api/stats/index.php — Dashboard Statistics (no auth)
// ============================================================
declare(strict_types=1);
require_once __DIR__ . '/../../config/bootstrap.php';

$pdo    = Database::get();
$action = $_GET['action'] ?? 'overview';

switch ($action) {

    case 'overview': {
        $centers     = (int)$pdo->query("SELECT COUNT(*) FROM religious_centers WHERE is_active=1")->fetchColumn();
        $households  = (int)$pdo->query("SELECT COUNT(*) FROM households WHERE is_active=1")->fetchColumn();
        $population  = (int)$pdo->query("SELECT COALESCE(SUM(dependents),0) FROM households WHERE is_active=1")->fetchColumn();
        $aidReceived = (int)$pdo->query("SELECT COUNT(*) FROM households WHERE is_active=1 AND aid_status='received'")->fetchColumn();
        $openReports = (int)$pdo->query("SELECT COUNT(*) FROM emergency_reports WHERE status IN ('open','in_progress')")->fetchColumn();
        $pendingPublic = 0;
        try {
            $pendingPublic = (int)$pdo->query("SELECT COUNT(*) FROM public_reports WHERE status='pending'")->fetchColumn();
        } catch (\Throwable) {}

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

        Response::success([
            'centers'           => $centers,
            'households'        => $households,
            'population'        => $population,
            'aid_received'      => $aidReceived,
            'aid_not_yet'       => $households - $aidReceived,
            'open_reports'      => $openReports,
            'pending_public'    => $pendingPublic,
            'poverty_breakdown' => [
                'sangat_miskin' => (int)($povertyBreakdown['sangat_miskin'] ?? 0),
                'miskin'        => (int)($povertyBreakdown['miskin']        ?? 0),
                'rentan_miskin' => (int)($povertyBreakdown['rentan_miskin'] ?? 0),
                'terdata'       => (int)($povertyBreakdown['terdata']       ?? 0),
            ],
            'condition_breakdown' => [
                'layak'       => (int)($conditionBreakdown['layak']       ?? 0),
                'tidak_layak' => (int)($conditionBreakdown['tidak_layak'] ?? 0),
            ],
        ]);
        break;
    }

    case 'trend': {
        $rows = $pdo->query("
            SELECT
                DATE_FORMAT(created_at,'%Y-%m') AS month,
                COUNT(*) AS new_households,
                SUM(CASE WHEN aid_status='received' THEN 1 ELSE 0 END) AS aided
            FROM households
            WHERE is_active=1 AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY month ORDER BY month
        ")->fetchAll();

        foreach ($rows as &$r) {
            $r['new_households'] = (int)$r['new_households'];
            $r['aided']          = (int)$r['aided'];
        }
        unset($r);

        Response::success(['trend' => $rows]);
        break;
    }

    case 'poverty_chart': {
        $breakdown = $pdo->query("
            SELECT poverty_status, COUNT(*) AS count
            FROM households WHERE is_active=1
            GROUP BY poverty_status
            ORDER BY FIELD(poverty_status,'sangat_miskin','miskin','rentan_miskin','terdata')
        ")->fetchAll();

        Response::success(['breakdown' => $breakdown]);
        break;
    }

    case 'aid_chart': {
        $byType = $pdo->query("
            SELECT aid_type, COUNT(*) AS cnt
            FROM aid_history GROUP BY aid_type ORDER BY cnt DESC
        ")->fetchAll();

        $monthly = $pdo->query("
            SELECT DATE_FORMAT(aid_date,'%Y-%m') AS month,
                   aid_type, COUNT(*) AS cnt
            FROM aid_history
            WHERE aid_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
            GROUP BY month, aid_type ORDER BY month, aid_type
        ")->fetchAll();

        $total = (int)$pdo->query("SELECT COUNT(*) FROM aid_history")->fetchColumn();

        Response::success([
            'monthly' => $monthly,
            'by_type' => $byType,
            'summary' => ['total_distributions' => $total],
        ]);
        break;
    }

    case 'age_distribution': {
        $row = $pdo->query("
            SELECT
                SUM(CASE WHEN TIMESTAMPDIFF(YEAR,date_of_birth,CURDATE()) < 12              THEN 1 ELSE 0 END) AS anak,
                SUM(CASE WHEN TIMESTAMPDIFF(YEAR,date_of_birth,CURDATE()) BETWEEN 12 AND 17 THEN 1 ELSE 0 END) AS remaja,
                SUM(CASE WHEN TIMESTAMPDIFF(YEAR,date_of_birth,CURDATE()) BETWEEN 18 AND 30 THEN 1 ELSE 0 END) AS pemuda,
                SUM(CASE WHEN TIMESTAMPDIFF(YEAR,date_of_birth,CURDATE()) BETWEEN 31 AND 59 THEN 1 ELSE 0 END) AS dewasa,
                SUM(CASE WHEN TIMESTAMPDIFF(YEAR,date_of_birth,CURDATE()) >= 60              THEN 1 ELSE 0 END) AS lansia,
                SUM(CASE WHEN date_of_birth IS NULL THEN 1 ELSE 0 END)                                         AS unknown
            FROM households WHERE is_active=1
        ")->fetch();

        foreach ($row as &$v) { $v = (int)$v; }
        Response::success(['age_distribution' => $row]);
        break;
    }

    case 'center_stats': {
        $rows = $pdo->query("
            SELECT rc.id, rc.name, rc.worship_type, rc.radius,
                COUNT(h.id)                                          AS total_households,
                SUM(h.aid_status='received')                         AS aided,
                SUM(h.poverty_status='sangat_miskin')                AS sangat_miskin,
                SUM(h.poverty_status='miskin')                       AS miskin,
                SUM(h.poverty_status='rentan_miskin')                AS rentan_miskin,
                SUM(h.house_condition='tidak_layak')                 AS tidak_layak
            FROM religious_centers rc
            LEFT JOIN households h ON h.managing_center_id = rc.id AND h.is_active=1
            WHERE rc.is_active=1
            GROUP BY rc.id
            ORDER BY total_households DESC
        ")->fetchAll();

        foreach ($rows as &$r) {
            $r['total_households'] = (int)$r['total_households'];
            $r['aided']            = (int)$r['aided'];
            $r['sangat_miskin']    = (int)$r['sangat_miskin'];
            $r['miskin']           = (int)$r['miskin'];
            $r['rentan_miskin']    = (int)$r['rentan_miskin'];
            $r['tidak_layak']      = (int)$r['tidak_layak'];
        }
        unset($r);

        Response::success(['centers' => $rows]);
        break;
    }

    default:
        Response::error('Unknown stats action.', 400);
}
