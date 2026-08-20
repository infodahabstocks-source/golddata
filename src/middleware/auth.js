'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { getDb } = require('../services/bootstrap');

function signToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

/**
 * Require a valid Bearer token for a given role.
 * role: 'staff' | 'user'
 */
function requireAuth(role) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    try {
      const payload = verifyToken(token);
      if (payload.role !== role) {
        return res.status(403).json({ error: 'Forbidden: wrong role for this route' });
      }
      const db = getDb();
      const table = role === 'staff' ? db.table('staff_users') : db.table('users');
      const entity = table.findById(payload.sub);
      if (!entity) {
        return res.status(401).json({ error: 'Account no longer exists' });
      }
      if (entity.is_active === false || entity.status === 'banned') {
        return res.status(403).json({ error: 'Account is not active' });
      }
      req.auth = { token, payload };
      req[role] = entity;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

module.exports = {
  signToken,
  verifyToken,
  requireStaff: requireAuth('staff'),
  requireUser: requireAuth('user'),
  requireAdmin: (req, res, next) => {
    if (!req.staff || req.staff.role !== 'ADMIN') {
      return res.status(403).json({ error: 'ADMIN role required' });
    }
    next();
  }
};