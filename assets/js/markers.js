/* ============================================================
   markers.js — Draggable markers + inside/outside radius colors
   ============================================================ */
'use strict';

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncate(str, n = 28) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '…' : str;
}

function formatRp(n) {
    if (!n) return 'Rp 0';
    return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function formatDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function educationLabel(edu) {
    const labels = {
        'tidak_sekolah': 'Tidak Sekolah',
        'sd': 'SD',
        'smp': 'SMP',
        'sma': 'SMA',
        'diploma': 'Diploma',
        'sarjana': 'Sarjana',
        'pascasarjana': 'Pascasarjana'
    };
    return labels[edu] || edu;
}

const radiusCircles = {};
let dragInProgress = false;

// ====================================================================
// CENTERS
// ====================================================================
function renderCenters() {
    layerCenters.clearLayers();
    Object.values(radiusCircles).forEach(c => { if (MAP.hasLayer(c)) MAP.removeLayer(c); });

    const filtered = State.centers.filter(c => {
        if (State.activeFilter === 'houses') return false;
        if (State.searchQuery) {
            const q = State.searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q);
        }
        return true;
    });

    filtered.forEach(center => addCenterMarker(center));
    updateLayerCounts();
    renderCenterList();
}

function addCenterMarker(center) {
    const color = CENTER_COLORS[center.worship_type] || '#3a56d4';
    const icon = CENTER_ICONS[center.worship_type] || 'fa-place-of-worship';

    const circle = L.circle([center.latitude, center.longitude], {
        radius: center.radius,
        color: color,
        fillColor: color,
        fillOpacity: 0.07,
        weight: 1.5,
        dashArray: '4 3',
    });
    circle.addTo(MAP);
    radiusCircles[center.id] = circle;

    const marker = L.marker([center.latitude, center.longitude], {
        icon: L.divIcon({
            html: `<div class="custom-marker-center" style="background:${color};"><i class="fas ${icon}"></i></div>`,
            iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
            className: '',
        }),
        title: center.name,
        draggable: true,
    });

    marker.on('dragstart', function() { marker.closePopup(); marker.setZIndexOffset(1000); });
    marker.on('drag', function(e) { if (radiusCircles[center.id]) radiusCircles[center.id].setLatLng(marker.getLatLng()); });
    marker.on('dragend', async function(e) {
        marker.setZIndexOffset(0);
        const pos = marker.getLatLng();
        center.latitude = pos.lat;
        center.longitude = pos.lng;
        if (radiusCircles[center.id]) radiusCircles[center.id].setLatLng(pos);
        try {
            const r = await ApiCenters.patch(center.id, { latitude: pos.lat, longitude: pos.lng });
            if (r.ok && r.data?.success) {
                showToast('Posisi tempat ibadah diperbarui.', 'success');
                updateAllHouseColors();
                recountCenterHouseholds();
                loadStats();
                renderCenterList();
                renderHouseList();
                updateLayerCounts();
            } else showToast('Gagal menyimpan posisi.', 'error');
        } catch (err) { showToast('Gagal menyimpan posisi.', 'error'); }
        showCenterPopup(marker, center);
    });
    marker.on('click', () => showCenterPopup(marker, center));
    layerCenters.addLayer(marker);
    center._marker = marker;
}

function showCenterPopup(marker, center) {
    const color = CENTER_COLORS[center.worship_type] || '#3a56d4';
    const icon = CENTER_ICONS[center.worship_type] || 'fa-place-of-worship';
    const label = CENTER_LABELS[center.worship_type] || center.worship_type;
    
    // ⭐ HITUNG ULANG JUMLAH RUMAH SAAT POPUP DIBUKA (memastikan data fresh)
    let count = 0;
    let nearbyHouses = [];
    
    State.houses.forEach(house => {
        if (house.is_active === false) return;
        const distance = haversineMeters(
            house.latitude, house.longitude,
            center.latitude, center.longitude
        );
        if (distance <= center.radius) {
            count++;
            nearbyHouses.push({
                id: house.id,
                name: house.head_name,
                distance: Math.round(distance)
            });
        }
    });
    
    // Update center household_count jika berbeda
    if (center.household_count !== count) {
        center.household_count = count;
        renderCenterList(); // Refresh sidebar jika ada perubahan
    }
    
    // Buat HTML daftar rumah dalam radius
    let housesListHtml = '';
    if (nearbyHouses.length > 0) {
        const displayHouses = nearbyHouses.slice(0, 5);
        housesListHtml = `
            <div class="popup-section" style="margin-top: 6px;">
                <div class="popup-section-label"><i class="fas fa-home"></i> Rumah dalam Radius (${nearbyHouses.length})</div>
                <div style="max-height: 150px; overflow-y: auto;">
                    ${displayHouses.map(h => `
                        <div class="popup-row" style="font-size: 10.5px; cursor: pointer;" onclick="flyToAndOpenHouse(${h.id}, ${center.latitude}, ${center.longitude})">
                            <i class="fas fa-home" style="font-size: 8px;"></i>
                            <span><strong>${escapeHtml(h.name)}</strong> · ${h.distance}m</span>
                        </div>
                    `).join('')}
                    ${nearbyHouses.length > 5 ? `<div class="popup-row" style="font-size: 9px; color: var(--text-muted);">+${nearbyHouses.length - 5} rumah lainnya</div>` : ''}
                </div>
            </div>
        `;
    }
    
    const popup = L.popup({ maxWidth: 320, closeButton: true })
        .setLatLng(marker.getLatLng())
        .setContent(`
        <div class="popup-info">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #edf0f6;">
                <div style="width:34px;height:34px;border-radius:9px;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-size:14px;flex-shrink:0;box-shadow:0 2px 8px ${color}44;">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <div class="popup-name" style="margin-bottom:0;">${escapeHtml(center.name)}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${label} · <em style="font-size:9px;">seret untuk pindahkan</em></div>
                </div>
            </div>
            <div class="popup-row"><i class="fas fa-map-marker-alt"></i><span>${truncate(center.address || '—', 42)}</span></div>
            
            <!-- ⭐ JUMLAH RUMAH DALAM RADIUS (LIVE) -->
            <div class="popup-section" style="background: ${count > 0 ? color + '10' : 'var(--surface-2)'}">
                <div class="popup-section-label"><i class="fas fa-home"></i> Cakupan Layanan</div>
                <div class="popup-row" style="margin-bottom: 0;">
                    <i class="fas fa-chart-simple"></i>
                    <span><strong style="font-size: 16px; color: ${color};">${count}</strong> rumah dalam radius ${center.radius}m</span>
                </div>
            </div>
            
            ${housesListHtml}
            
            <div class="popup-section">
                <div class="popup-section-label"><i class="fas fa-dot-circle"></i> Ubah Radius: <strong id="rcVal_${center.id}" style="color:${color};">${center.radius}m</strong></div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="range" min="50" max="5000" step="10" value="${center.radius}"
                        oninput="liveUpdateRadius(${center.id}, this.value)"
                        onchange="saveRadius(${center.id}, this.value)"
                        style="flex:1;height:4px;-webkit-appearance:none;background:#e2e6ef;border-radius:2px;outline:none;border:none;padding:0;accent-color:${color};">
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;color:#9ba4b5;margin-top:3px;">
                    <span>50m</span><span>2.5km</span><span>5km</span>
                </div>
            </div>
            <div class="popup-actions">
                <button class="btn btn-primary btn-sm" onclick="editCenter(${center.id})"><i class="fas fa-pen"></i> Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="showCoverageHouseholds(${center.id})"><i class="fas fa-eye"></i> Lihat Semua</button>
                ${window.canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteCenter(${center.id})" title="Hapus"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>`);
    
    marker.unbindPopup();
    marker.bindPopup(popup).openPopup();
}

// Fungsi helper untuk terbang ke rumah dan membuka popupnya
function flyToAndOpenHouse(houseId, centerLat, centerLng) {
    const house = State.houses.find(h => h.id == houseId);
    if (house) {
        flyTo(house.latitude, house.longitude, 17);
        setTimeout(() => {
            if (house._marker) {
                house._marker.openPopup();
            }
        }, 800);
    }
}
window.flyToAndOpenHouse = flyToAndOpenHouse;

function liveUpdateRadius(centerId, value) {
    const valSpan = document.getElementById('rcVal_' + centerId);
    if (valSpan) valSpan.textContent = value + 'm';
    
    if (radiusCircles[centerId]) {
        radiusCircles[centerId].setRadius(parseInt(value));
    }
    
    // ⭐ LIVE UPDATE: Hitung ulang jumlah rumah saat slider digeser
    const center = State.centers.find(c => c.id == centerId);
    if (center) {
        let tempCount = 0;
        State.houses.forEach(house => {
            if (house.is_active === false) return;
            const distance = haversineMeters(
                house.latitude, house.longitude,
                center.latitude, center.longitude
            );
            if (distance <= parseInt(value)) {
                tempCount++;
            }
        });
        
        // Update tampilan jumlah rumah di popup secara live
        const popupContent = document.querySelector('.leaflet-popup-content');
        if (popupContent && center._marker && center._marker.isPopupOpen()) {
            const countElement = popupContent.querySelector('.popup-section:first-child .popup-row strong');
            if (countElement) {
                countElement.textContent = tempCount;
                countElement.style.color = '#d63230';
            }
        }
    }
}

async function saveRadius(centerId, value) {
    try {
        const r = await ApiCenters.patch(centerId, { radius: parseInt(value) });
        if (r.ok && r.data?.success) {
            const center = State.centers.find(c => c.id == centerId);
            if (center) {
                center.radius = parseInt(value);
                // ⭐ PERBARUI LINGKARAN DI PETA
                if (radiusCircles[centerId]) {
                    radiusCircles[centerId].setRadius(parseInt(value));
                }
            }
            showToast('Radius diperbarui.', 'success');
            
            // ⭐ UPDATE SEMUA DATA YANG TERPENGARUH
            updateAllHouseColors();
            recountCenterHouseholds();      // Hitung ulang jumlah rumah per center
            renderHouseList();               // Refresh daftar rumah
            renderCenterList();              // Refresh daftar center dengan count baru
            updateLayerCounts();             // Update badge layer
            loadStats();                     // Update statistik dashboard
            
            // ⭐ REFRESH POPUP CENTER JIKA TERBUKA
            if (center._marker && center._marker.isPopupOpen()) {
                showCenterPopup(center._marker, center);
            }
        } else showToast('Gagal menyimpan radius.', 'error');
    } catch (err) { 
        showToast('Gagal menyimpan radius.', 'error'); 
    }
}

async function showCoverageHouseholds(centerId) {
    showLoading(true);
    const r = await ApiCenters.coverage(centerId);
    showLoading(false);
    if (!r.ok) { showToast('Gagal memuat data.', 'error'); return; }
    const { center, households, count } = r.data.data;
    if (!households.length) { showToast(`Tidak ada rumah dalam radius ${center.radius}m.`, 'warning'); return; }
    const tempLayer = L.layerGroup();
    households.forEach(h => {
        L.circleMarker([h.latitude, h.longitude], {
            radius: 10, color: '#3a56d4', fillColor: '#3a56d4', fillOpacity: 0.25, weight: 2,
        }).addTo(tempLayer).bindTooltip(h.head_name, { permanent: false });
    });
    tempLayer.addTo(MAP);
    setTimeout(() => MAP.removeLayer(tempLayer), 10000);
    flyTo(center.latitude, center.longitude, 15);
    showToast(`${count} rumah dalam jangkauan ${center.name}.`, 'success');
}

// ====================================================================
// HOUSES
// ====================================================================
function renderHouses() {
    layerHouses.clearLayers();

    const filtered = State.houses.filter(h => {
        if (State.activeFilter === 'centers') return false;
        if (State.povertyFilter && h.poverty_status !== State.povertyFilter) return false;
        if (State.aidFilter && h.aid_status !== State.aidFilter) return false;
        if (State.conditionFilter && h.house_condition !== State.conditionFilter) return false;
        if (State.searchQuery) {
            const q = State.searchQuery.toLowerCase();
            if (!h.head_name.toLowerCase().includes(q) &&
                !(h.full_address || h.address || '').toLowerCase().includes(q) &&
                !(h.head_nik || '').includes(q)) return false;
        }
        return true;
    });

    filtered.forEach(h => addHouseMarker(h));
    updateLayerCounts();
    renderHouseList(filtered);
}

function isHouseInsideAnyRadius(lat, lng) {
    for (const center of State.centers) {
        if (!center.is_active) continue;
        const distance = haversineMeters(lat, lng, center.latitude, center.longitude);
        if (distance <= center.radius) return true;
    }
    return false;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function recountCenterHouseholds() {
    console.log('Recounting center households...');
    
    State.centers.forEach(center => {
        let count = 0;
        let householdsInRadius = [];
        
        State.houses.forEach(house => {
            if (house.is_active === false) return;
            
            const distance = haversineMeters(
                house.latitude, house.longitude,
                center.latitude, center.longitude
            );
            
            if (distance <= center.radius) {
                count++;
                householdsInRadius.push({
                    id: house.id,
                    name: house.head_name,
                    distance: Math.round(distance)
                });
            }
        });
        
        center.household_count = count;
        center.households_in_radius = householdsInRadius.slice(0, 10); // Simpan 10 terdekat
    });
    
    // Update UI
    renderCenterList();
    updateLayerCounts();
}

function getHouseMarkerColor(lat, lng) {
    return isHouseInsideAnyRadius(lat, lng) ? '#d63230' : '#0b9e73';
}

function addHouseMarker(h) {
    const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
    const color = insideRadius ? '#d63230' : '#0b9e73';

    const marker = L.marker([h.latitude, h.longitude], {
        icon: L.divIcon({
            html: `<div class="custom-marker-house" style="background:${color};"><i class="fas fa-home"></i></div>`,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
            className: '',
        }),
        title: h.head_name,
        draggable: true,
    });

    marker._houseColor = color;

    marker.on('dragstart', function() { dragInProgress = true; marker.closePopup(); marker.setZIndexOffset(1000); });
    marker.on('drag', function(e) {
        const pos = marker.getLatLng();
        const newColor = getHouseMarkerColor(pos.lat, pos.lng);
        if (marker._houseColor !== newColor) {
            marker._houseColor = newColor;
            marker.setIcon(L.divIcon({
                html: `<div class="custom-marker-house" style="background:${newColor};"><i class="fas fa-home"></i></div>`,
                iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
                className: '',
            }));
        }
    });
    marker.on('dragend', async function(e) {
        dragInProgress = false;
        marker.setZIndexOffset(0);
        const pos = marker.getLatLng();
        const lat = pos.lat, lng = pos.lng;
        h.latitude = lat; h.longitude = lng;
        const newColor = getHouseMarkerColor(lat, lng);
        marker._houseColor = newColor;
        marker.setIcon(L.divIcon({
            html: `<div class="custom-marker-house" style="background:${newColor};"><i class="fas fa-home"></i></div>`,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
            className: '',
        }));
        let newAddress = h.full_address || h.address;
        try { newAddress = await reverseGeocode(lat, lng); h.full_address = newAddress; } catch (err) {}
        try {
            const r = await ApiHouses.patch(h.id, { latitude: lat, longitude: lng, full_address: newAddress });
            if (r.ok && r.data?.success) {
                if (r.data.data?.managing_center_id) h.managing_center_id = r.data.data.managing_center_id;
                showToast('Posisi rumah diperbarui.', 'success');
                recountCenterHouseholds();
                loadStats();
                renderHouseList();
                renderCenterList();
                updateLayerCounts();
            } else showToast('Gagal menyimpan posisi.', 'error');
        } catch (err) { showToast('Gagal menyimpan posisi.', 'error'); }
        showHousePopup(marker, h);
    });
    marker.on('click', () => showHousePopup(marker, h));
    layerHouses.addLayer(marker);
    h._marker = marker;
}

function updateAllHouseColors() {
    State.houses.forEach(h => {
        if (h._marker) {
            const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
            const newColor = insideRadius ? '#d63230' : '#0b9e73';
            if (h._marker._houseColor !== newColor) {
                h._marker._houseColor = newColor;
                h._marker.setIcon(L.divIcon({
                    html: `<div class="custom-marker-house" style="background:${newColor};"><i class="fas fa-home"></i></div>`,
                    iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
                    className: '',
                }));
            }
        }
    });
}

// assets/js/markers.js — showHousePopup (redesigned popup)
async function showHousePopup(marker, h, forceRefresh = false) {
    let houseData = h;

    // Fetch fresh data if aid_history is missing or forceRefresh=true
    if (forceRefresh || !houseData.aid_history || houseData.aid_history.length === undefined) {
        try {
            showLoading(true);
            const r = await ApiHouses.show(houseData.id);
            showLoading(false);
            if (r.ok && r.data?.success) {
                houseData = r.data.data;
                const index = State.houses.findIndex(hh => hh.id === houseData.id);
                if (index !== -1) {
                    State.houses[index] = houseData;
                    if (State.houses[index]._marker) {
                        State.houses[index]._marker._houseData = houseData;
                    }
                }
            }
        } catch (err) {
            showLoading(false);
            console.error('Failed to load fresh household data:', err);
        }
    }

    // ── Derived values ───────────────────────────────────────────────
    const hasAid        = (houseData.aid_history && houseData.aid_history.length > 0);
    const aidStatusText = hasAid ? 'Penerima Bantuan' : 'Belum Ada Bantuan';
    const aidStatusColor= hasAid ? '#0b9e73' : '#d97706';

    let age = '—';
    if (houseData.head_date_of_birth) {
        const bd = new Date(houseData.head_date_of_birth), now = new Date();
        let a = now.getFullYear() - bd.getFullYear();
        if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) a--;
        age = a;
    }

    const povColor = POVERTY_COLORS[houseData.poverty_status] || '#9ba4b5';
    const povLabel = POVERTY_LABELS[houseData.poverty_status] || houseData.poverty_status;

    // Employment one-liner
    let jobLine = '—';
    if (houseData.head_employment_status === 'unemployed') {
        jobLine = 'Tidak Bekerja';
    } else if (houseData.head_employment_status === 'studying') {
        jobLine = escapeHtml(houseData.head_institution_name || 'Pelajar/Mahasiswa');
    } else if (houseData.head_employment_status === 'working') {
        jobLine = escapeHtml(houseData.head_job_name || 'Bekerja');
        if (houseData.head_monthly_income) jobLine += ` · ${formatRp(houseData.head_monthly_income)}/bln`;
    }

    const fullAddress = houseData.full_address || houseData.address || '—';
    const conditionIcon = houseData.house_condition === 'layak'
        ? `<span style="color:#0b9e73;"><i class="fas fa-check-circle"></i> Layak</span>`
        : houseData.house_condition === 'tidak_layak'
            ? `<span style="color:#d63230;"><i class="fas fa-times-circle"></i> Tidak Layak</span>`
            : '—';

    // ── Location pills (RT/RW · Kelurahan · Kecamatan) ───────────────
    const locationPills = [
        houseData.rt    ? `RT ${escapeHtml(houseData.rt)}/${escapeHtml(houseData.rw || '?')}` : null,
        houseData.kelurahan ? escapeHtml(houseData.kelurahan) : null,
        houseData.kecamatan ? escapeHtml(houseData.kecamatan) : null,
    ].filter(Boolean);

    const locationPillsHtml = locationPills.length
        ? `<div class="hp-pills">${locationPills.map(p => `<span class="hp-pill">${p}</span>`).join('')}</div>`
        : '';

    // ── Family members ────────────────────────────────────────────────
    let membersHtml = '';
    if (houseData.household_members && houseData.household_members.length) {
        const members = houseData.household_members;
        const shown   = members.slice(0, 5);
        const extra   = members.length - shown.length;
        membersHtml = `
        <div class="hp-section">
            <div class="hp-section-header">
                <i class="fas fa-users"></i>
                <span>Anggota Keluarga</span>
                <span class="hp-count">${members.length}</span>
            </div>
            <div class="hp-members-list">
                ${shown.map(m => {
                    let statusLine = '';
                    if (m.employment_status === 'working')   statusLine = escapeHtml(m.job_name || 'Bekerja');
                    else if (m.employment_status === 'studying') statusLine = escapeHtml(m.institution_name || 'Sekolah');
                    else if (m.employment_status === 'unemployed') statusLine = 'Tidak bekerja';
                    return `<div class="hp-member-row">
                        <div class="hp-member-avatar"><i class="fas fa-user"></i></div>
                        <div class="hp-member-info">
                            <div class="hp-member-name">${escapeHtml(m.name)}</div>
                            <div class="hp-member-meta">${escapeHtml(m.relationship || '—')}${statusLine ? ' · ' + statusLine : ''}</div>
                        </div>
                    </div>`;
                }).join('')}
                ${extra > 0 ? `<div class="hp-member-more"><i class="fas fa-ellipsis-h"></i> +${extra} anggota lainnya</div>` : ''}
            </div>
        </div>`;
    }

    // ── Aid history ───────────────────────────────────────────────────
    let aidHistoryHtml = '';
    if (hasAid) {
        const latestAids = houseData.aid_history.slice(0, 5);
        const extraAids  = houseData.aid_history.length - latestAids.length;
        aidHistoryHtml = `
        <div class="hp-section">
            <div class="hp-section-header">
                <i class="fas fa-hand-holding-heart"></i>
                <span>Riwayat Bantuan</span>
                <span class="hp-count">${houseData.aid_history.length}</span>
            </div>
            <div class="hp-aid-list">
                ${latestAids.map(aid => `
                <div class="hp-aid-row">
                    <div class="hp-aid-left">
                        <span class="hp-aid-type">${escapeHtml(aid.aid_type_label || (typeof AID_LABELS !== 'undefined' && AID_LABELS[aid.aid_type]) || aid.aid_type || 'Bantuan')}</span>
                        ${aid.amount ? `<span class="hp-aid-amount">${formatRp(aid.amount)}</span>` : ''}
                    </div>
                    <div class="hp-aid-date">${formatDate(aid.aid_date)}</div>
                    ${aid.description || aid.notes ? `<div class="hp-aid-note">${escapeHtml((aid.description || aid.notes || '').substring(0, 55))}${(aid.description || aid.notes || '').length > 55 ? '…' : ''}</div>` : ''}
                </div>`).join('')}
                ${extraAids > 0 ? `<div class="hp-member-more"><i class="fas fa-ellipsis-h"></i> +${extraAids} bantuan lainnya</div>` : ''}
            </div>
        </div>`;
    } else {
        aidHistoryHtml = `
        <div class="hp-section hp-aid-empty">
            <div class="hp-section-header">
                <i class="fas fa-hand-holding-heart"></i>
                <span>Riwayat Bantuan</span>
            </div>
            <div class="hp-empty-hint"><i class="fas fa-inbox"></i> Belum ada riwayat bantuan</div>
        </div>`;
    }

    // ── Assigned center ───────────────────────────────────────────────
    const centerHtml = houseData.center_name
        ? `<div class="hp-center-row">
               <i class="fas fa-place-of-worship"></i>
               <span>${escapeHtml(houseData.center_name)}</span>
           </div>`
        : '';

    // ── Coordinates ──────────────────────────────────────────────────
    const lat = (houseData.latitude  || marker.getLatLng().lat).toFixed(6);
    const lng = (houseData.longitude || marker.getLatLng().lng).toFixed(6);

    // ── Build popup ──────────────────────────────────────────────────
    const popup = L.popup({ maxWidth: 360, minWidth: 300, closeButton: true, className: 'hp-leaflet-popup' })
        .setLatLng(marker.getLatLng())
        .setContent(`
        <div class="hp-popup">

            <!-- ── HEADER ───────────────────────────────── -->
            <div class="hp-header">
                <div class="hp-avatar" style="background:${povColor}18;color:${povColor};">
                    <i class="fas fa-home"></i>
                </div>
                <div class="hp-header-info">
                    <div class="hp-head-name">${escapeHtml(houseData.head_name)}</div>
                    <div class="hp-nik">NIK: ${escapeHtml(houseData.head_nik || houseData.nik || '—')}</div>
                </div>
                <div class="hp-drag-hint" title="Seret marker untuk memindahkan">
                    <i class="fas fa-up-down-left-right"></i>
                </div>
            </div>

            <!-- ── STATUS STRIP ─────────────────────────── -->
            <div class="hp-status-strip">
                <div class="hp-status-chip" style="background:${povColor}14;color:${povColor};border-color:${povColor}30;">
                    <span class="hp-chip-dot" style="background:${povColor};"></span>${povLabel}
                </div>
                <div class="hp-status-chip" style="background:${aidStatusColor}12;color:${aidStatusColor};border-color:${aidStatusColor}28;">
                    <i class="fas ${hasAid ? 'fa-check-circle' : 'fa-clock'}"></i>${aidStatusText}
                </div>
            </div>

            <!-- ── SCROLLABLE BODY ──────────────────────── -->
            <div class="hp-body">

                <!-- Location -->
                <div class="hp-section">
                    <div class="hp-section-header">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>Lokasi</span>
                    </div>
                    <div class="hp-address">${escapeHtml(fullAddress)}</div>
                    ${locationPillsHtml}
                    ${centerHtml}
                    <div class="hp-coords"><i class="fas fa-crosshairs"></i>${lat}, ${lng}</div>
                </div>

                <!-- Head of Household -->
                <div class="hp-section">
                    <div class="hp-section-header">
                        <i class="fas fa-user"></i>
                        <span>Kepala Keluarga</span>
                    </div>
                    <div class="hp-kv-grid">
                        <div class="hp-kv-row">
                            <span class="hp-kv-label">Usia</span>
                            <span class="hp-kv-val">${age} tahun</span>
                        </div>
                        <div class="hp-kv-row">
                            <span class="hp-kv-label">Pendidikan</span>
                            <span class="hp-kv-val">${educationLabel(houseData.head_education) || '—'}</span>
                        </div>
                        <div class="hp-kv-row">
                            <span class="hp-kv-label">Pekerjaan</span>
                            <span class="hp-kv-val">${jobLine}</span>
                        </div>
                        <div class="hp-kv-row">
                            <span class="hp-kv-label">Kondisi Rumah</span>
                            <span class="hp-kv-val">${conditionIcon}</span>
                        </div>
                    </div>
                </div>

                <!-- Family Members -->
                ${membersHtml}

                <!-- Aid History -->
                ${aidHistoryHtml}

            </div><!-- /.hp-body -->

            <!-- ── ACTIONS ──────────────────────────────── -->
            <div class="hp-actions">
                <button class="hp-btn hp-btn-primary" onclick="editHouse(${houseData.id})">
                    <i class="fas fa-pen"></i> Edit
                </button>
                <button class="hp-btn hp-btn-success" onclick="openAidModalForHouse(${houseData.id})">
                    <i class="fas fa-gift"></i> Tambah Bantuan
                </button>
                ${window.canDelete ? `<button class="hp-btn hp-btn-danger" onclick="deleteHouse(${houseData.id})" title="Hapus"><i class="fas fa-trash"></i></button>` : ''}
            </div>

        </div>`);

    marker.unbindPopup();
    marker.bindPopup(popup).openPopup();
}

// Update click handler untuk memuat data fresh
function addHouseMarker(h) {
    const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
    const color = insideRadius ? '#d63230' : '#0b9e73';

    const marker = L.marker([h.latitude, h.longitude], {
        icon: L.divIcon({
            html: `<div class="custom-marker-house" style="background:${color};"><i class="fas fa-home"></i></div>`,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
            className: '',
        }),
        title: h.head_name,
        draggable: true,
    });

    marker._houseColor = color;
    marker._houseData = h;

    // ... (drag handlers tetap sama) ...

    // ⭐ PERBAIKAN: Saat klik, muat data fresh dari API
    marker.on('click', async () => {
        // Tampilkan loading state di popup sementara
        const loadingPopup = L.popup()
            .setLatLng(marker.getLatLng())
            .setContent('<div style="padding: 20px; text-align: center;"><i class="fas fa-circle-notch fa-spin"></i> Memuat data...</div>')
            .openPopup();
        
        // Load data fresh dari API
        try {
            const r = await ApiHouses.show(h.id);
            if (r.ok && r.data?.success) {
                const freshData = r.data.data;
                // Update data di State
                marker._houseData = freshData;
                const index = State.houses.findIndex(hh => hh.id === freshData.id);
                if (index !== -1) {
                    State.houses[index] = freshData;
                    State.houses[index]._marker = marker;
                }
                // Tampilkan popup dengan data fresh
                await showHousePopup(marker, freshData);
            } else {
                loadingPopup.setContent('<div style="padding: 20px; text-align: center; color: var(--danger);">Gagal memuat data</div>');
                setTimeout(() => marker.closePopup(), 1500);
            }
        } catch (err) {
            loadingPopup.setContent('<div style="padding: 20px; text-align: center; color: var(--danger);">Error memuat data</div>');
            setTimeout(() => marker.closePopup(), 1500);
        }
    });
    
    layerHouses.addLayer(marker);
    h._marker = marker;
}

// ====================================================================
// SIDEBAR LISTS
// ====================================================================
function renderCenterList() {
    const el = document.getElementById('centersList');
    const cnt = document.getElementById('centerCount');
    const show = State.activeFilter !== 'houses';
    document.getElementById('centersListSection').style.display = show ? '' : 'none';
    if (!show) return;
    const filtered = State.centers.filter(c => {
        if (!State.searchQuery) return true;
        const q = State.searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q);
    });
    cnt.textContent = filtered.length;
    if (!filtered.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-place-of-worship"></i><p>Tidak ada data</p></div>'; return; }
    el.innerHTML = filtered.slice(0, 50).map(c => {
        const color = CENTER_COLORS[c.worship_type] || '#3a56d4';
        const icon = CENTER_ICONS[c.worship_type] || 'fa-place-of-worship';
        return `<div class="data-item" onclick="flyTo(${c.latitude},${c.longitude})">
            <div class="data-item-icon center" style="background:${color}20;color:${color};"><i class="fas ${icon}"></i></div>
            <div class="data-item-info"><div class="data-item-title">${truncate(c.name, 24)}</div><div class="data-item-subtitle">${CENTER_LABELS[c.worship_type] || ''} · ${c.household_count ?? 0} rumah</div></div>
            <div class="data-item-actions">
                <button class="btn-edit" title="Edit" onclick="event.stopPropagation();editCenter(${c.id})"><i class="fas fa-pen"></i></button>
                ${window.canDelete ? `<button class="btn-delete" title="Hapus" onclick="event.stopPropagation();deleteCenter(${c.id})"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function renderHouseList(filtered) {
    const el = document.getElementById('housesList');
    const cnt = document.getElementById('houseCount');
    const show = State.activeFilter !== 'centers';
    document.getElementById('housesListSection').style.display = show ? '' : 'none';
    if (!show) return;
    const list = filtered || State.houses;
    cnt.textContent = list.length;
    if (!list.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-home"></i><p>Tidak ada data</p></div>'; return; }
    el.innerHTML = list.slice(0, 80).map(h => {
        const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
        const color = insideRadius ? '#d63230' : '#0b9e73';
        const status = insideRadius ? 'Dalam Radius' : 'Luar Radius';
        return `<div class="data-item" onclick="flyTo(${h.latitude},${h.longitude})">
            <div class="data-item-icon house" style="background:${color}18;color:${color};"><i class="fas fa-home"></i></div>
            <div class="data-item-info"><div class="data-item-title">${truncate(h.head_name, 22)}</div><div class="data-item-subtitle" style="color:${color};">${status}</div></div>
            <div class="data-item-actions">
                <button class="btn-edit" title="Edit" onclick="event.stopPropagation();editHouse(${h.id})"><i class="fas fa-pen"></i></button>
                ${window.canDelete ? `<button class="btn-delete" title="Hapus" onclick="event.stopPropagation();deleteHouse(${h.id})"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>`;
    }).join('');
    if (list.length > 80) el.innerHTML += `<div class="empty-state" style="padding:10px;"><p style="color:var(--text-muted);">+${list.length - 80} lainnya — gunakan filter</p></div>`;
}

function updateLayerCounts() {
    const cc = document.getElementById('layerCenterCount');
    const hc = document.getElementById('layerHouseCount');
    if (cc) cc.textContent = State.centers.length;
    if (hc) hc.textContent = State.houses.length;
}