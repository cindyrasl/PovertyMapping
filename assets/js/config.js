/* ============================================================
   config.js — Global constants, utilities, shared state
   Single-admin simplified version
   ============================================================ */
'use strict';

const API = {
    houses:  'api/houses/index.php',
    centers: 'api/centers/index.php',
    aid:     'api/aid/index.php',
    reports: 'api/reports/index.php',
    stats:   'api/stats/index.php',
    users:   'api/users/index.php',
    logs:    'api/logs/index.php',
};

const POVERTY_COLORS = {
    sangat_miskin:  '#d63230',
    miskin:         '#f76707',
    rentan_miskin:  '#f59e0b',
    terdata:        '#0b9e73',
};

const POVERTY_LABELS = {
    sangat_miskin:  'Sangat Miskin',
    miskin:         'Miskin',
    rentan_miskin:  'Rentan Miskin',
    terdata:        'Terdata',
};

// Short labels for compact display
const POVERTY_SHORT = {
    sangat_miskin:  'Sgt Miskin',
    miskin:         'Miskin',
    rentan_miskin:  'Rentan',
    terdata:        'Terdata',
};

const CENTER_COLORS = {
    masjid:   '#1d6fa4',
    gereja:   '#7c3aed',
    klenteng: '#b45309',
    pura:     '#0e7f6e',
    vihara:   '#a16207',
};

const CENTER_ICONS = {
    masjid:   'fa-mosque',
    gereja:   'fa-church',
    klenteng: 'fa-torii-gate',
    pura:     'fa-om',
    vihara:   'fa-dharmachakra',
};

const CENTER_LABELS = {
    masjid:   'Masjid',
    gereja:   'Gereja',
    klenteng: 'Klenteng',
    pura:     'Pura',
    vihara:   'Vihara',
};

const AID_LABELS = {
    sembako:             'Sembako',
    pendanaan:           'Pendanaan',
    pelatihan:           'Pelatihan',
    sembako_pendanaan:   'Sembako + Pendanaan',
    sembako_pelatihan:   'Sembako + Pelatihan',
    pendanaan_pelatihan: 'Pendanaan + Pelatihan',
    lengkap:             'Lengkap',
};

const SEVERITY_COLORS = {
    kritis: '#d63230',
    berat:  '#f76707',
    sedang: '#f59e0b',
    ringan: '#0b9e73',
};

const State = {
    activeFilter: 'all',
    povertyFilter: '',
    aidFilter:     '',
    conditionFilter: '',
    ageFilter:     '',
    searchQuery:   '',
    centers:    [],
    houses:     [],
    stats:      null,
};

function debounce(fn, delay = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function formatRp(n) {
    if (!n) return 'Rp 0';
    return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function formatDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

function formatDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function truncate(str, n = 28) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '…' : str;
}

function showToast(msg, type = 'success', duration = 2800) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, duration);
}

function showLoading(show = true) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; document.body.style.overflow = ''; }
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
        document.body.style.overflow = '';
    }
});