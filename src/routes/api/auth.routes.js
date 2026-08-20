'use strict';

/**
 * Android API - Authentication
 * POST /api/v1/auth/register  (multipart: image, username, phone, PIN)
 * POST /api/v1/auth/login     (Phone & PIN)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../../services/bootstrap');
const { signToken, requireUser } = require('../../middleware/auth');
const { uploadProfileImage } = require('../../middleware/upload');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ok, fail, isPhone, isPin } = require('../../utils/helpers');

const router = express.Router();

router.post(
  '/register',
  uploadProfileImage.single('image'),
  asyncHandler(async (req, res) => {
    const { username, phone, pin } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return fail(res, 'Username must be at least 3 characters');
    }
    if (!isPhone(phone)) {
      return fail(res, 'Valid phone number (10-14 digits) is required');
    }
    if (!isPin(pin)) {
      return fail(res, 'PIN must be 4-8 digits');
    }

    const db = getDb();
    const users = db.table('users');
    if (users.findOne({ phone_number: phone })) {
      return fail(res, 'An account with this phone number already exists', 409);
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const user = await users.insert({
      username: username.trim(),
      phone_number: phone,
      pin_hash: pinHash,
      profile_image_url: req.file ? `/uploads/profiles/${req.file.filename}` : null,
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
    const { phone, pin } = req.body;
    if (!isPhone(phone) || !isPin(pin)) {
      return fail(res, 'Valid phone and 4-8 digit PIN are required');
    }
    const db = getDb();
    const user = db.table('users').findOne({ phone_number: phone });
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