/* ============================================================
   admin.js — Admin panel: public reports only
   Emergency reports / audit log / users tabs removed
   ============================================================ */
'use strict';

async function openAdminPanel() {
    openModal('adminModal');
    loadPendingReports();
    updatePendingBadge();
}

async function updatePendingBadge() {
    try {
        const r = await fetch('api/public/report.php?action=list&status=pending&limit=1');
        const d = await r.json();
        const cnt = d?.data?.total ?? 0;
        const el  = document.getElementById('pendingBadge');
        if (el) el.textContent = cnt > 0 ? cnt : '';
    } catch { /* ignore */ }
}

document.addEventListener('DOMContentLoaded', () => {
    // Status filter change
    document.getElementById('pendingStatusFilter')
        ?.addEventListener('change', loadPendingReports);

    // Refresh badge every 90 seconds
    setInterval(updatePendingBadge, 90_000);
});