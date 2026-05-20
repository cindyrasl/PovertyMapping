/* ============================================================
   auth.js — Authentication and role-based UI management
   ============================================================ */
'use strict';

// Global user state
let currentUser = null;
let isLoggedIn = false;
let userRole = null;

// ================================================================
// Session check on page load
// ================================================================
async function checkAuth() {
    try {
        const response = await fetch('api/auth/check.php');
        const result = await response.json();
        
        if (result.success && result.data && result.data.logged_in === true) {
            isLoggedIn = true;
            currentUser = {
                id: result.data.user_id,
                name: result.data.name,
                email: result.data.email,
                role: result.data.role
            };
            userRole = result.data.role;
            
            window.userRole = userRole;
            window.currentUser = currentUser;
            window.currentUserName = currentUser.name;
            
            return true;
        } else {
            isLoggedIn = false;
            currentUser = null;
            userRole = null;
            window.userRole = null;
            window.currentUser = null;
            return false;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        isLoggedIn = false;
        return false;
    }
}

// ================================================================
// Initialize UI based on user role
// ================================================================
function initUIByRole() {
    if (!isLoggedIn || !userRole) {
        window.location.href = 'login.html';
        return;
    }
    
    const isAdmin = (userRole === 'admin');
    
    window.canDelete = isAdmin;
    
    const chartTab = document.querySelector('.nav-tab[data-tab="dashboard"]');
    if (chartTab) {
        chartTab.style.display = isAdmin ? '' : 'none';
    }
    
    const adminPanelBtn = document.querySelector('.btn-admin-panel');
    if (adminPanelBtn) {
        adminPanelBtn.style.display = ''; // SEMUA USER BISA LIHAT (Field Officer juga)
    }
    
    const adminTopBar = document.querySelector('.admin-top-bar');
    if (adminTopBar) {
        adminTopBar.style.display = isAdmin ? '' : 'none';
    }
    
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRoleDisplay');
    if (userNameEl && currentUser) {
        userNameEl.textContent = currentUser.name;
    }
    if (userRoleEl && currentUser) {
        const roleLabel = userRole === 'admin' ? 'Admin' : 'Petugas Lapangan';
        userRoleEl.textContent = roleLabel;
    }
    
    console.log(`UI initialized for role: ${userRole} (Admin: ${isAdmin})`);
}

// ================================================================
// Logout function
// ================================================================
async function logout() {
    try {
        await fetch('api/auth/check.php?action=logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
    }
}

// ================================================================
// Add logout button to sidebar (only if not already exists)
// ================================================================
function addLogoutButton() {
    // CEK: apakah tombol logout sudah ada di HTML (dari index.html)
    const existingLogoutBtn = document.querySelector('.sidebar-header .logout-btn, #logoutBtn');
    if (existingLogoutBtn) {
        console.log('Logout button already exists, skipping dynamic addition');
        return;  // JANGAN tambahkan tombol baru jika sudah ada
    }
    
    // Fallback: jika belum ada, baru tambahkan
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (!sidebarHeader) return;
    
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logoutBtn';
    logoutBtn.className = 'logout-btn';
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    logoutBtn.title = 'Logout';
    logoutBtn.onclick = logout;
    logoutBtn.style.cssText = `
        background: none;
        border: none;
        color: var(--danger);
        font-size: 16px;
        cursor: pointer;
        padding: 5px;
        margin-left: 10px;
        border-radius: 6px;
        transition: all 0.14s;
    `;
    logoutBtn.onmouseenter = () => logoutBtn.style.backgroundColor = 'rgba(214,50,48,0.1)';
    logoutBtn.onmouseleave = () => logoutBtn.style.backgroundColor = 'transparent';
    
    const headerRight = sidebarHeader.querySelector('div[style*="margin-left:auto"]');
    if (headerRight) {
        headerRight.appendChild(logoutBtn);
    }
}

function canDelete() {
    return userRole === 'admin';
}

function getUserRole() {
    return userRole;
}

function getUserName() {
    return currentUser ? currentUser.name : '';
}

window.auth = {
    checkAuth,
    initUIByRole,
    logout,
    addLogoutButton,
    canDelete,
    getUserRole,
    getUserName,
    currentUser: () => currentUser,
    isLoggedIn: () => isLoggedIn,
    userRole: () => userRole
};