type Maybe = number | null | undefined;

const MISSING = "–";

/** 0.523 -> "52.3%" */
export const pct = (value: Maybe, digits = 1) =>
  value == null ? MISSING : `${(value * 100).toFixed(digits)}%`;

/** AUCs and other 0–1 statistics, to three decimals. */
export const dec = (value: Maybe, digits = 3) => (value == null ? MISSING : value.toFixed(digits));

export const int = (value: Maybe) => (value == null ? MISSING : Math.round(value).toLocaleString("en-GB"));

/** Signed difference in percentage points: 0.053 -> "+5.3 pp" */
export const pp = (value: Maybe) =>
  value == null ? MISSING : `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)} pp`;

/** Signed number: 7.8 -> "+7.8" */
export const signed = (value: Maybe, digits = 1) =>
  value == null ? MISSING : `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;

export const interval = (pair: number[] | null | undefined, format = dec) =>
  pair ? `${format(pair[0])} to ${format(pair[1])}` : MISSING;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-09-01" or "2025-09" -> "Sep 2025"; short form -> "Sep 25" */
export function month(value: string, short = false): string {
  const [year, m] = value.split("-");
  return `${MONTHS[Number(m) - 1]} ${short ? year.slice(2) : year}`;
}

export function pValue(p: Maybe): string {
  if (p == null) return MISSING;
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}
