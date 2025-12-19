/**
 * Database schema definitions
 */

export const SCHEMA = {
  brands: `
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      url TEXT,
      is_active INTEGER DEFAULT 1,
      estimated_models INTEGER DEFAULT 0,
      last_scraped_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
    CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active);
  `,

  models: `
    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_id INTEGER NOT NULL,
      model_name TEXT NOT NULL,
      series TEXT,
      release_date TEXT,
      release_year INTEGER,
      device_id INTEGER UNIQUE,
      device_url TEXT,
      image_url TEXT,
      last_fetched_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_models_brand_id ON models(brand_id);
    CREATE INDEX IF NOT EXISTS idx_models_device_id ON models(device_id);
    CREATE INDEX IF NOT EXISTS idx_models_release_year ON models(release_year);
  `,

  specifications: `
    CREATE TABLE IF NOT EXISTS specifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL UNIQUE,
      specifications_json TEXT NOT NULL,
      image_url TEXT,
      ram_options TEXT DEFAULT '[]',
      storage_options TEXT DEFAULT '[]',
      color_options TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_specifications_device_id ON specifications(device_id);
  `,

  jobs: `
    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      priority INTEGER NOT NULL DEFAULT 0,
      run_at TEXT DEFAULT CURRENT_TIMESTAMP,
      queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT,
      last_error TEXT,
      result TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON scrape_jobs(status, run_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_type ON scrape_jobs(job_type);
  `,

  jobLogs: `
    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      log_level TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES scrape_jobs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
    CREATE INDEX IF NOT EXISTS idx_job_logs_level ON job_logs(log_level);
    CREATE INDEX IF NOT EXISTS idx_job_logs_timestamp ON job_logs(timestamp);
  `
};

