/* ============================================================
   forms.js — All modal form logic (FULLY UPDATED)
   ============================================================ */
'use strict';

function clientCalcPoverty(income, dependents, condition, education, landOwnership) {
    let severityPoints = 0;
    const indicators = [];
    const members = Math.max(1, dependents);
    const perCapita = income / members;
    if (perCapita < 400000) { indicators.push('Pendapatan per kapita sangat rendah (< Rp 400.000)'); severityPoints += 3; }
    else if (perCapita < 700000) { indicators.push('Pendapatan per kapita rendah (< Rp 700.000)'); severityPoints += 2; }
    else if (perCapita < 1200000) { indicators.push('Pendapatan per kapita di bawah UMP'); severityPoints += 1; }
    if (dependents >= 7) { indicators.push('Tanggungan sangat besar (≥ 7 orang)'); severityPoints += 3; }
    else if (dependents >= 5) { indicators.push('Tanggungan besar (5-6 orang)'); severityPoints += 2; }
    else if (dependents >= 4) { indicators.push('Tanggungan cukup besar (4 orang)'); severityPoints += 1; }
    if (condition === 'tidak_layak') { indicators.push('Kondisi rumah tidak layak huni'); severityPoints += 3; }
    const eduMap = { tidak_sekolah: ['Tidak pernah sekolah', 3], sd: ['Pendidikan hanya SD', 2], smp: ['Pendidikan hanya SMP', 1], sma: ['Pendidikan SMA', 0], diploma: ['Pendidikan Diploma', 0], sarjana: ['Pendidikan Sarjana', 0], pascasarjana: ['Pendidikan Pascasarjana', 0] };
    if (eduMap[education] && eduMap[education][1] > 0) { indicators.push(eduMap[education][0]); severityPoints += eduMap[education][1]; }
    if (landOwnership === 'numpang') { indicators.push('Tidak memiliki lahan (numpang)'); severityPoints += 2; }
    else if (landOwnership === 'sewa') { indicators.push('Lahan menyewa'); severityPoints += 1; }
    let status, label;
    if (severityPoints >= 7) { status = 'sangat_miskin'; label = 'Sangat Miskin'; }
    else if (severityPoints >= 4) { status = 'miskin'; label = 'Miskin'; }
    else if (severityPoints >= 1) { status = 'rentan_miskin'; label = 'Rentan Miskin'; }
    else { status = 'terdata'; label = 'Terdata'; }
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
    const ring = document.getElementById('povertyRing');
    const icon = document.getElementById('povertyIcon');
    const labelEl = document.getElementById('povertyStatusLabel');
    const indicatorList = document.getElementById('povertyIndicators');
    if (ring) { ring.style.borderColor = color; ring.style.boxShadow = `0 0 12px ${color}30`; }
    if (icon) icon.style.color = color;
    if (labelEl) { const shortLabels = { sangat_miskin: 'Sangat Miskin', miskin: 'Miskin', rentan_miskin: 'Rentan Miskin', terdata: 'Terdata' }; labelEl.textContent = shortLabels[status] || label; labelEl.style.color = color; }
    if (indicatorList && indicators.length > 0) indicatorList.innerHTML = indicators.map(i => `<li>${i}</li>`).join('');
    else if (indicatorList) indicatorList.innerHTML = '<li style="color:#0b9e73;">Tidak ada indikator kemiskinan signifikan</li>';
}

function initFormTabs() {
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panel = tab.dataset.ftab;
            document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.form-tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('ftab-' + panel)?.classList.add('active');
        });
    });
}

async function reverseGeocodeDetailed(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id&addressdetails=1&zoom=18`;
        const response = await fetch(url, { headers: { 'User-Agent': 'WebGIS-PovertyMapping/2.0' } });
        const data = await response.json();
        let rt = '', rw = '', kelurahan = '', kecamatan = '', fullAddress = '';
        if (data && data.address) {
            const addr = data.address;
            rt = addr.quarter || addr.suburb || '';
            rw = addr.neighbourhood || '';
            kelurahan = addr.village || addr.suburb || addr.city_district || '';
            kecamatan = addr.city || addr.town || addr.municipality || '';
            const parts = [];
            if (addr.road) parts.push(addr.road);
            if (addr.house_number) parts.push('No. ' + addr.house_number);
            if (rt) parts.push('RT ' + rt);
            if (rw) parts.push('RW ' + rw);
            if (kelurahan) parts.push('Kel. ' + kelurahan);
            if (kecamatan) parts.push('Kec. ' + kecamatan);
            if (addr.city) parts.push(addr.city);
            if (addr.state) parts.push(addr.state);
            fullAddress = parts.join(', ');
        }
        return { rt, rw, kelurahan, kecamatan, fullAddress: fullAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}` };
    } catch (err) { return { rt: '', rw: '', kelurahan: '', kecamatan: '', fullAddress: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }; }
}

async function autoAssignReligiousCenter(lat, lng) {
    try {
        const r = await ApiCenters.nearby(lat, lng, 2);
        if (r.ok && r.data?.success && r.data.data.centers.length) {
            const nearest = r.data.data.centers[0];
            document.getElementById('managingCenterId').value = nearest.id;
            document.getElementById('managingCenterName').value = nearest.name;
            return nearest.id;
        }
    } catch (err) { console.warn('Failed to auto-assign center:', err); }
    return null;
}

function openCenterModal(id = null, lat = null, lng = null, address = '') {
    const isEdit = !!id;
    document.getElementById('centerModalTitle').textContent = isEdit ? 'Edit Tempat Ibadah' : 'Tambah Tempat Ibadah';
    document.getElementById('centerId').value = id || '';
    document.getElementById('centerLat').value = lat || '';
    document.getElementById('centerLng').value = lng || '';
    if (!isEdit) {
        document.getElementById('centerName').value = '';
        document.getElementById('centerWorshipType').value = 'masjid';
        document.getElementById('centerRadius').value = '300';
        document.getElementById('centerRadiusSlider').value = '300';
        document.getElementById('centerRadiusValue').textContent = '300m';
        document.getElementById('centerContactPerson').value = '';
        document.getElementById('centerContactPhone').value = '';
        document.getElementById('centerNotes').value = '';
        document.getElementById('centerAddress').value = address;
        document.getElementById('centerLatDisplay').value = lat ? lat.toFixed(6) : '';
        document.getElementById('centerLngDisplay').value = lng ? lng.toFixed(6) : '';
        cancelPlacementMode();
        openModal('centerModal');
        return;
    }
    showLoading(true);
    ApiCenters.show(id).then(r => {
        showLoading(false);
        if (!r.ok) { showToast('Gagal memuat data.', 'error'); return; }
        const c = r.data.data;
        document.getElementById('centerName').value = c.name;
        document.getElementById('centerWorshipType').value = c.worship_type;
        document.getElementById('centerRadius').value = c.radius;
        document.getElementById('centerRadiusSlider').value = c.radius;
        document.getElementById('centerRadiusValue').textContent = c.radius + 'm';
        document.getElementById('centerContactPerson').value = c.contact_person || '';
        document.getElementById('centerContactPhone').value = c.contact_phone || '';
        document.getElementById('centerNotes').value = c.notes || '';
        document.getElementById('centerAddress').value = c.address;
        document.getElementById('centerLat').value = c.latitude;
        document.getElementById('centerLng').value = c.longitude;
        document.getElementById('centerLatDisplay').value = parseFloat(c.latitude).toFixed(6);
        document.getElementById('centerLngDisplay').value = parseFloat(c.longitude).toFixed(6);
        openModal('centerModal');
    });
}

document.getElementById('centerRadiusSlider')?.addEventListener('input', function () { document.getElementById('centerRadius').value = this.value; document.getElementById('centerRadiusValue').textContent = this.value + 'm'; });
document.getElementById('centerRadius')?.addEventListener('input', function () { document.getElementById('centerRadiusSlider').value = this.value; document.getElementById('centerRadiusValue').textContent = this.value + 'm'; });

document.getElementById('centerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('centerId').value;
    const lat = parseFloat(document.getElementById('centerLat').value);
    const lng = parseFloat(document.getElementById('centerLng').value);
    if (!lat || !lng) { showToast('Koordinat tidak valid.', 'error'); return; }
    const body = { name: document.getElementById('centerName').value.trim(), worship_type: document.getElementById('centerWorshipType').value, radius: parseInt(document.getElementById('centerRadius').value), address: document.getElementById('centerAddress').value, latitude: lat, longitude: lng, contact_person: document.getElementById('centerContactPerson').value.trim(), contact_phone: document.getElementById('centerContactPhone').value.trim(), notes: document.getElementById('centerNotes').value.trim() };
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
    } else showToast(r.data?.message || 'Gagal menyimpan.', 'error');
    return false;
});

async function editCenter(id) { if (MAP) MAP.closePopup(); openCenterModal(id); }
async function deleteCenter(id) {
    if (!window.canDelete) { showToast('Anda tidak memiliki izin untuk menghapus data.', 'error'); return; }
    if (!confirm('Hapus tempat ibadah ini? Semua data terkait akan dihapus.')) return;
    showLoading(true);
    const r = await ApiCenters.delete(id);
    showLoading(false);
    if (MAP) MAP.closePopup();
    if (r.ok && r.data?.success) { showToast('Tempat ibadah dihapus.', 'success'); await loadAllData(); recountCenterHouseholds(); renderCenterList(); loadStats(); }
    else showToast(r.data?.message || 'Gagal menghapus.', 'error');
}

async function openHouseModal(id = null, lat = null, lng = null, address = '') {
    const isEdit = !!id;
    document.getElementById('houseModalTitle').textContent = isEdit ? 'Edit Data Rumah Tangga' : 'Tambah Rumah Tangga';
    document.getElementById('houseId').value = id || '';
    document.getElementById('houseLat').value = lat || '';
    document.getElementById('houseLng').value = lng || '';
    document.getElementById('familyMembersData').value = '[]';
    
    // Mode TAMBAH BARU (dari klik peta)
    if (!isEdit && lat && lng) {
        const addr = await reverseGeocodeDetailed(lat, lng);
        document.getElementById('houseRt').value = addr.rt || '';
        document.getElementById('houseRw').value = addr.rw || '';
        document.getElementById('houseKelurahan').value = addr.kelurahan || '';
        document.getElementById('houseKecamatan').value = addr.kecamatan || '';
        document.getElementById('houseFullAddress').value = addr.fullAddress || address || '';
        document.getElementById('houseLatDisplay').value = lat.toFixed(6);
        document.getElementById('houseLngDisplay').value = lng.toFixed(6);
        await autoAssignReligiousCenter(lat, lng);
        
        // Reset form fields
        document.getElementById('houseHeadName').value = '';
        document.getElementById('houseNIK').value = '';
        document.getElementById('houseGender').value = 'male';
        document.getElementById('houseDOB').value = '';
        document.getElementById('houseEducation').value = 'sd';
        document.getElementById('houseIncome').value = '0';
        document.getElementById('houseJob').value = '';
        document.getElementById('houseCondition').value = 'layak';
        document.getElementById('houseLandOwnership').value = 'milik';
        document.getElementById('houseDescription').value = '';
        document.getElementById('houseAidStatus').value = 'not_yet';
        document.getElementById('houseEmploymentStatus').value = 'unemployed';
        document.getElementById('houseJobGroup').style.display = 'none';
        document.getElementById('houseInstitutionGroup').style.display = 'none';
        document.getElementById('houseJob').value = '';
        document.getElementById('houseInstitutionName').value = '';
        
        // Reset family members display
        const familyContainer = document.getElementById('familyMembersList');
        if (familyContainer) {
            familyContainer.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;"><i class="fas fa-users"></i><p>Belum ada anggota keluarga</p></div>';
        }
        
        // Reset aid history display
        renderAidHistory([]);
        
        // Sembunyikan tombol add aid (karena household belum tersimpan)
        const addAidBtn = document.getElementById('addAidBtn');
        if (addAidBtn) addAidBtn.style.display = 'none';
        
        cancelPlacementMode();
        openModal('houseModal');
        recalcPoverty(); // Hitung ulang poverty preview
        return;
    }
    
    // Mode TAMBAH BARU (tanpa koordinat)
    if (!isEdit && !lat && !lng) {
        // Reset semua form
        document.getElementById('houseRt').value = '';
        document.getElementById('houseRw').value = '';
        document.getElementById('houseKelurahan').value = '';
        document.getElementById('houseKecamatan').value = '';
        document.getElementById('houseFullAddress').value = '';
        document.getElementById('houseLatDisplay').value = '';
        document.getElementById('houseLngDisplay').value = '';
        document.getElementById('managingCenterId').value = '';
        document.getElementById('managingCenterName').value = '';
        document.getElementById('houseHeadName').value = '';
        document.getElementById('houseNIK').value = '';
        document.getElementById('houseGender').value = 'male';
        document.getElementById('houseDOB').value = '';
        document.getElementById('houseEducation').value = 'sd';
        document.getElementById('houseIncome').value = '0';
        document.getElementById('houseJob').value = '';
        document.getElementById('houseCondition').value = 'layak';
        document.getElementById('houseLandOwnership').value = 'milik';
        document.getElementById('houseDescription').value = '';
        document.getElementById('houseAidStatus').value = 'not_yet';
        
        const familyContainer = document.getElementById('familyMembersList');
        if (familyContainer) {
            familyContainer.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;"><i class="fas fa-users"></i><p>Belum ada anggota keluarga</p></div>';
        }
        renderAidHistory([]);
        
        const addAidBtn = document.getElementById('addAidBtn');
        if (addAidBtn) addAidBtn.style.display = 'none';
        
        cancelPlacementMode();
        openModal('houseModal');
        recalcPoverty();
        return;
    }
    
    // ================================================================
    // EDIT MODE: Load data dari API
    // ================================================================
    if (isEdit) {
        showLoading(true);
        const r = await ApiHouses.show(id);
        showLoading(false);
        
        if (!r.ok || !r.data?.success) {
            showToast('Gagal memuat data rumah tangga.', 'error');
            return;
        }
        
        const h = r.data.data;
        
        // Informasi Alamat
        if (document.getElementById('houseRt')) 
            document.getElementById('houseRt').value = h.rt || '';
        if (document.getElementById('houseRw')) 
            document.getElementById('houseRw').value = h.rw || '';
        if (document.getElementById('houseKelurahan')) 
            document.getElementById('houseKelurahan').value = h.kelurahan || '';
        if (document.getElementById('houseKecamatan')) 
            document.getElementById('houseKecamatan').value = h.kecamatan || '';
        if (document.getElementById('houseFullAddress')) {
            document.getElementById('houseFullAddress').value = h.full_address || h.address || '';
            // Hapus readonly attribute jika ada
            document.getElementById('houseFullAddress').removeAttribute('readonly');
            // Set background ke surface (tidak readonly)
            document.getElementById('houseFullAddress').style.background = 'var(--surface)';
        }
        // Koordinat
        if (document.getElementById('houseLat')) 
            document.getElementById('houseLat').value = h.latitude;
        if (document.getElementById('houseLng')) 
            document.getElementById('houseLng').value = h.longitude;
        if (document.getElementById('houseLatDisplay')) 
            document.getElementById('houseLatDisplay').value = parseFloat(h.latitude).toFixed(6);
        if (document.getElementById('houseLngDisplay')) 
            document.getElementById('houseLngDisplay').value = parseFloat(h.longitude).toFixed(6);
        
        // Pusat Pengelola
        if (document.getElementById('managingCenterId')) 
            document.getElementById('managingCenterId').value = h.managing_center_id || '';
        if (document.getElementById('managingCenterName')) 
            document.getElementById('managingCenterName').value = h.center_name || '';
        
        // Kondisi Rumah
        if (document.getElementById('houseCondition')) 
            document.getElementById('houseCondition').value = h.house_condition || 'layak';
        
        // Kepemilikan Lahan
        if (document.getElementById('houseLandOwnership')) 
            document.getElementById('houseLandOwnership').value = h.land_ownership || 'milik';
        
        // Keterangan
        if (document.getElementById('houseDescription')) 
            document.getElementById('houseDescription').value = h.notes || h.description || '';
        
        // ⭐ KEPALA KELUARGA (Head of Household)
        if (document.getElementById('houseHeadName')) 
            document.getElementById('houseHeadName').value = h.head_name || '';
        if (document.getElementById('houseNIK')) 
            document.getElementById('houseNIK').value = h.head_nik || h.nik || '';
        if (document.getElementById('houseGender')) 
            document.getElementById('houseGender').value = h.head_gender || h.gender || 'male';
        if (document.getElementById('houseDOB')) 
            document.getElementById('houseDOB').value = h.head_date_of_birth || h.date_of_birth || '';
        if (document.getElementById('houseEducation')) 
            document.getElementById('houseEducation').value = h.head_education || h.education || 'sd';
        
        // Pekerjaan dan Pendapatan
        if (document.getElementById('houseJob')) 
            document.getElementById('houseJob').value = h.head_job_name || h.job || '';
        if (document.getElementById('houseIncome')) 
            document.getElementById('houseIncome').value = h.head_monthly_income || h.income || 0;
        if (document.getElementById('houseEmploymentStatus')) {
            const empStatus = h.head_employment_status || 'unemployed';
            document.getElementById('houseEmploymentStatus').value = empStatus;
            toggleHouseEmploymentFields();
            
            if (empStatus === 'working') {
                document.getElementById('houseJob').value = h.head_job_name || '';
            } else if (empStatus === 'studying') {
                document.getElementById('houseInstitutionName').value = h.head_institution_name || '';
            }
        }
        
        // Status Bantuan
        if (document.getElementById('houseAidStatus')) {
            // Jika ada aid_history, set status ke 'received'
            const hasAidHistory = (h.aid_history && h.aid_history.length > 0);
            document.getElementById('houseAidStatus').value = hasAidHistory ? 'received' : (h.aid_status || 'not_yet');
        }
        
        // ⭐ ANGGOTA KELUARGA (Household Members)
        if (h.household_members && h.household_members.length) {
            document.getElementById('familyMembersData').value = JSON.stringify(h.household_members);
            renderFamilyMembers(h.household_members);
        } else if (h.family_members && h.family_members.length) {
            document.getElementById('familyMembersData').value = JSON.stringify(h.family_members);
            renderFamilyMembers(h.family_members);
        } else {
            document.getElementById('familyMembersData').value = '[]';
            const familyContainer = document.getElementById('familyMembersList');
            if (familyContainer) {
                familyContainer.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;"><i class="fas fa-users"></i><p>Belum ada anggota keluarga</p></div>';
            }
        }
        
        // ⭐ RIWAYAT BANTUAN (Aid History)
        if (h.aid_history && h.aid_history.length) {
            renderAidHistory(h.aid_history);
        } else {
            renderAidHistory([]);
        }
        
        // Tampilkan tombol add aid jika household sudah ada di database
        const addAidBtn = document.getElementById('addAidBtn');
        if (addAidBtn) addAidBtn.style.display = 'inline-flex';
        
        // Hitung ulang poverty preview berdasarkan data yang diisi
        setTimeout(() => recalcPoverty(), 100);
        
        openModal('houseModal');
    }
}

function renderFamilyMembers(members) {
    const container = document.getElementById('familyMembersList');
    if (!container) return;
    if (!members || members.length === 0) { container.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;"><i class="fas fa-users"></i><p>Belum ada anggota keluarga</p></div>'; return; }
    container.innerHTML = '';
    members.forEach((member, index) => {
        const row = document.createElement('div');
        row.className = 'family-member-item';
        row.innerHTML = `<div class="family-member-info"><span class="family-member-name">${escapeHtml(member.name)}</span><span class="family-member-relation">${member.relationship || 'lainnya'}</span>${member.employment_status === 'working' ? `<span class="family-member-job">💼 ${escapeHtml(member.job_name || 'Bekerja')}</span>` : ''}${member.employment_status === 'studying' ? `<span class="family-member-study">📚 ${escapeHtml(member.institution_name || 'Sekolah')}</span>` : ''}</div><div class="family-member-actions"><button type="button" class="btn-edit-member" onclick="editFamilyMember(${index})"><i class="fas fa-pen"></i></button><button type="button" class="btn-delete-member" onclick="deleteFamilyMember(${index})"><i class="fas fa-trash"></i></button></div>`;
        container.appendChild(row);
    });
}

let currentEditingMemberIndex = -1;
function openFamilyMemberModal(index = -1) {
    currentEditingMemberIndex = index;
    const title = document.getElementById('familyMemberModalTitle');
    if (index >= 0) {
        title.textContent = 'Edit Anggota Keluarga';
        const members = JSON.parse(document.getElementById('familyMembersData').value || '[]');
        const member = members[index];
        document.getElementById('memberName').value = member.name || '';
        document.getElementById('memberNik').value = member.nik || '';
        document.getElementById('memberGender').value = member.gender || 'male';
        document.getElementById('memberDob').value = member.date_of_birth || '';
        document.getElementById('memberEducation').value = member.education || 'sd';
        document.getElementById('memberRelationship').value = member.relationship || 'lainnya';
        document.getElementById('memberEmploymentStatus').value = member.employment_status || 'unemployed';
        const jobGroup = document.getElementById('memberJobGroup');
        const institutionGroup = document.getElementById('memberInstitutionGroup');
        if (member.employment_status === 'working') { if (jobGroup) jobGroup.style.display = 'block'; if (institutionGroup) institutionGroup.style.display = 'none'; document.getElementById('memberJobName').value = member.job_name || ''; }
        else if (member.employment_status === 'studying') { if (jobGroup) jobGroup.style.display = 'none'; if (institutionGroup) institutionGroup.style.display = 'block'; document.getElementById('memberInstitutionName').value = member.institution_name || ''; }
        else { if (jobGroup) jobGroup.style.display = 'none'; if (institutionGroup) institutionGroup.style.display = 'none'; }
        document.getElementById('memberIncome').value = member.monthly_income || 0;
    } else {
        title.textContent = 'Tambah Anggota Keluarga';
        document.getElementById('memberForm').reset();
        document.getElementById('memberGender').value = 'male';
        document.getElementById('memberEducation').value = 'sd';
        document.getElementById('memberRelationship').value = 'lainnya';
        document.getElementById('memberEmploymentStatus').value = 'unemployed';
        if (document.getElementById('memberJobGroup')) document.getElementById('memberJobGroup').style.display = 'none';
        if (document.getElementById('memberInstitutionGroup')) document.getElementById('memberInstitutionGroup').style.display = 'none';
        document.getElementById('memberIncome').value = '0';
    }
    openModal('familyMemberModal');
}

function saveFamilyMember() {
    const member = { name: document.getElementById('memberName').value.trim(), nik: document.getElementById('memberNik').value.trim(), gender: document.getElementById('memberGender').value, date_of_birth: document.getElementById('memberDob').value, education: document.getElementById('memberEducation').value, relationship: document.getElementById('memberRelationship').value, employment_status: document.getElementById('memberEmploymentStatus').value, job_name: document.getElementById('memberJobName').value.trim(), institution_name: document.getElementById('memberInstitutionName').value.trim(), monthly_income: parseInt(document.getElementById('memberIncome').value) || 0 };
    if (!member.name) { showToast('Nama anggota keluarga harus diisi.', 'error'); return; }
    let members = JSON.parse(document.getElementById('familyMembersData').value || '[]');
    if (currentEditingMemberIndex >= 0) members[currentEditingMemberIndex] = member;
    else members.push(member);
    document.getElementById('familyMembersData').value = JSON.stringify(members);
    renderFamilyMembers(members);
    closeModal('familyMemberModal');
}

function editFamilyMember(index) { openFamilyMemberModal(index); }
function deleteFamilyMember(index) {
    if (!confirm('Hapus anggota keluarga ini?')) return;
    let members = JSON.parse(document.getElementById('familyMembersData').value || '[]');
    members.splice(index, 1);
    document.getElementById('familyMembersData').value = JSON.stringify(members);
    renderFamilyMembers(members);
}

function toggleMemberEmploymentFields() {
    const status = document.getElementById('memberEmploymentStatus')?.value;
    const jobGroup = document.getElementById('memberJobGroup');
    const institutionGroup = document.getElementById('memberInstitutionGroup');
    if (status === 'working') { if (jobGroup) jobGroup.style.display = 'block'; if (institutionGroup) institutionGroup.style.display = 'none'; }
    else if (status === 'studying') { if (jobGroup) jobGroup.style.display = 'none'; if (institutionGroup) institutionGroup.style.display = 'block'; }
    else { if (jobGroup) jobGroup.style.display = 'none'; if (institutionGroup) institutionGroup.style.display = 'none'; }
}

function toggleHouseEmploymentFields() {
    const status = document.getElementById('houseEmploymentStatus')?.value;
    const jobGroup = document.getElementById('houseJobGroup');
    const institutionGroup = document.getElementById('houseInstitutionGroup');
    const jobField = document.getElementById('houseJob');
    const institutionField = document.getElementById('houseInstitutionName');
    
    if (status === 'working') {
        if (jobGroup) jobGroup.style.display = 'block';
        if (institutionGroup) institutionGroup.style.display = 'none';
        if (jobField) jobField.required = false;
        if (institutionField) institutionField.required = false;
    } else if (status === 'studying') {
        if (jobGroup) jobGroup.style.display = 'none';
        if (institutionGroup) institutionGroup.style.display = 'block';
        if (jobField) jobField.required = false;
        if (institutionField) institutionField.required = false;
    } else {
        if (jobGroup) jobGroup.style.display = 'none';
        if (institutionGroup) institutionGroup.style.display = 'none';
        if (jobField) jobField.required = false;
        if (institutionField) institutionField.required = false;
    }
}

async function editHouse(id) { if (MAP) MAP.closePopup(); await openHouseModal(id); }
async function deleteHouse(id) {
    if (!window.canDelete) { showToast('Anda tidak memiliki izin untuk menghapus data.', 'error'); return; }
    if (!confirm('Hapus data rumah ini? Semua data terkait akan dihapus.')) return;
    showLoading(true);
    const r = await ApiHouses.delete(id);
    showLoading(false);
    if (MAP) MAP.closePopup();
    if (r.ok && r.data?.success) {
        showToast('Data rumah dihapus.', 'success');
        await loadAllData();
        
        // ⭐ HITUNG ULANG CENTER HOUSEHOLDS
        recountCenterHouseholds();
        renderCenterList();
        renderHouseList();
        updateLayerCounts();
        loadStats();
    } else {
        showToast(r.data?.message || 'Gagal menghapus.', 'error');
    }
}

function openAidModalForHouse(householdId) { if (MAP) MAP.closePopup(); document.getElementById('aidHouseholdId').value = householdId; document.getElementById('aidDate').value = new Date().toISOString().slice(0, 10); document.getElementById('aidType').value = 'sembako'; document.getElementById('aidAmount').value = '0'; document.getElementById('aidNotes').value = ''; openModal('aidModal'); }

// assets/js/forms.js - Update event listener aidForm
document.getElementById('aidForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('aidForm').dataset.editId;
    const body = { 
        household_id: parseInt(document.getElementById('aidHouseholdId').value), 
        aid_type: document.getElementById('aidType').value, 
        aid_date: document.getElementById('aidDate').value, 
        amount: parseInt(document.getElementById('aidAmount').value || 0), 
        notes: document.getElementById('aidNotes').value.trim() 
    };
    showLoading(true);
    const r = editId ? await ApiAid.update(editId, body) : await ApiAid.create(body);
    showLoading(false);
    
    if (r.ok && r.data?.success) { 
        closeModal('aidModal'); 
        document.getElementById('aidForm').dataset.editId = ''; 
        document.querySelector('#aidModal .modal-header h2').textContent = 'Catat Bantuan'; 
        showToast(editId ? 'Bantuan berhasil diperbarui.' : 'Bantuan berhasil dicatat.', 'success'); 
        
        const houseId = document.getElementById('houseId').value; 
        if (houseId) { 
            // ⭐ REFRESH DATA RUMAH SETELAH TAMBAH BANTUAN
            showLoading(true);
            const houseData = await ApiHouses.show(houseId); 
            showLoading(false);
            if (houseData.ok && houseData.data?.data) { 
                const freshData = houseData.data.data;
                
                // Update aid history display in modal
                renderAidHistory(freshData.aid_history || []); 
                document.getElementById('houseAidStatus').value = 'received';
                
                // ⭐ UPDATE POPUP DI PETA - REFRESH MARKER
                const existingHouse = State.houses.find(h => h.id == houseId);
                if (existingHouse && existingHouse._marker) {
                    // Update data rumah di State
                    existingHouse.aid_history = freshData.aid_history || [];
                    existingHouse.aid_status = 'received';
                    existingHouse._marker._houseData = freshData;
                    
                    // Jika popup sedang terbuka, refresh dengan data baru
                    if (existingHouse._marker.isPopupOpen()) {
                        await showHousePopup(existingHouse._marker, freshData);
                    }
                }
                
                // Reload stats untuk update counter
                await loadStats();
            } 
        } 
    } else { 
        showToast(r.data?.message || 'Gagal menyimpan.', 'error'); 
    }
    return false;
});

async function refreshHousePopup(householdId) {
    try {
        const r = await ApiHouses.show(householdId);
        if (r.ok && r.data?.success) {
            const freshData = r.data.data;
            
            // Update data di State
            const index = State.houses.findIndex(h => h.id == householdId);
            if (index !== -1) {
                State.houses[index] = freshData;
                
                // Update marker popup
                if (State.houses[index]._marker) {
                    showHousePopup(State.houses[index]._marker, freshData);
                }
            }
            
            return freshData;
        }
    } catch (err) {
        console.error('Failed to refresh house popup:', err);
    }
    return null;
}

// Export fungsi untuk digunakan di file lain
window.refreshHousePopup = refreshHousePopup;

document.getElementById('addAidBtn')?.addEventListener('click', () => { const hhId = document.getElementById('houseId').value; if (hhId) openAidModalForHouse(hhId); });

function renderAidHistory(list) {
    const el = document.getElementById('aidHistoryList');
    if (!el) return;
    
    if (!list || !list.length) {
        el.innerHTML = '<div class="empty-state" style="padding:14px;"><i class="fas fa-gift"></i><p>Belum ada riwayat bantuan</p></div>';
        return;
    }
    
    el.innerHTML = list.map((a, idx) => {
        // Gunakan label yang sudah ada atau mapping dari AID_LABELS
        const typeLabel = a.aid_type_label || AID_LABELS[a.aid_type] || a.aid_type || 'Bantuan';
        const amount = a.amount || 0;
        const notes = a.description || a.notes || '';
        
        return `
            <div class="aid-history-item" id="aid-item-${a.id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
                <span class="aid-badge" style="background:#e0faf3;color:#0b9e73;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;">${escapeHtml(typeLabel)}</span>
                <span style="flex:1;font-size:10.5px;color:#5a6478;">${formatDate(a.aid_date)}</span>
                <span style="font-size:10.5px;font-weight:600;color:#0f1623;">${amount ? formatRp(amount) : '—'}</span>
                <button type="button" class="action-btn" onclick="editAidRecord(${a.id})" title="Edit" style="padding:2px 6px;font-size:9px;">
                    <i class="fas fa-pen"></i>
                </button>
                <button type="button" class="action-btn danger" onclick="deleteAidRecord(${a.id})" title="Hapus" style="padding:2px 6px;font-size:9px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
}

async function editAidRecord(aidId) {
    showLoading(true);
    const r = await ApiAid.show(aidId);
    showLoading(false);
    if (!r.ok || !r.data?.data) { showToast('Gagal memuat data bantuan.', 'error'); return; }
    const a = r.data.data;
    document.getElementById('aidHouseholdId').value = a.household_id;
    document.getElementById('aidDate').value = a.aid_date;
    document.getElementById('aidType').value = a.aid_type;
    document.getElementById('aidAmount').value = a.amount || 0;
    document.getElementById('aidNotes').value = a.notes || '';
    document.getElementById('aidForm').dataset.editId = aidId;
    document.querySelector('#aidModal .modal-header h2').textContent = 'Edit Bantuan';
    openModal('aidModal');
}

async function deleteAidRecord(aidId) {
    if (!confirm('Hapus riwayat bantuan ini?')) return;
    showLoading(true);
    const r = await ApiAid.delete(aidId);
    showLoading(false);
    if (r.ok && r.data?.success) { showToast('Riwayat bantuan dihapus.', 'success'); const item = document.getElementById('aid-item-' + aidId); if (item) item.remove(); const houseId = document.getElementById('houseId').value; if (houseId) { const houseData = await ApiHouses.show(houseId); if (houseData.ok && houseData.data?.data) { renderAidHistory(houseData.data.data.aid_history || []); document.getElementById('houseAidStatus').value = houseData.data.data.aid_status; } } }
    else showToast(r.data?.message || 'Gagal menghapus.', 'error');
}

function openReportModal(householdId) { showToast('Gunakan halaman lapor.html untuk melaporkan warga.', 'success', 3000); }

// Helper: show error message below field
function showFieldError(fieldId, errorId, message) {
    const errorEl = document.getElementById(errorId);
    const fieldEl = document.getElementById(fieldId);
    if (errorEl) {
        errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        errorEl.classList.add('show');
    }
    if (fieldEl) fieldEl.classList.add('error');
}

// Helper: clear error for a field
function clearFieldError(fieldId, errorId) {
    const errorEl = document.getElementById(errorId);
    const fieldEl = document.getElementById(fieldId);
    if (errorEl) errorEl.classList.remove('show');
    if (fieldEl) fieldEl.classList.remove('error');
}

// Validate house form before submit
function validateHouseForm() {
    let isValid = true;

    const employmentStatus = document.getElementById('houseEmploymentStatus')?.value;
    
    // Required fields
    const requiredFields = [
        { id: 'houseHeadName', errId: 'errHouseHeadName', label: 'Nama Kepala Keluarga' },
        { id: 'houseNIK', errId: 'errHouseNIK', label: 'NIK KK', validate: (val) => /^\d{16}$/.test(val) },
        { id: 'houseGender', errId: 'errHouseGender', label: 'Jenis Kelamin' },
        { id: 'houseDOB', errId: 'errHouseDOB', label: 'Tanggal Lahir' },
        { id: 'houseEducation', errId: 'errHouseEducation', label: 'Pendidikan' },
        { id: 'houseIncome', errId: 'errHouseIncome', label: 'Pendapatan' },
        { id: 'houseCondition', errId: 'errHouseCondition', label: 'Kondisi Rumah' },
        { id: 'houseLandOwnership', errId: 'errHouseLandOwnership', label: 'Kepemilikan Lahan' },
        { id: 'houseRt', errId: 'errHouseRt', label: 'RT' },
        { id: 'houseRw', errId: 'errHouseRw', label: 'RW' },
        { id: 'houseKelurahan', errId: 'errHouseKelurahan', label: 'Kelurahan' },
        { id: 'houseKecamatan', errId: 'errHouseKecamatan', label: 'Kecamatan' },
        { id: 'houseFullAddress', errId: 'errHouseAddress', label: 'Alamat Lengkap' }
    ];
    
    requiredFields.forEach(field => {
        const el = document.getElementById(field.id);
        let value = el ? el.value.trim() : '';
        
        if (!value || value === '') {
            showFieldError(field.id, field.errId, `${field.label} wajib diisi.`);
            isValid = false;
        } else if (field.validate && !field.validate(value)) {
            showFieldError(field.id, field.errId, `${field.label} tidak valid.`);
            isValid = false;
        } else {
            clearFieldError(field.id, field.errId);
        }
    });

    if (employmentStatus === 'working') {
        const jobValue = document.getElementById('houseJob')?.value.trim();
        if (!jobValue || jobValue === '') {
            showFieldError('houseJob', 'errHouseJob', 'Nama pekerjaan wajib diisi.');
            isValid = false;
        } else {
            clearFieldError('houseJob', 'errHouseJob');
        }
    } else if (employmentStatus === 'studying') {
        const institutionValue = document.getElementById('houseInstitutionName')?.value.trim();
        if (!institutionValue || institutionValue === '') {
            showFieldError('houseInstitutionName', 'errHouseInstitution', 'Nama sekolah/universitas wajib diisi.');
            isValid = false;
        } else {
            clearFieldError('houseInstitutionName', 'errHouseInstitution');
        }
    } else {
        // Status unemployed: tidak perlu validasi pekerjaan/institusi
        clearFieldError('houseJob', 'errHouseJob');
        clearFieldError('houseInstitutionName', 'errHouseInstitution');
    }
    
    // Koordinat validation
    const lat = document.getElementById('houseLat')?.value;
    const lng = document.getElementById('houseLng')?.value;
    if (!lat || !lng || lat === '' || lng === '') {
        showFieldError('houseLatDisplay', 'errHouseCoord', 'Pilih lokasi pada peta terlebih dahulu.');
        isValid = false;
    } else {
        clearFieldError('houseLatDisplay', 'errHouseCoord');
    }
    
    // Family members validation (at least 1 member? optional)
    const familyData = document.getElementById('familyMembersData')?.value;
    // Tidak wajib, hanya peringatan jika kosong
    if (familyData && familyData !== '[]') {
        const members = JSON.parse(familyData);
        if (members.length === 0) {
            // Optional warning
        }
    }
    
    return isValid;
}

// Tambahkan event listener untuk real-time validation clearing
function initHouseFormValidation() {
    const fields = ['houseHeadName', 'houseNIK', 'houseGender', 'houseDOB', 'houseEducation', 
                    'houseIncome', 'houseJob', 'houseCondition', 'houseLandOwnership', 
                    'houseRt', 'houseRw', 'houseKelurahan', 'houseKecamatan', 'houseFullAddress'];
    
    fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.addEventListener('input', () => {
                const errId = 'err' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1);
                clearFieldError(fieldId, errId);
            });
            el.addEventListener('change', () => {
                const errId = 'err' + fieldId.charAt(0).toUpperCase() + fieldId.slice(1);
                clearFieldError(fieldId, errId);
            });
        }
    });
    
    // Coordinate clear on map click
    const coordFields = ['houseLat', 'houseLng'];
    coordFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.addEventListener('change', () => {
                clearFieldError('houseLatDisplay', 'errHouseCoord');
            });
        }
    });
}

// Modify the houseForm submit handler
document.getElementById('houseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // ⭐ VALIDATE FORM FIRST
    if (!validateHouseForm()) {
        // Scroll to first error
        const firstError = document.querySelector('.field-error.show');
        if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        showToast('Periksa kembali isian yang belum lengkap.', 'error');
        return;
    }
    
    const id = document.getElementById('houseId').value;
    const lat = parseFloat(document.getElementById('houseLat').value);
    const lng = parseFloat(document.getElementById('houseLng').value);
    
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) { 
        showToast('Koordinat tidak valid. Klik peta terlebih dahulu.', 'error'); 
        return; 
    }
    
    const members = JSON.parse(document.getElementById('familyMembersData').value || '[]');
    const body = {
        rt: document.getElementById('houseRt')?.value || '',
        rw: document.getElementById('houseRw')?.value || '',
        kelurahan: document.getElementById('houseKelurahan')?.value || '',
        kecamatan: document.getElementById('houseKecamatan')?.value || '',
        full_address: document.getElementById('houseFullAddress')?.value || '',
        latitude: lat, 
        longitude: lng,
        house_condition: document.getElementById('houseCondition').value,
        managing_center_id: document.getElementById('managingCenterId')?.value || null,
        head_name: document.getElementById('houseHeadName').value.trim(),
        head_nik: document.getElementById('houseNIK').value.trim(),
        head_gender: document.getElementById('houseGender').value,
        head_date_of_birth: document.getElementById('houseDOB').value,
        head_education: document.getElementById('houseEducation').value,
        head_employment_status: document.getElementById('houseEmploymentStatus').value,
        head_job_name: document.getElementById('houseEmploymentStatus').value === 'working' ? document.getElementById('houseJob').value.trim() || null : null,
        head_institution_name: document.getElementById('houseEmploymentStatus').value === 'studying' ? document.getElementById('houseInstitutionName').value.trim() || null : null,
        head_monthly_income: parseInt(document.getElementById('houseIncome').value) || 0,
        land_ownership: document.getElementById('houseLandOwnership').value,
        description: document.getElementById('houseDescription').value.trim(),
        aid_status: document.getElementById('houseAidStatus').value,
        household_members: members,
        notes: document.getElementById('houseDescription').value.trim()
    };
    
    if (!body.head_name) { showToast('Nama Kepala Keluarga wajib diisi.', 'error'); return; }
    if (!body.head_nik || body.head_nik.length !== 16) { showToast('NIK KK harus 16 digit.', 'error'); return; }
    if (!body.head_date_of_birth) { showToast('Tanggal Lahir KK wajib diisi.', 'error'); return; }
    
    showLoading(true);
    try {
        const r = id ? await ApiHouses.update(id, body) : await ApiHouses.create(body);
        if (r.ok && r.data?.success) { 
            closeModal('houseModal'); 
            cancelPlacementMode(); 
            showToast(id ? 'Data rumah diperbarui.' : 'Rumah berhasil ditambahkan.', 'success'); 
            await loadAllData();
            
            recountCenterHouseholds();
            renderCenterList();
            renderHouseList();
            updateLayerCounts();
            loadStats();
        } else { 
            showToast(r.data?.message || 'Gagal menyimpan.', 'error'); 
        }
    } catch (err) { 
        showToast('Terjadi kesalahan: ' + err.message, 'error'); 
    } finally { 
        showLoading(false); 
    }
});