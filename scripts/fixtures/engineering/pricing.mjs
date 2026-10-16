export function total({ unitPrice, quantity, taxRate }) {
  return unitPrice * quantity * (1 + (taxRate || 0.1));
}
