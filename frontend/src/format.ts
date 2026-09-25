export function usd(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const d = abs >= 1 ? digits : 4;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function compactUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [u, s] of units) {
    if (abs >= u) return `$${(v / u).toFixed(2)}${s}`;
  }
  return `$${v.toFixed(2)}`;
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

export function num(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function short(s: string | null | undefined, head = 4, tail = 4): string {
  if (!s) return "—";
  return s.length <= head + tail + 3 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function dateOnly(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

export function premiumClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-dim";
  return v >= 0 ? "text-pos" : "text-neg";
}
