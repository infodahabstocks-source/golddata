'use strict';

const express = require('express');
const path = require('path');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// Static: admin web-app + uploaded media
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------
// Android App API (Bearer token required except register/login)
// ---------------------------------------------------------------
app.use('/api/v1/auth', require('./routes/api/auth.routes'));
app.use('/api/v1', require('./routes/api/dashboard.routes'));
app.use('/api/v1', require('./routes/api/spin.routes'));
app.use('/api/v1', require('./routes/api/transactions.routes'));

// ---------------------------------------------------------------
// Admin Web-App API (staff JWT required)
// ---------------------------------------------------------------
app.use('/api/admin/auth', require('./routes/admin/auth.routes'));
app.use('/api/admin/dashboard', require('./routes/admin/dashboard.routes'));
app.use('/api/admin/packages', require('./routes/admin/packages.routes'));
app.use('/api/admin/spin', require('./routes/admin/spin.routes'));
app.use('/api/admin/banners', require('./routes/admin/banners.routes'));
app.use('/api/admin/users', require('./routes/admin/users.routes'));
app.use('/api/admin/transactions', require('./routes/admin/transactions.routes'));
app.use('/api/admin/settings', require('./routes/admin/settings.routes'));
app.use('/api/admin/database', require('./routes/admin/database.routes'));

// ---------------------------------------------------------------
// Health check
// ---------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'goldatadb-backend', time: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;