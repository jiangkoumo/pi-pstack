import assert from 'node:assert/strict';
import { cartSubtotal } from './cart.mjs';
import { quoteSubtotal } from './quote.mjs';
for (const subtotal of [cartSubtotal, quoteSubtotal]) {
  for (const quantity of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => subtotal(100, quantity), RangeError, 'Reject invalid quantity through each public caller');
  }
  assert.equal(subtotal(100, 0), 0);
  assert.equal(subtotal(100, 2), 200);
}
console.log('quantity constraints passed for both callers');
