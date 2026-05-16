/* ============================================================
   map.js — Leaflet map initialisation + layer management
   ============================================================ */
'use strict';

// ---- Map instance + layer groups ---------------------------
let MAP;
let layerCenters, layerHouses, layerReports;
let layerVisible = { centers: true, houses: true, reports: true };

// ---- Placement mode: 'center' | 'house' | null -------------
let placementMode = null;
let tempMarker    = null;

// ---- Init --------------------------------------------------
function initMap() {
    MAP = L.map('map', {
        center: [-0.0236, 109.3426], // Pontianak, Kalimantan Barat
        zoom:   13,
        zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(MAP);

    // Tile layers
    const osmTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
    });
    const satelliteTile = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 19,
    });

    osmTile.addTo(MAP);

    // Expose for layer switcher
    MAP._baseLayers = { osm: osmTile, satellite: satelliteTile };
    MAP._activeBase = 'osm';

    // Layer groups
    layerCenters = L.layerGroup().addTo(MAP);
    layerHouses  = L.layerGroup().addTo(MAP);
    layerReports = L.layerGroup().addTo(MAP);

    // Map click → placement
    MAP.on('click', onMapClick);

    // Double-click suppression
    MAP.on('dblclick', (e) => e.originalEvent.preventDefault());
}

// ---- Map click handler -------------------------------------
async function onMapClick(e) {
    if (!placementMode) return;

    const { lat, lng } = e.latlng;

    // Remove temp marker
    if (tempMarker) { MAP.removeLayer(tempMarker); tempMarker = null; }

    // Place temp crosshair marker
    tempMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#3a56d4;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7], className: '',
        }),
    }).addTo(MAP);

    // Reverse geocode
    showLoading(true);
    const address = await reverseGeocode(lat, lng);
    showLoading(false);

    if (placementMode === 'center') {
        openCenterModal(null, lat, lng, address);
    } else if (placementMode === 'house') {
        openHouseModal(null, lat, lng, address);
    }
}

// ---- Reverse Geocode --------------------------------
async function reverseGeocode(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id&addressdetails=1&zoom=18`;
        const res = await fetch(url, { 
            headers: { 
                'Accept-Language': 'id',
                'User-Agent': 'WebGIS-PovertyMapping/2.0'
            } 
        });
        const data = await res.json();
        
        if (data && data.display_name) {
            return data.display_name;
        }
        
        // Fallback: build address from components
        if (data && data.address) {
            const addr = data.address;
            const parts = [];
            if (addr.road) parts.push(addr.road);
            if (addr.house_number) parts.push('No. ' + addr.house_number);
            if (addr.neighbourhood) parts.push(addr.neighbourhood);
            if (addr.suburb) parts.push(addr.suburb);
            if (addr.village) parts.push(addr.village);
            if (addr.city || addr.town || addr.municipality) parts.push(addr.city || addr.town || addr.municipality);
            if (addr.state) parts.push(addr.state);
            if (parts.length > 0) return parts.join(', ');
        }
        
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (err) {
        console.warn('Reverse geocoding failed:', err.message);
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
}

// ---- Placement mode control --------------------------------
function setPlacementMode(mode) {
    placementMode = mode;
    const map = document.getElementById('map');
    map.classList.remove('cursor-add-center', 'cursor-add-house');
    if (mode === 'center') map.classList.add('cursor-add-center');
    if (mode === 'house')  map.classList.add('cursor-add-house');

    // Highlight nav tabs
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === (mode === 'center' ? 'centers' : mode === 'house' ? 'houses' : 'overview'));
    });
}

function cancelPlacementMode() {
    placementMode = null;
    document.getElementById('map').classList.remove('cursor-add-center', 'cursor-add-house');
    if (tempMarker) { MAP.removeLayer(tempMarker); tempMarker = null; }
}

// ---- Layer toggle ------------------------------------------
function toggleLayer(name) {
    layerVisible[name] = !layerVisible[name];
    const checkbox = document.getElementById('layerCenters')?.parentElement?.querySelector('#layer' + capitalize(name));
    const grp = name === 'centers' ? layerCenters : name === 'houses' ? layerHouses : layerReports;

    if (layerVisible[name]) {
        grp.addTo(MAP);
    } else {
        MAP.removeLayer(grp);
    }

    const cb = document.getElementById('layer' + capitalize(name));
    if (cb) cb.checked = layerVisible[name];
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---- Fly to point ------------------------------------------
function flyTo(lat, lng, zoom = 17) {
    MAP.flyTo([lat, lng], zoom, { duration: 0.8 });
}

// ---- Clear + rebuild all layers ----------------------------
function renderAllLayers() {
    renderCenters();
    renderHouses();
}

// ---- Update layer count badges -----------------------------
function updateLayerCounts() {
    const cc = document.getElementById('layerCenterCount');
    const hc = document.getElementById('layerHouseCount');
    const rc = document.getElementById('layerReportCount');
    if (cc) cc.textContent = State.centers.length;
    if (hc) hc.textContent = State.houses.length;
}