import assert from 'node:assert/strict';
import { total } from './pricing.mjs';
assert.equal(total({ unitPrice: 100, quantity: 2, taxRate: 0 }), 200, 'An explicit zero tax rate is tax-exempt');
assert(Math.abs(total({ unitPrice: 100, quantity: 2 }) - 220) < 1e-9, 'An omitted rate defaults to ten percent');
console.log('pricing behavior passed');
