'use strict';

/**
 * Admin API - Dynamic Database Inspector CRUD
 * -------------------------------------------
 * Generic, schema-agnostic record management for every managed table:
 *   GET    /api/admin/db/:tableName        -> rows + metadata (columns inferred)
 *   POST   /api/admin/db/:tableName        -> insert record (id auto-assigned)
 *   PUT    /api/admin/db/:tableName/:id    -> patch record (id never replaced)
 *   DELETE /api/admin/db/:tableName/:id    -> remove record (guarded)
 *
 * All writes go through the JSON engine's serialized atomic queue.
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail } = require('../../utils/helpers');

const router = express.Router();

const MANAGED_TABLES = new Set([
  'users',
  'transactions',
  'staff_users',
  'data_packages',
  'daily_spin_config',
  'banner_ads',
  'app_control_settings'
]);

function isSafeTable(name) {
  return typeof name === 'string' && /^[a-z0-9_]{1,64}$/.test(name);
}

function isSafeRowId(id) {
  return typeof id === 'string' && /^[0-9]+$/.test(id);
}

function assertTable(db, name) {
  if (!isSafeTable(name) || !MANAGED_TABLES.has(name)) return 'Unknown table';
  if (!db.listTables().includes(name)) return `Table "${name}" does not exist in ${db.dbName}`;
  return null;
}

/** Infer column metadata (name + primitive type) from the union of row keys. */
function inferColumns(rows) {
  const types = new Map();
  const rank = { boolean: 1, number: 2, string: 3 };
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      let t = value === null || value === undefined
        ? null
        : Array.isArray(value) || typeof value === 'object'
          ? 'json'
          : typeof value;
      if (t === null) continue;
      const cur = types.get(key);
      if (!cur) types.set(key, t);
      else if (cur !== t) types.set(key, rank[t] && rank[cur] ? (rank[t] > rank[cur] ? t : cur) : 'json');
    }
  }
  return [...types.entries()].map(([name, type]) => ({ name, type }));
}

// ---------------------------------------------------------------
// Read: rows + metadata
// ---------------------------------------------------------------

router.get(
  '/:tableName',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const name = req.params.tableName;
    const err = assertTable(db, name);
    if (err) return fail(res, err, 404);

    const table = db.table(name);
    const rows = table.all();
    return ok(res, {
      table: name,
      file: db.fileFor(name).split(/[\\/]/).pop(),
      count: rows.length,
      columns: inferColumns(rows),
      rows
    });
  })
);

// ---------------------------------------------------------------
// Create
// ---------------------------------------------------------------

router.post(
  '/:tableName',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const name = req.params.tableName;
    const err = assertTable(db, name);
    if (err) return fail(res, err, 404);

    const doc = req.body;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return fail(res, 'Record must be a JSON object', 400);
    }
    const { id, ...rest } = doc;
    if (Object.keys(rest).length === 0) return fail(res, 'Record has no fields', 400);
    const row = await db.table(name).insert(rest);
    return ok(res, row, 201);
  })
);

// ---------------------------------------------------------------
// Update
// ---------------------------------------------------------------

router.put(
  '/:tableName/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const name = req.params.tableName;
    const err = assertTable(db, name);
    if (err) return fail(res, err, 404);
    if (!isSafeRowId(req.params.id)) return fail(res, 'Invalid record id', 400);

    const doc = req.body;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return fail(res, 'Record must be a JSON object', 400);
    }
    const { id, ...patch } = doc;
    if (Object.keys(patch).length === 0) return fail(res, 'Nothing to update', 400);
    const updated = await db.table(name).updateById(req.params.id, patch);
    if (!updated) return fail(res, 'Record not found', 404);
    return ok(res, updated);
  })
);

// ---------------------------------------------------------------
// Delete (guarded for critical rows)
// ---------------------------------------------------------------

router.delete(
  '/:tableName/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const name = req.params.tableName;
    const err = assertTable(db, name);
    if (err) return fail(res, err, 404);
    if (!isSafeRowId(req.params.id)) return fail(res, 'Invalid record id', 400);

    const rowId = req.params.id;
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

module.exports = router;
