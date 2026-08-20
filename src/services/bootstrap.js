'use strict';

/**
 * Database bootstrap: opens the authenticated JSON connection, creates
 * the required tables and seeds default rows on first boot.
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { JsonDb } = require('../engine/jsonDb');

let db = null;

/** Open an authenticated connection to the JSON database. */
function openConnection() {
  if (db) return db;
  db = JsonDb.connect({
    dataDir: env.DATA_DIR,
    dbName: env.DB_NAME,
    user: env.DB_USER,
    pass: env.DB_PASS
  });
  return db;
}

/**
 * Close the current connection and re-open (re-authenticate) against the
 * current environment credentials, re-seeding any missing tables.
 * Used after an admin updates the database connection configuration.
 */
async function reconnectDatabase() {
  db = null;
  return initDatabase();
}

/** Add table-listing + credential helpers to the engine. */
JsonDb.prototype.listTables = function listTables() {
  return fs
    .readdirSync(this.dataDir)
    .filter((f) => f.startsWith(`${this.dbName}_`) && f.endsWith('.json'))
    .map((f) => f.slice(this.dbName.length + 1, -5));
};

async function seedStaff() {
  const table = db.table('staff_users');
  if (table.count() > 0) return;
  const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10);
  await table.insert({
    username: env.SEED_ADMIN_USERNAME,
    password_hash: passwordHash,
    role: 'ADMIN',
    full_name: 'System Administrator',
    is_active: true,
    created_at: new Date().toISOString()
  });
  console.log(`[db] Seeded admin staff account: ${env.SEED_ADMIN_USERNAME}`);
}

async function seedPackages() {
  const table = db.table('data_packages');
  if (table.count() > 0) return;
  const rows = [
    { package_name: 'MTN 100MB', data_amount: '100 MB', price: 50, ussd_code_template: '*131*100*1#', is_active: true },
    { package_name: 'MTN 500MB', data_amount: '500 MB', price: 150, ussd_code_template: '*131*500*1#', is_active: true },
    { package_name: 'MTN 1GB', data_amount: '1 GB', price: 250, ussd_code_template: '*131*1GB*1#', is_active: true },
    { package_name: 'Airtel 200MB', data_amount: '200 MB', price: 80, ussd_code_template: '*141*200*1#', is_active: true },
    { package_name: 'Airtel 1GB', data_amount: '1 GB', price: 220, ussd_code_template: '*141*1GB*1#', is_active: true },
    { package_name: 'Glo 2GB', data_amount: '2 GB', price: 400, ussd_code_template: '*777*2GB*1#', is_active: true },
    { package_name: '9mobile 1GB', data_amount: '1 GB', price: 300, ussd_code_template: '*229*1GB*1#', is_active: true }
  ];
  for (const row of rows) {
    await table.insert({ ...row, created_at: new Date().toISOString() });
  }
  console.log(`[db] Seeded ${rows.length} data packages`);
}

async function seedSpinConfig() {
  const table = db.table('daily_spin_config');
  if (table.count() > 0) return;
  const rows = [
    { label: '100 MB', reward_type: 'DATA', reward_value: 100, win_probability: 0.1, is_active: true, sort_order: 1 },
    { label: '200 MB', reward_type: 'DATA', reward_value: 200, win_probability: 0.08, is_active: true, sort_order: 2 },
    { label: '500 MB', reward_type: 'DATA', reward_value: 500, win_probability: 0.05, is_active: true, sort_order: 3 },
    { label: '50 Points', reward_type: 'POINTS', reward_value: 50, win_probability: 0.15, is_active: true, sort_order: 4 },
    { label: '20 Points', reward_type: 'POINTS', reward_value: 20, win_probability: 0.22, is_active: true, sort_order: 5 },
    { label: 'Try Again', reward_type: 'NONE', reward_value: 0, win_probability: 0.4, is_active: true, sort_order: 6 }
  ];
  for (const row of rows) {
    await table.insert(row);
  }
  console.log(`[db] Seeded ${rows.length} spin wheel segments`);
}

async function seedSettings() {
  const table = db.table('app_control_settings');
  if (table.count() > 0) return;
  await table.insert({
    app_status: 'ONLINE',
    min_required_version: '1.0.0',
    daily_spin_limit: 3,
    auto_reminder_hours: 24,
    updated_at: new Date().toISOString()
  });
  console.log('[db] Seeded app control settings');
}

/** Create every table (empty files) + seed defaults. */
async function initDatabase() {
  openConnection();

  const tableNames = [
    'users',
    'data_packages',
    'daily_spin_config',
    'banner_ads',
    'transactions',
    'app_control_settings',
    'staff_users'
  ];
  for (const name of tableNames) {
    const file = db.fileFor(name);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '[]\n', 'utf8');
    }
    db.table(name); // warm the cache
  }

  await seedStaff();
  await seedPackages();
  await seedSpinConfig();
  await seedSettings();
  return db;
}

module.exports = { initDatabase, openConnection, reconnectDatabase, getDb: () => db };