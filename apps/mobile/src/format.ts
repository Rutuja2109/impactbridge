// Rupees with Indian digit grouping (1,20,500), done by hand so it does not depend on the device's Intl data.
export function inr(amount: number): string {
  const digits = Math.round(amount).toString();
  if (digits.length <= 3) return `₹${digits}`;
  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `₹${groups.join(',')},${lastThree}`;
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}
