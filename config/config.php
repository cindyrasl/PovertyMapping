<?php
// ============================================================
// config/config.php
// ============================================================
declare(strict_types=1);

// ---- Environment -------------------------------------------
// SET TO 'development' TEMPORARILY TO SEE ERROR DETAILS
define('APP_ENV',   getenv('APP_ENV') ?: 'development');
define('APP_DEBUG', true);  // <--- SET TRUE TO SEE ERRORS
define('APP_NAME',  'WebGIS Poverty Mapping v2');
define('BASE_URL',  getenv('BASE_URL') ?: 'http://localhost/webgis-v2');

// ---- Database ----------------------------------------------
define('DB_HOST',    getenv('DB_HOST')    ?: 'localhost');
define('DB_PORT',    getenv('DB_PORT')    ?: '3306');
define('DB_NAME',    getenv('DB_NAME')    ?: 'webgis5');   // <--- YOUR NEW DB
define('DB_USER',    getenv('DB_USER')    ?: 'root');
define('DB_PASS',    getenv('DB_PASS')    ?: '');
define('DB_CHARSET', 'utf8mb4');

// ---- Pagination --------------------------------------------
define('PAGE_SIZE', 500);

// ---- Poverty scoring thresholds ----------------------------
define('POVERTY_THRESHOLD_NEAR',   30);
define('POVERTY_THRESHOLD_POOR',   55);
define('POVERTY_THRESHOLD_SEVERE', 75);