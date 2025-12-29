# GitHub Copilot Instructions for GSM-Arena-Scraper

Quick, focused guidance for AI coding agents working on this repo.

## Goal
- Maintain and extend a standalone GSM Arena scraper API that stores brands, models, and specifications in SQLite and performs asynchronous scraping via a persistent job queue.

## Quick commands (repeatable) ✅
- Start API server: `npm start` (runs `node src/index.js server`) or `docker compose up -d` (requires Docker Compose v2+; use `docker compose` not `docker-compose`).
- Run CLI scraper: `npm run scrape` or `node src/index.js cli`.
- Dev mode: `npm run dev` (nodemon)
- API client tests: `node src/index.js test` (uses `ScraperAPIClient.waitForServer`)

## Where to look first (big picture) 🔎
- Entry points: `src/index.js` (server/cli/test modes), `src/api/server.js` (Express app)
- Routes → controllers → services: `src/routes/scraperRoutes.js` → `src/controllers/ScraperController.js` → `src/services/ScraperService.js`
- Persistence: SQLite helpers and models in `src/database/*` (`db.js`, `migrations.js`, `models.js`, `schema.js`)
- Background jobs: `src/jobs/JobQueue.js`, job handlers in `src/jobs/index.js`, logging in `src/jobs/JobLogger.js`
- Networking & rate limiting: `src/utils/RequestQueue.js`, `src/utils/RateLimiter.js`, `src/utils/ProxyManager.js`

## Important patterns & conventions (be explicit) ⚙️
- Responses use `ResponseHelper` (`src/utils/ResponseHelper.js`) — return objects with `success`, `message`, `statusCode`, and `data`.
- Job enqueuing is the canonical async flow: use exported helpers in `src/jobs/index.js` (`enqueueBrandScrape`, `enqueueDeviceSpecs`, `enqueueBrandList`). Jobs are persisted in `scrape_jobs` and deduplicated by payload.
- Job retry/backoff is implemented in `JobQueue.processNext()`; handlers should throw on unrecoverable errors and rely on retry policies.
- Database migrations run automatically during initial startup via `src/database/initialScrape.js` (called from `src/index.js` → `runInitialScrapeInBackground`).
- Rate limiting + proxy rotation are enforced by `RequestQueue` → `RateLimiter` + `ProxyManager`. Tests and fixes should respect these (do not bypass queue for live scraping).
- Parsing logic (HTML scraping) mainly lives in `src/services/ScraperService.js` (many helper extractors: `extractYearFromStatus`, `extractReleaseInfoMap`, etc.).

## Adding features / endpoints (checklist) ✍️
1. Add route to `src/routes/scraperRoutes.js` (follow existing style).
2. Add controller method in `ScraperController` and call service or DB functions.
3. Add business logic to `ScraperService` (or new service) and persist via `src/database/models.js` if needed.
4. If background work is required, register handler in `src/jobs/index.js` and implement logic in handler.
5. Add job logs with `JobLogger` (it writes both DB and console). Ensure job deduplication and idempotency.

## Debugging & testing tips 🐞
- Health & status endpoints: `GET /health`, `GET /status`.
- Inspect job state via `GET /jobs/:jobId`, and logs via `GET /jobs/:jobId/logs`.
- Use `Sneaker client` pattern: `src/api/client.js` (`ScraperAPIClient`) has `waitForServer`, `healthCheck`, and convenience methods.
- Local DB file: `data/gsmarena.sqlite`. If it’s stale, remove to force re-run of initial migration & brand sync.

## Notable repo-specific caveats ⚠️
- Config is canonical in `src/config/config.js` (not every env var in `env.example` is guaranteed to be wired up). Prefer reading/updating `CONFIG` there.
- README contains helpful examples but has minor inconsistencies (e.g., `Node.js 16+` vs `engines.node` = `22.x`, mentions `npm run db:test` which isn't in `package.json`). Call this out when editing docs.
- Some files contain inline comments in Persian/Farsi — that’s intentional and can be left as-is unless requested.

## When opening a PR (short checklist) ✅
- Add/modify unit tests where possible (project has limited test coverage; check `package.json` `test` script).
- Run `npm run dev` or `npm start` and validate relevant endpoints and job behavior.
- When changing scraping/parsing logic, add a short comment explaining why (GSM Arena HTML is brittle).

---
If anything here is unclear or you want additional examples (e.g., a sample small PR that adds an endpoint or a job handler), tell me which area to expand and I’ll update this file. Thanks! 👩‍💻👨‍💻
