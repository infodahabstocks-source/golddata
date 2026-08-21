'use strict';

/**
 * Android API - Transactions
 * POST /api/v1/transactions/log  (logs completed USSD data purchases)
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { requireUser } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail } = require('../../utils/helpers');

const router = express.Router();

router.post(
  '/transactions/log',
  requireUser,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { package_id, amount_paid, sim_slot_used, ussd_executed, status } = req.body;

    const packageId = Number(package_id);
    const pkg = db.table('data_packages').findById(packageId);
    if (!pkg) {
      return fail(res, 'Unknown package_id', 404);
    }

    if (!['SUCCESS', 'FAILED'].includes(status)) {
      return fail(res, "status must be 'SUCCESS' or 'FAILED'");
    }
    if (sim_slot_used && !['SIM1', 'SIM2'].includes(sim_slot_used)) {
      return fail(res, "sim_slot_used must be 'SIM1' or 'SIM2'");
    }

    const amount = Number(amount_paid);
    if (!Number.isFinite(amount) || amount < 0) {
      return fail(res, 'Invalid amount_paid');
    }

    await db.table('transactions').insert({
      user_id: req.user.id,
      package_id: pkg.id,
      amount_paid: amount,
      sim_slot_used: sim_slot_used || null,
      ussd_executed: typeof ussd_executed === 'string' ? ussd_executed : '',
      status,
      kind: 'PURCHASE',
      points_awarded: 0,
      notes: pkg.package_name,
      timestamp: new Date().toISOString()
    });

    return ok(res, { logged: true }, 201);
  })
);

/** Delete a transaction log entry (admin/staff). */
router.delete(
  '/transactions/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const removed = await db.table('transactions').removeById(req.params.id);
    if (!removed) return fail(res, 'Transaction not found', 404);
    return ok(res, { deleted: removed.id });
  })
);

module.exports = router;