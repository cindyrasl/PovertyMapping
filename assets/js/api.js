/* ============================================================
   api.js — Centralized fetch wrapper
   ============================================================ */
'use strict';

const Http = {
    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        try {
            const res = await fetch(url, { ...options, headers });
            const data = await res.json();
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            console.error('[API] Network error:', err);
            return { ok: false, status: 0, data: { success: false, message: 'Koneksi gagal.' } };
        }
    },
    async post(endpoint, body = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },
};

const ApiHouses = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request(API.houses + (qs ? '?' + qs : ''), { method: 'GET' });
    },
    async show(id) {
        return Http.request(API.houses + '?action=show&id=' + id, { method: 'GET' });
    },
    async create(body) {
        return Http.post(API.houses + '?action=create', body);
    },
    async update(id, body) {
        return Http.post(API.houses + '?action=update&id=' + id, body);
    },
    async patch(id, body) {
        return Http.post(API.houses + '?action=patch&id=' + id, body);
    },
    async delete(id) {
        return Http.post(API.houses + '?action=delete&id=' + id);
    },
    async verify(id) {
        return Http.post(API.houses + '?action=verify&id=' + id);
    },
};

const ApiCenters = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request(API.centers + (qs ? '?' + qs : ''), { method: 'GET' });
    },
    async show(id) {
        return Http.request(API.centers + '?action=show&id=' + id, { method: 'GET' });
    },
    async create(body) {
        return Http.post(API.centers + '?action=create', body);
    },
    async update(id, body) {
        return Http.post(API.centers + '?action=update&id=' + id, body);
    },
    async patch(id, body) {
        return Http.post(API.centers + '?action=patch&id=' + id, body);
    },
    async delete(id) {
        return Http.post(API.centers + '?action=delete&id=' + id);
    },
    async coverage(id) {
        return Http.request(API.centers + '?action=coverage&id=' + id, { method: 'GET' });
    },
    async nearby(lat, lng, km = 5) {
        return Http.request(API.centers + `?action=nearby&lat=${lat}&lng=${lng}&km=${km}`, { method: 'GET' });
    },
};

const ApiAid = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request(API.aid + (qs ? '?' + qs : ''), { method: 'GET' });
    },
    async show(id) {
        return Http.request(API.aid + '?action=show&id=' + id, { method: 'GET' });
    },
    async create(body) {
        return Http.post(API.aid + '?action=create', body);
    },
    async update(id, body) {
        return Http.post(API.aid + '?action=update&id=' + id, body);
    },
    async delete(id) {
        return Http.post(API.aid + '?action=delete&id=' + id);
    },
    async stats() {
        return Http.request(API.aid + '?action=stats', { method: 'GET' });
    },
};

const ApiReports = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request(API.reports + (qs ? '?' + qs : ''), { method: 'GET' });
    },
    async show(id) {
        return Http.request(API.reports + '?action=show&id=' + id, { method: 'GET' });
    },
    async create(body) {
        return Http.post(API.reports + '?action=create', body);
    },
    async update(id, body) {
        return Http.post(API.reports + '?action=update&id=' + id, body);
    },
    async resolve(id) {
        return Http.post(API.reports + '?action=resolve&id=' + id);
    },
    async delete(id) {
        return Http.post(API.reports + '?action=delete&id=' + id);
    },
};

const ApiStats = {
    async overview() {
        return Http.request(API.stats + '?action=overview', { method: 'GET' });
    },
    async trend() {
        return Http.request(API.stats + '?action=trend', { method: 'GET' });
    },
    async povertyChart() {
        return Http.request(API.stats + '?action=poverty_chart', { method: 'GET' });
    },
    async aidChart() {
        return Http.request(API.stats + '?action=aid_chart', { method: 'GET' });
    },
    async centerStats() {
        return Http.request(API.stats + '?action=center_stats', { method: 'GET' });
    },
    async ageDistribution() {
        return Http.request(API.stats + '?action=age_distribution', { method: 'GET' });
    },
    async education() {
        return Http.request(API.stats + '?action=education', { method: 'GET' });
    },
};

const ApiUsers = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request(API.users + (qs ? '?' + qs : ''), { method: 'GET' });
    },
};

const ApiLogs = {
    async list(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return Http.request(API.logs + (qs ? '?' + qs : ''), { method: 'GET' });
    },
};