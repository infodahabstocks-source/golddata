'use strict';

/** Shared helpers: validation, pagination, sanitizers. */

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

function isPhone(phone) {
  return typeof phone === 'string' && /^[0-9]{10,14}$/.test(phone);
}

function isPin(pin) {
  return typeof pin === 'string' && /^[0-9]{4,8}$/.test(pin);
}

function isBoolean(v) {
  return v === true || v === false || v === 'true' || v === 'false' || v === 0 || v === 1;
}

function toBoolean(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Simple pagination slice of an array. */
function paginate(list, page = 1, limit = 50) {
  const p = Math.max(1, toNumber(page, 1));
  const l = Math.min(200, Math.max(1, toNumber(limit, 50)));
  const start = (p - 1) * l;
  return {
    rows: list.slice(start, start + l),
    page: p,
    limit: l,
    total: list.length,
    pages: Math.ceil(list.length / l) || 1
  };
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

module.exports = { ok, fail, isPhone, isPin, isBoolean, toBoolean, toNumber, paginate, dayKey, todayRange };