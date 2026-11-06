// Descriptive statistics for the playground benchmarks (no external dependencies).

export interface FullStats {
  mean:         number;
  median:       number;
  std:          number;   // sample standard deviation (df = n − 1)
  cv:           number;   // coefficient of variation in percent
  min:          number;
  max:          number;
  ci95Half:     number;   // half-width of the 95 % confidence interval of the mean (t-distribution)
  ci95Lo:       number;
  ci95Hi:       number;
  q1:           number;
  q3:           number;
  iqr:          number;
  fenceLo:      number;   // Q1 − 1.5 · IQR
  fenceHi:      number;   // Q3 + 1.5 · IQR
  whiskerLo:    number;   // farthest value inside the fences
  whiskerHi:    number;
  outlierCount: number;
  trimmedMean:  number;   // mean of the values inside the fences
  n:            number;
}

// Two-tailed 95 % critical values t(0.975, df) for df = 1 … 30
const T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042,
];
// Beyond df = 30: tabulated anchors, interpolated linearly in 1/df (standard practice)
const T95_TAIL: [number, number][] = [[30, 2.042], [40, 2.021], [60, 2.000], [120, 1.980], [Infinity, 1.960]];

export function t95(df: number): number {
  if (df < 1) return NaN;
  if (df <= 30) return T95[df - 1];
  for (let i = 0; i < T95_TAIL.length - 1; i++) {
    const [d0, t0] = T95_TAIL[i], [d1, t1] = T95_TAIL[i + 1];
    if (df <= d1) {
      const x = 1 / df, x0 = 1 / d0, x1 = d1 === Infinity ? 0 : 1 / d1;
      return t0 + ((x - x0) / (x1 - x0)) * (t1 - t0);
    }
  }
  return 1.96;
}

export function computeFullStats(vals: number[]): FullStats | null {
  const n = vals.length;
  if (n < 2) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  // Linear interpolation between order statistics (type 7, as in R and NumPy)
  const quantile = (p: number) => {
    const h = (n - 1) * p, i = Math.floor(h), f = h - i;
    return f === 0 ? sorted[i] : sorted[i] + f * (sorted[Math.min(i + 1, n - 1)] - sorted[i]);
  };

  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const q1 = quantile(0.25), q3 = quantile(0.75), iqr = q3 - q1;
  const fenceLo = q1 - 1.5 * iqr, fenceHi = q3 + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= fenceLo && v <= fenceHi);
  const ci95Half = t95(n - 1) * (std / Math.sqrt(n));

  return {
    mean, median: quantile(0.5), std, cv: mean > 0 ? (std / mean) * 100 : 0,
    min: sorted[0], max: sorted[n - 1],
    ci95Half, ci95Lo: mean - ci95Half, ci95Hi: mean + ci95Half,
    q1, q3, iqr, fenceLo, fenceHi,
    whiskerLo: inliers[0] ?? sorted[0],
    whiskerHi: inliers[inliers.length - 1] ?? sorted[n - 1],
    outlierCount: n - inliers.length,
    trimmedMean: inliers.length ? inliers.reduce((s, v) => s + v, 0) / inliers.length : mean,
    n,
  };
}

export function fmtMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  if (v >= 100) return `${v.toFixed(1)} ms`;
  if (v >= 1) return `${v.toFixed(2)} ms`;
  return `${v.toFixed(3)} ms`;
}
