# WebGIS Poverty Mapping v2
**Sistem Pemetaan Kemiskinan Berbasis GIS — PHP Native + Leaflet.js**

---

## Ringkasan Sistem

Sistem ini membagi antarmuka menjadi **dua halaman utama**:

| Halaman | URL | Pengguna |
|---|---|---|
| Peta Publik | `index.html` | Masyarakat umum (view only) |
| Halaman Admin | `admin.html` | Petugas lapangan / admin |
| Form Laporan | `lapor.html` | Masyarakat umum (submit laporan) |

Tidak ada sistem login. Admin mengakses `admin.html` langsung (URL tersembunyi).

---

## Struktur Folder

```
PovertyMapping/
├── api/
│   ├── houses/index.php        CRUD rumah tangga
│   ├── centers/index.php       CRUD tempat ibadah
│   ├── aid/index.php           Riwayat bantuan
│   ├── reports/index.php       Laporan darurat
│   ├── stats/index.php         Statistik & chart data
│   ├── public/report.php       Laporan publik (no auth)
│   ├── users/index.php         Daftar pengguna (read-only)
│   └── logs/index.php          Audit log
├── assets/
│   ├── css/style.css           Stylesheet utama
│   └── js/
│       ├── config.js           Konstanta & state global
│       ├── api.js              HTTP client & API wrappers
│       ├── map.js              Inisialisasi Leaflet
│       ├── markers.js          Render marker & popup
│       ├── forms.js            Form handler (CRUD modal)
│       ├── dashboard.js        Chart.js analitik
│       ├── admin.js            Panel admin (users, audit, darurat)
│       ├── public-reports.js   Verifikasi laporan publik
│       └── app.js              Orkestrator utama
├── config/
│   ├── config.php              Konfigurasi app & DB
│   ├── database.php            PDO singleton
│   └── bootstrap.php           Bootstrap semua API
├── middleware/
│   ├── Response.php            JSON response helper
│   └── Validator.php           Input validation
├── models/
│   ├── PovertyCalculator.php   Klasifikasi kemiskinan otomatis
│   └── AuditLog.php            Pencatat audit
├── migrations/
│   └── 002_public_reports.sql  Migration database
├── index.html                  Peta publik (view only)
├── admin.html                  Halaman admin CRUD
└── lapor.html                  Form laporan masyarakat
```

---

## Instalasi

### Persyaratan
- PHP 8.1+
- MySQL 8.0+ / MariaDB 10.6+
- Web server: Apache / Nginx / XAMPP / Laragon
- Ekstensi PHP: `pdo_mysql`, `json`, `mbstring`

### Langkah Setup

**1. Salin file ke web server**
```bash
cp -r PovertyMapping/ /var/www/html/
# atau untuk XAMPP:
cp -r PovertyMapping/ C:/xampp/htdocs/
```

**2. Buat database baru**
```sql
CREATE DATABASE webgis5 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**3. Jalankan migration**

Buka phpMyAdmin → pilih database `webgis5` → tab SQL → paste dan jalankan:
```
migrations/002_public_reports.sql
```

Atau via command line:
```bash
mysql -u root -p webgis5 < migrations/002_public_reports.sql
```

**4. Sesuaikan konfigurasi database**

Edit `config/config.php`:
```php
define('DB_NAME', 'webgis5');   // nama database Anda
define('DB_USER', 'root');      // user MySQL
define('DB_PASS', '');          // password MySQL
```

**5. Download Chart.js** (jika belum ada)

Unduh dari https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js  
Simpan sebagai `assets/js/chart.umd.min.js`

**6. Buka di browser**
```
http://localhost/PovertyMapping/          → Peta publik
http://localhost/PovertyMapping/admin.html → Panel admin
http://localhost/PovertyMapping/lapor.html → Form laporan
```

---

## Konfigurasi

### config/config.php
```php
define('APP_ENV',   'production');   // 'development' untuk debug
define('APP_DEBUG', false);          // true = tampilkan error detail
define('DB_NAME',   'webgis5');
define('DB_USER',   'root');
define('DB_PASS',   '');
define('PAGE_SIZE', 500);            // max marker per request

// Ambang batas skor kemiskinan (severity points)
define('POVERTY_THRESHOLD_NEAR',   1);  // rentan_miskin
define('POVERTY_THRESHOLD_POOR',   4);  // miskin
define('POVERTY_THRESHOLD_SEVERE', 7);  // sangat_miskin
```

---

## Fitur yang Diimplementasikan

### Peta Publik (index.html)
- ✅ Tampilkan semua marker rumah tangga (read-only, tidak bisa klik edit/hapus)
- ✅ Tampilkan tempat ibadah dengan ikon spesifik per jenis
- ✅ Radius circle per tempat ibadah
- ✅ Filter kemiskinan & status bantuan
- ✅ Pencarian nama/alamat
- ✅ Layer control (tampilkan/sembunyikan layer)
- ✅ Legenda peta
- ✅ Tombol "Laporkan" → lapor.html
- ✅ Popup informatif tanpa tombol edit/hapus

### Halaman Admin (admin.html)
- ✅ Semua fitur CRUD rumah tangga
- ✅ Semua fitur CRUD tempat ibadah
- ✅ Marker draggable (geser posisi)
- ✅ Radius slider di popup
- ✅ Riwayat bantuan per rumah tangga
- ✅ Laporan darurat per rumah tangga
- ✅ Dashboard chart analitik (Chart.js)
- ✅ Panel Admin: Laporan Publik (verifikasi)
- ✅ Panel Admin: Laporan Darurat
- ✅ Panel Admin: Audit Log
- ✅ Panel Admin: Daftar Pengguna
- ✅ Link navigasi ke peta publik & form laporan

### Form Laporan Publik (lapor.html)
- ✅ Form lengkap dengan validasi frontend
- ✅ Peta mini Leaflet untuk pilih koordinat
- ✅ Reverse geocoding otomatis (isi alamat dari klik peta)
- ✅ Pin draggable
- ✅ Rate limiting: maks 3 laporan per jam per IP
- ✅ Tampilan sukses setelah submit
- ✅ Reset form untuk laporan berikutnya

### Klasifikasi Kemiskinan Otomatis
Berdasarkan 5 indikator (PovertyCalculator.php):
| Indikator | Bobot Maks |
|---|---|
| Pendapatan per kapita | 3 poin |
| Jumlah tanggungan | 3 poin |
| Kondisi rumah | 3 poin |
| Pendidikan KK | 3 poin |
| Status kepemilikan lahan | 2 poin |

| Total Skor | Kategori |
|---|---|
| 0 | Terdata |
| 1–3 | Rentan Miskin |
| 4–6 | Miskin |
| ≥ 7 | Sangat Miskin |

### Warna Marker
| Kategori | Warna |
|---|---|
| Sangat Miskin | 🔴 `#d63230` |
| Miskin | 🟠 `#f76707` |
| Rentan Miskin | 🟡 `#f59e0b` |
| Terdata | 🟢 `#0b9e73` |

### Alur Verifikasi Laporan Publik
```
Masyarakat → lapor.html → POST api/public/report.php
                                    ↓
                          public_reports (status=pending)
                                    ↓
                          Admin buka Panel Admin → Laporan Publik
                                    ↓
                    [Setujui]              [Tolak]
                        ↓                     ↓
              INSERT INTO households    status=rejected
              status=approved           admin_notes disimpan
              converted_household_id=N
                        ↓
              Marker baru muncul di peta
```

---

## API Endpoints

Semua API berada di folder `api/` tanpa autentikasi.

### Houses (`api/houses/index.php`)
| Method | Action | Deskripsi |
|---|---|---|
| GET | (default) | List semua rumah, support filter |
| GET | `?action=show&id=N` | Detail 1 rumah + aid history |
| POST | `?action=create` | Tambah rumah baru |
| POST | `?action=update&id=N` | Update data rumah |
| POST | `?action=patch&id=N` | Update posisi saja (drag) |
| POST | `?action=delete&id=N` | Soft delete |

**Query filters:** `poverty_status`, `aid_status`, `house_condition`, `center_id`, `q` (search)

### Centers (`api/centers/index.php`)
| Method | Action | Deskripsi |
|---|---|---|
| GET | (default) | List semua tempat ibadah |
| GET | `?action=show&id=N` | Detail 1 center |
| GET | `?action=nearby&lat=X&lng=Y` | Cari center terdekat |
| GET | `?action=coverage&id=N` | Rumah dalam radius center |
| POST | `?action=create` | Tambah tempat ibadah |
| POST | `?action=update&id=N` | Update tempat ibadah |
| POST | `?action=patch&id=N` | Update radius/posisi saja |
| POST | `?action=delete&id=N` | Soft delete |

### Public Reports (`api/public/report.php`)
| Method | Action | Deskripsi |
|---|---|---|
| POST | (default/submit) | Kirim laporan publik baru |
| GET | `?action=list` | List laporan (untuk admin) |
| POST | `?action=approve&id=N` | Setujui → buat household |
| POST | `?action=reject&id=N` | Tolak laporan |
| POST | `?action=delete&id=N` | Hapus laporan |

### Stats (`api/stats/index.php`)
| Action | Deskripsi |
|---|---|
| `overview` | KPI cards (centers, households, population, dll) |
| `trend` | Tren pendataan 12 bulan |
| `poverty_chart` | Distribusi kemiskinan |
| `aid_chart` | Distribusi bantuan |
| `age_distribution` | Distribusi usia KK |
| `center_stats` | Statistik per tempat ibadah |

---

## Database Schema

### Tabel Utama

**households**
```sql
id, head_name, nik, date_of_birth, gender, education,
dependents, income, job, house_condition, land_ownership,
poverty_status ENUM('terdata','rentan_miskin','miskin','sangat_miskin'),
aid_status ENUM('not_yet','received'),
managing_center_id, address, latitude, longitude,
description, is_active, created_at
```

**religious_centers**
```sql
id, name, worship_type ENUM('masjid','gereja','klenteng','pura','vihara'),
address, latitude, longitude, radius, contact_person,
contact_phone, notes, is_active, created_at
```

**public_reports** *(BARU)*
```sql
id, reporter_name, reporter_phone, head_name, address,
latitude, longitude, description,
status ENUM('pending','approved','rejected'),
admin_notes, converted_household_id, ip_address,
reviewed_at, created_at
```

**aid_history**
```sql
id, household_id, center_id, aid_type, aid_date, amount, notes, created_at
```

**emergency_reports**
```sql
id, household_id, type, severity, status, description,
resolved_at, created_at
```

**audit_logs**
```sql
id, action, table_name, record_id, old_values JSON,
new_values JSON, ip_address, user_agent, created_at
```

---

## Troubleshooting

### API mengembalikan HTML bukan JSON
- Pastikan `APP_DEBUG = true` di `config.php` untuk melihat error
- Cek error PHP di `error_log` server
- Pastikan `ob_start()` ada di `bootstrap.php`

### Peta tidak muncul
- Pastikan Leaflet CDN dapat diakses (perlu internet)
- Cek console browser (F12) untuk error JS

### Chart tidak muncul
- Pastikan `assets/js/chart.umd.min.js` ada
- Alternatif: ganti dengan CDN `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`

### Migration gagal
- Jalankan satu per satu blok ALTER TABLE
- Cek versi MySQL (butuh 8.0+ untuk `ADD COLUMN IF NOT EXISTS`)
- Untuk MariaDB < 10.3: hapus klausa `IF NOT EXISTS`

### Rate limiting laporan publik terlalu ketat
Di `api/public/report.php`, ubah angka `3` menjadi lebih besar:
```php
if ($recentCount >= 3) {   // ubah ke 10 untuk testing
```

---

## Catatan Keamanan

Karena tidak ada sistem login, lindungi `admin.html` dengan salah satu cara:

**Opsi 1: Rename file**
```bash
mv admin.html admin-rahasia-xyz123.html
```

**Opsi 2: .htaccess IP restriction**
```apache
<Files "admin.html">
    Order Deny,Allow
    Deny from all
    Allow from 127.0.0.1
    Allow from 192.168.1.0/24
</Files>
```

**Opsi 3: Basic Auth via .htaccess**
```apache
<Files "admin.html">
    AuthType Basic
    AuthName "Admin Area"
    AuthUserFile /path/to/.htpasswd
    Require valid-user
</Files>
```

---

## Pengembangan Lanjutan

Jika di masa depan ingin menambahkan fitur:

- **Login sistem**: Tambah kembali `middleware/Auth.php` dan panggil `Auth::require()` di setiap API
- **Export data**: Tambah `api/export/index.php` yang generate CSV/Excel
- **Notifikasi**: Tambah webhook ke WhatsApp/Telegram saat laporan publik masuk
- **Multi-bahasa**: Pisahkan string ke file `lang/id.php`
