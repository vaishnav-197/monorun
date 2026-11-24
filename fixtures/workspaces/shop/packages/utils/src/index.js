export function formatPrice(cents) {
  return `Rs ${(cents / 100).toFixed(2)}`;
}
