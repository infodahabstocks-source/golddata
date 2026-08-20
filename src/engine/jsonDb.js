'use strict';

/**
 * GoldData Custom JSON Database Engine
 * ------------------------------------
 * A file-based, ORM-like database driver that stores each "table" as a
 * structured .json file inside a protected /database folder.
 *
 * Features:
 *  - Connection authentication against DB_USER / DB_PASS / DB_NAME
 *  - CRUD operations per table (goldatadb_<table>.json)
 *  - Atomic writes (temp file + rename) to prevent corruption
 *  - Serialized write queue (in-process file locking) for concurrency
 *  - In-memory read cache for fast reads
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONNECT_ERROR = 'Access denied: invalid JSON database credentials';

class JsonDb {
  /**
   * @param {{dataDir:string, dbName:string, user:string, pass:string}} options
   */
  constructor(options) {
    this.dataDir = options.dataDir;
    this.dbName = options.dbName;
    this.user = options.user;
    this.pass = options.pass;
    this.tables = new Map();
    this._writeQueue = Promise.resolve();
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  /**
   * Open a "connection" to the JSON database. Fails unless the supplied
   * credentials match the environment configuration.
   */
  static connect({ dataDir, dbName, user, pass }) {
    if (!user || !pass || !dbName) {
      throw new Error(CONNECT_ERROR);
    }
    if (user !== process.env.DB_USER || pass !== process.env.DB_PASS || dbName !== process.env.DB_NAME) {
      throw new Error(CONNECT_ERROR);
    }
    return new JsonDb({ dataDir, dbName, user, pass });
  }

  /** Get (or create) a table wrapper. */
  table(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Table(this, name));
    }
    return this.tables.get(name);
  }

  fileFor(name) {
    return path.join(this.dataDir, `${this.dbName}_${name}.json`);
  }

  listFiles() {
    return fs.readdirSync(this.dataDir).filter((f) => f.endsWith('.json'));
  }

  /** Serialize a mutation so concurrent writes never interleave. */
  enqueue(worker) {
    const next = this._writeQueue.then(worker, worker);
    this._writeQueue = next.catch(() => {});
    return next;
  }
}

class Table {
  constructor(db, name) {
    this.db = db;
    this.name = name;
    this._rows = null;
  }

  file() {
    return this.db.fileFor(this.name);
  }

  /** Load rows from disk (cached in memory afterwards). */
  _load() {
    if (this._rows !== null) return this._rows;
    try {
      const raw = fs.readFileSync(this.file(), 'utf8');
      const parsed = JSON.parse(raw);
      this._rows = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code === 'ENOENT') {
        this._rows = [];
      } else {
        throw err;
      }
    }
    return this._rows;
  }

  _nextId() {
    const rows = this._load();
    return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
  }

  /** Atomic persist: write temp file, then rename over the target.
   *  If the platform (e.g. OneDrive sync) blocks the rename, retry briefly
   *  and fall back to a direct write so the service never deadlocks. */
  async _persist() {
    const rows = this._load();
    const payload = JSON.stringify(rows, null, 2);
    const target = this.file();
    const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.promises.writeFile(tmp, payload, 'utf8');
    try {
      await fs.promises.rename(tmp, target);
    } catch (err) {
      let renamed = false;
      for (let i = 0; i < 3 && !renamed; i++) {
        await new Promise((r) => setTimeout(r, 120));
        try {
          await fs.promises.rename(tmp, target);
          renamed = true;
        } catch (_) { /* keep retrying */ }
      }
      if (!renamed) {
        await fs.promises.writeFile(target, payload, 'utf8');
        await fs.promises.unlink(tmp).catch(() => {});
      }
    }
  }

  _matches(row, query) {
    if (typeof query === 'function') return Boolean(query(row));
    return Object.keys(query).every((key) => row[key] === query[key]);
  }

  // ---------------------------------------------------------------
  // READ operations
  // ---------------------------------------------------------------

  find(query = {}) {
    const rows = this._load();
    return rows.filter((row) => this._matches(row, query)).map((row) => ({ ...row }));
  }

  findOne(query = {}) {
    const rows = this._load();
    const row = rows.find((r) => this._matches(r, query));
    return row ? { ...row } : null;
  }

  findById(id) {
    const row = this._load().find((r) => Number(r.id) === Number(id));
    return row ? { ...row } : null;
  }

  count(query = {}) {
    const rows = this._load();
    if (Object.keys(query).length === 0 && typeof query !== 'function') return rows.length;
    return rows.filter((row) => this._matches(row, query)).length;
  }

  all() {
    return this._load().map((row) => ({ ...row }));
  }

  // ---------------------------------------------------------------
  // WRITE operations (all serialized + atomic)
  // ---------------------------------------------------------------

  /** Insert a document, auto-assigning the next numeric id. */
  insert(doc) {
    return this.db.enqueue(async () => {
      const rows = this._load();
      const row = { id: this._nextId(), ...doc };
      rows.push(row);
      await this._persist();
      return { ...row };
    });
  }

  /** Update every row matching the query; returns the updated rows. */
  update(query, patch) {
    return this.db.enqueue(async () => {
      const rows = this._load();
      const updated = [];
      for (const row of rows) {
        if (this._matches(row, query)) {
          Object.assign(row, patch);
          updated.push(row);
        }
      }
      if (updated.length) await this._persist();
      return updated.map((row) => ({ ...row }));
    });
  }

  updateById(id, patch) {
    return this.db.enqueue(async () => {
      const rows = this._load();
      const row = rows.find((r) => Number(r.id) === Number(id));
      if (!row) return null;
      Object.assign(row, patch);
      await this._persist();
      return { ...row };
    });
  }

  /** Remove every row matching the query; returns the removed rows. */
  remove(query) {
    return this.db.enqueue(async () => {
      const rows = this._load();
      const removed = [];
      let i = rows.length;
      while (i--) {
        if (this._matches(rows[i], query)) {
          removed.push(rows.splice(i, 1)[0]);
        }
      }
      if (removed.length) await this._persist();
      return removed.map((row) => ({ ...row }));
    });
  }

  removeById(id) {
    return this.db.enqueue(async () => {
      const rows = this._load();
      const idx = rows.findIndex((r) => Number(r.id) === Number(id));
      if (idx === -1) return null;
      const [row] = rows.splice(idx, 1);
      await this._persist();
      return { ...row };
    });
  }

  /** Replace the whole table contents. */
  replaceAll(docs) {
    return this.db.enqueue(async () => {
      this._rows = docs.map((d) => ({ ...d }));
      await this._persist();
      return this.all();
    });
  }
}

module.exports = { JsonDb, Table };