/* ============================================================
   markers.js — Draggable markers + inside/outside radius colors
   ============================================================ */
'use strict';

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
    const icon  = CENTER_ICONS[center.worship_type]  || 'fa-place-of-worship';

    const circle = L.circle([center.latitude, center.longitude], {
        radius:      center.radius,
        color:       color,
        fillColor:   color,
        fillOpacity: 0.07,
        weight:      1.5,
        dashArray:   '4 3',
    });
    circle.addTo(MAP);
    radiusCircles[center.id] = circle;

    const marker = L.marker([center.latitude, center.longitude], {
        icon: L.divIcon({
            html: `<div class="custom-marker-center" style="background:${color};">
                       <i class="fas ${icon}"></i>
                   </div>`,
            iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
            className: '',
        }),
        title: center.name,
        draggable: true,
    });

    marker.on('dragstart', function() {
        marker.closePopup();
        marker.setZIndexOffset(1000);
    });

    marker.on('drag', function(e) {
        const pos = marker.getLatLng();
        if (radiusCircles[center.id]) {
            radiusCircles[center.id].setLatLng(pos);
        }
    });

    marker.on('dragend', async function(e) {
        marker.setZIndexOffset(0);
        const pos = marker.getLatLng();
        center.latitude = pos.lat;
        center.longitude = pos.lng;

        if (radiusCircles[center.id]) {
            radiusCircles[center.id].setLatLng(pos);
        }

        try {
            const r = await ApiCenters.patch(center.id, {
                latitude: pos.lat,
                longitude: pos.lng,
            });
            if (r.ok && r.data?.success) {
                showToast('Posisi tempat ibadah diperbarui.', 'success');
                // Update house colors after center moved
                updateAllHouseColors();
                recountCenterHouseholds();
                loadStats();
                renderCenterList();
                renderHouseList();         
                updateLayerCounts(); 
            } else {
                showToast('Gagal menyimpan posisi.', 'error');
            }
        } catch (err) {
            console.error('Drag save error:', err);
            showToast('Gagal menyimpan posisi.', 'error');
        }

        showCenterPopup(marker, center);
    });

    marker.on('click', () => showCenterPopup(marker, center));
    layerCenters.addLayer(marker);
    center._marker = marker;
}

function showCenterPopup(marker, center) {
    const color  = CENTER_COLORS[center.worship_type] || '#3a56d4';
    const icon   = CENTER_ICONS[center.worship_type]  || 'fa-place-of-worship';
    const label  = CENTER_LABELS[center.worship_type] || center.worship_type;

    const popup = L.popup({ maxWidth: 300, closeButton: true })
        .setLatLng(marker.getLatLng())
        .setContent(`
        <div class="popup-info">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #edf0f6;">
                <div style="width:32px;height:32px;border-radius:8px;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-size:13px;flex-shrink:0;">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <strong style="font-size:13px;color:#0f1623;">${center.name}</strong>
                    <div style="font-size:10.5px;color:#9ba4b5;">${label} · <em>seret untuk pindahkan</em></div>
                </div>
            </div>
            <p><i class="fas fa-map-marker-alt"></i>${truncate(center.address || '—', 40)}</p>
            <p><i class="fas fa-ruler-combined"></i>Radius: <strong>${center.radius}m</strong></p>
            <p><i class="fas fa-home"></i>Rumah dalam radius: <strong>${center.household_count ?? '—'}</strong></p>
            <div class="radius-control">
                <label>Ubah Radius: <strong id="rcVal_${center.id}">${center.radius}m</strong></label>
                <div class="slider-container" style="margin-top:5px;">
                    <input type="range" min="50" max="5000" step="10" value="${center.radius}"
                        oninput="liveUpdateRadius(${center.id}, this.value)"
                        onchange="saveRadius(${center.id}, this.value)">
                </div>
                <div class="radius-ticks"><span>50m</span><span>2.5km</span><span>5km</span></div>
            </div>
            <div class="popup-actions">
                <button class="btn btn-primary btn-sm" onclick="editCenter(${center.id})"><i class="fas fa-pen"></i> Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="showCoverageHouseholds(${center.id})"><i class="fas fa-eye"></i> Lihat Rumah</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCenter(${center.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`);

    marker.unbindPopup();
    marker.bindPopup(popup).openPopup();
}

function liveUpdateRadius(centerId, value) {
    document.getElementById('rcVal_' + centerId).textContent = value + 'm';
    if (radiusCircles[centerId]) {
        radiusCircles[centerId].setRadius(parseInt(value));
    }
}

async function saveRadius(centerId, value) {
    try {
        const r = await ApiCenters.patch(centerId, { radius: parseInt(value) });
        if (r.ok && r.data?.success) {
            const center = State.centers.find(c => c.id == centerId);
            if (center) center.radius = parseInt(value);
            showToast('Radius diperbarui.', 'success');
            updateAllHouseColors();
            recountCenterHouseholds();
            renderHouseList();       
            renderCenterList();        
            updateLayerCounts(); 
        } else {
            showToast('Gagal menyimpan radius.', 'error');
        }
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
                !(h.address || '').toLowerCase().includes(q) &&
                !(h.nik || '').includes(q)) return false;
        }
        return true;
    });

    filtered.forEach(h => addHouseMarker(h));
    updateLayerCounts();
    renderHouseList(filtered);
}

/**
 * Check if a house is inside ANY religious center's radius
 */
function isHouseInsideAnyRadius(lat, lng) {
    for (const center of State.centers) {
        if (!center.is_active) continue;
        const distance = haversineMeters(lat, lng, center.latitude, center.longitude);
        if (distance <= center.radius) {
            return true;
        }
    }
    return false;
}

/**
 * Calculate distance in meters between two coordinates
 */
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

/**
 * Recount houses for each center and update State.centers
 */
function recountCenterHouseholds() {
    State.centers.forEach(center => {
        let count = 0;
        State.houses.forEach(house => {
            if (house.is_active === false) return;
            
            const distance = haversineMeters(
                house.latitude, house.longitude,
                center.latitude, center.longitude
            );
            
            if (distance <= center.radius) {
                count++;
            }
        });
        center.household_count = count;
    });
}

/**
 * Get marker color based on inside/outside radius
 * Red (#d63230) = inside worship place radius
 * Green (#0b9e73) = outside worship place radius
 */
function getHouseMarkerColor(lat, lng) {
    return isHouseInsideAnyRadius(lat, lng) ? '#d63230' : '#0b9e73';
}

function addHouseMarker(h) {
    const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
    const color = insideRadius ? '#d63230' : '#0b9e73';

    const markerHtml = `
        <div class="custom-marker-house" style="background:${color};">
            <i class="fas fa-home"></i>
        </div>`;

    const marker = L.marker([h.latitude, h.longitude], {
        icon: L.divIcon({
            html: markerHtml,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
            className: '',
        }),
        title: h.head_name,
        draggable: true,
    });

    // Store color state on marker
    marker._houseColor = color;

    marker.on('dragstart', function() {
        dragInProgress = true;
        marker.closePopup();
        marker.setZIndexOffset(1000);
    });

    marker.on('drag', function(e) {
        // Real-time color update while dragging
        const pos = marker.getLatLng();
        const newColor = getHouseMarkerColor(pos.lat, pos.lng);
        if (marker._houseColor !== newColor) {
            marker._houseColor = newColor;
            const iconHtml = marker.getIcon();
            const div = iconHtml.options.html;
            const updatedHtml = div.replace(/background:(#[a-f0-9]+)/, `background:${newColor}`);
            marker.setIcon(L.divIcon({
                html: updatedHtml,
                iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
                className: '',
            }));
        }
    });

    marker.on('dragend', async function(e) {
        dragInProgress = false;
        marker.setZIndexOffset(0);
        const pos = marker.getLatLng();
        const lat = pos.lat;
        const lng = pos.lng;

        // Update local state
        h.latitude = lat;
        h.longitude = lng;

        // Update color after drag
        const newColor = getHouseMarkerColor(lat, lng);
        marker._houseColor = newColor;
        marker.setIcon(L.divIcon({
            html: `<div class="custom-marker-house" style="background:${newColor};">
                    <i class="fas fa-home"></i>
                </div>`,
            iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
            className: '',
        }));

        // Reverse geocode new position for address
        let newAddress = h.address;
        try {
            newAddress = await reverseGeocode(lat, lng);
            h.address = newAddress;
        } catch (err) {
            console.warn('Reverse geocode on drag failed:', err);
        }

        // Save position + address to API
        try {
            const r = await ApiHouses.patch(h.id, {
                latitude: lat,
                longitude: lng,
                address: newAddress,  
            });
            if (r.ok && r.data?.success) {
                if (r.data.data?.managing_center_id) {
                    h.managing_center_id = r.data.data.managing_center_id;
                }
                showToast('Posisi rumah diperbarui.', 'success');
                recountCenterHouseholds();
                loadStats();
                renderHouseList();        
                renderCenterList();        
                updateLayerCounts();  
            } else {
                showToast('Gagal menyimpan posisi.', 'error');
            }
        } catch (err) {
            console.error('House drag save error:', err);
            showToast('Gagal menyimpan posisi.', 'error');
        }

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
                    html: `<div class="custom-marker-house" style="background:${newColor};">
                               <i class="fas fa-home"></i>
                           </div>`,
                    iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -28],
                    className: '',
                }));
            }
        }
    });
}

function showHousePopup(marker, h) {
    const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
    const radiusColor = insideRadius ? '#d63230' : '#0b9e73';
    const radiusText = insideRadius ? 'Dalam Radius' : 'Luar Radius';
    const povColor = POVERTY_COLORS[h.poverty_status] || '#9ba4b5';
    const povLabel = POVERTY_LABELS[h.poverty_status] || h.poverty_status;

    const popup = L.popup({ maxWidth: 300, closeButton: true })
        .setLatLng(marker.getLatLng())
        .setContent(`
        <div class="popup-info">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #edf0f6;">
                <div>
                    <strong style="font-size:13.5px;color:#0f1623;">${h.head_name}</strong>
                    <div style="font-size:9px;color:var(--text-muted);">seret untuk pindahkan</div>
                </div>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
                <span style="padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;background:${povColor}15;color:${povColor};white-space:nowrap;">
                    ● ${povLabel}
                </span>
                <span style="padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700;background:${radiusColor}15;color:${radiusColor};white-space:nowrap;">
                    ○ ${radiusText}
                </span>
            </div>
            <p><i class="fas fa-map-marker-alt"></i>${truncate(h.address || '—', 42)}</p>
            <p><i class="fas fa-id-card"></i>NIK: <strong>${h.nik || '—'}</strong></p>
            <p><i class="fas fa-users"></i>Anggota: <strong>${h.dependents}</strong> orang | Pendapatan: <strong>${formatRp(h.income)}/bln</strong></p>
            ${h.center_name ? `<p><i class="fas fa-place-of-worship"></i>Pusat: ${h.center_name}</p>` : ''}
            <div class="popup-actions">
                <button class="btn btn-primary btn-sm" onclick="editHouse(${h.id})"><i class="fas fa-pen"></i> Edit</button>
                <button class="btn btn-secondary btn-sm" onclick="openReportModal(${h.id})"><i class="fas fa-exclamation-triangle"></i> Laporan</button>
                <button class="btn btn-success btn-sm" onclick="openAidModalForHouse(${h.id})"><i class="fas fa-gift"></i> Bantuan</button>
                <button class="btn btn-danger btn-sm" onclick="deleteHouse(${h.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`);

    marker.unbindPopup();
    marker.bindPopup(popup).openPopup();
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

    if (!filtered.length) {
        el.innerHTML = '<div class="empty-state"><i class="fas fa-place-of-worship"></i><p>Tidak ada data</p></div>';
        return;
    }

    el.innerHTML = filtered.slice(0, 50).map(c => {
        const color = CENTER_COLORS[c.worship_type] || '#3a56d4';
        const icon  = CENTER_ICONS[c.worship_type]  || 'fa-place-of-worship';
        return `
        <div class="data-item" onclick="flyTo(${c.latitude},${c.longitude})">
            <div class="data-item-icon center" style="background:${color}20;color:${color};">
                <i class="fas ${icon}"></i>
            </div>
            <div class="data-item-info">
                <div class="data-item-title">${truncate(c.name, 24)}</div>
                <div class="data-item-subtitle">${CENTER_LABELS[c.worship_type] || ''} · ${c.household_count ?? 0} rumah</div>
            </div>
            <div class="data-item-actions">
                <button class="btn-edit" title="Edit" onclick="event.stopPropagation();editCenter(${c.id})"><i class="fas fa-pen"></i></button>
                <button class="btn-delete" title="Hapus" onclick="event.stopPropagation();deleteCenter(${c.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function renderHouseList(filtered) {
    const el  = document.getElementById('housesList');
    const cnt = document.getElementById('houseCount');
    const show = State.activeFilter !== 'centers';

    document.getElementById('housesListSection').style.display = show ? '' : 'none';
    if (!show) return;

    const list = filtered || State.houses;
    cnt.textContent = list.length;

    if (!list.length) {
        el.innerHTML = '<div class="empty-state"><i class="fas fa-home"></i><p>Tidak ada data</p></div>';
        return;
    }

    el.innerHTML = list.slice(0, 80).map(h => {
        const insideRadius = isHouseInsideAnyRadius(h.latitude, h.longitude);
        const color = insideRadius ? '#d63230' : '#0b9e73';
        const status = insideRadius ? 'Dalam Radius' : 'Luar Radius';
        return `
        <div class="data-item" onclick="flyTo(${h.latitude},${h.longitude})">
            <div class="data-item-icon house" style="background:${color}18;color:${color};">
                <i class="fas fa-home"></i>
            </div>
            <div class="data-item-info">
                <div class="data-item-title">${truncate(h.head_name, 22)}</div>
                <div class="data-item-subtitle" style="color:${color};">${status}</div>
            </div>
            <div class="data-item-actions">
                <button class="btn-edit" title="Edit" onclick="event.stopPropagation();editHouse(${h.id})"><i class="fas fa-pen"></i></button>
                <button class="btn-delete" title="Hapus" onclick="event.stopPropagation();deleteHouse(${h.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');

    if (list.length > 80) {
        el.innerHTML += `<div class="empty-state" style="padding:10px;"><p style="color:var(--text-muted);">+${list.length - 80} lainnya — gunakan filter</p></div>`;
    }
}

function updateLayerCounts() {
    const cc = document.getElementById('layerCenterCount');
    const hc = document.getElementById('layerHouseCount');
    if (cc) cc.textContent = State.centers.length;
    if (hc) hc.textContent = State.houses.length;
}