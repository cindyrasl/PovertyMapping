/* ============================================================
   admin.js — Admin panel: users, audit log, emergency reports
   Single-admin simplified version
   ============================================================ */
'use strict';

async function openAdminPanel() {
    openModal('adminModal');
    loadAdminUsers();
    loadAuditLog();
    loadReportsTable();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const key = tab.dataset.atab;
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('atab-' + key)?.classList.add('active');
            if (key === 'audit')   loadAuditLog();
            if (key === 'reports') loadReportsTable();
            if (key === 'users')   loadAdminUsers();
        });
    });

    const us = document.getElementById('userSearch');
    if (us) us.addEventListener('input', debounce(() => loadAdminUsers(us.value), 350));
});

async function loadAdminUsers(q = '') {
    const tbody = document.getElementById('usersTbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Memuat...</td></tr>';

    const params = {};
    if (q) params.q = q;
    const r = await ApiUsers.list(params);

    if (!r.ok) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Gagal memuat.</td></tr>';
        return;
    }

    const users = r.data.data?.users || [];
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Tidak ada pengguna.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => `
        <tr>
            <td><strong>${u.name}</strong></td>
            <td style="font-size:11px;color:#5a6478;">${u.email}</td>
            <td style="font-size:10.5px;color:#9ba4b5;">${formatDateTime(u.last_login_at)}</td>
            <td style="font-size:10.5px;color:#9ba4b5;">${formatDateTime(u.created_at)}</td>
        </tr>`).join('');
}

async function loadAuditLog() {
    const tbody = document.getElementById('auditTbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Memuat...</td></tr>';

    const r = await ApiLogs.list({ limit: 100 });
    if (!r.ok) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Gagal memuat.</td></tr>';
        return;
    }

    const logs = r.data.data?.logs || [];
    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada log.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(l => {
        const actionColor = l.action.includes('delete') ? '#d63230'
                          : l.action.includes('create') ? '#0b9e73'
                          : '#d97706';
        return `
        <tr>
            <td style="font-size:10.5px;color:#9ba4b5;white-space:nowrap;">${formatDateTime(l.created_at)}</td>
            <td><code style="font-size:10px;color:${actionColor};background:${actionColor}15;padding:2px 6px;border-radius:4px;">${l.action}</code></td>
            <td style="font-size:10.5px;color:#5a6478;">${l.table_name}</td>
            <td style="font-family:'DM Mono',monospace;font-size:10.5px;color:#9ba4b5;">${l.record_id ?? '—'}</td>
            <td style="font-size:10.5px;color:#9ba4b5;">${l.ip_address}</td>
        </tr>`;
    }).join('');
}

async function loadReportsTable() {
    const tbody = document.getElementById('reportsTbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Memuat...</td></tr>';

    const statusFilter = document.getElementById('reportStatusFilter')?.value || '';
    const severityFilter = document.getElementById('reportSeverityFilter')?.value || '';
    
    const params = { limit: 200 };
    if (statusFilter) params.status = statusFilter;
    if (severityFilter) params.severity = severityFilter;

    const r = await ApiReports.list(params);
    if (!r.ok) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Gagal memuat.</td></tr>';
        return;
    }

    const reports = r.data.data?.reports || [];
    if (!reports.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Tidak ada laporan.</td></tr>';
        return;
    }

    const typeLabel = { 
        sakit: 'Sakit', 
        kecelakaan: 'Kecelakaan', 
        bencana: 'Bencana', 
        kehilangan_pekerjaan: 'Kehil. Pekerjaan', 
        kematian: 'Kematian', 
        lainnya: 'Lainnya' 
    };
    const sevLabel = { ringan: 'Ringan', sedang: 'Sedang', berat: 'Berat', kritis: 'Kritis' };
    const stLabel = { open: 'Terbuka', in_progress: 'Diproses', resolved: 'Selesai', closed: 'Ditutup' };

    tbody.innerHTML = reports.map(rep => {
        const sColor = SEVERITY_COLORS[rep.severity] || '#9ba4b5';
        const stColor = rep.status === 'open' ? '#d63230' : rep.status === 'resolved' ? '#0b9e73' : rep.status === 'closed' ? '#9ba4b5' : '#d97706';
        return `
        <tr>
            <td style="font-size:10px;color:#9ba4b5;white-space:nowrap;">${formatDateTime(rep.created_at)}</td>
            <td style="font-size:11.5px;font-weight:600;">
                ${rep.head_name || '—'}
                ${rep.address ? `<br><small style="color:#9ba4b5;font-size:9px;">${truncate(rep.address, 35)}</small>` : ''}
            </td>
            <td style="font-size:11px;">${typeLabel[rep.type] || rep.type}</td>
            <td><span style="padding:2px 7px;border-radius:20px;font-size:9.5px;font-weight:700;background:${sColor}18;color:${sColor};">${sevLabel[rep.severity] || rep.severity}</span></td>
            <td>
                <select onchange="updateReportStatus(${rep.id}, this.value)" 
                    style="padding:3px 6px;border-radius:20px;font-size:9.5px;font-weight:700;background:${stColor}15;color:${stColor};border:1px solid ${stColor}40;cursor:pointer;">
                    <option value="open" ${rep.status === 'open' ? 'selected' : ''}>Terbuka</option>
                    <option value="in_progress" ${rep.status === 'in_progress' ? 'selected' : ''}>Diproses</option>
                    <option value="resolved" ${rep.status === 'resolved' ? 'selected' : ''}>Selesai</option>
                    <option value="closed" ${rep.status === 'closed' ? 'selected' : ''}>Ditutup</option>
                </select>
            </td>
            <td style="font-size:10px;color:#5a6478;max-width:180px;word-wrap:break-word;">${truncate(rep.description || '', 80)}</td>
            <td>
                <button class="action-btn" onclick="viewReportDetail(${rep.id})" title="Lihat Detail"><i class="fas fa-eye"></i></button>
                <button class="action-btn danger" onclick="deleteReport(${rep.id})" title="Hapus"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function updateReportStatus(id, status) {
    const r = await ApiReports.update(id, { status });
    if (r.ok && r.data?.success) {
        showToast('Status laporan diperbarui.', 'success');
        loadStats();
    } else {
        showToast('Gagal memperbarui status.', 'error');
        loadReportsTable();
    }
}

// Report Detail Modal
async function viewReportDetail(id) {
    showLoading(true);
    const r = await ApiReports.show(id);
    showLoading(false);
    
    if (!r.ok || !r.data?.data) {
        showToast('Laporan tidak ditemukan.', 'error');
        return;
    }
    
    const rep = r.data.data;
    const typeLabel = { sakit:'Sakit', kecelakaan:'Kecelakaan', bencana:'Bencana', kehilangan_pekerjaan:'Kehil. Pekerjaan', kematian:'Kematian', lainnya:'Lainnya' };
    const sevLabel = { ringan:'Ringan', sedang:'Sedang', berat:'Berat', kritis:'Kritis' };
    const stLabel = { open:'Terbuka', in_progress:'Diproses', resolved:'Selesai', closed:'Ditutup' };
    const sColor = SEVERITY_COLORS[rep.severity] || '#9ba4b5';
    
    // Build detail modal if not exists
    let modal = document.getElementById('reportDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reportDetailModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
        <div class="modal" style="max-width:500px;">
            <div class="modal-header">
                <h2><i class="fas fa-exclamation-triangle"></i> Detail Laporan Darurat</h2>
                <span class="modal-close" onclick="closeModal('reportDetailModal')">&times;</span>
            </div>
            <div id="reportDetailContent"></div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-sm" onclick="closeModal('reportDetailModal')">Tutup</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    
    document.getElementById('reportDetailContent').innerHTML = `
        <div style="background:var(--surface-2);border-radius:var(--r);padding:14px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <strong style="font-size:14px;">#${rep.id} - ${typeLabel[rep.type] || rep.type}</strong>
                <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${sColor}18;color:${sColor};">${sevLabel[rep.severity] || rep.severity}</span>
            </div>
            <div style="font-size:11px;color:#5a6478;margin-bottom:8px;">
                <strong>Status:</strong> ${stLabel[rep.status] || rep.status}
            </div>
            <div style="font-size:11px;color:#5a6478;margin-bottom:8px;">
                <strong>Deskripsi:</strong><br>${rep.description || '—'}
            </div>
            <div style="font-size:11px;color:#9ba4b5;margin-bottom:4px;">
                Dibuat: ${formatDateTime(rep.created_at)}
            </div>
            ${rep.resolved_at ? `<div style="font-size:11px;color:#9ba4b5;">Diselesaikan: ${formatDateTime(rep.resolved_at)}</div>` : ''}
        </div>
        <div style="background:var(--surface-2);border-radius:var(--r);padding:14px;">
            <strong style="font-size:12px;color:var(--text-primary);">Informasi Rumah</strong>
            <div style="font-size:11px;color:#5a6478;margin-top:8px;">
                <p><strong>KK:</strong> ${rep.head_name || '—'}</p>
                <p><strong>NIK:</strong> ${rep.nik || '—'}</p>
                <p><strong>Alamat:</strong> ${rep.address || '—'}</p>
                <p><strong>Kondisi:</strong> ${rep.house_condition === 'layak' ? 'Layak' : 'Tidak Layak'}</p>
                <p><strong>Tanggungan:</strong> ${rep.dependents || 0} orang</p>
                <p><strong>Pendapatan:</strong> Rp ${(rep.income || 0).toLocaleString('id-ID')}/bln</p>
            </div>
        </div>
    `;
    
    openModal('reportDetailModal');
}

async function deleteReport(id) {
    if (!confirm('Hapus laporan ini secara permanen?')) return;
    showLoading(true);
    const r = await ApiReports.delete(id);
    showLoading(false);
    if (r.ok && r.data?.success) {
        showToast('Laporan dihapus.', 'success');
        loadReportsTable();
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menghapus laporan.', 'error');
    }
}

async function resolveReport(id) {
    if (!confirm('Tandai laporan ini sebagai selesai?')) return;
    const r = await ApiReports.resolve(id);
    if (r.ok && r.data?.success) {
        showToast('Laporan diselesaikan.', 'success');
        loadReportsTable();
        loadStats();
    } else {
        showToast('Gagal menyelesaikan laporan.', 'error');
    }
}

async function deleteReport(id) {
    if (!confirm('Hapus laporan ini secara permanen?')) return;
    const r = await ApiReports.delete(id);
    if (r.ok && r.data?.success) {
        showToast('Laporan dihapus.', 'success');
        loadReportsTable();
    } else {
        showToast('Gagal menghapus laporan.', 'error');
    }
}