# WebGIS Poverty Mapping
**Sistem Pemetaan Kemiskinan Berbasis GIS — PHP Native + Leaflet.js**

[![PHP](https://img.shields.io/badge/PHP-8.1%2B-blue)](https://php.net)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%2B-orange)](https://mysql.com)
[![Leaflet](https://img.shields.io/badge/Leaflet.js-1.9-green)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

---

## 1. Gambaran Proyek

**WebGIS Poverty Mapping** adalah Sistem Informasi Geografis (GIS) berbasis web yang dirancang untuk memetakan, menganalisis, dan mengelola data kemiskinan rumah tangga pada tingkat desa/kelurahan. Sistem ini memungkinkan petugas lapangan dan administrator untuk mengumpulkan, memvisualisasikan, serta mengambil tindakan terhadap data kesejahteraan sosial secara efisien melalui peta digital interaktif.

### Permasalahan yang Diselesaikan

| Masalah | Solusi |
|---|---|
| Data kemiskinan tersebar di berbagai spreadsheet | Basis data rumah tangga terpusat dengan koordinat GIS |
| Tidak ada gambaran visual distribusi kemiskinan | Peta interaktif Leaflet dengan marker berwarna |
| Penyaluran bantuan tidak tercatat secara sistematis | Modul riwayat bantuan per rumah tangga dengan stempel waktu |
| Masyarakat sulit melaporkan kasus kemiskinan | Halaman pelaporan publik (`lapor.html`) berbasis peta |
| Tidak ada cara mengukur jangkauan tempat ibadah | Radius cakupan yang dapat dikonfigurasi |
| Petugas dan admin memiliki akses yang sama | Autentikasi berbasis peran (Admin vs Petugas Lapangan) |
| Tidak ada bukti visual pada laporan | Fitur unggah foto untuk laporan dan data rumah tangga |

---

## 2. Fitur Utama

### 🗺️ Pemetaan GIS
- **Marker rumah tangga** — Dengan kode warna berdasarkan tingkat keparahan kemiskinan pada peta dasar OpenStreetMap
- **Marker tempat ibadah** — Ikon khusus per jenis ibadah (Masjid, Gereja, Klenteng, Pura, Vihara)
- **Visualisasi radius** — Lingkaran cakupan yang dapat dikonfigurasi per tempat ibadah, secara dinamis menunjukkan rumah tangga mana yang berada dalam jangkauan
- **Marker yang dapat diseret** — Memposisikan ulang marker rumah atau pusat ibadah dengan menyeret; koordinat diperbarui secara otomatis
- **Popup dinamis** — Kartu informasi detail yang dirender dari data langsung API saat marker diklik, termasuk thumbnail foto
- **Kontrol layer** — Mengaktifkan/menonaktifkan layer rumah, pusat ibadah, dan radius secara independen

### 👥 Manajemen Rumah Tangga & Keluarga
- CRUD lengkap untuk data rumah tangga termasuk detail kepala keluarga (NIK, jenis kelamin, tanggal lahir, pendidikan, pekerjaan, penghasilan)
- Manajemen **anggota keluarga** yang dinamis — tambah, edit, atau hapus anggota keluarga dengan profil individu
- Kolom lokasi administratif: RT, RW, Kelurahan, Kecamatan, alamat lengkap
- **Unggah foto per rumah tangga** — lampirkan hingga 5 foto rumah (JPG/JPEG/PNG, maks 5 MB per foto); foto muncul sebagai thumbnail di popup peta dan modal edit

### 📊 Klasifikasi Kemiskinan Otomatis
- Penilaian otomatis melalui `PovertyCalculator.php` berdasarkan 5 indikator:
  - Pendapatan per kapita bulanan
  - Jumlah tanggungan
  - Kondisi kelayakan hunian rumah
  - Tingkat pendidikan kepala keluarga
  - Status kepemilikan lahan
- Menghasilkan salah satu dari empat kategori: **Terdata**, **Rentan Miskin**, **Miskin**, **Sangat Miskin**

### 🎁 Pelacakan Riwayat Bantuan
- Mencatat pengiriman bantuan per rumah tangga (jenis, tanggal, jumlah, catatan)
- Jenis bantuan: Sembako, Pendanaan, Pelatihan, dan kombinasi
- Status bantuan (`not_yet` / `received`) secara otomatis tercermin pada marker peta

### 📢 Sistem Pelaporan Publik
- Pengiriman publik anonim melalui `lapor.html` — tidak perlu login
- Pemilih koordinat berbasis peta dengan reverse geocoding (mengisi alamat secara otomatis)
- **Unggah foto bukti** — pelapor dapat melampirkan hingga 5 foto (JPG/JPEG/PNG, maks 5 MB per foto) sebagai bukti visual
- Pembatasan laju: maks **5 laporan per IP per 24 jam**
- Alur kerja verifikasi admin: **Menunggu → Disetujui/Ditolak**
- Laporan yang disetujui secara otomatis membuat catatan rumah tangga baru dan marker peta

### 📷 Fitur Unggah Foto
- Modul unggah bersama (`assets/js/photo-upload.js`) yang digunakan di seluruh form rumah tangga dan halaman laporan publik
- **Aturan validasi:** format file harus JPG, JPEG, atau PNG; maksimal 5 MB per file; maksimal 5 foto per pengiriman
- Pratinjau sisi klien dengan zona seret dan lepas sebelum unggah
- Validasi sisi server melalui `api/public/upload.php`: pengecekan tipe MIME menggunakan `finfo`, daftar putih ekstensi, pengecekan integritas `getimagesize()`, dan pembuatan nama file acak untuk mencegah tabrakan
- Direktori unggah diamankan dengan `.htaccess` untuk memblokir eksekusi PHP di dalam `uploads/`
- Foto yang disimpan ditampilkan sebagai thumbnail 60×72 px dengan penampil lightbox saat diklik

### 🔐 Autentikasi & Akses Berbasis Peran
- Sistem login aman (`login.html`) dengan autentikasi berbasis sesi
- Dua peran terautentikasi: **Admin** dan **Petugas Lapangan**
- Akses publik ke `lapor.html` tanpa login

### 📈 Dasbor Analitik
- Kartu KPI: total pusat ibadah, rumah tangga, populasi, penerima bantuan
- Grafik Chart.js: distribusi kemiskinan, distribusi bantuan, tren entri data (12 bulan), distribusi usia, statistik per pusat
- Dasbor hanya terlihat oleh Admin

### 📱 Antarmuka Pengguna Responsif Mobile
- Sidebar, modal, dan popup yang sepenuhnya responsif
- Perbaikan tinggi viewport CSS untuk iOS Safari (properti kustom `--vh`)
- Kontrol yang dioptimalkan untuk sentuhan dan target sentuh minimal 44px
- Dukungan inset area aman untuk ponsel dengan takik

### 🔍 Reverse Geocoding
- Pin klik-tempat pada peta dengan pengisian alamat otomatis
- Didukung oleh API Nominatim OpenStreetMap
- Tersedia di kedua form rumah tangga admin dan form laporan publik

---

## 3. Tumpukan Teknologi

| Lapisan | Teknologi | Tujuan |
|---|---|---|
| Struktur Frontend | HTML5 | Tata letak halaman dan markup semantik |
| Styling Frontend | CSS Vanila | Sistem desain kustom, tata letak responsif |
| Logika Frontend | JavaScript (ES2020+) | Interaksi peta, panggilan API, logika formulir |
| Pemetaan | Leaflet.js 1.9 | Rendering peta GIS interaktif |
| Grafik | Chart.js 4.4 | Visualisasi dasbor analitik |
| Ikon | Font Awesome 6.4 | Ikon UI dan peta |
| Font | Google Fonts (DM Sans) | Tipografi |
| Geocoding | OpenStreetMap Nominatim | Reverse geocoding (alamat dari koordinat) |
| Backend | PHP 8.1+ (Native) | REST API, manajemen sesi, logika bisnis |
| ORM Database | PDO (PHP) | Akses database aman dengan prepared statements |
| Database | MySQL 8.0+ / MariaDB 10.6+ | Penyimpanan data persisten |
| Server Web | Apache (XAMPP/shared hosting) | Perutean permintaan |

---

## 4. Struktur Folder

```
PovertyMapping/
├── api/
│   ├── auth/
│   │   └── check.php           Pengecekan sesi, login, logout
│   ├── houses/
│   │   └── index.php           CRUD rumah tangga + anggota keluarga + bantuan
│   ├── centers/
│   │   └── index.php           CRUD tempat ibadah + cakupan
│   ├── aid/
│   │   └── index.php           Manajemen riwayat bantuan
│   ├── public/
│   │   ├── report.php          Pengiriman laporan publik & verifikasi admin
│   │   └── upload.php          Penanganan unggah foto (laporan & rumah)
│   ├── reports/
│   │   └── index.php           Manajemen laporan internal
│   ├── stats/
│   │   └── index.php           KPI dasbor dan data grafik
│   ├── users/
│   │   └── index.php           Manajemen pengguna (hanya Admin)
│   └── logs/
│       └── index.php           Penampil log audit
├── assets/
│   ├── css/
│   │   └── style.css           Lembar gaya utama
│   └── js/
│       ├── config.js           Konstanta global dan status aplikasi
│       ├── api.js              Klien HTTP terpusat (pembungkus fetch)
│       ├── auth.js             Pengecekan sesi dan inisialisasi UI berbasis peran
│       ├── map.js              Inisialisasi peta Leaflet, mode penempatan
│       ├── markers.js          Rendering marker, popup, logika radius
│       ├── forms.js            Penangan formulir rumah/pusat (modal CRUD)
│       ├── dashboard.js        Rendering analitik Chart.js
│       ├── public-reports.js   Panel admin — verifikasi laporan publik
│       ├── photo-upload.js     Widget unggah foto bersama (pratinjau, validasi, unggah)
│       └── app.js              Pengatur utama (alur inisialisasi)
├── config/
│   ├── config.php              Konstanta aplikasi, kredensial DB, ambang batas
│   ├── database.php            Koneksi singleton PDO
│   └── bootstrap.php           Bootstrap API: header, sesi, pembantu autentikasi
├── middleware/
│   ├── Response.php            Pembantu respons JSON standar
│   └── Validator.php           Validasi dan pembersihan input
├── models/
│   ├── PovertyCalculator.php   Mesin penilaian kemiskinan otomatis
│   └── AuditLog.php            Menulis entri audit terstruktur
├── uploads/
│   ├── .htaccess               Memblokir eksekusi PHP di dalam uploads/
│   ├── houses/                 Penyimpanan foto rumah tangga
│   └── reports/                Penyimpanan foto bukti laporan publik
├── index.html                  Peta utama terautentikasi & dasbor admin
├── login.html                  Halaman login
└── lapor.html                  Halaman pengiriman laporan publik
```

---

## 5. Struktur Database

### Ringkasan Relasi Entitas

```
users                    (akun admin / petugas)
religious_centers        (1) ──< households (N)   [managing_center_id]
households               (1) ──< household_members (N)
households               (1) ──< aid_history (N)
households               (1) ──< public_reports (N) [converted_household_id]
```

### Definisi Tabel

**`users`**
```sql
id, name, email, password_hash,
role ENUM('admin','petugas'),
is_active, last_login_at, created_at
```

**`households`**
```sql
id,
-- Lokasi
rt, rw, kelurahan, kecamatan, full_address,
latitude, longitude,
-- Kepala keluarga
head_name, head_nik,
head_gender ENUM('male','female'),
head_date_of_birth, head_education,
head_employment_status, head_job_name, head_institution_name,
head_monthly_income,
-- Perumahan
house_condition ENUM('layak','tidak_layak'),
land_ownership ENUM('milik','sewa','numpang','lainnya'),
-- Kemiskinan
poverty_score INT,           -- Skor ternormalisasi 0–100
poverty_status ENUM('terdata','rentan_miskin','miskin','sangat_miskin'),
-- Bantuan
aid_status ENUM('not_yet','received'),
-- Foto
house_photos TEXT NULL,      -- Array JSON nama file foto
-- Relasi
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
radius INT (meter),
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
proof_photos TEXT NULL,      -- Array JSON nama file foto
urgent_need,
admin_notes, converted_household_id FK → households.id,
ip_address, reviewed_at, created_at
```

---

## 6. Panduan Instalasi

### Prasyarat

- PHP **8.1+** dengan ekstensi: `pdo_mysql`, `json`, `mbstring`, `fileinfo`, `gd`
- MySQL **8.0+** atau MariaDB **10.6+**
- Server web Apache (XAMPP, Laragon, atau hosting bersama)
- Akses internet untuk aset CDN (Leaflet, Chart.js, Font Awesome, Google Fonts)

---

### Langkah 1 — Salin File

**XAMPP (Windows):**
```
Salin folder PovertyMapping/ ke:
C:\xampp\htdocs\PovertyMapping\
```

**Server Linux:**
```bash
cp -r PovertyMapping/ /var/www/html/
```

---

### Langkah 2 — Buat Database

Buka **phpMyAdmin** → klik **Baru** → masukkan nama database:
```
webgis5
```
Atur kolasi: `utf8mb4_unicode_ci` → klik **Buat**.

Atau melalui CLI MySQL:
```sql
CREATE DATABASE webgis5
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

---

### Langkah 3 — Impor Skema

Di phpMyAdmin → pilih `webgis5` → klik **Impor** → pilih file SQL yang disertakan dengan proyek ini → klik **Go**.

Atau melalui CLI:
```bash
mysql -u root -p webgis5 < webgis5.sql
```

File SQL membuat semua tabel, termasuk kolom `house_photos` dan `proof_photos`, dan menyisipkan akun pengguna awal yang sudah di-seed.

---

### Langkah 4 — Konfigurasi Koneksi Database

Edit `config/config.php`:
```php
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'webgis5');   // nama database Anda
define('DB_USER', 'root');       // nama pengguna MySQL
define('DB_PASS', '');           // kata sandi MySQL (kosong untuk default XAMPP)
```

Untuk **produksi**, atur juga:
```php
define('APP_ENV',   'production');
define('APP_DEBUG', false);
```

---

### Langkah 5 — Atur Izin Direktori Unggah

Pastikan direktori unggah dapat ditulis oleh server web:

**Linux/Mac:**
```bash
chmod 755 uploads/ uploads/houses/ uploads/reports/
```

**Windows (XAMPP):** Izin tulis biasanya diberikan secara default. Tidak perlu langkah tambahan.

---

### Langkah 6 — Buka di Browser

```
http://localhost/PovertyMapping/login.html    → Halaman login
http://localhost/PovertyMapping/              → Dasbor utama (setelah login)
http://localhost/PovertyMapping/lapor.html    → Form laporan publik
```

---

### Langkah 7 — Kredensial Login Default

Setelah mengimpor database, dua akun yang sudah di-seed tersedia:

| Peran | Email | Kata Sandi |
|---|---|---|
| Administrator | `admin@webgis.local` | `Admin@12345` |
| Petugas Lapangan | `petugas@webgis.local` | `Petugas@12345` |

> **Penting:** Segera ganti kata sandi default setelah login pertama melalui panel Manajemen Pengguna.

---

### Catatan Deployment Hosting Bersama

1. Unggah semua file melalui FTP/cPanel File Manager (kecuali folder `.git/`)
2. Buat database MySQL dan pengguna di cPanel
3. Perbarui `config/config.php` dengan kredensial DB hosting Anda
4. Pastikan versi PHP ≥ 8.1 di cPanel → PHP Selector
5. Pastikan `pdo_mysql` dan `fileinfo` diaktifkan di ekstensi PHP
6. Atur `APP_DEBUG = false` dan `APP_ENV = 'production'`
7. Pastikan direktori `uploads/houses/` dan `uploads/reports/` dapat ditulis

---

## 7. Autentikasi & Peran

Sistem menggunakan **autentikasi berbasis sesi PHP**. Semua halaman yang dilindungi akan dialihkan ke `login.html` jika tidak ada sesi yang valid.

### Perbandingan Peran

| Izin | Admin | Petugas Lapangan | Publik (Tidak Login) |
|---|:---:|:---:|:---:|
| Lihat peta & marker | ✅ | ✅ | ❌ |
| Tambah rumah tangga | ✅ | ✅ | ❌ |
| Edit rumah tangga | ✅ | ✅ | ❌ |
| Unggah foto rumah tangga | ✅ | ✅ | ❌ |
| Hapus rumah tangga | ✅ | ❌ | ❌ |
| Tambah/edit tempat ibadah | ✅ | ✅ | ❌ |
| Hapus tempat ibadah | ✅ | ❌ | ❌ |
| Catat riwayat bantuan | ✅ | ✅ | ❌ |
| Lihat dasbor analitik | ✅ | ❌ | ❌ |
| Tinjau laporan publik | ✅ | ✅ | ❌ |
| Kelola pengguna | ✅ | ❌ | ❌ |
| Lihat log audit | ✅ | ❌ | ❌ |
| Kirim laporan publik (dengan foto) | ❌ | ❌ | ✅ |

### Alur Autentikasi

```
login.html → POST api/auth/check.php?action=login
           → session_regenerate_id() mencegah fiksasi
           → $_SESSION menyimpan user_id, name, email, role
           → index.html dimuat, auth.js memanggil GET api/auth/check.php
           → Elemen UI berbasis peran ditampilkan/disembunyikan
           → Logout: POST api/auth/check.php?action=logout
             → session_destroy() → dialihkan ke login.html
```

---

## 8. Alur Kerja GIS

### Pembuatan Marker Rumah Tangga

```
1. Petugas mengklik tombol "Tambah Rumah" pada peta
2. Peta memasuki mode penempatan — kursor berubah menjadi tanda silang
3. Petugas mengklik peta di lokasi rumah tangga
4. Reverse geocoding Nominatim mengisi kolom alamat secara otomatis
5. Petugas melengkapi formulir (data keluarga, penghasilan, kondisi rumah)
6. Petugas opsional melampirkan foto rumah (hingga 5 foto, JPG/JPEG/PNG, maks 5 MB masing-masing)
7. PovertyCalculator memberi skor pada rumah tangga saat disimpan
8. Setelah disimpan, foto diunggah melalui api/public/upload.php?target=house&id={id}
9. Marker segera muncul pada peta dengan warna yang benar
10. Popup menampilkan thumbnail foto ketika kolom house_photos terisi
```

### Alur Kerja Unggah Foto

```
Pengguna memilih foto melalui zona unggah (atau seret dan lepas)
          ↓
PhotoUpload.validate() — pengecekan sisi klien: format, ukuran, jumlah
          ↓
Thumbnail pratinjau ditampilkan
          ↓
Catatan disimpan (rumah tangga atau laporan) → server mengembalikan ID
          ↓
PhotoUpload.upload(target, id, fileList) — POST ke api/public/upload.php
          ↓
Server memvalidasi: tipe MIME (finfo), daftar putih ekstensi, getimagesize()
          ↓
File disimpan ke uploads/houses/ atau uploads/reports/
Nama file: {target}_{id}_{random12hex}.{ext}
          ↓
Kolom house_photos / proof_photos diperbarui (array JSON)
          ↓
Popup / modal edit / modal setujui menampilkan foto yang tersimpan
```

### Sistem Warna Kemiskinan

| Warna | Kategori | Rentang Skor |
|---|---|---|
| 🟢 Hijau `#0b9e73` | Terdata | 0 poin |
| 🟡 Kuning `#f59e0b` | Rentan Miskin | 1–3 poin |
| 🟠 Oranye `#f76707` | Miskin | 4–6 poin |
| 🔴 Merah `#d63230` | Sangat Miskin | ≥ 7 poin |

### Analisis Cakupan Radius

```
Tempat ibadah memiliki radius yang dapat dikonfigurasi (meter)
→ Lingkaran digambar pada peta
→ Rumus Haversine berjalan sisi klien per rumah tangga
→ Rumah tangga dalam radius disorot dan dihitung
→ Admin dapat menyesuaikan radius melalui slider di popup pusat ibadah
→ Jumlah cakupan diperbarui langsung tanpa memuat ulang halaman
```

### Alur Kerja Verifikasi Laporan Publik

```
Pengguna publik → lapor.html → POST api/public/report.php
                              ↓ (opsional)
                        Unggah foto bukti → api/public/upload.php?target=report&id=N
                                    ↓
                          public_reports (status = pending)
                                    ↓
                    Admin → index.html → Panel Admin → Laporan Publik
                    (Foto terlihat di modal setujui)
                                    ↓
                    ┌─────── Setujui ──────── Tolak ───────┐
                    ↓                                        ↓
          INSERT INTO households                   status = rejected
          poverty dihitung otomatis                  catatan admin disimpan
          status = approved
          converted_household_id = ID baru
                    ↓
          Marker baru muncul pada peta
```

### Alur Kerja Pelacakan Bantuan

```
1. Petugas membuka popup rumah tangga → "Tambah Bantuan"
2. Memilih: jenis bantuan, tanggal, jumlah, pusat pemberi
3. Catatan aid_history dibuat
4. aid_status pada rumah tangga diperbarui menjadi 'received'
5. Ikon marker disegarkan untuk mencerminkan status bantuan baru
6. Statistik dasbor diperbarui pada penyegaran berikutnya
```

---

## 9. Ikhtisar API

Semua endpoint API mengembalikan JSON yang konsisten:
```json
{ "success": true, "message": "...", "data": { ... } }
```

Semua endpoint terautentikasi mengembalikan `401` tanpa sesi yang valid, dan `403` untuk peran yang tidak mencukupi.

### `api/auth/check.php`

| Metode | Query | Deskripsi |
|---|---|---|
| GET | — | Memeriksa status sesi saat ini |
| POST | `?action=login` | Mengautentikasi pengguna (email + kata sandi) |
| POST | `?action=logout` | Menghancurkan sesi |

### `api/houses/index.php`

| Metode | Query | Auth | Deskripsi |
|---|---|---|---|
| GET | `?action=list` | Siapa saja | Daftar rumah tangga (dengan filter) |
| GET | `?action=show&id=N` | Siapa saja | Detail rumah tangga + anggota + bantuan |
| POST | `?action=create` | Siapa saja | Membuat rumah tangga baru |
| POST | `?action=update&id=N` | Siapa saja | Memperbarui data rumah tangga |
| POST | `?action=patch&id=N` | Siapa saja | Memperbarui koordinat saja (seret) |
| POST | `?action=delete&id=N` | Admin | Menghapus lunak rumah tangga |
| POST | `?action=delete_photo&id=N` | Siapa saja | Menghapus foto rumah tangga individu |

**Filter daftar:** `poverty_status`, `aid_status`, `house_condition`, `center_id`, `q` (cari nama/alamat/NIK)

### `api/public/upload.php`

| Metode | Query | Auth | Deskripsi |
|---|---|---|---|
| POST | `?target=house&id=N` | Diperlukan | Mengunggah foto untuk rumah tangga |
| POST | `?target=report&id=N` | Publik | Mengunggah foto bukti untuk laporan publik |

**Validasi:** maks 5 file, maks 5 MB per file, ekstensi yang diizinkan: `jpg`, `jpeg`, `png`. Tipe MIME diverifikasi sisi server melalui `finfo`.

### `api/centers/index.php`

| Metode | Query | Auth | Deskripsi |
|---|---|---|---|
| GET | `?action=list` | Siapa saja | Daftar semua tempat ibadah |
| GET | `?action=show&id=N` | Siapa saja | Detail tempat ibadah |
| GET | `?action=coverage&id=N` | Siapa saja | Rumah tangga dalam radius tempat ibadah |
| POST | `?action=create` | Siapa saja | Membuat tempat ibadah baru |
| POST | `?action=update&id=N` | Siapa saja | Memperbarui data tempat ibadah |
| POST | `?action=patch&id=N` | Siapa saja | Memperbarui radius/koordinat saja |
| POST | `?action=delete&id=N` | Admin | Menghapus lunak tempat ibadah |

### `api/public/report.php`

| Metode | Query | Auth | Deskripsi |
|---|---|---|---|
| POST | — | Publik | Mengirim laporan publik |
| GET | `?action=list` | Admin/Petugas | Daftar semua laporan |
| POST | `?action=approve&id=N` | Admin/Petugas | Menyetujui → membuat rumah tangga |
| POST | `?action=reject&id=N` | Admin/Petugas | Menolak dengan catatan |
| POST | `?action=delete&id=N` | Admin | Menghapus laporan + foto terkait |

### `api/stats/index.php`

| Aksi | Deskripsi |
|---|---|
| `overview` | Kartu KPI: jumlah pusat ibadah, rumah tangga, populasi, penerima bantuan |
| `poverty_chart` | Jumlah rumah tangga per kategori kemiskinan |
| `aid_chart` | Distribusi berbanding tidak berhak |
| `trend` | Tren pendaftaran rumah tangga bulanan (12 bulan) |
| `age_distribution` | Distribusi kelompok umur kepala rumah tangga |
| `center_stats` | Statistik rumah tangga dan cakupan per pusat |

---

## 10. Dukungan Responsif Mobile

Sistem dirancang untuk dapat digunakan sepenuhnya pada browser mobile Android dan iOS.

### Titik Henti Responsif

| Titik Henti | Perilaku |
|---|---|
| `> 768px` | Sidebar terlihat, tampilan peta penuh |
| `≤ 768px` | Sidebar menyusut, dapat diakses melalui tombol toggle |
| `≤ 480px` | Modal dan popup beralih ke overlay layar penuh |
| Lanskap `≤ 600px tinggi` | Header ringkas, jarak berkurang |

### Optimalisasi Khusus Mobile

- **Perbaikan 100vh iOS** — Properti kustom CSS `--vh` dihitung ulang saat resize untuk mencegah pemotongan viewport di Safari
- **Inset area aman** — `env(safe-area-inset-*)` diterapkan untuk tata letak iPhone dengan takik
- **Target sentuh** — Semua elemen interaktif memiliki tinggi/lebar minimum `44px`
- **`-webkit-tap-highlight-color: transparent`** — Menghilangkan kilatan sentuh pada tombol
- **Ukuran font input: 16px** — Mencegah zoom otomatis iOS saat fokus pada formulir
- **Penanganan keyboard** — Elemen aktif dikaburkan sebelum navigasi untuk menutup keyboard virtual
- **Gulir popup** — Popup menggunakan `overflow-y: auto` dengan `max-height: 70vh` untuk konten panjang
- **Thumbnail foto** — Ubah ukuran menjadi 60px pada mobile (72px pada desktop) untuk target sentuh yang optimal

---

## 11. Catatan Keamanan

Sistem ini dirancang untuk deployment akademik publik pada hosting bersama. Langkah-langkah keamanan ringan berikut diterapkan:

| Area | Langkah |
|---|---|
| **SQL Injection** | Semua query menggunakan prepared statements PDO dengan `ATTR_EMULATE_PREPARES = false` — kueri terparameterisasi sejati ditegakkan di tingkat driver |
| **XSS** | Semua konten buatan pengguna yang dirender ke HTML dibungkus dengan `escapeHtml()` (`htmlspecialchars` dengan `ENT_QUOTES`); input backend dibersihkan melalui `Validator::sanitizeString()` |
| **Fiksasi Sesi** | `session_regenerate_id(true)` dipanggil pada setiap login yang berhasil |
| **Keamanan Sesi** | Sesi bersifat `HttpOnly`, `SameSite=Lax`; diberi nama `webgis_sess` untuk menghindari konflik |
| **Penegakan Peran** | Pembantu `requireAuth()` dan `requireAdmin()` menjaga setiap endpoint API sisi server |
| **Validasi Input** | `Validator.php` menegakkan aturan tipe, panjang, enum, koordinat, dan email sebelum operasi DB apa pun |
| **Pembatasan Laju** | Endpoint laporan publik menolak pengiriman melebihi 5 per IP per 24 jam |
| **Kebocoran Kesalahan** | `APP_DEBUG = false` dalam produksi menekan kesalahan PHP; penangan pengecualian mengembalikan JSON 500 generik |
| **CORS** | `Access-Control-Allow-Origin: *` hanya diaktifkan di lingkungan `development` |
| **Clickjacking** | Header `X-Frame-Options: DENY` dikirim pada semua respons API |
| **Keamanan Unggah File** | `.htaccess` memblokir eksekusi PHP di `uploads/`; tipe MIME diverifikasi melalui `finfo`; nama file diacak dengan `random_bytes(12)`; `getimagesize()` mengonfirmasi struktur gambar yang valid; `basename()` mencegah traversal jalur |

---

## 12. Pemecahan Masalah

### API mengembalikan HTML bukan JSON
- Atur `APP_DEBUG = true` di `config/config.php` sementara untuk menampilkan kesalahan PHP
- Periksa log kesalahan Apache: `C:\xampp\logs\error.log` (XAMPP)
- Pastikan `ob_start()` ada di `bootstrap.php` untuk menekan output yang tidak disengaja

### Ubin peta tidak dimuat
- Membutuhkan akses internet ke server ubin OpenStreetMap
- Periksa konsol browser (F12) untuk kesalahan konten campuran atau CORS
- Pada hosting HTTPS, URL ubin juga harus menggunakan HTTPS

### Dasbor Chart.js kosong
- Grafik dimuat dari CDN — membutuhkan akses internet
- Pastikan tidak ada kesalahan konsol JavaScript di tab dasbor
- Pastikan API Stats (`api/stats/index.php`) mengembalikan JSON yang valid

### Unggah foto gagal secara diam-diam
- Pastikan ekstensi PHP `fileinfo` dan `gd` diaktifkan
- Pastikan `uploads/houses/` dan `uploads/reports/` ada dan dapat ditulis (`chmod 755`)
- Atur `APP_DEBUG = true` sementara untuk menampilkan kesalahan unggah PHP
- Pastikan `upload_max_filesize` dan `post_max_size` di `php.ini` minimal `6M`

### Pembatasan laju terlalu ketat selama pengujian
Di `api/public/report.php`, ubah konstanta batas:
```php
if ($recentCount >= 5) {    // tingkatkan untuk pengujian lokal
```

### Loop pengalihan login
- Pastikan database diimpor dengan benar dan tabel `users` berisi baris admin default
- Pastikan konfigurasi sesi: PHP harus dapat menulis file sesi (`session.save_path`)
- Pada hosting bersama, pastikan jalur sesi dapat ditulis

---

## 13. Peningkatan Masa Depan

| Fitur | Deskripsi |
|---|---|
| **Ekspor ke Excel/PDF** | Tambahkan endpoint `api/export/` untuk menghasilkan laporan data rumah tangga yang dapat diunduh |
| **Peta siap cetak** | Implementasikan Leaflet.print atau CSS cetak browser untuk output peta siap kertas |
| **Impor massal** | Unggah CSV untuk entri data rumah tangga massal dari survei lapangan |
| **Sistem notifikasi** | Peringatan email atau WhatsApp ke admin ketika laporan publik baru dikirim |
| **Penegakan HTTPS** | Tambahkan pengalihan HTTPS `.htaccess` dan ubah flag sesi `secure` menjadi `true` |
| **Jejak audit pengguna** | Perluas UI log audit untuk menunjukkan riwayat perubahan lengkap per catatan rumah tangga |
| **Dukungan multi-desa** | Tambahkan tabel `villages` untuk mendukung beberapa area administratif dari satu sistem |
| **Pengelompokan peta** | Implementasikan Leaflet.markercluster untuk kinerja pada kumpulan data padat (500+ marker) |
| **Kemampuan offline** | Caching Service Worker untuk penggunaan lapangan di area dengan konektivitas buruk |
| **Pembatasan laju API** | Perluas pembatasan laju ke endpoint tulis terautentikasi untuk mencegah banjir data |
| **Kompresi foto** | Perubahan ukuran gambar sisi server sebelum penyimpanan untuk mengurangi penggunaan disk |

---

## Lisensi

Proyek ini bersumber terbuka di bawah [Lisensi MIT](LICENSE).  
Dibangun sebagai proyek GIS akademik — cocok untuk proyek akhir tahun universitas, penelitian, dan demo sektor publik.