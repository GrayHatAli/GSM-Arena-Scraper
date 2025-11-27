import { runMigrations } from '../database/migrations.js';
import { runInitialScrape } from '../database/initialScrape.js';
import * as db from '../database/models.js';
import { closePool } from '../database/db.js';

async function main() {
  console.log('🧪 Running database smoke test...');
  await runMigrations();
  await runInitialScrape();
  const brands = await db.getBrands();
  console.log(`✅ Brands in database: ${brands.length}`);
  await closePool();
}

main()
  .then(() => {
    console.log('✅ Smoke test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Smoke test failed:', error);
    process.exit(1);
  });

