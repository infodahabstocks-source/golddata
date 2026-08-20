'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_USER: required('DB_USER'),
  DB_PASS: required('DB_PASS'),
  DB_NAME: required('DB_NAME'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',
  DATA_DIR: path.resolve(__dirname, '..', '..', process.env.DATA_DIR || './src/database'),
  UPLOAD_DIR: path.resolve(__dirname, '..', '..', process.env.UPLOAD_DIR || './public/uploads'),
  SEED_ADMIN_USERNAME: process.env.SEED_ADMIN_USERNAME || 'admin',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || 'Admin@123'
};
