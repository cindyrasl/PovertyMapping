# WebGIS Poverty Mapping
**Sistem Pemetaan Kemiskinan Berbasis GIS — PHP Native + Leaflet.js**

[![PHP](https://img.shields.io/badge/PHP-8.1%2B-blue)](https://php.net)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%2B-orange)](https://mysql.com)
[![Leaflet](https://img.shields.io/badge/Leaflet.js-1.9-green)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

---

## 1. Project Overview

**WebGIS Poverty Mapping** is a web-based Geographic Information System (GIS) designed for mapping, analyzing, and managing household poverty data at the village/sub-district level. It enables field officers and administrators to efficiently collect, visualize, and act on social welfare data using an interactive digital map.

### Problems It Solves

| Problem | Solution |
|---|---|
| Poverty data scattered across spreadsheets | Centralized household database with GIS coordinates |
| No visual overview of poverty distribution | Interactive Leaflet map with color-coded markers |
| Aid distribution not tracked systematically | Aid history module per household with timestamps |
| Public cannot report poverty cases easily | Public reporting page (`lapor.html`) with map-based input |
| No way to measure religious center coverage | Configurable radius circles per religious center |
| Field officers and admins share the same access | Role-based authentication (Admin vs. Petugas Lapangan) |

---

## 2. Main Features

### 🗺️ GIS Mapping
- **Household markers** — Color-coded by poverty severity on an OpenStreetMap base layer
- **Religious center markers** — Custom icons per worship type (Masjid, Gereja, Klenteng, Pura, Vihara)
- **Radius visualization** — Configurable coverage circle per religious center, dynamically showing which households fall within reach
- **Draggable markers** — Reposition household or center markers by dragging; coordinates update automatically
- **Dynamic popups** — Detailed information cards rendered from live API data on marker click
- **Layer controls** — Toggle household, center, and radius layers independently

### 👥 Household & Family Management
- Full CRUD for household data including head-of-family details (NIK, gender, date of birth, education, employment, income)
- Dynamic **family member management** — add, edit, or remove household members with individual profiles
- Administrative location fields: RT, RW, Kelurahan, Kecamatan, full address

### 📊 Automatic Poverty Classification
- Automated scoring via `PovertyCalculator.php` based on 5 indicators:
  - Per-capita monthly income
  - Number of dependents
  - House habitability condition
  - Head-of-family education level
  - Land ownership status
- Produces one of four categories: **Terdata**, **Rentan Miskin**, **Miskin**, **Sangat Miskin**

### 🎁 Aid History Tracking
- Record aid deliveries per household (type, date, amount, notes)
- Aid types: Sembako, Pendanaan, Pelatihan, and combinations
- Aid status (`not_yet` / `received`) automatically reflected on the map marker

### 📢 Public Reporting System
- Anonymous public submission via `lapor.html` — no login required
- Map-based coordinate picker with reverse geocoding (auto-fills address)
- Rate limiting: max **5 reports per IP per 24 hours**
- Admin review workflow: **Pending → Approved/Rejected**
- Approved reports automatically create a new household record and map marker

### 🔐 Authentication & Role-Based Access
- Secure login system (`login.html`) with session-based authentication
- Two authenticated roles: **Admin** and **Petugas Lapangan** (Field Officer)
- Public access to `lapor.html` without login

### 📈 Analytics Dashboard
- KPI cards: total centers, households, population, aid recipients
- Chart.js charts: poverty distribution, aid distribution, data entry trend (12 months), age distribution, per-center statistics
- Dashboard visible to Admin only

### 📱 Responsive Mobile UI
- Fully responsive sidebar, modals, and popups
- CSS viewport-height fix for iOS Safari (`--vh` custom property)
- Touch-optimized controls and minimum 44px tap targets
- Safe area inset support for notched phones

### 🔍 Reverse Geocoding
- Click-to-place pin on map with automatic address fill-in
- Powered by OpenStreetMap Nominatim API
- Available in both admin household forms and the public report form

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend Structure | HTML5 | Page layout and semantic markup |
| Frontend Styling | Vanilla CSS | Custom design system, responsive layout |
| Frontend Logic | JavaScript (ES2020+) | Map interaction, API calls, form logic |
| Mapping | Leaflet.js 1.9 | Interactive GIS map rendering |
| Charts | Chart.js 4.4 | Analytics dashboard visualization |
| Icons | Font Awesome 6.4 | UI and map icons |
| Fonts | Google Fonts (DM Sans) | Typography |
| Geocoding | OpenStreetMap Nominatim | Reverse geocoding (address from coords) |
| Backend | PHP 8.1+ (Native) | REST API, session management, business logic |
| Database ORM | PDO (PHP) | Secure database access with prepared statements |
| Database | MySQL 8.0+ / MariaDB 10.6+ | Data persistence |
| Web Server | Apache (XAMPP/shared hosting) | Request routing |

---

## 4. Folder Structure

```
PovertyMapping/
├── api/
│   ├── auth/
│   │   └── check.php           Session check, login, logout
│   ├── houses/
│   │   └── index.php           Household CRUD + family members + aid
│   ├── centers/
│   │   └── index.php           Religious center CRUD + coverage
│   ├── aid/
│   │   └── index.php           Aid history management
│   ├── public/
│   │   └── report.php          Public report submission & admin review
│   ├── stats/
│   │   └── index.php           Dashboard KPIs and chart data
│   ├── users/
│   │   └── index.php           User management (Admin only)
│   └── logs/
│       └── index.php           Audit log viewer
├── assets/
│   ├── css/
│   │   └── style.css           Main stylesheet
│   └── js/
│       ├── config.js           Global constants and app state
│       ├── api.js              Centralized HTTP client (fetch wrappers)
│       ├── auth.js             Session check and role-based UI init
│       ├── map.js              Leaflet map initialization, placement mode
│       ├── markers.js          Marker rendering, popups, radius logic
│       ├── forms.js            Household/center form handlers (CRUD modals)
│       ├── dashboard.js        Chart.js analytics rendering
│       ├── public-reports.js   Admin panel — public report verification
│       └── app.js              Main orchestrator (initialization flow)
├── config/
│   ├── config.php              App constants, DB credentials, thresholds
│   ├── database.php            PDO singleton connection
│   └── bootstrap.php           API bootstrap: headers, session, auth helpers
├── middleware/
│   ├── Response.php            Standardized JSON response helper
│   └── Validator.php           Input validation and sanitization
├── models/
│   ├── PovertyCalculator.php   Automated poverty scoring engine
│   └── AuditLog.php            Writes structured audit entries
├── index.html                  Main authenticated map & admin dashboard
├── login.html                  Login page
└── lapor.html                  Public report submission page
```

---

## 5. Database Structure

### Entity Relationship Summary

```
users                    (admin / petugas accounts)
religious_centers        (1) ──< households (N)   [managing_center_id]
households               (1) ──< household_members (N)
households               (1) ──< aid_history (N)
households               (1) ──< public_reports (N) [converted_household_id]
```

### Table Definitions

**`users`**
```sql
id, name, email, password_hash,
role ENUM('admin','petugas'),
is_active, last_login_at, created_at
```

**`households`**
```sql
id,
-- Location
rt, rw, kelurahan, kecamatan, full_address,
latitude, longitude,
-- Head of family
head_name, head_nik,
head_gender ENUM('male','female'),
head_date_of_birth, head_education,
head_employment_status, head_job_name, head_institution_name,
head_monthly_income,
-- Housing
house_condition ENUM('layak','tidak_layak'),
land_ownership ENUM('milik','sewa','numpang','lainnya'),
-- Poverty
poverty_score INT,           -- 0–100 normalized score
poverty_status ENUM('terdata','rentan_miskin','miskin','sangat_miskin'),
-- Aid
aid_status ENUM('not_yet','received'),
-- Relations
managing_center_id FK → religious_centers.id,
-- Meta
notes, is_active, created_at, updated_at
```

**`household_members`**
```sql
id, household_id FK → households.id,
name, gender, date_of_birth,
relationship, education, employment_status,
created_at
```

**`religious_centers`**
```sql
id, name,
worship_type ENUM('masjid','gereja','klenteng','pura','vihara'),
address, latitude, longitude,
radius INT (meters),
contact_person, contact_phone, notes,
is_active, created_at
```

**`aid_history`**
```sql
id, household_id FK → households.id,
center_id FK → religious_centers.id,
aid_type ENUM('sembako','pendanaan','pelatihan',
              'sembako_pendanaan','sembako_pelatihan',
              'pendanaan_pelatihan','lengkap'),
aid_date, amount, notes, created_at
```

**`public_reports`**
```sql
id, reporter_name, reporter_phone,
head_name, address, latitude, longitude, description,
status ENUM('pending','approved','rejected'),
admin_notes, converted_household_id FK → households.id,
ip_address, reviewed_at, created_at
```

**`audit_logs`**
```sql
id, action, table_name, record_id,
old_values JSON, new_values JSON,
user_id, ip_address, user_agent, created_at
```

---

## 6. Installation Guide

### Prerequisites

- PHP **8.1+** with extensions: `pdo_mysql`, `json`, `mbstring`
- MySQL **8.0+** or MariaDB **10.6+**
- Apache web server (XAMPP, Laragon, or shared hosting)
- Internet access for CDN assets (Leaflet, Chart.js, Font Awesome, Google Fonts)

---

### Step 1 — Copy Files

**XAMPP (Windows):**
```
Copy the PovertyMapping/ folder to:
C:\xampp\htdocs\PovertyMapping\
```

**Linux server:**
```bash
cp -r PovertyMapping/ /var/www/html/
```

---

### Step 2 — Create Database

Open **phpMyAdmin** → click **New** → enter database name:
```
webgis5
```
Set collation: `utf8mb4_unicode_ci` → click **Create**.

Or via MySQL CLI:
```sql
CREATE DATABASE webgis5
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

---

### Step 3 — Import Schema

In phpMyAdmin → select `webgis5` → click **Import** → choose the SQL file provided with this project → click **Go**.

Or via CLI:
```bash
mysql -u root -p webgis5 < database.sql
```

The SQL file creates all tables and inserts the initial admin user account.

---

### Step 4 — Configure Database Connection

Edit `config/config.php`:
```php
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'webgis5');   // your database name
define('DB_USER', 'root');       // MySQL username
define('DB_PASS', '');           // MySQL password (empty for XAMPP default)
```

For **production**, also set:
```php
define('APP_ENV',   'production');
define('APP_DEBUG', false);
```

---

### Step 5 — Open in Browser

```
http://localhost/PovertyMapping/login.html    → Login page
http://localhost/PovertyMapping/              → Main dashboard (after login)
http://localhost/PovertyMapping/lapor.html    → Public report form
```

---

### Step 6 — Default Login Credentials

After importing the database, log in with the seeded admin account:

| Field | Value |
|---|---|
| Email | `admin@webgis.local` |
| Password | `Admin@12345` |

> **Important:** Change the default password immediately after first login via the User Management panel.

---

### Shared Hosting Deployment Notes

1. Upload all files via FTP/cPanel File Manager (exclude `.git/` folder)
2. Create a MySQL database and user in cPanel
3. Update `config/config.php` with your hosting DB credentials
4. Ensure PHP version ≥ 8.1 in cPanel → PHP Selector
5. Verify `pdo_mysql` is enabled in PHP extensions
6. Set `APP_DEBUG = false` and `APP_ENV = 'production'`

---

## 7. Authentication & Roles

The system uses **PHP session-based authentication**. All protected pages redirect to `login.html` if no valid session exists.

### Role Comparison

| Permission | Admin | Petugas Lapangan | Public (No Login) |
|---|:---:|:---:|:---:|
| View map & markers | ✅ | ✅ | ❌ |
| Add household | ✅ | ✅ | ❌ |
| Edit household | ✅ | ✅ | ❌ |
| Delete household | ✅ | ❌ | ❌ |
| Add/edit religious center | ✅ | ✅ | ❌ |
| Delete religious center | ✅ | ❌ | ❌ |
| Record aid history | ✅ | ✅ | ❌ |
| View analytics dashboard | ✅ | ❌ | ❌ |
| Review public reports | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| View audit logs | ✅ | ❌ | ❌ |
| Submit public report | ❌ | ❌ | ✅ |

### Authentication Flow

```
login.html → POST api/auth/check.php?action=login
           → session_regenerate_id() prevents fixation
           → $_SESSION stores user_id, name, email, role
           → index.html loads, auth.js calls GET api/auth/check.php
           → Role-based UI elements shown/hidden
           → Logout: POST api/auth/check.php?action=logout
             → session_destroy() → redirect to login.html
```

---

## 8. GIS Workflow

### Household Marker Creation

```
1. Officer clicks "Tambah Rumah" button on the map
2. Map enters placement mode — cursor changes to crosshair
3. Officer clicks the map at the household location
4. Nominatim reverse geocoding fills the address field automatically
5. Officer completes the form (family data, income, housing condition)
6. PovertyCalculator scores the household on save
7. Marker appears immediately on the map with the correct color
```

### Poverty Color System

| Color | Category | Score Range |
|---|---|---|
| 🟢 Green `#0b9e73` | Terdata | 0 points |
| 🟡 Amber `#f59e0b` | Rentan Miskin | 1–3 points |
| 🟠 Orange `#f76707` | Miskin | 4–6 points |
| 🔴 Red `#d63230` | Sangat Miskin | ≥ 7 points |

### Radius Coverage Analysis

```
Religious center has a configurable radius (meters)
→ A circle is drawn on the map
→ Haversine formula runs client-side per household
→ Households within radius are highlighted and counted
→ Admin can adjust radius via a slider in the center popup
→ Coverage count updates live without page reload
```

### Public Report Verification Workflow

```
Public user → lapor.html → POST api/public/report.php
                                    ↓
                          public_reports (status = pending)
                                    ↓
                    Admin → index.html → Admin Panel → Laporan Publik
                                    ↓
                    ┌─────── Approve ──────── Reject ───────┐
                    ↓                                        ↓
          INSERT INTO households                   status = rejected
          poverty auto-calculated                  admin_notes saved
          status = approved
          converted_household_id = new ID
                    ↓
          New marker appears on the map
```

### Aid Tracking Workflow

```
1. Officer opens household popup → "Tambah Bantuan"
2. Selects: aid type, date, amount, delivering center
3. aid_history record created
4. aid_status on household updated to 'received'
5. Marker icon refreshes to reflect new aid status
6. Dashboard stats update on next refresh
```

---

## 9. API Overview

All API endpoints return consistent JSON:
```json
{ "success": true, "message": "...", "data": { ... } }
```

All authenticated endpoints return `401` without a valid session, and `403` for insufficient role.

### `api/auth/check.php`

| Method | Query | Description |
|---|---|---|
| GET | — | Check current session state |
| POST | `?action=login` | Authenticate user (email + password) |
| POST | `?action=logout` | Destroy session |

### `api/houses/index.php`

| Method | Query | Auth | Description |
|---|---|---|---|
| GET | `?action=list` | Any | List households (with filters) |
| GET | `?action=show&id=N` | Any | Household detail + members + aid |
| POST | `?action=create` | Any | Create new household |
| POST | `?action=update&id=N` | Any | Update household data |
| POST | `?action=patch&id=N` | Any | Update coordinates only (drag) |
| POST | `?action=delete&id=N` | Admin | Soft-delete household |

**List filters:** `poverty_status`, `aid_status`, `house_condition`, `center_id`, `q` (search name/address/NIK)

### `api/centers/index.php`

| Method | Query | Auth | Description |
|---|---|---|---|
| GET | `?action=list` | Any | List all religious centers |
| GET | `?action=show&id=N` | Any | Center detail |
| GET | `?action=coverage&id=N` | Any | Households within center radius |
| POST | `?action=create` | Any | Create new center |
| POST | `?action=update&id=N` | Any | Update center data |
| POST | `?action=patch&id=N` | Any | Update radius/coords only |
| POST | `?action=delete&id=N` | Admin | Soft-delete center |

### `api/public/report.php`

| Method | Query | Auth | Description |
|---|---|---|---|
| POST | — | Public | Submit public report |
| GET | `?action=list` | Admin | List all reports |
| POST | `?action=approve&id=N` | Admin | Approve → create household |
| POST | `?action=reject&id=N` | Admin | Reject with notes |
| POST | `?action=delete&id=N` | Admin | Delete report |

### `api/stats/index.php`

| Action | Description |
|---|---|
| `overview` | KPI cards: counts of centers, households, population, aid recipients |
| `poverty_chart` | Household count per poverty category |
| `aid_chart` | Aid vs. no-aid distribution |
| `trend` | Monthly household registration trend (12 months) |
| `age_distribution` | Age bracket distribution of household heads |
| `center_stats` | Per-center household and coverage statistics |

---

## 10. Mobile Responsive Support

The system is designed to be fully usable on Android and iOS mobile browsers.

### Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `> 768px` | Sidebar visible, full map view |
| `≤ 768px` | Sidebar collapses, accessible via toggle button |
| `≤ 480px` | Modals and popups switch to full-screen overlay |
| Landscape `≤ 600px height` | Compact header, reduced spacing |

### Mobile-Specific Optimizations

- **iOS 100vh fix** — `--vh` CSS custom property recalculated on resize to prevent viewport clipping in Safari
- **Safe area insets** — `env(safe-area-inset-*)` applied for notched iPhone layouts
- **Touch targets** — All interactive elements have a minimum height/width of `44px`
- **`-webkit-tap-highlight-color: transparent`** — Removes tap flash on buttons
- **Input font-size: 16px** — Prevents iOS auto-zoom on form focus
- **Keyboard handling** — Active element blurred before navigation to dismiss virtual keyboard
- **Popup scroll** — Popups use `overflow-y: auto` with `max-height: 70vh` for long content

---

## 11. Security Notes

This system is designed for public academic deployment on shared hosting. The following lightweight security measures are implemented:

| Area | Measure |
|---|---|
| **SQL Injection** | All queries use PDO prepared statements with `ATTR_EMULATE_PREPARES = false` — true parameterized queries enforced at driver level |
| **XSS** | All user-generated content rendered into HTML is wrapped in `escapeHtml()` (`htmlspecialchars` with `ENT_QUOTES`); backend inputs sanitized via `Validator::sanitizeString()` |
| **Session Fixation** | `session_regenerate_id(true)` called on every successful login |
| **Session Security** | Sessions are `HttpOnly`, `SameSite=Lax`; named `webgis_sess` to avoid conflicts |
| **Role Enforcement** | `requireAuth()` and `requireAdmin()` helpers guard every API endpoint server-side |
| **Input Validation** | `Validator.php` enforces type, length, enum, coordinate, and email rules before any DB operation |
| **Rate Limiting** | Public report endpoint rejects submissions exceeding 5 per IP per 24 hours |
| **Error Leakage** | `APP_DEBUG = false` in production suppresses PHP errors; exception handler returns generic 500 JSON |
| **CORS** | `Access-Control-Allow-Origin: *` only enabled in `development` environment |
| **Clickjacking** | `X-Frame-Options: DENY` header sent on all API responses |

---

## 12. Troubleshooting

### API returns HTML instead of JSON
- Set `APP_DEBUG = true` in `config/config.php` temporarily to expose the PHP error
- Check Apache error log: `C:\xampp\logs\error.log` (XAMPP)
- Confirm `ob_start()` is present in `bootstrap.php` to suppress accidental output

### Map tiles do not load
- Requires internet access to OpenStreetMap tile servers
- Check browser console (F12) for mixed-content or CORS errors
- On HTTPS hosting, tile URLs must also use HTTPS

### Chart.js dashboard is empty
- Charts are loaded from CDN — requires internet access
- Verify no JavaScript console errors in the dashboard tab
- Confirm the Stats API (`api/stats/index.php`) returns valid JSON

### Rate limiting too strict during testing
In `api/public/report.php`, change the limit constant:
```php
if ($recentCount >= 5) {    // increase for local testing
```

### Login redirect loop
- Confirm the database is correctly imported and the `users` table contains the default admin row
- Verify session configuration: PHP must be able to write session files (`session.save_path`)
- On shared hosting, confirm the session path is writable

---

## 13. Future Improvements

| Feature | Description |
|---|---|
| **Export to Excel/PDF** | Add `api/export/` endpoints to generate downloadable reports of household data |
| **Print-ready map** | Implement Leaflet.print or browser print CSS for paper-ready map output |
| **Batch import** | CSV upload for bulk household data entry from field surveys |
| **Notification system** | Email or WhatsApp alert to admin when a new public report is submitted |
| **HTTPS enforcement** | Add `.htaccess` HTTPS redirect and switch session `secure` flag to `true` |
| **User audit trail** | Expand audit log UI to show full change history per household record |
| **Multi-village support** | Add a `villages` table to support multiple administrative areas from one system |
| **Map clustering** | Implement Leaflet.markercluster for performance on dense datasets (500+ markers) |
| **Offline capability** | Service Worker caching for field use in areas with poor connectivity |
| **API rate limiting** | Extend rate limiting to authenticated write endpoints to prevent data flooding |

---

## License

This project is open-source under the [MIT License](LICENSE).  
Built as an academic GIS project — suitable for university final-year projects, research, and public-sector demos.
