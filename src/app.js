'use strict';

const express = require('express');
const path = require('path');
const cors = require('cors');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');

// Enable CORS for all origins (handles OPTIONS preflight automatically)
app.use(cors());

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// Static: admin web-app + uploaded media
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------
// Android App API v1 - Core & Health
// ---------------------------------------------------------------
const v1Router = express.Router();
v1Router.get('/health', (req, res) => {
  return res.status(200).json({
    status: "ONLINE",
    database: "CONNECTED",
    db_name: process.env.DB_NAME || "goldatadb",
    timestamp: Math.floor(Date.now() / 1000)
  });
});
app.use('/api/v1', v1Router);

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
app.use('/api/admin/db', require('./routes/admin/db.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
