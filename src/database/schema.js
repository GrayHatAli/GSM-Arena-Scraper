/**
 * Database schema definitions
 */

export const SCHEMA = {
  brands: `
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      url VARCHAR(500),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
    CREATE INDEX IF NOT EXISTS idx_brands_is_active ON brands(is_active);
  `,

  models: `
    CREATE TABLE IF NOT EXISTS models (
      id SERIAL PRIMARY KEY,
      brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      model_name VARCHAR(500) NOT NULL,
      series VARCHAR(255),
      release_date VARCHAR(50),
      device_id INTEGER UNIQUE,
      device_url VARCHAR(500),
      image_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_models_brand_id ON models(brand_id);
    CREATE INDEX IF NOT EXISTS idx_models_device_id ON models(device_id);
    CREATE INDEX IF NOT EXISTS idx_models_model_name ON models(model_name);
  `,

  specifications: `
    CREATE TABLE IF NOT EXISTS specifications (
      id SERIAL PRIMARY KEY,
      device_id INTEGER NOT NULL UNIQUE,
      specifications_json JSONB NOT NULL,
      image_url VARCHAR(500),
      ram_options JSONB DEFAULT '[]'::jsonb,
      storage_options JSONB DEFAULT '[]'::jsonb,
      color_options JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_specifications_device_id ON specifications(device_id);
  `
};

