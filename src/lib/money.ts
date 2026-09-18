/** All money in this app is integer øre. These helpers are the only conversion points. */

export function formatNok(ore: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? ore % 100 !== 0;
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(ore / 100);
}

export function formatKroner(ore: number): string {
  return new Intl.NumberFormat('nb-NO', {
    minimumFractionDigits: ore % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(ore / 100);
}

/** Parse a user-typed Norwegian amount ("1 250,50", "1250.5", "1.250") into øre. */
export function parseKronerToOre(input: string | number): number | null {
  if (typeof input === 'number') return Math.round(input * 100);
  let s = input.trim().replace(/\s| /g, '').replace(/kr/gi, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // "1.250,50" — dot is a thousands separator.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot && /\.\d{3}(\D|$)/.test(s)) {
    // "1.250" — thousands separator, not decimals.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
