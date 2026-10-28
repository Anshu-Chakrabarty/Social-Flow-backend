import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { persistConfigured } from './dbHelpers.js';

describe('persistConfigured', () => {
  it('is false when the persist secret is missing', () => {
    const previous = process.env.WORKSPACE_PERSIST_SECRET;
    delete process.env.WORKSPACE_PERSIST_SECRET;
    assert.equal(persistConfigured(), false);
    if (previous !== undefined) process.env.WORKSPACE_PERSIST_SECRET = previous;
  });

  it('is true when a long persist secret is set', () => {
    const previous = process.env.WORKSPACE_PERSIST_SECRET;
    process.env.WORKSPACE_PERSIST_SECRET = '1234567890abcdef';
    assert.equal(persistConfigured(), true);
    if (previous === undefined) delete process.env.WORKSPACE_PERSIST_SECRET;
    else process.env.WORKSPACE_PERSIST_SECRET = previous;
  });
});
