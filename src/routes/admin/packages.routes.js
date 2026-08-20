'use strict';

/**
 * Admin API - Data Packages Manager (CRUD + real-time USSD updates).
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, toBoolean } = require('../../utils/helpers');

const router = express.Router();

router.get(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .table('data_packages')
      .all()
      .sort((a, b) => a.id - b.id);
    return ok(res, rows);
  })
);

router.get(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const pkg = getDb().table('data_packages').findById(req.params.id);
    if (!pkg) return fail(res, 'Package not found', 404);
    return ok(res, pkg);
  })
);

router.post(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const { package_name, data_amount, price, ussd_code_template, is_active } = req.body;
    if (!package_name || !data_amount || !ussd_code_template) {
      return fail(res, 'package_name, data_amount and ussd_code_template are required');
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return fail(res, 'A valid price is required');
    }
    const pkg = await getDb().table('data_packages').insert({
      package_name: String(package_name).trim(),
      data_amount: String(data_amount).trim(),
      price: priceNum,
      ussd_code_template: String(ussd_code_template).trim(),
      is_active: is_active === undefined ? true : toBoolean(is_active),
      created_at: new Date().toISOString()
    });
    return ok(res, pkg, 201);
  })
);

router.put(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('data_packages').findById(req.params.id);
    if (!existing) return fail(res, 'Package not found', 404);

    const patch = {};
    if (req.body.package_name !== undefined) patch.package_name = String(req.body.package_name).trim();
    if (req.body.data_amount !== undefined) patch.data_amount = String(req.body.data_amount).trim();
    if (req.body.price !== undefined) {
      const priceNum = Number(req.body.price);
      if (!Number.isFinite(priceNum) || priceNum < 0) return fail(res, 'A valid price is required');
      patch.price = priceNum;
    }
    if (req.body.ussd_code_template !== undefined) {
      patch.ussd_code_template = String(req.body.ussd_code_template).trim();
    }
    if (req.body.is_active !== undefined) patch.is_active = toBoolean(req.body.is_active);

    const updated = await db.table('data_packages').updateById(existing.id, patch);
    return ok(res, updated);
  })
);

router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const removed = await db.table('data_packages').removeById(req.params.id);
    if (!removed) return fail(res, 'Package not found', 404);
    return ok(res, { deleted: removed.id });
  })
);

module.exports = router;