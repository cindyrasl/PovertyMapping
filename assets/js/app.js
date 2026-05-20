/* ============================================================
   app.js — Main app orchestrator with authentication
   ============================================================ */
'use strict';

// Flag to prevent duplicate initialization
let isAppInitialized = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Prevent duplicate initialization
    if (isAppInitialized) {
        console.warn('App already initialized, skipping duplicate call');
        return;
    }
    
    // First check authentication
    const isAuthed = await checkAuth();
    
    if (!isAuthed) {
        // Not logged in, redirect to login
        window.location.href = 'login.html';
        return;
    }
    
    // Initialize UI based on role
    initUIByRole();
    
    // Add logout button to sidebar
    addLogoutButton();
    
    // Init map
    initMap();
    
    // Init UI
    initNavTabs();
    initFilters();
    initFormTabs();
    initHelpModal();
    
    // Load data
    await loadAllData();
    
    // Nav tab: activate placement modes
    hookTabPlacementModes();
    
    isAppInitialized = true;
});

async function loadAllData() {
    showLoading(true);
    await Promise.all([loadCenters(), loadHouses(), loadStats()]);
    showLoading(false);
}

async function loadCenters() {
    const r = await ApiCenters.list();
    if (r.ok && r.data?.success) {
        State.centers = r.data.data.centers || [];
    }
    renderCenters();
}

async function loadHouses() {
    const params = {};

    const r = await ApiHouses.list({ ...params, limit: 500 });
    if (r.ok && r.data?.success) {
        State.houses = r.data.data.households || [];
    }
    renderHouses();
}

async function loadStats() {
    const r = await ApiStats.overview();
    if (!r.ok || !r.data?.success) return;

    const d = r.data.data;
    State.stats = d;

    animateCount('statCenters',    d.centers);
    animateCount('statHouses',     d.households);
    animateCount('statPopulation', d.population);
    animateCount('statAided',      d.aid_received);
    animateCount('statPending',    d.pending_public ?? 0);
}

// Export for public-reports.js
window.loadAllData = loadAllData;
window.loadStats   = loadStats;

function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent.replace(/\D/g,'')) || 0;
    const diff  = target - start;
    const steps = 20;
    let step = 0;
    const interval = setInterval(() => {
        step++;
        el.textContent = Math.round(start + (diff * step / steps)).toLocaleString('id-ID');
        if (step >= steps) clearInterval(interval);
    }, 30);
}

function initNavTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const key = tab.dataset.tab;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (key === 'dashboard') {
                openDashboard();
                setTimeout(() => {
                    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                    document.querySelector('[data-tab="overview"]').classList.add('active');
                }, 200);
            } else if (key === 'overview') {
                cancelPlacementMode();
                State.activeFilter = 'all';
                renderAllLayers();
            }
        });
    });
}

function hookTabPlacementModes() {
    document.querySelector('[data-tab="centers"]')?.addEventListener('click', () => {
        setPlacementMode('center');
        showToast('Klik peta untuk menambah tempat ibadah.', 'success', 3000);
    });

    document.querySelector('[data-tab="houses"]')?.addEventListener('click', () => {
        setPlacementMode('house');
        showToast('Klik peta untuk menambah rumah tangga.', 'success', 3000);
    });
}

function initFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.activeFilter = btn.dataset.filter;
            renderAllLayers();
        });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(async (e) => {
            State.searchQuery = e.target.value.trim();
            renderAllLayers();
        }, 300));
    }
}

let helpStep = 1;
const helpTotal = 5;

function initHelpModal() {
    document.getElementById('helpBtn')?.addEventListener('click', () => {
        helpStep = 1;
        updateHelpStep();
        openModal('helpModal');
    });
}

function helpNav(dir) {
    helpStep = Math.min(helpTotal, Math.max(1, helpStep + dir));
    updateHelpStep();
}

function updateHelpStep() {
    document.querySelectorAll('.help-step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.help-step[data-step="${helpStep}"]`)?.classList.add('active');
    document.getElementById('helpProgress').textContent = helpStep + ' / ' + helpTotal;
    document.getElementById('helpPrev').disabled = helpStep === 1;
    document.getElementById('helpNext').disabled = helpStep === helpTotal;
    if (helpStep === helpTotal) {
        document.getElementById('helpNext').textContent = 'Selesai';
        document.getElementById('helpNext').onclick = () => closeModal('helpModal');
    } else {
        document.getElementById('helpNext').textContent = 'Berikutnya →';
        document.getElementById('helpNext').onclick = () => helpNav(1);
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cancelPlacementMode();
        document.querySelectorAll('.modal-overlay').forEach(m => {
            if (m.style.display === 'flex') {
                m.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    }
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        loadAllData().then(() => showToast('Data diperbarui.', 'success'));
    }
});