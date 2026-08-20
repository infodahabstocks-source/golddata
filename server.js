'use strict';

/**
 * GoldData Backend - Entry point.
 * Boots the JSON database (authenticated + seeded) and starts the web server.
 */

const env = require('./src/config/env');
const { initDatabase } = require('./src/services/bootstrap');
const app = require('./src/app');

async function main() {
  const db = await initDatabase();
  console.log(`[db] Connected to "${db.dbName}" as "${db.user}" -> ${db.dataDir}`);
  console.log(`[db] Tables: ${db.listFiles().join(', ')}`);

  app.listen(env.PORT, () => {
    console.log(`[server] GoldData backend running at http://localhost:${env.PORT}`);
    console.log(`[server] Admin web-app:  http://localhost:${env.PORT}/`);
    console.log(`[server] Android API:    http://localhost:${env.PORT}/api/v1`);
  });
}

main().catch((err) => {
  console.error('[fatal] Failed to start GoldData backend:');
  console.error(err.message || err);
  process.exit(1);
});