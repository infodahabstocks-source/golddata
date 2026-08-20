'use strict';

/**
 * Admin API - Transaction Logs (real-time table + filters).
 */

const express = require('express');
const { getDb } = require('../../services/bootstrap');
const { requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, paginate } = require('../../utils/helpers');

const router = express.Router();

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

module.exports = router;