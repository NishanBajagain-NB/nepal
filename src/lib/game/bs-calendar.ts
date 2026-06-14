// Gregorian date of Baishakh 1 (Nepali New Year) for BS years 2082..2090.
// Hand-checked against the official Nepali patro; sufficient through AD 2033.
const NEW_YEAR_AD: Record<number, [number, number, number]> = {
  2082: [2025, 4, 14],
  2083: [2026, 4, 14],
  2084: [2027, 4, 14],
  2085: [2028, 4, 13],
  2086: [2029, 4, 14],
  2087: [2030, 4, 14],
  2088: [2031, 4, 14],
  2089: [2032, 4, 13],
  2090: [2033, 4, 14],
};

export function nextNepaliNewYear(now = new Date()): { bsYear: number; date: Date } {
  for (const [bsStr, [y, m, d]] of Object.entries(NEW_YEAR_AD)) {
    const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    if (date.getTime() > now.getTime()) {
      return { bsYear: Number(bsStr), date };
    }
  }
  // Fallback
  return { bsYear: 2090, date: new Date(Date.UTC(2033, 3, 14)) };
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  bsYear: number;
}

export function getCountdown(now = new Date()): Countdown {
  const { bsYear, date } = nextNepaliNewYear(now);
  let diff = Math.max(0, date.getTime() - now.getTime());
  const days = Math.floor(diff / 86_400_000);
  diff -= days * 86_400_000;
  const hours = Math.floor(diff / 3_600_000);
  diff -= hours * 3_600_000;
  const minutes = Math.floor(diff / 60_000);
  diff -= minutes * 60_000;
  const seconds = Math.floor(diff / 1000);
  return { days, hours, minutes, seconds, bsYear };
}
