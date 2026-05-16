/* ============================================================
   dashboard.js — Chart.js analytics dashboard
   ============================================================ */
'use strict';

let charts = {};

async function openDashboard() {
    openModal('dashboardModal');
    // Always fetch fresh data when opening
    await renderDashboard();
}

function destroyChart(id) {
    if (charts[id]) { 
        charts[id].destroy(); 
        delete charts[id]; 
    }
}

async function renderDashboard() {
    showLoading(true);

    // Destroy all existing charts before re-rendering
    Object.keys(charts).forEach(key => destroyChart(key));

    try {
        const [overview, trend, poverty, aidStat, age] = await Promise.all([
            ApiStats.overview(),
            ApiStats.trend(),
            ApiStats.povertyChart(),
            ApiStats.aidChart(),
            ApiStats.ageDistribution(),
        ]);

        showLoading(false);

        if (poverty && poverty.ok)    renderPovertyChart(poverty.data.data);
        if (trend && trend.ok)        renderTrendChart(trend.data.data);
        if (age && age.ok)            renderAgeChart(age.data.data);
        if (aidStat && aidStat.ok)    renderAidChart(aidStat.data.data);
    } catch (err) {
        showLoading(false);
        console.error('Dashboard render error:', err);
    }
}

function chartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    font: { family: "'DM Sans', sans-serif", size: 10 },
                    color: '#5a6478',
                    padding: 12,
                    usePointStyle: true,
                    pointStyleWidth: 8,
                    boxHeight: 8,
                },
            },
            tooltip: {
                backgroundColor: '#0f1623',
                titleFont: { family: "'DM Sans', sans-serif", size: 11, weight: '700' },
                bodyFont: { family: "'DM Sans', sans-serif", size: 11 },
                padding: 10,
                cornerRadius: 8,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(0,0,0,0.03)' },
                ticks: { font: { family: "'DM Sans', sans-serif", size: 9 }, color: '#9ba4b5' },
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.03)' },
                ticks: { font: { family: "'DM Sans', sans-serif", size: 9 }, color: '#9ba4b5', precision: 0 },
                beginAtZero: true,
            },
        },
    };
}

// ---- Poverty distribution (doughnut) -----------------------
function renderPovertyChart(data) {
    destroyChart('poverty');
    const bd = data?.breakdown || [];
    if (!bd.length) return;
    
    const labels = bd.map(r => POVERTY_LABELS[r.poverty_status] || r.poverty_status);
    const values = bd.map(r => parseInt(r.count));
    const colors = bd.map(r => POVERTY_COLORS[r.poverty_status] || '#9ba4b5');

    const ctx = document.getElementById('chartPoverty');
    if (!ctx) return;

    charts.poverty = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels, 
            datasets: [{ 
                data: values, 
                backgroundColor: colors, 
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 8,
            }] 
        },
        options: {
            ...chartDefaults(),
            cutout: '62%',
        },
    });
}

// ---- Trend line chart (12 months) --------------------------
function renderTrendChart(data) {
    destroyChart('trend');
    const rows = data?.trend || [];
    if (!rows.length) return;

    const labels = rows.map(r => r.month);
    const ctx = document.getElementById('chartTrend');
    if (!ctx) return;

    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Rumah Baru',
                    data: rows.map(r => r.new_households),
                    borderColor: '#3a56d4',
                    backgroundColor: 'rgba(58,86,212,0.08)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#3a56d4',
                },
                {
                    label: 'Dibantu',
                    data: rows.map(r => r.aided),
                    borderColor: '#0b9e73',
                    backgroundColor: 'rgba(11,158,115,0.06)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#0b9e73',
                },
            ],
        },
        options: {
            ...chartDefaults(),
        },
    });
}

// ---- Age distribution of DEPENDENTS (bar) ------------------
function renderAgeChart(data) {
    destroyChart('age');
    const dist = data?.age_distribution || {};
    
    // Only dependent age groups
    const labels = ['Anak (<12)', 'Remaja (12-17)', 'Pemuda (18-30)', 'Dewasa (31-59)', 'Lansia (60+)'];
    const values = [
        dist.anak || 0, 
        dist.remaja || 0, 
        dist.pemuda || 0, 
        dist.dewasa || 0, 
        dist.lansia || 0
    ];
    const colors = ['#7c3aed','#3a56d4','#0b9e73','#d97706','#d63230'];

    // Skip if all zero
    if (values.every(v => v === 0)) return;

    const ctx = document.getElementById('chartAge');
    if (!ctx) return;

    charts.age = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Jumlah Tanggungan',
                data: values,
                backgroundColor: colors.map(c => c + 'cc'),
                borderColor: colors,
                borderWidth: 1.5,
                borderRadius: 5,
            }],
        },
        options: {
            ...chartDefaults(),
            plugins: { 
                ...chartDefaults().plugins, 
                legend: { display: false },
                title: {
                    display: true,
                    text: 'Distribusi Usia Tanggungan Keluarga',
                    font: { family: "'DM Sans', sans-serif", size: 11 },
                    color: '#5a6478',
                    padding: { bottom: 10 },
                },
            },
        },
    });
}

// ---- Aid distribution (pie) --------------------------------
function renderAidChart(data) {
    destroyChart('aid');
    const byType = data?.by_type || [];
    if (!byType.length) return;
    
    const colors = ['#3a56d4','#0b9e73','#d97706','#7c3aed','#d63230','#0e7f6e','#b45309'];

    const ctx = document.getElementById('chartAid');
    if (!ctx) return;

    charts.aid = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: byType.map(r => AID_LABELS[r.aid_type] || r.aid_type),
            datasets: [{
                data: byType.map(r => parseInt(r.cnt)),
                backgroundColor: byType.map((_, i) => colors[i % colors.length] + 'cc'),
                borderColor: byType.map((_, i) => colors[i % colors.length]),
                borderWidth: 1.5,
            }],
        },
        options: {
            ...chartDefaults(),
            plugins: {
                ...chartDefaults().plugins,
                title: {
                    display: true,
                    text: 'Total: ' + (data?.summary?.total_distributions || 0) + ' distribusi',
                    font: { family: "'DM Sans', sans-serif", size: 10 },
                    color: '#9ba4b5',
                    padding: { bottom: 8 },
                },
            },
        },
    });
}