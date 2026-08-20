'use strict';

/**
 * Admin API - User & Security Management
 * (list, inspect, reset PIN, block accounts, adjust points, history)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, isPin, isPhone, toNumber, paginate } = require('../../utils/helpers');

const router = express.Router();

function sanitizeUser(user) {
  const { pin_hash, ...safe } = user;
  return safe;
}

router.get(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const q = String(req.query.q || '').toLowerCase();
    let rows = db.table('users').all().sort((a, b) => b.id - a.id);
    if (q) {
      rows = rows.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.phone_number.includes(q) ||
          String(u.id).includes(q)
      );
    }
    if (req.query.status) {
      rows = rows.filter((u) => u.status === req.query.status);
    }
    const page = paginate(rows, req.query.page, req.query.limit);
    return ok(res, { ...page, rows: page.rows.map(sanitizeUser) });
  })
);

router.get(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = db.table('users').findById(req.params.id);
    if (!user) return fail(res, 'User not found', 404);
    const history = db
      .table('transactions')
      .find({ user_id: user.id })
      .sort((a, b) => b.id - a.id);
    return ok(res, { user: sanitizeUser(user), history });
  })
);

router.put(
  '/:id/status',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { status } = req.body;
    if (!['active', 'banned'].includes(status)) {
      return fail(res, "status must be 'active' or 'banned'");
    }
    const updated = await db.table('users').updateById(req.params.id, { status });
    if (!updated) return fail(res, 'User not found', 404);
    return ok(res, sanitizeUser(updated));
  })
);

router.put(
  '/:id/pin',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { new_pin } = req.body;
    if (!isPin(new_pin)) return fail(res, 'new_pin must be 4-8 digits');
    const hash = await bcrypt.hash(new_pin, 10);
    const updated = await db.table('users').updateById(req.params.id, { pin_hash: hash });
    if (!updated) return fail(res, 'User not found', 404);
    return ok(res, { reset: true, user_id: updated.id });
  })
);

router.put(
  '/:id/points',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = db.table('users').findById(req.params.id);
    if (!user) return fail(res, 'User not found', 404);
    const delta = toNumber(req.body.delta, NaN);
    if (!Number.isFinite(delta)) return fail(res, 'delta (points adjustment) must be a number');
    const newBalance = Math.max(0, (Number(user.points_balance) || 0) + delta);
    const updated = await db.table('users').updateById(user.id, { points_balance: newBalance });
    return ok(res, { user_id: updated.id, points_balance: updated.points_balance, delta });
  })
);

router.put(
  '/:id/profile',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { username, phone_number } = req.body;
    const patch = {};
    if (username !== undefined) {
      if (String(username).trim().length < 3) return fail(res, 'Username must be at least 3 characters');
      patch.username = String(username).trim();
    }
    if (phone_number !== undefined) {
      if (!isPhone(phone_number)) return fail(res, 'Valid phone number (10-14 digits) is required');
      const clash = db.table('users').findOne({ phone_number });
      if (clash && Number(clash.id) !== Number(req.params.id)) {
        return fail(res, 'Phone number already in use by another account', 409);
      }
      patch.phone_number = phone_number;
    }
    if (Object.keys(patch).length === 0) return fail(res, 'Nothing to update');
    const updated = await db.table('users').updateById(req.params.id, patch);
    if (!updated) return fail(res, 'User not found', 404);
    return ok(res, sanitizeUser(updated));
  })
);

module.exports = router;