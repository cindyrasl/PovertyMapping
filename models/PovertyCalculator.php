<?php
// ============================================================
// models/PovertyCalculator.php
// Direct poverty category classification
// ============================================================
declare(strict_types=1);

class PovertyCalculator
{
    /**
     * Determine poverty level directly based on indicators
     * 
     * Categories (Indonesian context):
     * - Sangat Miskin (Severe): Multiple critical indicators
     * - Miskin (Poor): Several concerning indicators
     * - Rentan Miskin (Vulnerable): At risk of poverty
     * 
     * Indicators considered:
     * 1. Per-capita income (below regional minimum wage)
     * 2. Number of dependents (high dependency ratio)
     * 3. House condition (uninhabitable)
     * 4. Education level (low educational attainment)
     * 5. Land ownership (doesn't own land)
     */
    public static function calculate(
        int    $income,
        int    $dependents,
        string $condition,
        string $education,
        string $landOwnership = 'milik'
    ): array {
        $indicators = [];
        $severityPoints = 0;
        
        $members = max(1, $dependents);
        $perCapita = $income / $members;
        
        // ---- Indicator 1: Per-capita income ----
        // Indonesian poverty line approx Rp 550,000/capita/month
        // Regional minimum wage (UMP) varies ~Rp 2,000,000-5,000,000
        if ($perCapita < 400_000) {
            $indicators[] = 'Pendapatan per kapita sangat rendah (< Rp 400.000)';
            $severityPoints += 3;
        } elseif ($perCapita < 700_000) {
            $indicators[] = 'Pendapatan per kapita rendah (< Rp 700.000)';
            $severityPoints += 2;
        } elseif ($perCapita < 1_200_000) {
            $indicators[] = 'Pendapatan per kapita di bawah UMP';
            $severityPoints += 1;
        }
        
        // ---- Indicator 2: Dependency ratio ----
        if ($dependents >= 7) {
            $indicators[] = 'Tanggungan sangat besar (≥ 7 orang)';
            $severityPoints += 3;
        } elseif ($dependents >= 5) {
            $indicators[] = 'Tanggungan besar (5-6 orang)';
            $severityPoints += 2;
        } elseif ($dependents >= 4) {
            $indicators[] = 'Tanggungan cukup besar (4 orang)';
            $severityPoints += 1;
        }
        
        // ---- Indicator 3: House condition ----
        if ($condition === 'tidak_layak') {
            $indicators[] = 'Kondisi rumah tidak layak huni';
            $severityPoints += 3;
        }
        
        // ---- Indicator 4: Education ----
        $eduLevels = [
            'tidak_sekolah' => ['Tidak pernah sekolah', 3],
            'sd'            => ['Pendidikan hanya SD', 2],
            'smp'           => ['Pendidikan hanya SMP', 1],
            'sma'           => ['Pendidikan SMA', 0],
            'diploma'       => ['Pendidikan Diploma', 0],
            'sarjana'       => ['Pendidikan Sarjana', 0],
            'pascasarjana'  => ['Pendidikan Pascasarjana', 0],
        ];
        
        if (isset($eduLevels[$education])) {
            [$eduDesc, $eduPts] = $eduLevels[$education];
            if ($eduPts > 0) {
                $indicators[] = $eduDesc;
                $severityPoints += $eduPts;
            }
        }
        
        // ---- Indicator 5: Land ownership ----
        if ($landOwnership === 'numpang') {
            $indicators[] = 'Tidak memiliki lahan (numpang)';
            $severityPoints += 2;
        } elseif ($landOwnership === 'sewa') {
            $indicators[] = 'Lahan menyewa';
            $severityPoints += 1;
        }
        
        // ---- Determine category based on accumulated severity ----
        if ($severityPoints >= 7) {
            $status = 'sangat_miskin';
            $label = 'Sangat Miskin';
        } elseif ($severityPoints >= 4) {
            $status = 'miskin';
            $label = 'Miskin';
        } elseif ($severityPoints >= 1) {
            $status = 'rentan_miskin';
            $label = 'Rentan Miskin';
        } else {
            $status = 'terdata';
            $label = 'Terdata';
        }
        
        return [
            'status'     => $status,
            'label'      => $label,
            'indicators' => $indicators,
            'severity'   => $severityPoints,
        ];
    }

    /**
     * Marker color based on poverty status
     */
    public static function markerColor(string $status): string
    {
        return match($status) {
            'sangat_miskin' => '#d63230',   // Red
            'miskin'        => '#f76707',   // Orange
            'rentan_miskin' => '#f59e0b',   // Amber
            'terdata'       => '#0b9e73',   // Green
            default         => '#9ba4b5',
        };
    }

    /**
     * Label in Indonesian
     */
    public static function label(string $status): string
    {
        return match($status) {
            'sangat_miskin' => 'Sangat Miskin',
            'miskin'        => 'Miskin',
            'rentan_miskin' => 'Rentan Miskin',
            'terdata'       => 'Terdata',
            default         => '-',
        };
    }
}