import assert from 'node:assert/strict';
import { total } from './pricing.mjs';
assert.equal(total({ unitPrice: 100, quantity: 2, taxRate: 0.1, discountRate: 0.25 }), 165, 'Apply a 25% discount before tax');
assert.equal(total({ unitPrice: 100, quantity: 2, taxRate: 0, discountRate: 1 }), 0, 'A full discount makes the order free');
assert(Math.abs(total({ unitPrice: 100, quantity: 2, taxRate: 0.1 }) - 220) < 1e-9, 'An absent discount preserves existing pricing');
for (const discountRate of [-0.1, 1.1, NaN, Infinity, '0.2', null]) {
  assert.throws(() => total({ unitPrice: 100, quantity: 2, taxRate: 0, discountRate }), RangeError, 'Reject invalid discount rates');
}
console.log('discount behavior passed');
