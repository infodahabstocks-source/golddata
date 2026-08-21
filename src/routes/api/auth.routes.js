'use strict';

/**
 * Android API - Authentication
 * POST /api/v1/auth/register  (JSON: username, phone_number, pin)
 * POST /api/v1/auth/login     (Phone & PIN)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../services/bootstrap');
const { signToken, requireUser } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, sanitizePhone, isPin } = require('../../utils/helpers');

const router = express.Router();

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { username, pin } = req.body;

    // CRITICAL: clean the incoming phone before validation/storage
    // (strips spaces, plus signs and any non-digit characters)
    const rawPhone = req.body.phone !== undefined ? req.body.phone : req.body.phone_number;
    const cleanPhone = sanitizePhone(rawPhone);

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return fail(res, 'Username must be at least 3 characters');
    }
    if (!cleanPhone || cleanPhone.length < 7 || cleanPhone.length > 12) {
      return fail(res, 'Fadlan gali lambar sax ah (7-9 god)', 400);
    }
    if (!isPin(pin)) {
      return fail(res, 'PIN must be 4-8 digits');
    }

    const db = getDb();
    const users = db.table('users');
    if (users.findOne({ phone_number: cleanPhone })) {
      return fail(res, 'An account with this phone number already exists', 409);
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const user = await users.insert({
      username: username.trim(),
      phone_number: cleanPhone,
      pin_hash: pinHash,
      profile_image_url: null,
      points_balance: 0,
      status: 'active',
      created_at: new Date().toISOString()
    });

    const token = signToken({ sub: user.id, role: 'user' });
    return ok(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        phone_number: user.phone_number,
        profile_image_url: user.profile_image_url,
        points_balance: user.points_balance,
        status: user.status
      }
    }, 201);
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { pin } = req.body;

    // CRITICAL: clean the incoming phone before the DB lookup
    const rawPhone = req.body.phone !== undefined ? req.body.phone : req.body.phone_number;
    const cleanPhone = sanitizePhone(rawPhone);

    if (!cleanPhone || !isPin(pin)) {
      return fail(res, 'Invalid phone number or PIN', 401);
    }
    const db = getDb();
    const user = db.table('users').findOne({ phone_number: cleanPhone });
    if (!user) return fail(res, 'Invalid phone number or PIN', 401);

    const match = await bcrypt.compare(pin, user.pin_hash);
    if (!match) return fail(res, 'Invalid phone number or PIN', 401);

    if (user.status === 'banned') {
      return fail(res, 'This account has been banned', 403);
    }

    const token = signToken({ sub: user.id, role: 'user' });
    return ok(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        phone_number: user.phone_number,
        profile_image_url: user.profile_image_url,
        points_balance: user.points_balance,
        status: user.status
      }
    });
  })
);

/** Convenience: current profile for the logged-in user. */
router.get(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    const user = req.user;
    return ok(res, {
      id: user.id,
      username: user.username,
      phone_number: user.phone_number,
      profile_image_url: user.profile_image_url,
      points_balance: user.points_balance,
      status: user.status,
      created_at: user.created_at
    });
  })
);

module.exports = router;