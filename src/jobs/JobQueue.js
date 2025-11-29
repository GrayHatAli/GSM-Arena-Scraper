import { getDatabase } from '../database/db.js';
import { logProgress } from '../utils/ScraperUtils.js';

const STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export class JobQueue {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.isRunning = false;
    this.pollInterval = 1000;
  }

  registerHandler(type, handler) {
    this.handlers[type] = handler;
  }

  mapJob(row) {
    if (!row) return null;
    return {
      ...row,
      payload: row.payload ? JSON.parse(row.payload) : {},
      result: row.result ? JSON.parse(row.result) : null
    };
  }

  getJobById(jobId) {
    const db = getDatabase();
    if (!db) return null;
    const row = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(jobId);
    return this.mapJob(row);
  }

  getJobs(filters = {}) {
    const db = getDatabase();
    if (!db) return [];
    
    let query = 'SELECT * FROM scrape_jobs WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.job_type) {
      query += ' AND job_type = ?';
      params.push(filters.job_type);
    }
    
    query += ' ORDER BY id DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const rows = db.prepare(query).all(...params);
    return rows.map(row => this.mapJob(row));
  }

  getActiveJobForPayload(type, payloadHash) {
    const db = getDatabase();
    if (!db) return null;
    const row = db
      .prepare(
        `SELECT * FROM scrape_jobs
         WHERE job_type = ? AND status IN ('pending', 'processing')
         AND payload = ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(type, payloadHash);
    return this.mapJob(row);
  }

  async enqueue(type, payload, options = {}) {
    const db = getDatabase();
    if (!db) {
      throw new Error('Database not initialized');
    }

    const payloadString = JSON.stringify(payload || {});
    const existing = options.deduplicate
      ? this.getActiveJobForPayload(type, payloadString)
      : null;
    if (existing) {
      return existing;
    }

    const stmt = db.prepare(
      `INSERT INTO scrape_jobs (job_type, payload, status, priority, run_at, max_attempts)
       VALUES (?, ?, 'pending', ?, ?, ?)`
    );

    const runAt = options.runAt || new Date().toISOString();
    const info = stmt.run(
      type,
      payloadString,
      options.priority || 0,
      runAt,
      options.maxAttempts || 3
    );

    const job = this.getJobById(info.lastInsertRowid);
    this.start();
    return job;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNext(0);
  }

  stop() {
    this.isRunning = false;
  }

  scheduleNext(delay) {
    setTimeout(() => this.processNext().catch(() => this.scheduleNext(this.pollInterval)), delay);
  }

  async processNext() {
    if (!this.isRunning) return;
    const db = getDatabase();
    if (!db) {
      this.scheduleNext(this.pollInterval);
      return;
    }

    const now = new Date().toISOString();
    const jobRow = db
      .prepare(
        `SELECT * FROM scrape_jobs
         WHERE status = 'pending' AND datetime(run_at) <= datetime(?)
         ORDER BY priority DESC, id ASC
         LIMIT 1`
      )
      .get(now);

    if (!jobRow) {
      this.scheduleNext(this.pollInterval);
      return;
    }

    db.prepare(
      `UPDATE scrape_jobs
       SET status = ?, started_at = ?, attempts = attempts + 1
       WHERE id = ?`
    ).run(STATUS.PROCESSING, now, jobRow.id);

    const handler = this.handlers[jobRow.job_type];
    if (!handler) {
      logProgress(`No handler registered for job type ${jobRow.job_type}`, 'error');
      this.failJob(jobRow.id, 'Missing handler');
      this.scheduleNext(100);
      return;
    }

    try {
      const payload = JSON.parse(jobRow.payload || '{}');
      const result = await handler(payload, this.mapJob(jobRow));
      const completedAt = new Date().toISOString();

      db.prepare(
        `UPDATE scrape_jobs
         SET status = ?, completed_at = ?, last_error = NULL, result = ?
         WHERE id = ?`
      ).run(STATUS.COMPLETED, completedAt, JSON.stringify(result || null), jobRow.id);

      this.scheduleNext(50);
    } catch (error) {
      const attempts = jobRow.attempts + 1;
      const maxAttempts = jobRow.max_attempts || 3;
      logProgress(`Job ${jobRow.id} failed (${attempts}/${maxAttempts}): ${error.message}`, 'warn');

      if (attempts >= maxAttempts) {
        this.failJob(jobRow.id, error.message);
        this.scheduleNext(50);
      } else {
        const nextRun = new Date(Date.now() + this.pollInterval * Math.pow(2, attempts)).toISOString();
        db.prepare(
          `UPDATE scrape_jobs
           SET status = ?, run_at = ?, last_error = ?
           WHERE id = ?`
        ).run(STATUS.PENDING, nextRun, error.message, jobRow.id);
        this.scheduleNext(this.pollInterval);
      }
    }
  }

  failJob(jobId, message) {
    const db = getDatabase();
    if (!db) return;
    db.prepare(
      `UPDATE scrape_jobs
       SET status = ?, completed_at = ?, last_error = ?
       WHERE id = ?`
    ).run(STATUS.FAILED, new Date().toISOString(), message, jobId);
  }
}

export const JOB_STATUS = STATUS;

