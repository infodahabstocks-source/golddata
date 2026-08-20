'use strict';

/**
 * Admin API - Spin Wheel & Rewards Manager.
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, toBoolean, toNumber } = require('../../utils/helpers');

const router = express.Router();
const REWARD_TYPES = ['DATA', 'POINTS', 'NONE'];

function validateSegment(body) {
  if (!body.label) return 'label is required';
  if (!REWARD_TYPES.includes(body.reward_type)) return `reward_type must be one of ${REWARD_TYPES.join(', ')}`;
  const prob = Number(body.win_probability);
  if (!Number.isFinite(prob) || prob < 0 || prob > 1) return 'win_probability must be between 0.0 and 1.0';
  if (body.reward_type !== 'NONE') {
    const value = Number(body.reward_value);
    if (!Number.isFinite(value) || value < 0) return 'reward_value must be a positive number';
  }
  return null;
}

router.get(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .table('daily_spin_config')
      .all()
      .sort((a, b) => (a.sort_order || a.id) - (b.sort_order || b.id));
    return ok(res, rows);
  })
);

router.post(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const err = validateSegment(req.body);
    if (err) return fail(res, err);
    const seg = await getDb().table('daily_spin_config').insert({
      label: String(req.body.label).trim(),
      reward_type: req.body.reward_type,
      reward_value: req.body.reward_type === 'NONE' ? 0 : Number(req.body.reward_value),
      win_probability: Number(req.body.win_probability),
      is_active: req.body.is_active === undefined ? true : toBoolean(req.body.is_active),
      sort_order: toNumber(req.body.sort_order, 0)
    });
    return ok(res, seg, 201);
  })
);

router.put(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('daily_spin_config').findById(req.params.id);
    if (!existing) return fail(res, 'Segment not found', 404);

    const merged = { ...existing, ...req.body };
    const err = validateSegment(merged);
    if (err) return fail(res, err);

    const patch = {
      label: String(merged.label).trim(),
      reward_type: merged.reward_type,
      reward_value: merged.reward_type === 'NONE' ? 0 : Number(merged.reward_value),
      win_probability: Number(merged.win_probability)
    };
    if (merged.is_active !== undefined) patch.is_active = toBoolean(merged.is_active);
    if (merged.sort_order !== undefined) patch.sort_order = toNumber(merged.sort_order, 0);

    const updated = await db.table('daily_spin_config').updateById(existing.id, patch);
    return ok(res, updated);
  })
);

router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const removed = await db.table('daily_spin_config').removeById(req.params.id);
    if (!removed) return fail(res, 'Segment not found', 404);
    return ok(res, { deleted: removed.id });
  })
);

module.exports = router;