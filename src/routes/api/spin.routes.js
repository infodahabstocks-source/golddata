'use strict';

/**
 * Android API - Spin Wheel
 * GET  /api/v1/spin/config
 * POST /api/v1/spin/claim
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireUser } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, dayKey } = require('../../utils/helpers');

const router = express.Router();

router.get(
  '/spin/config',
  requireUser,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const segments = db
      .table('daily_spin_config')
      .find({ is_active: true })
      .sort((a, b) => (a.sort_order || a.id) - (b.sort_order || b.id))
      .map(({ id, label, reward_type, reward_value, win_probability }) => ({
        id,
        label,
        reward_type,
        reward_value,
        win_probability
      }));
    const settings = db.table('app_control_settings').findOne({ id: 1 });
    return ok(res, {
      segments,
      daily_spin_limit: settings ? settings.daily_spin_limit : 3
    });
  })
);

/** Server-validated spin outcome. */
router.post(
  '/spin/claim',
  requireUser,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = req.user;
    const settings = db.table('app_control_settings').findOne({ id: 1 });

    if (settings && settings.app_status === 'MAINTENANCE') {
      return fail(res, 'App is under maintenance, please try again later', 503);
    }

    const limit = settings ? settings.daily_spin_limit : 3;
    const today = dayKey();
    const spinsToday = db.table('transactions').count((t) => {
      return t.user_id === user.id && t.kind === 'SPIN' && dayKey(new Date(t.timestamp)) === today;
    });
    if (spinsToday >= limit) {
      return fail(res, `Daily spin limit (${limit}) reached`, 429);
    }

    const segments = db
      .table('daily_spin_config')
      .find({ is_active: true })
      .sort((a, b) => (a.sort_order || a.id) - (b.sort_order || b.id));

    const roll = Math.random();
    let acc = 0;
    let winner = null;
    for (const seg of segments) {
      acc += Number(seg.win_probability) || 0;
      if (roll < acc) {
        winner = seg;
        break;
      }
    }
    if (!winner) {
      winner = segments.find((s) => s.reward_type === 'NONE') || segments[segments.length - 1] || null;
    }
    if (!winner) {
      return fail(res, 'No active spin segments configured', 503);
    }

    let pointsAdded = 0;
    if (winner.reward_type === 'POINTS') {
      pointsAdded = Number(winner.reward_value) || 0;
      await db.table('users').updateById(user.id, {
        points_balance: (user.points_balance || 0) + pointsAdded
      });
    }

    await db.table('transactions').insert({
      user_id: user.id,
      package_id: null,
      amount_paid: 0,
      sim_slot_used: null,
      ussd_executed: '',
      status: 'SUCCESS',
      kind: 'SPIN',
      points_awarded: pointsAdded,
      notes: `${winner.label} (${winner.reward_type})`,
      timestamp: new Date().toISOString()
    });

    return ok(res, {
      segment: {
        id: winner.id,
        label: winner.label,
        reward_type: winner.reward_type,
        reward_value: winner.reward_value
      },
      points_added: pointsAdded,
      points_balance: (user.points_balance || 0) + pointsAdded,
      spins_remaining: Math.max(0, limit - spinsToday - 1)
    });
  })
);

module.exports = router;