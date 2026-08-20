'use strict';

/** Central error handler + 404. */

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Internal server error' });
}

/** Wrap async route handlers so rejections reach the error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { notFound, errorHandler, asyncHandler };