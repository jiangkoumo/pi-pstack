export function subtotal(unitPrice, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a nonnegative safe integer; use subtotal');
  }
  return unitPrice * quantity;
}
