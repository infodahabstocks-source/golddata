'use strict';

/**
 * Android API - Dashboard
 * GET /api/v1/dashboard  (prices, banners, app settings, user stats)
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireUser } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok } = require('../../utils/helpers');

const router = express.Router();

router.get(
  '/dashboard',
  requireUser,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const now = Date.now();

    const packages = db
      .table('data_packages')
      .find({ is_active: true })
      .map(({ id, package_name, data_amount, price, ussd_code_template }) => ({
        id,
        package_name,
        data_amount,
        price,
        ussd_code_template
      }));

    const banners = db
      .table('banner_ads')
      .find({ is_active: true })
      .filter((b) => {
        const withinStart = !b.start_at || Date.parse(b.start_at) <= now;
        const withinEnd = !b.end_at || Date.parse(b.end_at) >= now;
        return withinStart && withinEnd;
      })
      .map(({ id, banner_title, image_url, target_action }) => ({
        id,
        banner_title,
        image_url,
        target_action
      }));

    const settings = db.table('app_control_settings').findOne({ id: 1 });

    const user = req.user;
    const txCount = db.table('transactions').count({ user_id: user.id });

    return ok(res, {
      prices: packages,
      banners,
      settings: settings
        ? {
            app_status: settings.app_status,
            min_required_version: settings.min_required_version,
            daily_spin_limit: settings.daily_spin_limit,
            auto_reminder_hours: settings.auto_reminder_hours
          }
        : null,
      user_stats: {
        points_balance: user.points_balance,
        transactions_count: txCount
      }
    });
  })
);

module.exports = router;