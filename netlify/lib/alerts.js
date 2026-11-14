// EOD watcher: "unusual" is defined by the user, in either absolute terms (±X%, N× volume) or in the
// stock's own volatility units (σ) — a 4% day is noise for a smallcap and an event for a utility.
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

export const DEFAULT_RULES = { movePct: 5, volX: 2, sigma: 2.5, volWindow: 20, sigmaWindow: 60 };

export function priceStats(series, rules = DEFAULT_RULES) {
  const s = series.filter((x) => x.close > 0);
  const n = s.length;
  if (n < 25) return null;
  const rets = s.slice(1).map((x, i) => (x.close / s[i].close - 1) * 100);
  const lastRet = rets[rets.length - 1];
  const sig = std(rets.slice(-rules.sigmaWindow - 1, -1));
  const vols = s.slice(-rules.volWindow - 1, -1).map((x) => x.volume).filter((v) => v != null);
  const avgVol = vols.length ? mean(vols) : null;
  const lastVol = s[n - 1].volume;
  const r = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
  const hi52 = Math.max(...s.slice(-250).map((x) => x.close)), lo52 = Math.min(...s.slice(-250).map((x) => x.close));
  return {
    date: s[n - 1].date, close: s[n - 1].close, ret1d: r(lastRet, 2), sigma: r(sig, 2), z: sig ? r(lastRet / sig, 1) : null,
    vol: lastVol, avgVol: avgVol && Math.round(avgVol), volX: avgVol ? r(lastVol / avgVol, 1) : null,
    ret5d: r((s[n - 1].close / s[Math.max(0, n - 6)].close - 1) * 100), ret1m: r((s[n - 1].close / s[Math.max(0, n - 22)].close - 1) * 100),
    hi52, lo52, offHigh: r((s[n - 1].close / hi52 - 1) * 100),
    spark: s.slice(-60).map((x) => x.close),
    returnsByDate: Object.fromEntries(s.slice(1).map((x, i) => [x.date, r(rets[i], 2)])),
  };
}

/** Which rules fired, with the sentence that explains each. */
export function evaluate(st, rules = DEFAULT_RULES) {
  if (!st) return [];
  const out = [];
  if (st.volX != null && st.volX >= rules.volX)
    out.push({ kind: "volume", severity: st.volX >= rules.volX * 1.5 ? "high" : "med", title: `Volume ${st.volX}× normal`, why: `${fmtVol(st.vol)} shares vs ${rules.volWindow}-day average ${fmtVol(st.avgVol)} (your trigger: ≥ ${rules.volX}×)` });
  if (st.ret1d != null && Math.abs(st.ret1d) >= rules.movePct)
    out.push({ kind: "move", severity: "high", title: `${st.ret1d > 0 ? "Up" : "Down"} ${Math.abs(st.ret1d)}% today`, why: `close ₹${st.close} (your trigger: ±${rules.movePct}%)` });
  else if (st.z != null && Math.abs(st.z) >= rules.sigma)
    out.push({ kind: "sigma", severity: "med", title: `${st.ret1d > 0 ? "Up" : "Down"} ${Math.abs(st.ret1d)}% — a ${Math.abs(st.z)}σ day`, why: `this stock's typical daily move is ±${st.sigma}% (your trigger: ≥ ${rules.sigma}σ)` });
  return out;
}
const fmtVol = (v) => (v == null ? "–" : v >= 1e7 ? (v / 1e7).toFixed(2) + " cr" : v >= 1e5 ? (v / 1e5).toFixed(1) + " L" : v.toLocaleString("en-IN"));
