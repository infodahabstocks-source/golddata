'use strict';

/**
 * Multer configuration for file uploads (profile images, banner ads).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');

const ALLOWED = /\.(png|jpe?g|webp|gif)$/i;

function makeStorage(subdir) {
  const dir = path.join(env.UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      cb(null, name);
    }
  });
}

function fileFilter(req, file, cb) {
  if (!ALLOWED.test(file.originalname) || !file.mimetype.startsWith('image/')) {
    const err = new Error('Only image files (png, jpg, jpeg, webp, gif) are allowed');
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
}

const uploadProfileImage = multer({
  storage: makeStorage('profiles'),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadBannerImage = multer({
  storage: makeStorage('banners'),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = { uploadProfileImage, uploadBannerImage, UPLOAD_DIR: env.UPLOAD_DIR };