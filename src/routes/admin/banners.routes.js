'use strict';

/**
 * Admin API - Banner Ads Manager (upload, schedule, target actions).
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { uploadBannerImage } = require('../../middleware/upload');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, toBoolean } = require('../../utils/helpers');

const router = express.Router();

function isIsoOrEmpty(v) {
  return v === null || v === undefined || v === '' || !Number.isNaN(Date.parse(v));
}

router.get(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .table('banner_ads')
      .all()
      .sort((a, b) => b.id - a.id);
    return ok(res, rows);
  })
);

router.post(
  '/',
  requireStaff,
  uploadBannerImage.single('image'),
  asyncHandler(async (req, res) => {
    const { banner_title, target_action, is_active, start_at, end_at } = req.body;
    if (!banner_title) return fail(res, 'banner_title is required');
    if (!target_action) return fail(res, 'target_action (URL or app screen) is required');
    if (!req.file) return fail(res, 'A banner image is required (WEBP recommended)');
    if (!isIsoOrEmpty(start_at) || !isIsoOrEmpty(end_at)) {
      return fail(res, 'start_at / end_at must be ISO date strings or empty');
    }

    const banner = await getDb().table('banner_ads').insert({
      banner_title: String(banner_title).trim(),
      image_url: `/uploads/banners/${req.file.filename}`,
      target_action: String(target_action).trim(),
      is_active: is_active === undefined ? true : toBoolean(is_active),
      start_at: start_at || null,
      end_at: end_at || null,
      created_at: new Date().toISOString()
    });
    return ok(res, banner, 201);
  })
);

router.put(
  '/:id',
  requireStaff,
  uploadBannerImage.single('image'),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('banner_ads').findById(req.params.id);
    if (!existing) return fail(res, 'Banner not found', 404);
    if (!isIsoOrEmpty(req.body.start_at) || !isIsoOrEmpty(req.body.end_at)) {
      return fail(res, 'start_at / end_at must be ISO date strings or empty');
    }

    const patch = {};
    if (req.body.banner_title !== undefined) patch.banner_title = String(req.body.banner_title).trim();
    if (req.body.target_action !== undefined) patch.target_action = String(req.body.target_action).trim();
    if (req.body.is_active !== undefined) patch.is_active = toBoolean(req.body.is_active);
    if (req.body.start_at !== undefined) patch.start_at = req.body.start_at || null;
    if (req.body.end_at !== undefined) patch.end_at = req.body.end_at || null;
    if (req.file) {
      patch.image_url = `/uploads/banners/${req.file.filename}`;
      const oldPath = path.join(__dirname, '..', '..', '..', 'public', existing.image_url);
      fs.unlink(oldPath, () => {});
    }

    const updated = await db.table('banner_ads').updateById(existing.id, patch);
    return ok(res, updated);
  })
);

router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const existing = db.table('banner_ads').findById(req.params.id);
    if (!existing) return fail(res, 'Banner not found', 404);
    await db.table('banner_ads').removeById(existing.id);
    const oldPath = path.join(__dirname, '..', '..', '..', 'public', existing.image_url);
    fs.unlink(oldPath, () => {});
    return ok(res, { deleted: existing.id });
  })
);

module.exports = router;