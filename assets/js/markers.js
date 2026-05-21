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

// assets/js/markers.js - Perbaiki fungsi showHousePopup
// Tambahkan parameter forceRefresh untuk memuat ulang data
async function showHousePopup(marker, h, forceRefresh = false) {
    let houseData = h;
    
    // Jika data tidak memiliki aid_history atau forceRefresh=true, ambil data terbaru dari API
    if (forceRefresh || !houseData.aid_history || houseData.aid_history.length === undefined) {
        try {
            showLoading(true);
            const r = await ApiHouses.show(houseData.id);
            showLoading(false);
            if (r.ok && r.data?.success) {
                houseData = r.data.data;
                // Update data di State
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
    
    const hasAid = (houseData.aid_history && houseData.aid_history.length > 0);
    const aidStatusText = hasAid ? 'Sudah Menerima Bantuan' : 'Belum Menerima Bantuan';
    const aidStatusColor = hasAid ? '#0b9e73' : '#d97706';
    
    let age = '';
    if (houseData.head_date_of_birth) {
        const birthDate = new Date(houseData.head_date_of_birth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    }
    
    const povColor = POVERTY_COLORS[houseData.poverty_status] || '#9ba4b5';
    const povLabel = POVERTY_LABELS[houseData.poverty_status] || houseData.poverty_status;
    
    let employmentDisplay = '';
    if (houseData.head_employment_status === 'unemployed') {
        employmentDisplay = 'Tidak Bekerja / Menganggur';
    } else if (houseData.head_employment_status === 'studying') {
        employmentDisplay = `Pendidikan: ${escapeHtml(houseData.head_institution_name || '-')}`;
    } else if (houseData.head_employment_status === 'working') {
        employmentDisplay = `Pekerjaan: ${escapeHtml(houseData.head_job_name || '-')} | Pendapatan: ${formatRp(houseData.head_monthly_income)}/bln`;
    }
    
    const fullAddress = houseData.full_address || houseData.address || '';
    
    // ⭐ BUILD AID HISTORY HTML
    let aidHistoryHtml = '';
    if (houseData.aid_history && houseData.aid_history.length > 0) {
        const latestAids = houseData.aid_history.slice(0, 5); // Show up to 5 latest
        aidHistoryHtml = `
            <div class="popup-section">
                <div class="popup-section-label"><i class="fas fa-gift"></i> Riwayat Bantuan (${houseData.aid_history.length})</div>
                <div style="max-height: 180px; overflow-y: auto;">
                    ${latestAids.map(aid => `
                        <div class="popup-row" style="margin-bottom: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">
                            <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
                                <span class="aid-badge" style="background:#e0faf3;color:#0b9e73;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:600;">
                                    ${aid.aid_type_label || AID_LABELS[aid.aid_type] || aid.aid_type || 'Bantuan'}
                                </span>
                                <span style="font-size:10px;color:#5a6478;">${formatDate(aid.aid_date)}</span>
                            </div>
                            ${aid.amount ? `<div style="font-size:10px;color:#0f1623;margin-top:2px;margin-left:0;"><strong>${formatRp(aid.amount)}</strong></div>` : ''}
                            ${aid.description || aid.notes ? `<div style="font-size:9.5px;color:#9ba4b5;margin-top:2px;margin-left:0;">${escapeHtml(aid.description || aid.notes).substring(0, 60)}${(aid.description || aid.notes || '').length > 60 ? '…' : ''}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
                ${houseData.aid_history.length > 5 ? `<div class="popup-row" style="font-size:10px;color:var(--text-muted);margin-top:4px;">+${houseData.aid_history.length - 5} bantuan lainnya</div>` : ''}
            </div>
        `;
    } else {
        aidHistoryHtml = `
            <div class="popup-section">
                <div class="popup-section-label"><i class="fas fa-gift"></i> Riwayat Bantuan</div>
                <div class="popup-row" style="color: var(--text-muted); font-style: italic;">
                    <i class="fas fa-info-circle"></i> Belum ada riwayat bantuan
                </div>
            </div>
        `;
    }
    
    const popup = L.popup({ maxWidth: 340, closeButton: true })
        .setLatLng(marker.getLatLng())
        .setContent(`
        <div class="popup-info">
            <div class="popup-name">${escapeHtml(houseData.head_name)}</div>
            <div class="popup-hint"><i class="fas fa-arrows-alt" style="font-size:8px;"></i> Seret marker untuk pindahkan</div>
            
            <div class="popup-badges">
                <span class="popup-badge" style="background:${povColor}15;color:${povColor};">● ${povLabel}</span>
                <span class="popup-badge" style="background:${aidStatusColor}15;color:${aidStatusColor};">${aidStatusText}</span>
            </div>
            
            <!-- Address Section -->
            <div class="popup-section">
                <div class="popup-section-label"><i class="fas fa-map-marker-alt"></i> Alamat</div>
                <div class="popup-row"><strong>Alamat:</strong> ${truncate(fullAddress, 50)}</div>
                ${houseData.rt ? `<div class="popup-row"><strong>RT/RW:</strong> ${escapeHtml(houseData.rt)}/${escapeHtml(houseData.rw || '-')}</div>` : ''}
                ${houseData.kelurahan ? `<div class="popup-row"><strong>Kelurahan:</strong> ${escapeHtml(houseData.kelurahan)}</div>` : ''}
                ${houseData.kecamatan ? `<div class="popup-row"><strong>Kecamatan:</strong> ${escapeHtml(houseData.kecamatan)}</div>` : ''}
                ${houseData.center_name ? `<div class="popup-row"><strong><i class="fas fa-place-of-worship"></i> Pusat:</strong> ${escapeHtml(houseData.center_name)}</div>` : ''}
            </div>
            
            <!-- Head of Household Section -->
            <div class="popup-section">
                <div class="popup-section-label"><i class="fas fa-user"></i> Kepala Keluarga</div>
                <div class="popup-row"><strong>NIK:</strong> ${escapeHtml(houseData.head_nik || houseData.nik || '—')}</div>
                <div class="popup-row"><strong>Usia:</strong> ${age} tahun</div>
                <div class="popup-row"><strong>Pendidikan:</strong> ${educationLabel(houseData.head_education)}</div>
                <div class="popup-row"><strong>Status:</strong> ${employmentDisplay}</div>
                ${houseData.house_condition ? `<div class="popup-row"><strong>Kondisi Rumah:</strong> ${houseData.house_condition === 'layak' ? 'Layak' : 'Tidak Layak'}</div>` : ''}
            </div>
            
            ${houseData.household_members && houseData.household_members.length ? `
            <div class="popup-section">
                <div class="popup-section-label"><i class="fas fa-users"></i> Anggota Keluarga (${houseData.household_members.length})</div>
                <div style="max-height: 150px; overflow-y: auto;">
                    ${houseData.household_members.slice(0, 4).map(m => `
                        <div class="popup-row" style="font-size:11px;">
                            <strong>${escapeHtml(m.name)}</strong> (${m.relationship}) 
                            ${m.employment_status === 'working' ? `· ${escapeHtml(m.job_name || 'Bekerja')}` : 
                              m.employment_status === 'studying' ? `· ${escapeHtml(m.institution_name || 'Sekolah')}` : ''}
                        </div>
                    `).join('')}
                    ${houseData.household_members.length > 4 ? `<div class="popup-row" style="font-size:10px;color:var(--text-muted);">+${houseData.household_members.length - 4} anggota lainnya</div>` : ''}
                </div>
            </div>
            ` : ''}
            
            <!-- ⭐ AID HISTORY SECTION -->
            ${aidHistoryHtml}
            
            <div class="popup-actions">
                <button class="btn btn-primary btn-sm" onclick="editHouse(${houseData.id})"><i class="fas fa-pen"></i> Edit</button>
                <button class="btn btn-success btn-sm" onclick="openAidModalForHouse(${houseData.id})"><i class="fas fa-gift"></i> Bantuan</button>
                ${window.canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteHouse(${houseData.id})" title="Hapus"><i class="fas fa-trash"></i></button>` : ''}
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