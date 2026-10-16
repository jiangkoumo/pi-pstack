export function total({ unitPrice, quantity, taxRate, discountRate = 0 }) {
  if (typeof discountRate !== 'number' || !Number.isFinite(discountRate) || discountRate < 0 || discountRate > 1) {
    throw new RangeError('discountRate must be a finite number between 0 and 1');
  }
  return unitPrice * quantity * (1 - discountRate) * (1 + (taxRate ?? 0.1));
}
