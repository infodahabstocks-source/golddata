'use strict';

/**
 * Admin API - Authentication (Staff/Admin)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../services/bootstrap');
const { signToken, requireStaff } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail } = require('../../utils/helpers');

const router = express.Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return fail(res, 'Username and password are required');
    }
    const db = getDb();
    const staff = db.table('staff_users').findOne({ username: String(username).trim() });
    if (!staff) return fail(res, 'Invalid username or password', 401);

    const match = await bcrypt.compare(password, staff.password_hash);
    if (!match) return fail(res, 'Invalid username or password', 401);

    if (staff.is_active === false) {
      return fail(res, 'This staff account is disabled', 403);
    }

    const token = signToken({ sub: staff.id, role: 'staff' });
    return ok(res, {
      token,
      staff: {
        id: staff.id,
        username: staff.username,
        role: staff.role,
        full_name: staff.full_name
      }
    });
  })
);

router.get(
  '/me',
  requireStaff,
  asyncHandler(async (req, res) => {
    const s = req.staff;
    return ok(res, {
      id: s.id,
      username: s.username,
      role: s.role,
      full_name: s.full_name,
      is_active: s.is_active
    });
  })
);

router.put(
  '/password',
  requireStaff,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || String(new_password).length < 8) {
      return fail(res, 'current_password and new_password (min 8 chars) are required');
    }
    const staff = req.staff;
    const match = await bcrypt.compare(current_password, staff.password_hash);
    if (!match) return fail(res, 'Current password is incorrect', 401);

    const hash = await bcrypt.hash(String(new_password), 10);
    await getDb().table('staff_users').updateById(staff.id, { password_hash: hash });
    return ok(res, { changed: true });
  })
);

module.exports = router;