/* ============================================================
   public-reports.js — Admin panel: public report verification
   Loaded after app.js — requires loadAllData() and loadStats()
   on window (exported by app.js)
   ============================================================ */
'use strict';

// ================================================================
// API wrapper for public reports
// ================================================================
const ApiPublicReports = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request('api/public/report.php?action=list' + (qs ? '&' + qs : ''), { method: 'GET' });
    },
    async approve(id, body = {}) {
        return Http.post(`api/public/report.php?action=approve&id=${id}`, body);
    },
    async reject(id, body = {}) {
        return Http.post(`api/public/report.php?action=reject&id=${id}`, body);
    },
    async delete(id) {
        return Http.post(`api/public/report.php?action=delete&id=${id}`);
    },
};

// ================================================================
// Load pending reports into admin panel table
// ================================================================
async function loadPendingReports() {
    const tbody  = document.getElementById('pendingTbody');
    if (!tbody) return;

    const status = document.getElementById('pendingStatusFilter')?.value ?? 'pending';
    const params = { limit: 100 };
    if (status) params.status = status;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#9ba4b5;padding:18px;">Memuat...</td></tr>';

    const r = await ApiPublicReports.list(params);

    if (!r.ok || !r.data?.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--danger);padding:18px;">Gagal memuat laporan publik.</td></tr>';
        return;
    }

    const reports = r.data.data?.reports || [];

    // Update badge count (always count actual pending)
    const badge = document.getElementById('pendingBadge');
    if (badge) {
        const pendingCount = reports.filter(rep => rep.status === 'pending').length;
        badge.textContent = pendingCount > 0 ? pendingCount : '';
    }

    if (!reports.length) {
        const emptyMsg = status === 'pending' ? 'Tidak ada laporan yang menunggu verifikasi.' : 'Tidak ada laporan.';
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:#9ba4b5;padding:24px;">
            <i class="fas fa-check-circle" style="font-size:20px;display:block;margin-bottom:8px;opacity:0.3;"></i>
            ${emptyMsg}
        </td></tr>`;
        return;
    }

    const statusMap = {
        pending:  { label: 'Menunggu',  color: '#d97706', bg: '#fef6e4' },
        approved: { label: 'Disetujui', color: '#0b9e73', bg: '#e0faf3' },
        rejected: { label: 'Ditolak',   color: '#d63230', bg: '#fff0f0' },
    };

    tbody.innerHTML = reports.map(rep => {
        const st      = statusMap[rep.status] || { label: rep.status, color: '#9ba4b5', bg: '#f5f6f9' };
        const canAct  = rep.status === 'pending';
        const dateStr = formatDateTime(rep.created_at);

        return `
        <tr style="vertical-align:top;">
            <td style="font-size:9.5px;color:#9ba4b5;white-space:nowrap;padding-top:10px;">${dateStr}</td>
            <td style="padding-top:8px;">
                <div style="font-size:12px;font-weight:700;color:#0f1623;">${rep.head_name || '—'}</div>
                ${rep.reporter_name
                    ? `<div style="font-size:10px;color:#9ba4b5;margin-top:2px;"><i class="fas fa-user" style="font-size:9px;"></i> ${rep.reporter_name}${rep.reporter_phone ? ' · ' + rep.reporter_phone : ''}</div>`
                    : ''}
            </td>
            <td style="font-size:10.5px;color:#5a6478;max-width:130px;padding-top:10px;">${truncate(rep.address || '—', 38)}</td>
            <td style="font-size:10.5px;color:#5a6478;max-width:160px;padding-top:10px;">${truncate(rep.description || '—', 60)}</td>
            <td style="padding-top:10px;">
                <span style="padding:3px 9px;border-radius:20px;font-size:9.5px;font-weight:700;
                    background:${st.bg};color:${st.color};white-space:nowrap;">${st.label}</span>
                ${rep.admin_notes
                    ? `<div style="font-size:9px;color:#9ba4b5;margin-top:3px;">${truncate(rep.admin_notes, 25)}</div>`
                    : ''}
                ${rep.converted_household_id
                    ? `<div style="font-size:9px;color:#0b9e73;margin-top:2px;"><i class="fas fa-home"></i> ID: ${rep.converted_household_id}</div>`
                    : ''}
            </td>
            <td style="white-space:nowrap;padding-top:8px;">
                ${canAct ? `
                    <button class="action-btn" onclick="openApproveModal(${rep.id}, ${safeJson(rep)})"
                        style="color:#0b9e73;border-color:#a8e8d4;" title="Setujui & tambah ke peta">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="action-btn" onclick="openRejectModal(${rep.id})"
                        style="color:var(--danger);border-color:#fcc;" title="Tolak laporan">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
                <button class="action-btn" onclick="flyToPublicReport(${rep.latitude}, ${rep.longitude})"
                    title="Lihat di peta" style="color:var(--accent);border-color:#c8d0f5;">
                    <i class="fas fa-map-marker-alt"></i>
                </button>
                <button class="action-btn danger" onclick="deletePublicReport(${rep.id})" title="Hapus permanen">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

/** Safely JSON-encode report object for inline onclick attribute */
function safeJson(obj) {
    return JSON.stringify(obj)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ================================================================
// Approve modal
// ================================================================
function openApproveModal(reportId, reportData) {
    document.getElementById('approveReportId').value  = reportId;
    document.getElementById('approveIncome').value     = 0;
    document.getElementById('approveDependents').value = 1;
    document.getElementById('approveCondition').value  = 'tidak_layak';
    document.getElementById('approveEducation').value  = 'sd';
    document.getElementById('approveNotes').value      = '';

    const preview = document.getElementById('approveReportPreview');
    if (preview && reportData) {
        const data = typeof reportData === 'string' ? JSON.parse(reportData) : reportData;
        preview.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:10px;">
                <div style="width:32px;height:32px;border-radius:8px;background:#fff0f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas fa-flag" style="color:var(--danger);font-size:14px;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:700;color:#0f1623;">${data.head_name || '—'}</div>
                    <div style="font-size:11px;color:#5a6478;margin-top:3px;">${data.address || '—'}</div>
                    <div style="font-size:11px;color:#5a6478;margin-top:5px;font-style:italic;border-left:2px solid #e2e6ef;padding-left:8px;">"${truncate(data.description || '', 100)}"</div>
                    ${data.reporter_name ? `<div style="font-size:10.5px;color:#9ba4b5;margin-top:4px;"><i class="fas fa-user" style="font-size:9px;"></i> ${data.reporter_name}</div>` : ''}
                </div>
            </div>`;
    }

    openModal('approveModal');
}

document.getElementById('approveForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('approveReportId').value);
    if (!id) return;

    const body = {
        income:          parseInt(document.getElementById('approveIncome').value) || 0,
        dependents:      parseInt(document.getElementById('approveDependents').value) || 1,
        house_condition: document.getElementById('approveCondition').value,
        education:       document.getElementById('approveEducation').value,
        land_ownership:  'numpang',
        admin_notes:     document.getElementById('approveNotes').value.trim() || null,
    };

    showLoading(true);
    const r = await ApiPublicReports.approve(id, body);
    showLoading(false);

    if (r.ok && r.data?.success) {
        closeModal('approveModal');
        showToast('Laporan disetujui. Data rumah ditambahkan ke peta.', 'success', 4000);
        loadPendingReports();
        // Refresh map and stats
        if (typeof loadAllData === 'function') await loadAllData();
        if (typeof loadStats   === 'function') await loadStats();
        updatePendingBadge();
    } else {
        showToast(r.data?.message || 'Gagal menyetujui laporan.', 'error');
    }
});

// ================================================================
// Reject modal
// ================================================================
function openRejectModal(reportId) {
    document.getElementById('rejectReportId').value = reportId;
    document.getElementById('rejectNotes').value    = '';
    openModal('rejectModal');
}

document.getElementById('rejectForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('rejectReportId').value);
    if (!id) return;

    const body = {
        admin_notes: document.getElementById('rejectNotes').value.trim() || null,
    };

    showLoading(true);
    const r = await ApiPublicReports.reject(id, body);
    showLoading(false);

    if (r.ok && r.data?.success) {
        closeModal('rejectModal');
        showToast('Laporan ditolak.', 'success');
        loadPendingReports();
        if (typeof loadStats === 'function') loadStats();
        updatePendingBadge();
    } else {
        showToast(r.data?.message || 'Gagal menolak laporan.', 'error');
    }
});

// ================================================================
// Delete
// ================================================================
async function deletePublicReport(id) {
    if (!confirm('Hapus laporan ini secara permanen? Tindakan ini tidak dapat dibatalkan.')) return;
    showLoading(true);
    const r = await ApiPublicReports.delete(id);
    showLoading(false);
    if (r.ok && r.data?.success) {
        showToast('Laporan dihapus.', 'success');
        loadPendingReports();
        if (typeof loadStats === 'function') loadStats();
        updatePendingBadge();
    } else {
        showToast(r.data?.message || 'Gagal menghapus laporan.', 'error');
    }
}

// ================================================================
// Fly to location on map
// ================================================================
function flyToPublicReport(lat, lng) {
    closeModal('adminModal');
    flyTo(parseFloat(lat), parseFloat(lng), 17);

    // Temporary highlight pulse
    const highlight = L.circleMarker([lat, lng], {
        radius: 20, color: '#d63230', fillColor: '#d63230',
        fillOpacity: 0.2, weight: 2.5,
    }).addTo(MAP);

    setTimeout(() => { if (MAP.hasLayer(highlight)) MAP.removeLayer(highlight); }, 5000);
    showToast('Lokasi laporan ditampilkan di peta.', 'success');
}

// ================================================================
// Expose to global scope
// ================================================================
window.loadPendingReports  = loadPendingReports;
window.openApproveModal    = openApproveModal;
window.openRejectModal     = openRejectModal;
window.deletePublicReport  = deletePublicReport;
window.flyToPublicReport   = flyToPublicReport;
