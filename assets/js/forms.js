/* ============================================================
   forms.js — All modal form logic: center, house, aid, report
   Single-admin version with dynamic dependent fields
   ============================================================ */
'use strict';

// Track dependent data for editing
let currentDependents = [];

function clientCalcPoverty(income, dependents, condition, education, landOwnership) {
    let severityPoints = 0;
    const indicators = [];
    const members = Math.max(1, dependents);
    const perCapita = income / members;
    
    // Per-capita income
    if (perCapita < 400000) {
        indicators.push('Pendapatan per kapita sangat rendah (< Rp 400.000)');
        severityPoints += 3;
    } else if (perCapita < 700000) {
        indicators.push('Pendapatan per kapita rendah (< Rp 700.000)');
        severityPoints += 2;
    } else if (perCapita < 1200000) {
        indicators.push('Pendapatan per kapita di bawah UMP');
        severityPoints += 1;
    }
    
    // Dependents
    if (dependents >= 7) {
        indicators.push('Tanggungan sangat besar (≥ 7 orang)');
        severityPoints += 3;
    } else if (dependents >= 5) {
        indicators.push('Tanggungan besar (5-6 orang)');
        severityPoints += 2;
    } else if (dependents >= 4) {
        indicators.push('Tanggungan cukup besar (4 orang)');
        severityPoints += 1;
    }
    
    // House condition
    if (condition === 'tidak_layak') {
        indicators.push('Kondisi rumah tidak layak huni');
        severityPoints += 3;
    }
    
    // Education
    const eduMap = {
        tidak_sekolah: ['Tidak pernah sekolah', 3],
        sd: ['Pendidikan hanya SD', 2],
        smp: ['Pendidikan hanya SMP', 1],
        sma: ['Pendidikan SMA', 0],
        diploma: ['Pendidikan Diploma', 0],
        sarjana: ['Pendidikan Sarjana', 0],
        pascasarjana: ['Pendidikan Pascasarjana', 0],
    };
    if (eduMap[education] && eduMap[education][1] > 0) {
        indicators.push(eduMap[education][0]);
        severityPoints += eduMap[education][1];
    }
    
    // Land ownership
    if (landOwnership === 'numpang') {
        indicators.push('Tidak memiliki lahan (numpang)');
        severityPoints += 2;
    } else if (landOwnership === 'sewa') {
        indicators.push('Lahan menyewa');
        severityPoints += 1;
    }
    
    let status, label;
    if (severityPoints >= 7) {
        status = 'sangat_miskin'; label = 'Sangat Miskin';
    } else if (severityPoints >= 4) {
        status = 'miskin'; label = 'Miskin';
    } else if (severityPoints >= 1) {
        status = 'rentan_miskin'; label = 'Rentan Miskin';
    } else {
        status = 'terdata'; label = 'Terdata';
    }
    
    return { status, label, indicators, severity: severityPoints };
}

function recalcPoverty() {
    const income = parseInt(document.getElementById('houseIncome')?.value || 0);
    const dependents = parseInt(document.getElementById('houseDependents')?.value || 1);
    const condition = document.getElementById('houseCondition')?.value || 'layak';
    const education = document.getElementById('houseEducation')?.value || 'sd';
    const landOwnership = document.getElementById('houseLandOwnership')?.value || 'milik';

    const { status, label, indicators } = clientCalcPoverty(income, dependents, condition, education, landOwnership);
    const color = POVERTY_COLORS[status] || '#9ba4b5';

    // Update the ring
    const ring = document.getElementById('povertyRing');
    const icon = document.getElementById('povertyIcon');
    const labelEl = document.getElementById('povertyStatusLabel');
    const indicatorList = document.getElementById('povertyIndicators');

    if (ring) {
        ring.style.borderColor = color;
        ring.style.boxShadow = `0 0 12px ${color}30`;
    }
    
    if (icon) {
        icon.style.color = color;
    }
    
    if (labelEl) {
        // Short label for the status
        const shortLabels = {
            sangat_miskin: 'Sangat Miskin',
            miskin: 'Miskin',
            rentan_miskin: 'Rentan Miskin',
            terdata: 'Terdata',
        };
        labelEl.textContent = shortLabels[status] || label;
        labelEl.style.color = color;
    }
    
    if (indicatorList && indicators.length > 0) {
        indicatorList.innerHTML = indicators.map(i => 
            `<li>${i}</li>`
        ).join('');
    } else if (indicatorList) {
        indicatorList.innerHTML = '<li style="color:#0b9e73;">Tidak ada indikator kemiskinan signifikan</li>';
    }
}

// ====================================================================
// DYNAMIC DEPENDENT FIELDS
// ====================================================================
function generateDependentFields() {
    const count = parseInt(document.getElementById('houseDependents').value) || 0;
    const container = document.getElementById('dependentsContainer');
    
    if (!container) return;
    
    // Preserve existing data
    const existingData = collectDependentData();
    
    container.innerHTML = '';
    currentDependents = [];
    
    for (let i = 0; i < count; i++) {
        const entry = document.createElement('div');
        entry.className = 'dependent-entry';
        entry.innerHTML = `
            <div class="dependent-number">Anggota Keluarga #${i + 1}</div>
            ${count > 1 ? `<button type="button" class="btn-remove-dependent" onclick="removeDependent(${i})" title="Hapus anggota ini">
                <i class="fas fa-times"></i>
            </button>` : ''}
            <div class="dependent-grid">
                <div class="form-group">
                    <label>NIK</label>
                    <input type="text" class="dep-nik" id="dep_nik_${i}" maxlength="16" 
                           placeholder="16 digit NIK (opsional)" 
                           value="${existingData[i]?.nik || ''}">
                </div>
                <div class="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" class="dep-name" id="dep_name_${i}" 
                           placeholder="Nama anggota keluarga"
                           value="${existingData[i]?.name || ''}">
                </div>
                <div class="form-group">
                    <label>Jenis Kelamin</label>
                    <select class="dep-gender" id="dep_gender_${i}">
                        <option value="male" ${existingData[i]?.gender === 'male' ? 'selected' : ''}>Laki-laki</option>
                        <option value="female" ${existingData[i]?.gender === 'female' ? 'selected' : ''}>Perempuan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tanggal Lahir</label>
                    <input type="date" class="dep-dob" id="dep_dob_${i}"
                           value="${existingData[i]?.date_of_birth || ''}">
                </div>
                <div class="form-group form-group-full">
                    <label>Pendidikan</label>
                    <select class="dep-education" id="dep_education_${i}">
                        <option value="tidak_sekolah" ${existingData[i]?.education === 'tidak_sekolah' ? 'selected' : ''}>Tidak Sekolah</option>
                        <option value="sd" ${existingData[i]?.education === 'sd' || !existingData[i]?.education ? 'selected' : ''}>SD</option>
                        <option value="smp" ${existingData[i]?.education === 'smp' ? 'selected' : ''}>SMP</option>
                        <option value="sma" ${existingData[i]?.education === 'sma' ? 'selected' : ''}>SMA</option>
                        <option value="diploma" ${existingData[i]?.education === 'diploma' ? 'selected' : ''}>Diploma</option>
                        <option value="sarjana" ${existingData[i]?.education === 'sarjana' ? 'selected' : ''}>Sarjana</option>
                        <option value="pascasarjana" ${existingData[i]?.education === 'pascasarjana' ? 'selected' : ''}>Pascasarjana</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(entry);
    }
    
    recalcPoverty();
}

function generateDependentFieldsFromData(data) {
    const count = data.length || parseInt(document.getElementById('houseDependents').value) || 0;
    const container = document.getElementById('dependentsContainer');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < count; i++) {
        const dep = data[i] || {};
        const entry = document.createElement('div');
        entry.className = 'dependent-entry';
        entry.innerHTML = `
            <div class="dependent-number">Anggota Keluarga #${i + 1}</div>
            ${count > 1 ? `<button type="button" class="btn-remove-dependent" onclick="removeDependent(${i})" title="Hapus anggota ini">
                <i class="fas fa-times"></i>
            </button>` : ''}
            <div class="dependent-grid">
                <div class="form-group">
                    <label>NIK</label>
                    <input type="text" class="dep-nik" id="dep_nik_${i}" maxlength="16" 
                           placeholder="16 digit NIK (opsional)"
                           value="${dep.nik || ''}">
                </div>
                <div class="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" class="dep-name" id="dep_name_${i}" 
                           placeholder="Nama anggota keluarga"
                           value="${dep.name || ''}">
                </div>
                <div class="form-group">
                    <label>Jenis Kelamin</label>
                    <select class="dep-gender" id="dep_gender_${i}">
                        <option value="male" ${dep.gender === 'male' ? 'selected' : ''}>Laki-laki</option>
                        <option value="female" ${dep.gender === 'female' ? 'selected' : ''}>Perempuan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tanggal Lahir</label>
                    <input type="date" class="dep-dob" id="dep_dob_${i}"
                           value="${dep.date_of_birth || ''}">
                </div>
                <div class="form-group form-group-full">
                    <label>Pendidikan</label>
                    <select class="dep-education" id="dep_education_${i}">
                        <option value="tidak_sekolah" ${dep.education === 'tidak_sekolah' ? 'selected' : ''}>Tidak Sekolah</option>
                        <option value="sd" ${dep.education === 'sd' || !dep.education ? 'selected' : ''}>SD</option>
                        <option value="smp" ${dep.education === 'smp' ? 'selected' : ''}>SMP</option>
                        <option value="sma" ${dep.education === 'sma' ? 'selected' : ''}>SMA</option>
                        <option value="diploma" ${dep.education === 'diploma' ? 'selected' : ''}>Diploma</option>
                        <option value="sarjana" ${dep.education === 'sarjana' ? 'selected' : ''}>Sarjana</option>
                        <option value="pascasarjana" ${dep.education === 'pascasarjana' ? 'selected' : ''}>Pascasarjana</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(entry);
    }
}

function collectDependentData() {
    const container = document.getElementById('dependentsContainer');
    if (!container) return [];
    
    const entries = container.querySelectorAll('.dependent-entry');
    const data = [];
    
    entries.forEach((entry, i) => {
        const nik = entry.querySelector('.dep-nik')?.value || '';
        const name = entry.querySelector('.dep-name')?.value || '';
        const gender = entry.querySelector('.dep-gender')?.value || 'male';
        const dob = entry.querySelector('.dep-dob')?.value || '';
        const education = entry.querySelector('.dep-education')?.value || 'sd';
        
        if (name || nik) {
            data.push({
                nik: nik,
                name: name,
                gender: gender,
                date_of_birth: dob,
                education: education,
            });
        }
    });
    
    return data;
}

function removeDependent(index) {
    const countInput = document.getElementById('houseDependents');
    const currentCount = parseInt(countInput.value) || 0;
    
    if (currentCount > 1) {
        countInput.value = currentCount - 1;
        generateDependentFields();
    }
}

function initFormTabs() {
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.dataset.ftab;
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('ftab-' + panel)?.classList.add('active');
            
            // Generate dependent fields when switching to dependents tab
            if (panel === 'dependents') {
                generateDependentFields();
            }
        });
    });
}

// ====================================================================
// RELIGIOUS CENTER MODAL
// ====================================================================
function openCenterModal(id = null, lat = null, lng = null, address = '') {
    const isEdit = !!id;
    document.getElementById('centerModalTitle').textContent = isEdit ? 'Edit Tempat Ibadah' : 'Tambah Tempat Ibadah';
    document.getElementById('centerId').value   = id || '';
    document.getElementById('centerLat').value  = lat || '';
    document.getElementById('centerLng').value  = lng || '';

    if (!isEdit) {
        document.getElementById('centerName').value        = '';
        document.getElementById('centerWorshipType').value = 'masjid';
        document.getElementById('centerRadius').value      = '300';
        document.getElementById('centerRadiusSlider').value= '300';
        document.getElementById('centerRadiusValue').textContent = '300m';
        document.getElementById('centerContactPerson').value = '';
        document.getElementById('centerContactPhone').value  = '';
        document.getElementById('centerNotes').value         = '';
        document.getElementById('centerAddress').value       = address;
        document.getElementById('centerLatDisplay').value    = lat ? lat.toFixed(6) : '';
        document.getElementById('centerLngDisplay').value    = lng ? lng.toFixed(6) : '';
        cancelPlacementMode();
        openModal('centerModal');
        return;
    }

    showLoading(true);
    ApiCenters.show(id).then(r => {
        showLoading(false);
        if (!r.ok) { showToast('Gagal memuat data.', 'error'); return; }
        const c = r.data.data;
        document.getElementById('centerName').value         = c.name;
        document.getElementById('centerWorshipType').value  = c.worship_type;
        document.getElementById('centerRadius').value       = c.radius;
        document.getElementById('centerRadiusSlider').value = c.radius;
        document.getElementById('centerRadiusValue').textContent = c.radius + 'm';
        document.getElementById('centerContactPerson').value = c.contact_person || '';
        document.getElementById('centerContactPhone').value  = c.contact_phone  || '';
        document.getElementById('centerNotes').value         = c.notes           || '';
        document.getElementById('centerAddress').value       = c.address;
        document.getElementById('centerLat').value           = c.latitude;
        document.getElementById('centerLng').value           = c.longitude;
        document.getElementById('centerLatDisplay').value    = parseFloat(c.latitude).toFixed(6);
        document.getElementById('centerLngDisplay').value    = parseFloat(c.longitude).toFixed(6);
        openModal('centerModal');
    });
}

document.getElementById('centerRadiusSlider')?.addEventListener('input', function () {
    document.getElementById('centerRadius').value = this.value;
    document.getElementById('centerRadiusValue').textContent = this.value + 'm';
});
document.getElementById('centerRadius')?.addEventListener('input', function () {
    document.getElementById('centerRadiusSlider').value = this.value;
    document.getElementById('centerRadiusValue').textContent = this.value + 'm';
});

document.getElementById('centerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const id  = document.getElementById('centerId').value;
    const lat = parseFloat(document.getElementById('centerLat').value);
    const lng = parseFloat(document.getElementById('centerLng').value);

    if (!lat || !lng) { showToast('Koordinat tidak valid.', 'error'); return; }

    const body = {
        name:           document.getElementById('centerName').value.trim(),
        worship_type:   document.getElementById('centerWorshipType').value,
        radius:         parseInt(document.getElementById('centerRadius').value),
        address:        document.getElementById('centerAddress').value,
        latitude:       lat,
        longitude:      lng,
        contact_person: document.getElementById('centerContactPerson').value.trim(),
        contact_phone:  document.getElementById('centerContactPhone').value.trim(),
        notes:          document.getElementById('centerNotes').value.trim(),
    };

    // Validate
    if (!body.name) { showToast('Nama tempat ibadah wajib diisi.', 'error'); return; }

    showLoading(true);
    const r = id ? await ApiCenters.update(id, body) : await ApiCenters.create(body);
    showLoading(false);

    if (r.ok && r.data?.success) {
        closeModal('centerModal');
        cancelPlacementMode();
        showToast(id ? 'Tempat ibadah diperbarui.' : 'Tempat ibadah ditambahkan.', 'success');
        await loadAllData();
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menyimpan.', 'error');
    }
    return false;
});

async function editCenter(id) {
    MAP.closePopup();
    openCenterModal(id);
}

async function deleteCenter(id) {
    if (!confirm('Hapus tempat ibadah ini? Semua data terkait akan dihapus.')) return;
    showLoading(true);
    const r = await ApiCenters.delete(id);
    showLoading(false);
    MAP.closePopup();
    if (r.ok && r.data?.success) {
        showToast('Tempat ibadah dihapus.', 'success');
        await loadAllData();
        recountCenterHouseholds();   
        renderCenterList();           
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menghapus.', 'error');
    }
}

// ====================================================================
// HOUSEHOLD MODAL
// ====================================================================
async function openHouseModal(id = null, lat = null, lng = null, address = '') {
    const isEdit = !!id;
    document.getElementById('houseModalTitle').textContent = isEdit ? 'Edit Data Rumah' : 'Tambah Titik Rumah';
    document.getElementById('houseId').value  = id || '';
    document.getElementById('houseLat').value = lat || '';
    document.getElementById('houseLng').value = lng || '';

    // Reset form tabs to first
    document.querySelectorAll('.form-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.form-tab-panel').forEach((p, i) => p.classList.toggle('active', i === 0));

    if (!isEdit) {
        document.getElementById('houseHeadName').value    = '';
        document.getElementById('houseNIK').value         = '';
        document.getElementById('houseGender').value      = 'male';
        document.getElementById('houseDOB').value         = '';
        document.getElementById('houseEducation').value   = 'sd';
        document.getElementById('houseDependents').value  = '1';
        document.getElementById('houseCondition').value   = 'layak';
        document.getElementById('houseLandOwnership').value = 'milik';
        document.getElementById('houseIncome').value      = '0';
        document.getElementById('houseJob').value         = '';
        document.getElementById('houseAddress').value     = address;
        document.getElementById('houseLatDisplay').value  = lat ? lat.toFixed(6) : '';
        document.getElementById('houseLngDisplay').value  = lng ? lng.toFixed(6) : '';
        document.getElementById('houseDescription').value = '';
        document.getElementById('houseAidStatus').value   = 'not_yet';
        document.getElementById('addAidBtn').style.display = 'none';
        document.getElementById('aidHistoryList').innerHTML = '<div class="empty-state" style="padding:14px;"><i class="fas fa-gift"></i><p>Belum ada riwayat bantuan</p></div>';
        document.getElementById('dependentsContainer').innerHTML = '';
        currentDependents = [];
        recalcPoverty();
        cancelPlacementMode();
        openModal('houseModal');
        return;
    }

    // Edit: load full record
    showLoading(true);
    const r = await ApiHouses.show(id);
    showLoading(false);
    if (!r.ok) { showToast('Gagal memuat data.', 'error'); return; }

    const h = r.data.data;
    document.getElementById('houseHeadName').value    = h.head_name;
    document.getElementById('houseNIK').value         = h.nik || '';
    document.getElementById('houseGender').value      = h.gender;
    document.getElementById('houseDOB').value         = h.date_of_birth || '';
    document.getElementById('houseEducation').value   = h.education;
    document.getElementById('houseDependents').value  = h.dependents;
    document.getElementById('houseCondition').value   = h.house_condition;
    document.getElementById('houseLandOwnership').value = h.land_ownership;
    document.getElementById('houseIncome').value      = h.income;
    document.getElementById('houseJob').value         = h.job || '';
    document.getElementById('houseAddress').value     = h.address;
    document.getElementById('houseLat').value         = h.latitude;
    document.getElementById('houseLng').value         = h.longitude;
    document.getElementById('houseLatDisplay').value  = parseFloat(h.latitude).toFixed(6);
    document.getElementById('houseLngDisplay').value  = parseFloat(h.longitude).toFixed(6);
    document.getElementById('houseDescription').value = h.description || '';
    document.getElementById('houseAidStatus').value   = h.aid_status;
    document.getElementById('aidHouseholdId').value   = h.id;
    document.getElementById('addAidBtn').style.display = '';

    // Load dependents
    currentDependents = h.household_members || [];
    generateDependentFieldsFromData(currentDependents);

    recalcPoverty();
    renderAidHistory(h.aid_history || []);
    openModal('houseModal');
}

function generateDependentFieldsFromData(data) {
    const count = data.length || parseInt(document.getElementById('houseDependents').value) || 0;
    const container = document.getElementById('dependentsContainer');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < count; i++) {
        const dep = data[i] || {};
        const entry = document.createElement('div');
        entry.className = 'dependent-entry';
        entry.innerHTML = `
            <div class="dependent-number">Anggota Keluarga #${i + 1}</div>
            <button type="button" class="btn-remove-dependent" onclick="removeDependent(${i})" title="Hapus anggota ini">
                <i class="fas fa-times"></i>
            </button>
            <div class="dependent-grid">
                <div class="form-group">
                    <label>NIK *</label>
                    <input type="text" class="dep-nik" id="dep_nik_${i}" maxlength="16" placeholder="16 digit NIK" pattern="[0-9]{16}"
                           value="${dep.nik || ''}">
                </div>
                <div class="form-group">
                    <label>Nama Lengkap *</label>
                    <input type="text" class="dep-name" id="dep_name_${i}" placeholder="Nama anggota keluarga"
                           value="${dep.name || ''}">
                </div>
                <div class="form-group">
                    <label>Jenis Kelamin</label>
                    <select class="dep-gender" id="dep_gender_${i}">
                        <option value="male" ${dep.gender === 'male' ? 'selected' : ''}>Laki-laki</option>
                        <option value="female" ${dep.gender === 'female' ? 'selected' : ''}>Perempuan</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Tanggal Lahir</label>
                    <input type="date" class="dep-dob" id="dep_dob_${i}"
                           value="${dep.date_of_birth || ''}">
                </div>
                <div class="form-group form-group-full">
                    <label>Pendidikan</label>
                    <select class="dep-education" id="dep_education_${i}">
                        <option value="tidak_sekolah" ${dep.education === 'tidak_sekolah' ? 'selected' : ''}>Tidak Sekolah</option>
                        <option value="sd" ${dep.education === 'sd' || !dep.education ? 'selected' : ''}>SD</option>
                        <option value="smp" ${dep.education === 'smp' ? 'selected' : ''}>SMP</option>
                        <option value="sma" ${dep.education === 'sma' ? 'selected' : ''}>SMA</option>
                        <option value="diploma" ${dep.education === 'diploma' ? 'selected' : ''}>Diploma</option>
                        <option value="sarjana" ${dep.education === 'sarjana' ? 'selected' : ''}>Sarjana</option>
                        <option value="pascasarjana" ${dep.education === 'pascasarjana' ? 'selected' : ''}>Pascasarjana</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(entry);
    }
}

function renderAidHistory(list) {
    const el = document.getElementById('aidHistoryList');
    if (!list || !list.length) {
        el.innerHTML = '<div class="empty-state" style="padding:14px;"><i class="fas fa-gift"></i><p>Belum ada riwayat bantuan</p></div>';
        return;
    }
    el.innerHTML = list.map((a, idx) => `
        <div class="aid-history-item" id="aid-item-${a.id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
            <span class="aid-badge" style="background:#e0faf3;color:#0b9e73;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">${AID_LABELS[a.aid_type] || a.aid_type}</span>
            <span style="flex:1;font-size:10.5px;color:#5a6478;">${formatDate(a.aid_date)}</span>
            <span style="font-size:10.5px;font-weight:600;color:#0f1623;">${a.amount ? formatRp(a.amount) : '—'}</span>
            <button type="button" class="action-btn" onclick="editAidRecord(${a.id})" title="Edit" style="padding:2px 6px;font-size:9px;">
                <i class="fas fa-pen"></i>
            </button>
            <button type="button" class="action-btn danger" onclick="deleteAidRecord(${a.id})" title="Hapus" style="padding:2px 6px;font-size:9px;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

// Edit aid record — opens aid modal pre-filled
async function editAidRecord(aidId) {
    showLoading(true);
    const r = await ApiAid.show(aidId);
    showLoading(false);
    
    if (!r.ok || !r.data?.data) {
        showToast('Gagal memuat data bantuan.', 'error');
        return;
    }
    
    const a = r.data.data;
    document.getElementById('aidHouseholdId').value = a.household_id;
    document.getElementById('aidDate').value = a.aid_date;
    document.getElementById('aidType').value = a.aid_type;
    document.getElementById('aidAmount').value = a.amount || 0;
    document.getElementById('aidNotes').value = a.notes || '';
    
    // Store edit mode and ID
    document.getElementById('aidForm').dataset.editId = aidId;
    document.querySelector('#aidModal .modal-header h2').textContent = 'Edit Bantuan';
    
    openModal('aidModal');
}

// Delete aid record
async function deleteAidRecord(aidId) {
    if (!confirm('Hapus riwayat bantuan ini?')) return;
    
    showLoading(true);
    const r = await ApiAid.delete(aidId);
    showLoading(false);
    
    if (r.ok && r.data?.success) {
        showToast('Riwayat bantuan dihapus.', 'success');
        
        // Remove from DOM
        const item = document.getElementById('aid-item-' + aidId);
        if (item) item.remove();
        
        // Reload house data to refresh aid status
        const houseId = document.getElementById('houseId').value;
        if (houseId) {
            const houseData = await ApiHouses.show(houseId);
            if (houseData.ok && houseData.data?.data) {
                renderAidHistory(houseData.data.data.aid_history || []);
                document.getElementById('houseAidStatus').value = houseData.data.data.aid_status;
            }
        }
    } else {
        showToast(r.data?.message || 'Gagal menghapus.', 'error');
    }
}

// Submit house form
document.getElementById('houseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const id  = document.getElementById('houseId').value;
    const lat = parseFloat(document.getElementById('houseLat').value);
    const lng = parseFloat(document.getElementById('houseLng').value);

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) { 
        showToast('Koordinat tidak valid. Klik peta terlebih dahulu.', 'error'); 
        return false;; 
    }

    // Collect dependent data
    const dependentsData = collectDependentData();

    // Get values
    const headName = document.getElementById('houseHeadName').value.trim();
    const nik = document.getElementById('houseNIK').value.trim();
    const dob = document.getElementById('houseDOB').value;
    const gender = document.getElementById('houseGender').value;

    // Validate required fields
    if (!headName) { showToast('Nama Kepala Keluarga wajib diisi.', 'error'); return; }
    if (!nik || nik.length !== 16) { showToast('NIK KK harus 16 digit.', 'error'); return; }
    if (!dob) { showToast('Tanggal Lahir KK wajib diisi.', 'error'); return; }

    // Build request body
    const body = {
        head_name:      headName,
        nik:            nik,                          // <-- key is 'nik', matches PHP
        gender:         gender,
        date_of_birth:  dob,
        education:      document.getElementById('houseEducation').value,
        dependents:     parseInt(document.getElementById('houseDependents').value) || 1,
        income:         parseInt(document.getElementById('houseIncome').value || 0),
        job:            document.getElementById('houseJob').value.trim(),
        house_condition: document.getElementById('houseCondition').value,
        land_ownership:  document.getElementById('houseLandOwnership').value,
        address:        document.getElementById('houseAddress').value,
        latitude:       lat,
        longitude:      lng,
        description:    document.getElementById('houseDescription').value.trim(),
        aid_status:     document.getElementById('houseAidStatus').value,
        household_members: dependentsData,
    };

    console.log('Sending payload:', JSON.stringify(body, null, 2)); // Debug log

    showLoading(true);
    try {
        const r = id ? await ApiHouses.update(id, body) : await ApiHouses.create(body);
        showLoading(false);

        console.log('API response:', r); // Debug log

        if (r.ok && r.data?.success) {
            closeModal('houseModal');
            cancelPlacementMode();
            showToast(id ? 'Data rumah diperbarui.' : 'Rumah berhasil ditambahkan.', 'success');
            await loadAllData();
            loadStats();
        } else {
            const errMsg = r.data?.message || 'Gagal menyimpan.';
            const errs = r.data?.errors;
            const fullMsg = errs ? errMsg + ': ' + Object.values(errs).flat().join(', ') : errMsg;
            showToast(fullMsg, 'error');
            console.error('Save failed:', r.data);
        }
    } catch (err) {
        showLoading(false);
        console.error('Request error:', err);
        showToast('Koneksi gagal: ' + err.message, 'error');
    }

    return false;
});

async function editHouse(id) {
    MAP.closePopup();
    await openHouseModal(id);
}

async function deleteHouse(id) {
    if (!confirm('Hapus data rumah ini? Semua data terkait akan dihapus.')) return;
    showLoading(true);
    const r = await ApiHouses.delete(id);
    showLoading(false);
    MAP.closePopup();
    if (r.ok && r.data?.success) {
        showToast('Data rumah dihapus.', 'success');
        await loadAllData();
        recountCenterHouseholds();     
        renderCenterList();           
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menghapus.', 'error');
    }
}

// ====================================================================
// AID MODAL
// ====================================================================
function openAidModalForHouse(householdId) {
    MAP.closePopup();
    document.getElementById('aidHouseholdId').value = householdId;
    document.getElementById('aidDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('aidType').value   = 'sembako';
    document.getElementById('aidAmount').value = '0';
    document.getElementById('aidNotes').value  = '';
    openModal('aidModal');
}

document.getElementById('aidForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const editId = document.getElementById('aidForm').dataset.editId;
    const body = {
        household_id: parseInt(document.getElementById('aidHouseholdId').value),
        aid_type:     document.getElementById('aidType').value,
        aid_date:     document.getElementById('aidDate').value,
        amount:       parseInt(document.getElementById('aidAmount').value || 0),
        notes:        document.getElementById('aidNotes').value.trim(),
    };
    
    showLoading(true);
    const r = editId 
        ? await ApiAid.update(editId, body) 
        : await ApiAid.create(body);
    showLoading(false);

    if (r.ok && r.data?.success) {
        closeModal('aidModal');
        
        // Reset edit mode
        document.getElementById('aidForm').dataset.editId = '';
        document.querySelector('#aidModal .modal-header h2').textContent = 'Catat Bantuan';
        
        showToast(editId ? 'Bantuan berhasil diperbarui.' : 'Bantuan berhasil dicatat.', 'success');
        
        // Reload house data
        const houseId = document.getElementById('houseId').value;
        if (houseId) {
            const houseData = await ApiHouses.show(houseId);
            if (houseData.ok && houseData.data?.data) {
                renderAidHistory(houseData.data.data.aid_history || []);
                document.getElementById('houseAidStatus').value = houseData.data.data.aid_status;
            }
        }
    } else {
        showToast(r.data?.message || 'Gagal menyimpan.', 'error');
    }
    return false;
});

document.getElementById('addAidBtn')?.addEventListener('click', () => {
    const hhId = document.getElementById('houseId').value;
    if (hhId) openAidModalForHouse(hhId);
});

// Emergency report modal removed — reporting now handled via lapor.html
// openReportModal is kept as a no-op to prevent JS errors from any stale references
function openReportModal(householdId) {
    showToast('Gunakan halaman lapor.html untuk melaporkan warga.', 'success', 3000);
}