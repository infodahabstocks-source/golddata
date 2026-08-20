'use strict';

/**
 * Admin API - Overview Dashboard analytics.
 */

const express = require('express');
const fs = require('fs');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, dayKey, todayRange } = require('../../utils/helpers');

const router = express.Router();
const bootTime = Date.now();

router.get(
  '/stats',
  requireStaff,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const users = db.table('users').all();
    const packages = db.table('data_packages').all();
    const transactions = db.table('transactions').all().sort((a, b) => b.id - a.id);
    const spins = transactions.filter((t) => t.kind === 'SPIN');
    const purchases = transactions.filter((t) => t.kind === 'PURCHASE' && t.status === 'SUCCESS');

    const totalRevenue = purchases.reduce((s, t) => s + (Number(t.amount_paid) || 0), 0);
    const pointsIssued =
      users.reduce((s, u) => s + (Number(u.points_balance) || 0), 0) +
      spins.reduce((s, t) => s + (Number(t.points_awarded) || 0), 0);

    const { start, end } = todayRange();
    const todayTx = transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
    const todayRevenue = todayTx
      .filter((t) => t.kind === 'PURCHASE' && t.status === 'SUCCESS')
      .reduce((s, t) => s + (Number(t.amount_paid) || 0), 0);

    // Last 7 days of sales
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const dayTx = purchases.filter((t) => dayKey(new Date(t.timestamp)) === key);
      days.push({
        date: key,
        revenue: dayTx.reduce((s, t) => s + (Number(t.amount_paid) || 0), 0),
        count: dayTx.length
      });
    }

    // Package sales breakdown
    const breakdownMap = new Map();
    for (const t of purchases) {
      const name = t.notes || `Package #${t.package_id}`;
      const entry = breakdownMap.get(name) || { package_name: name, count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += Number(t.amount_paid) || 0;
      breakdownMap.set(name, entry);
    }
    const packageBreakdown = Array.from(breakdownMap.values()).sort((a, b) => b.revenue - a.revenue);

    // System health
    let dbWritable = true;
    try {
      const probe = `${db.dataDir}/.health-probe`;
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
    } catch {
      dbWritable = false;
    }

    return ok(res, {
      totals: {
        users: users.length,
        active_users: users.filter((u) => u.status === 'active').length,
        banned_users: users.filter((u) => u.status === 'banned').length,
        packages: packages.length,
        active_packages: packages.filter((p) => p.is_active).length,
        transactions: transactions.length,
        purchases: purchases.length,
        spins: spins.length,
        total_revenue: totalRevenue,
        today_revenue: todayRevenue,
        today_transactions: todayTx.length,
        points_issued: pointsIssued
      },
      sales_by_day: days,
      package_breakdown: packageBreakdown,
      recent_transactions: transactions.slice(0, 8),
      health: {
        status: dbWritable ? 'ONLINE' : 'DEGRADED',
        uptime_seconds: Math.floor((Date.now() - bootTime) / 1000),
        db_writable: dbWritable,
        db_files: db.listFiles().length,
        engine: 'JSON'
      }
    });
  })
);

module.exports = router;