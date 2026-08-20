'use strict';

/**
 * Admin API - App Control Settings & Staff management.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, toNumber } = require('../../utils/helpers');

const router = express.Router();

const SETTING_KEYS = ['app_status', 'min_required_version', 'daily_spin_limit', 'auto_reminder_hours'];

router.get(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const settings = getDb().table('app_control_settings').findOne({ id: 1 });
    return ok(res, settings || null);
  })
);

router.put(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const current = db.table('app_control_settings').findOne({ id: 1 });
    const patch = {};

    if (req.body.app_status !== undefined) {
      if (!['ONLINE', 'MAINTENANCE'].includes(req.body.app_status)) {
        return fail(res, "app_status must be 'ONLINE' or 'MAINTENANCE'");
      }
      patch.app_status = req.body.app_status;
    }
    if (req.body.min_required_version !== undefined) {
      patch.min_required_version = String(req.body.min_required_version).trim();
    }
    if (req.body.daily_spin_limit !== undefined) {
      const limit = toNumber(req.body.daily_spin_limit, NaN);
      if (!Number.isFinite(limit) || limit < 0) return fail(res, 'daily_spin_limit must be >= 0');
      patch.daily_spin_limit = limit;
    }
    if (req.body.auto_reminder_hours !== undefined) {
      const hours = toNumber(req.body.auto_reminder_hours, NaN);
      if (!Number.isFinite(hours) || hours <= 0) return fail(res, 'auto_reminder_hours must be > 0');
      patch.auto_reminder_hours = hours;
    }
    if (Object.keys(patch).length === 0) return fail(res, 'Nothing to update');

    patch.updated_at = new Date().toISOString();
    let settings;
    if (current) {
      settings = await db.table('app_control_settings').updateById(current.id, patch);
    } else {
      settings = await db.table('app_control_settings').insert({ id: 1, ...patch });
    }
    return ok(res, settings);
  })
);

// ---------------------------------------------------------------
// Staff accounts
// ---------------------------------------------------------------

router.get(
  '/staff',
  requireStaff,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .table('staff_users')
      .all()
      .map(({ password_hash, ...safe }) => safe);
    return ok(res, rows);
  })
);

router.post(
  '/staff',
  requireStaff,
  asyncHandler(async (req, res) => {
    const { username, password, full_name, role } = req.body;
    if (!username || String(username).trim().length < 3) return fail(res, 'Username must be at least 3 characters');
    if (!password || String(password).length < 8) return fail(res, 'Password must be at least 8 characters');
    if (role && !['ADMIN', 'STAFF'].includes(role)) return fail(res, "role must be 'ADMIN' or 'STAFF'");

    const db = getDb();
    if (db.table('staff_users').findOne({ username: String(username).trim() })) {
      return fail(res, 'Username already exists', 409);
    }
    const staff = await db.table('staff_users').insert({
      username: String(username).trim(),
      password_hash: await bcrypt.hash(String(password), 10),
      role: role || 'STAFF',
      full_name: full_name ? String(full_name).trim() : '',
      is_active: true,
      created_at: new Date().toISOString()
    });
    const { password_hash, ...safe } = staff;
    return ok(res, safe, 201);
  })
);

router.put(
  '/staff/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('staff_users').findById(req.params.id);
    if (!existing) return fail(res, 'Staff not found', 404);

    const patch = {};
    if (req.body.full_name !== undefined) patch.full_name = String(req.body.full_name).trim();
    if (req.body.role !== undefined) {
      if (!['ADMIN', 'STAFF'].includes(req.body.role)) return fail(res, "role must be 'ADMIN' or 'STAFF'");
      patch.role = req.body.role;
    }
    if (req.body.is_active !== undefined) patch.is_active = Boolean(req.body.is_active);
    if (req.body.password !== undefined) {
      if (String(req.body.password).length < 8) return fail(res, 'Password must be at least 8 characters');
      patch.password_hash = await bcrypt.hash(String(req.body.password), 10);
    }

    const updated = await db.table('staff_users').updateById(existing.id, patch);
    const { password_hash, ...safe } = updated;
    return ok(res, safe);
  })
);

router.delete(
  '/staff/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('staff_users').findById(req.params.id);
    if (!existing) return fail(res, 'Staff not found', 404);
    if (existing.role === 'ADMIN' && db.table('staff_users').count({ role: 'ADMIN' }) <= 1) {
      return fail(res, 'Cannot delete the last ADMIN account', 400);
    }
    await db.table('staff_users').removeById(existing.id);
    return ok(res, { deleted: existing.id });
  })
);

module.exports = router;