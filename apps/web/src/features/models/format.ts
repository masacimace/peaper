export function tokenPrice(value: number | null) {
  return value === null
    ? '—'
    : value === 0
      ? 'Free'
      : `$${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}
