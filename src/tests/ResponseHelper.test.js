import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseHelper } from '../utils/ResponseHelper.js';

describe('ResponseHelper', () => {
  it('creates a success response with defaults', () => {
    const result = ResponseHelper.success('ok', { foo: 'bar' });

    assert.equal(result.success, true);
    assert.equal(result.message, 'ok');
    assert.deepEqual(result.data, { foo: 'bar' });
    assert.equal(result.statusCode, 200);
    assert.ok(new Date(result.timestamp).toString() !== 'Invalid Date');
  });

  it('creates an error response with defaults', () => {
    const result = ResponseHelper.error('failed', 'boom');

    assert.equal(result.success, false);
    assert.equal(result.message, 'failed');
    assert.equal(result.error, 'boom');
    assert.equal(result.statusCode, 500);
    assert.ok(new Date(result.timestamp).toString() !== 'Invalid Date');
  });

  it('creates notFound and accepted responses with expected codes', () => {
    const notFound = ResponseHelper.notFound('missing');
    const accepted = ResponseHelper.accepted('queued', { id: '123' });

    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.success, false);
    assert.equal(accepted.statusCode, 202);
    assert.equal(accepted.success, true);
    assert.deepEqual(accepted.data, { id: '123' });
  });
});
