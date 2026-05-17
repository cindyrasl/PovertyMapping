/* ============================================================
   public-reports.js — Admin panel: public report verification
   Handles the "Laporan Publik" tab in admin panel
   ============================================================ */
'use strict';

// ---- Extend API object with public report endpoints --------
const ApiPublicReports = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request('api/public/report.php' + (qs ? '?' + qs : ''), { method: 'GET' });
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

// ---- Load pending public reports into admin tab ------------
async function loadPendingReports() {
    const tbody  = document.getElementById('pendingTbody');
    if (!tbody) return;

    const status = document.getElementById('pendingStatusFilter')?.value ?? 'pending';
    const params = { limit: 100 };
    if (status) params.status = status;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Memuat...</td></tr>';

    const r = await ApiPublicReports.list(params);
    if (!r.ok || !r.data?.success) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Gagal memuat laporan publik.</td></tr>';
        return;
    }

    const reports = r.data.data?.reports || [];

    // Update badge
    const badge = document.getElementById('pendingBadge');
    if (badge) {
        const pendingCount = reports.filter(rep => rep.status === 'pending').length;
        badge.textContent = pendingCount || '';
    }

    if (!reports.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--text-muted);padding:20px;">Tidak ada laporan.</td></tr>';
        return;
    }

    const statusMap = {
        pending:  { label: 'Menunggu',  color: '#d97706' },
        approved: { label: 'Disetujui', color: '#0b9e73' },
        rejected: { label: 'Ditolak',   color: '#d63230' },
    };

    tbody.innerHTML = reports.map(rep => {
        const st = statusMap[rep.status] || { label: rep.status, color: '#9ba4b5' };
        const canAct = rep.status === 'pending';
        return `
        <tr>
            <td style="font-size:10px;color:#9ba4b5;white-space:nowrap;">${formatDateTime(rep.created_at)}</td>
            <td style="font-size:11.5px;">
                <strong>${rep.head_name || '—'}</strong>
                ${rep.reporter_name ? `<br><small style="color:#9ba4b5;font-size:9.5px;">Pelapor: ${rep.reporter_name}</small>` : ''}
                ${rep.reporter_phone ? `<br><small style="color:#9ba4b5;font-size:9.5px;"><i class="fas fa-phone"></i> ${rep.reporter_phone}</small>` : ''}
            </td>
            <td style="font-size:10.5px;color:#5a6478;max-width:140px;">${truncate(rep.address || '—', 40)}</td>
            <td style="font-size:10.5px;color:#5a6478;max-width:180px;">${truncate(rep.description || '—', 70)}</td>
            <td>
                <span style="padding:2px 8px;border-radius:20px;font-size:9.5px;font-weight:700;
                    background:${st.color}15;color:${st.color};">${st.label}</span>
                ${rep.admin_notes ? `<br><small style="color:#9ba4b5;font-size:9px;">${truncate(rep.admin_notes, 30)}</small>` : ''}
                ${rep.converted_household_id ? `<br><small style="color:#0b9e73;font-size:9px;"><i class="fas fa-home"></i> ID Rumah: ${rep.converted_household_id}</small>` : ''}
            </td>
            <td style="white-space:nowrap;">
                ${canAct ? `
                    <button class="action-btn" onclick="openApproveModal(${rep.id}, ${JSON.stringify(rep).replace(/"/g, '&quot;')})"
                        style="color:#0b9e73;border-color:#0b9e73;" title="Setujui — tambah ke peta">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="action-btn" onclick="openRejectModal(${rep.id})"
                        style="color:var(--danger);border-color:var(--danger);" title="Tolak laporan">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
                <button class="action-btn" onclick="flyToPublicReport(${rep.latitude}, ${rep.longitude})"
                    title="Lihat di peta">
                    <i class="fas fa-map-marker-alt"></i>
                </button>
                <button class="action-btn danger" onclick="deletePublicReport(${rep.id})" title="Hapus laporan">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ---- Open approve modal ------------------------------------
function openApproveModal(reportId, reportData) {
    document.getElementById('approveReportId').value = reportId;
    document.getElementById('approveIncome').value      = 0;
    document.getElementById('approveDependents').value  = 1;
    document.getElementById('approveCondition').value   = 'tidak_layak';
    document.getElementById('approveEducation').value   = 'sd';
    document.getElementById('approveNotes').value       = '';

    // Preview
    const preview = document.getElementById('approveReportPreview');
    if (preview && reportData) {
        preview.innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:10px;">
                <i class="fas fa-flag" style="color:var(--danger);font-size:16px;margin-top:2px;"></i>
                <div>
                    <strong style="font-size:13px;">${reportData.head_name || '—'}</strong>
                    <div style="font-size:11px;color:#5a6478;margin-top:2px;">${reportData.address || '—'}</div>
                    <div style="font-size:11px;color:#5a6478;margin-top:4px;font-style:italic;">"${truncate(reportData.description || '', 100)}"</div>
                    ${reportData.reporter_name ? `<div style="font-size:10.5px;color:#9ba4b5;margin-top:4px;">Dilaporkan oleh: ${reportData.reporter_name}</div>` : ''}
                </div>
            </div>`;
    }

    openModal('approveModal');
}

// ---- Submit approve ----------------------------------------
document.getElementById('approveForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('approveReportId').value);
    if (!id) return;

    const body = {
        income:         parseInt(document.getElementById('approveIncome').value || 0),
        dependents:     parseInt(document.getElementById('approveDependents').value || 1),
        house_condition:document.getElementById('approveCondition').value,
        education:      document.getElementById('approveEducation').value,
        land_ownership: 'numpang',  // safe default for public report
        admin_notes:    document.getElementById('approveNotes').value.trim(),
    };

    showLoading(true);
    const r = await ApiPublicReports.approve(id, body);
    showLoading(false);

    if (r.ok && r.data?.success) {
        closeModal('approveModal');
        showToast('Laporan disetujui. Data rumah ditambahkan ke peta.', 'success');
        loadPendingReports();
        await loadAllData();   // refresh map markers
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menyetujui laporan.', 'error');
    }
    return false;
});

// ---- Open reject modal -------------------------------------
function openRejectModal(reportId) {
    document.getElementById('rejectReportId').value = reportId;
    document.getElementById('rejectNotes').value    = '';
    openModal('rejectModal');
}

// ---- Submit reject -----------------------------------------
document.getElementById('rejectForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('rejectReportId').value);
    if (!id) return;

    const body = { admin_notes: document.getElementById('rejectNotes').value.trim() };

    showLoading(true);
    const r = await ApiPublicReports.reject(id, body);
    showLoading(false);

    if (r.ok && r.data?.success) {
        closeModal('rejectModal');
        showToast('Laporan ditolak.', 'success');
        loadPendingReports();
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menolak laporan.', 'error');
    }
    return false;
});

// ---- Delete ------------------------------------------------
async function deletePublicReport(id) {
    if (!confirm('Hapus laporan publik ini secara permanen?')) return;
    showLoading(true);
    const r = await ApiPublicReports.delete(id);
    showLoading(false);
    if (r.ok && r.data?.success) {
        showToast('Laporan dihapus.', 'success');
        loadPendingReports();
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menghapus.', 'error');
    }
}

// ---- Fly to public report location -------------------------
function flyToPublicReport(lat, lng) {
    closeModal('adminModal');
    flyTo(parseFloat(lat), parseFloat(lng), 17);
    // Temporary highlight marker
    const highlight = L.circleMarker([lat, lng], {
        radius: 18, color: '#d63230', fillColor: '#d63230',
        fillOpacity: 0.25, weight: 2.5,
    }).addTo(MAP);
    setTimeout(() => MAP.removeLayer(highlight), 5000);
    showToast('Menampilkan lokasi laporan di peta.', 'success');
}

// ---- Hook admin tab click for pending reports --------------
document.addEventListener('DOMContentLoaded', () => {
    // Extend the admin-tabs click handler for the 'pending' tab
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.atab === 'pending') {
                loadPendingReports();
            }
        });
    });

    // Status filter change
    document.getElementById('pendingStatusFilter')?.addEventListener('change', loadPendingReports);

    // Auto-load pending count on admin panel open (badge update)
    // This is called from openAdminPanel() defined in admin.js
});

// ---- Export so admin.js can call it ------------------------
window.loadPendingReports  = loadPendingReports;
window.openApproveModal    = openApproveModal;
window.openRejectModal     = openRejectModal;
window.deletePublicReport  = deletePublicReport;
window.flyToPublicReport   = flyToPublicReport;
