import { parse } from 'yaml';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerPathCandidates = [
  path.join(__dirname, '../../swagger.yaml'),
  path.resolve(process.cwd(), 'swagger.yaml'),
  path.resolve(process.cwd(), 'src/swagger.yaml')
];

const swaggerPath = swaggerPathCandidates.find((candidate) => existsSync(candidate));

let swaggerDocument = null;

if (swaggerPath) {
  try {
    swaggerDocument = parse(readFileSync(swaggerPath, 'utf8'));
  } catch (error) {
    console.error('Failed to parse swagger.yaml. Using fallback document. Error:', error.message);
    swaggerDocument = null;
  }
}

if (!swaggerDocument) {
  swaggerDocument = {
    openapi: '3.0.0',
    info: {
      title: 'GSM Arena Scraper API',
      description:
        'swagger.yaml is missing; using minimal fallback schema. Ensure swagger.yaml is deployed for full documentation.',
      version: '1.0.0'
    },
    paths: {}
  };
  console.warn(
    'swagger.yaml not found. Checked paths:',
    swaggerPathCandidates,
    'Using fallback Swagger document.'
  );
}

export function getSwaggerDocument() {
  return swaggerDocument;
}

