'use strict';

/**
 * Admin API - Transaction Logs (real-time table + filters).
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, paginate, toNumber } = require('../../utils/helpers');

const router = express.Router();
const KINDS = ['PURCHASE', 'SPIN'];
const STATUSES = ['SUCCESS', 'FAILED'];

router.get(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const users = new Map(db.table('users').all().map((u) => [u.id, u]));

    let rows = db.table('transactions').all().sort((a, b) => b.id - a.id);
    if (req.query.status) rows = rows.filter((t) => t.status === req.query.status);
    if (req.query.kind) rows = rows.filter((t) => t.kind === req.query.kind);
    if (req.query.user_id) rows = rows.filter((t) => t.user_id === Number(req.query.user_id));
    if (req.query.date) {
      const d = String(req.query.date);
      rows = rows.filter((t) => String(t.timestamp || '').slice(0, 10) === d);
    }
    if (req.query.q) {
      const q = String(req.query.q).toLowerCase();
      rows = rows.filter((t) => {
        const user = users.get(t.user_id);
        return (
          String(t.id).includes(q) ||
          (user && (user.username.toLowerCase().includes(q) || user.phone_number.includes(q)))
        );
      });
    }

    const page = paginate(rows, req.query.page, req.query.limit);
    return ok(res, {
      ...page,
      rows: page.rows.map((t) => ({
        ...t,
        username: users.get(t.user_id)?.username || null,
        phone_number: users.get(t.user_id)?.phone_number || null
      }))
    });
  })
);

router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const removed = await db.table('transactions').removeById(req.params.id);
    if (!removed) return fail(res, 'Transaction not found', 404);
    return ok(res, { deleted: removed.id });
  })
);

/** Manually log a transaction entry from the admin console. */
router.post(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = db.table('users').findById(req.body.user_id);
    if (!user) return fail(res, 'user_id does not match any account', 404);
    if (!KINDS.includes(req.body.kind)) return fail(res, `kind must be one of ${KINDS.join(', ')}`);
    const status = STATUSES.includes(req.body.status) ? req.body.status : 'SUCCESS';
    const amount = toNumber(req.body.amount_paid, 0);
    if (amount < 0) return fail(res, 'amount_paid cannot be negative');
    const points = toNumber(req.body.points_awarded, 0);
    if (points < 0) return fail(res, 'points_awarded cannot be negative');

    const tx = await db.table('transactions').insert({
      user_id: user.id,
      package_id: req.body.package_id !== undefined && req.body.package_id !== '' ? toNumber(req.body.package_id, null) : null,
      amount_paid: amount,
      status,
      kind: req.body.kind,
      points_awarded: points,
      notes: req.body.notes ? String(req.body.notes).trim() : '',
      sim_slot_used: req.body.sim_slot_used ? String(req.body.sim_slot_used).trim() : null,
      ussd_executed: req.body.ussd_executed ? String(req.body.ussd_executed).trim() : null,
      timestamp: new Date().toISOString()
    });
    return ok(res, tx, 201);
  })
);

/** Edit an existing transaction record (status, amounts, notes...). */
router.put(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('transactions').findById(req.params.id);
    if (!existing) return fail(res, 'Transaction not found', 404);

    const patch = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return fail(res, `status must be one of ${STATUSES.join(', ')}`);
      patch.status = req.body.status;
    }
    if (req.body.kind !== undefined) {
      if (!KINDS.includes(req.body.kind)) return fail(res, `kind must be one of ${KINDS.join(', ')}`);
      patch.kind = req.body.kind;
    }
    if (req.body.amount_paid !== undefined) {
      const amt = Number(req.body.amount_paid);
      if (!Number.isFinite(amt) || amt < 0) return fail(res, 'amount_paid must be a positive number');
      patch.amount_paid = amt;
    }
    if (req.body.points_awarded !== undefined) {
      const pts = Number(req.body.points_awarded);
      if (!Number.isFinite(pts) || pts < 0) return fail(res, 'points_awarded must be a positive number');
      patch.points_awarded = pts;
    }
    if (req.body.notes !== undefined) patch.notes = String(req.body.notes).trim();
    if (req.body.sim_slot_used !== undefined) patch.sim_slot_used = String(req.body.sim_slot_used).trim() || null;
    if (req.body.ussd_executed !== undefined) patch.ussd_executed = String(req.body.ussd_executed).trim() || null;
    if (Object.keys(patch).length === 0) return fail(res, 'Nothing to update');

    const updated = await db.table('transactions').updateById(existing.id, patch);
    return ok(res, updated);
  })
);

module.exports = router;