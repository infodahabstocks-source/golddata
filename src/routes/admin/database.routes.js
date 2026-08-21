'use strict';

/**
 * Admin API - Database Management
 * --------------------------------
 * Configure, test and manage the custom JSON database:
 *  - View/update connection credentials (stored in .env)
 *  - Test connection (auth + read/write probe)
 *  - Table explorer + data inspector
 *  - Full backup (download) & restore (upload)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../../config/env');
const { getDb, reconnectDatabase } = require('../../services/bootstrap');
const { requireStaff, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail } = require('../../utils/helpers');
const { setEnvValues } = require('../../utils/envFile');

const router = express.Router();

const ENV_FILE = path.join(__dirname, '..', '..', '..', '.env');
const DB_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const RESTORE_TABLES = new Set([
  'users',
  'data_packages',
  'daily_spin_config',
  'banner_ads',
  'transactions',
  'app_control_settings',
  'staff_users'
]);

const uploadBackup = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.json') {
      const err = new Error('Backup file must be a .json bundle');
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

function isSafeDbName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(name);
}

function isSafeTable(name) {
  return typeof name === 'string' && /^[a-z0-9_]{1,64}$/.test(name);
}

function isSafeHost(host) {
  return typeof host === 'string' && host.length >= 1 && host.length <= 255 && !host.includes('\n');
}

function maskPassword(pass) {
  return pass ? `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022` : '';
}

// ---------------------------------------------------------------
// Connection configuration
// ---------------------------------------------------------------

/** Current configured connection (password is masked, never sent raw). */
router.get(
  '/connection',
  requireStaff,
  asyncHandler(async (req, res) => {
    return ok(res, {
      host: env.DB_HOST,
      username: env.DB_USER,
      db_name: env.DB_NAME,
      password_set: Boolean(env.DB_PASS),
      masked_password: maskPassword(env.DB_PASS),
      data_dir: env.DATA_DIR,
      env_file: ENV_FILE
    });
  })
);

/**
 * Test a connection: validates credentials + filesystem read/write.
 * Accepts proposed values (optional - falls back to current config).
 */
router.post(
  '/connection/test',
  requireStaff,
  asyncHandler(async (req, res) => {
    const host = req.body.host !== undefined ? String(req.body.host) : env.DB_HOST;
    const username = req.body.username !== undefined ? String(req.body.username) : env.DB_USER;
    const password = req.body.password !== undefined && String(req.body.password) !== ''
      ? String(req.body.password)
      : env.DB_PASS;
    const dbName = req.body.db_name !== undefined ? String(req.body.db_name) : env.DB_NAME;

    const errors = [];
    if (!isSafeHost(host)) errors.push('Invalid host/domain');
    if (!username) errors.push('Database username is required');
    if (!password) errors.push('Database password is required');
    if (!isSafeDbName(dbName)) errors.push('Database name must be 1-40 letters, digits or underscores');
    if (errors.length) {
      return ok(res, { ok: false, message: errors.join('. '), checks: [] }, 200);
    }

    const checks = [];
    const matchesRunning =
      username === env.DB_USER && password === env.DB_PASS && dbName === env.DB_NAME;
    checks.push({
      name: 'Credentials match running configuration',
      pass: matchesRunning,
      note: matchesRunning ? '' : 'Saving these values will reconnect the database'
    });

    const probeFile = path.join(env.DATA_DIR, `.probe-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    let writable = true;
    let probeError = null;
    try {
      fs.writeFileSync(probeFile, 'ok', 'utf8');
      fs.readFileSync(probeFile, 'utf8');
      fs.unlinkSync(probeFile);
    } catch (err) {
      writable = false;
      probeError = err.message;
    }
    checks.push({ name: 'Data directory read/write permissions', pass: writable, note: probeError || '' });

    const files = fs
      .readdirSync(env.DATA_DIR)
      .filter((f) => f.startsWith(`${dbName}_`) && f.endsWith('.json'));
    const tables = files.map((f) => {
      let count = 0;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(env.DATA_DIR, f), 'utf8'));
        count = Array.isArray(parsed) ? parsed.length : 0;
      } catch (_) { /* corrupt/empty */ }
      return { name: f.slice(dbName.length + 1, -5), count };
    });
    checks.push({
      name: `Database "${dbName}" tables found`,
      pass: tables.length > 0,
      note: tables.length ? `${tables.length} table(s)` : 'No tables yet - they are created on first boot'
    });

    const okFlag = writable;
    return ok(res, {
      ok: okFlag,
      message: okFlag
        ? `Connection OK \u2014 data directory writable, ${tables.length} table(s) found for "${dbName}".`
        : `Connection failed: filesystem probe error - ${probeError}`,
      checks,
      tables
    });
  })
);

/** Save connection credentials to .env and reconnect the live database (ADMIN). */
router.put(
  '/connection',
  requireStaff,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const host = req.body.host !== undefined ? String(req.body.host) : env.DB_HOST;
    const username = req.body.username !== undefined ? String(req.body.username) : env.DB_USER;
    const password =
      req.body.password !== undefined && String(req.body.password) !== ''
        ? String(req.body.password)
        : env.DB_PASS;
    const dbName = req.body.db_name !== undefined ? String(req.body.db_name) : env.DB_NAME;

    const errors = [];
    if (!isSafeHost(host)) errors.push('Invalid host/domain');
    if (!username) errors.push('Database username is required');
    if (!password) errors.push('Database password is required');
    if (!isSafeDbName(dbName)) errors.push('Database name must be 1-40 letters, digits or underscores');
    if (errors.length) return fail(res, errors.join('. '), 400);

    // 1. Persist to .env (all other keys preserved)
    setEnvValues(ENV_FILE, { DB_HOST: host, DB_USER: username, DB_PASS: password, DB_NAME: dbName });

    // 2. Apply to the running process
    process.env.DB_HOST = host;
    process.env.DB_USER = username;
    process.env.DB_PASS = password;
    process.env.DB_NAME = dbName;

    // 3. Reconnect the live JSON DB (re-authenticates + re-seeds missing tables)
    await reconnectDatabase();

    return ok(res, {
      saved: true,
      host: process.env.DB_HOST,
      username: process.env.DB_USER,
      db_name: process.env.DB_NAME,
      password_set: Boolean(process.env.DB_PASS),
      masked_password: maskPassword(process.env.DB_PASS),
      data_dir: env.DATA_DIR,
      env_file: ENV_FILE,
      message: `Connection configuration saved to ${ENV_FILE} and the database reconnected.`
    });
  })
);

// ---------------------------------------------------------------
// Table explorer & data inspector
// ---------------------------------------------------------------

router.get(
  '/tables',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const tables = db
      .listTables()
      .map((name) => ({ name, count: db.table(name).count(), file: db.fileFor(name) }));
    return ok(res, tables);
  })
);

router.get(
  '/tables/:name',
  requireStaff,
  asyncHandler(async (req, res) => {
    const name = req.params.name;
    if (!isSafeTable(name) || !RESTORE_TABLES.has(name)) {
      return fail(res, 'Unknown table', 404);
    }
    const db = getDb();
    if (!db.listTables().includes(name)) {
      return fail(res, `Table "${name}" does not exist in ${db.dbName}`, 404);
    }
    const rows = db.table(name).all();
    return ok(res, { table: name, count: rows.length, rows });
  })
);

function isSafeRowId(id) {
  return typeof id === 'string' && /^[0-9]+$/.test(id);
}

function assertRowTable(db, name) {
  if (!isSafeTable(name) || !RESTORE_TABLES.has(name)) {
    return 'Unknown table';
  }
  if (!db.listTables().includes(name)) {
    return `Table "${name}" does not exist in ${db.dbName}`;
  }
  return null;
}

/** Insert a new record into a managed table (id is auto-assigned by the engine). */
router.post(
  '/tables/:name',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const err = assertRowTable(db, req.params.name);
    if (err) return fail(res, err, 404);
    const doc = req.body;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return fail(res, 'Record must be a JSON object', 400);
    }
    const { id, ...rest } = doc;
    const row = await db.table(req.params.name).insert(rest);
    return ok(res, row, 201);
  })
);

/** Update an existing record (partial patch; id is never replaced). */
router.put(
  '/tables/:name/:rowId',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const err = assertRowTable(db, req.params.name);
    if (err) return fail(res, err, 404);
    if (!isSafeRowId(req.params.rowId)) return fail(res, 'Invalid record id', 400);
    const doc = req.body;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return fail(res, 'Record must be a JSON object', 400);
    }
    const { id, ...patch } = doc;
    const updated = await db.table(req.params.name).updateById(req.params.rowId, patch);
    if (!updated) return fail(res, 'Record not found', 404);
    return ok(res, updated);
  })
);

/** Delete a record (guarded for critical rows). */
router.delete(
  '/tables/:name/:rowId',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const err = assertRowTable(db, req.params.name);
    if (err) return fail(res, err, 404);
    if (!isSafeRowId(req.params.rowId)) return fail(res, 'Invalid record id', 400);

    const name = req.params.name;
    const rowId = req.params.rowId;
    if (name === 'app_control_settings' && Number(rowId) === 1) {
      return fail(res, 'The primary app settings record cannot be deleted', 400);
    }
    if (name === 'staff_users') {
      const target = db.table('staff_users').findById(rowId);
      if (target && target.role === 'ADMIN' && db.table('staff_users').count({ role: 'ADMIN' }) <= 1) {
        return fail(res, 'Cannot delete the last ADMIN account', 400);
      }
    }
    if (name === 'users') {
      db.table('transactions').remove({ user_id: Number(rowId) });
    }
    const removed = await db.table(name).removeById(rowId);
    if (!removed) return fail(res, 'Record not found', 404);
    return ok(res, { deleted: removed.id });
  })
);

// ---------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------

/** Download a full JSON bundle of the database. */
router.get(
  '/backup',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const bundle = {
      meta: {
        engine: 'goldatadb-json-db',
        version: 1,
        db_name: db.dbName,
        exported_at: new Date().toISOString()
      },
      tables: {}
    };
    for (const name of db.listTables()) {
      bundle.tables[name] = db.table(name).all();
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="goldatadb-${db.dbName}-backup-${stamp}.json"`);
    return res.status(200).send(JSON.stringify(bundle, null, 2));
  })
);

/** Restore tables from an uploaded backup bundle (ADMIN). */
router.post(
  '/restore',
  requireStaff,
  requireAdmin,
  uploadBackup.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return fail(res, 'A backup .json file is required', 400);

    let bundle;
    try {
      bundle = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return fail(res, 'Invalid JSON backup file', 400);
    }
    if (!bundle || typeof bundle !== 'object' || typeof bundle.tables !== 'object') {
      return fail(res, 'Backup bundle must contain a "tables" object', 400);
    }
    if (bundle.meta && bundle.meta.engine !== 'goldatadb-json-db') {
      return fail(res, 'Not a valid GoldData backup bundle', 400);
    }

    const restored = [];
    const skipped = [];
    for (const [name, rows] of Object.entries(bundle.tables)) {
      if (!isSafeTable(name) || !RESTORE_TABLES.has(name)) {
        skipped.push(name);
        continue;
      }
      if (!Array.isArray(rows)) {
        return fail(res, `Table "${name}" in backup is not an array`, 400);
      }
      await getDb().table(name).replaceAll(rows.map((r) => ({ ...r })));
      restored.push({ name, count: rows.length });
    }

    return ok(res, {
      restored,
      skipped: skipped.length ? skipped : undefined,
      message: `Restored ${restored.length} table(s)${skipped.length ? `, skipped ${skipped.length} (not managed)` : ''}.`
    });
  })
);

module.exports = router;