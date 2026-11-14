// Management credibility as a probability, not an adjective.
// Hutton & Stocken (2009): investors weight a manager's forecast by that manager's past accuracy.
// We make the weight explicit: each checkable promise is a Bernoulli trial (kept / not kept); with a
// uniform Beta(1,1) prior the posterior after k of n is Beta(1+k, 1+n−k). Its mean is the chance the
// *next* promise is kept, and its 80% interval says how much the record can be trusted (few promises
// → wide interval). Partial outcomes count half. Style labels come from the goalpost history
// (Richardson, Teoh & Wysocki 2004: guidance is walked down to beatable levels).

const KEPT = { delivered: 1, beat: 1, "on track": 1, partly: 0.5, behind: 0, missed: 0 };

// regularized incomplete beta I_x(a,b) via continued fraction (Numerical Recipes 6.4)
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-12, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function lgamma(z) { // Lanczos
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = p[0]; for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function betaCdf(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
export function betaQuantile(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (betaCdf(m, a, b) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export function credibility(threads) {
  const scored = threads.filter((t) => t.verdict in KEPT);
  const k = scored.reduce((s, t) => s + KEPT[t.verdict], 0), n = scored.length;
  if (!n) return null;
  const a = 1 + k, b = 1 + n - k;
  const mean = a / (a + b), lo = betaQuantile(0.1, a, b), hi = betaQuantile(0.9, a, b);
  // style from goalpost histories joined with outcomes
  let walkDownBeat = 0, raiseMiss = 0, moves = 0;
  for (const t of threads) {
    const ch = (t.history || []).map((h) => h.change);
    const down = ch.includes("lowered") || ch.includes("pushed out"), up = ch.includes("raised");
    if (down || up) moves++;
    if (down && ["delivered", "beat", "on track"].includes(t.verdict)) walkDownBeat++;
    if (up && ["missed", "behind"].includes(t.verdict)) raiseMiss++;
  }
  let style = null, styleWhy = null;
  if (walkDownBeat >= 1 && walkDownBeat > raiseMiss) { style = "walks down, then beats"; styleWhy = `${walkDownBeat} target(s) lowered or pushed out and then met: guidance may be set to be beaten`; }
  else if (raiseMiss >= 1) { style = "raises, then misses"; styleWhy = `${raiseMiss} target(s) raised and then missed or running behind`; }
  else if (n >= 4 && mean >= 0.7 && moves <= 1) { style = "reliable"; styleWhy = `${Math.round(k)} of ${n} checkable promises kept with ${moves ? "one" : "no"} goalpost move`; }
  const r = (x) => Math.round(x * 100);
  return {
    kept: +k.toFixed(1), scored: n, pNext: r(mean), lo: r(lo), hi: r(hi), style, styleWhy,
    method: "Beta(1,1) prior updated by kept/not-kept promises (partly = ½); pNext = posterior mean, interval = 10th–90th percentile",
  };
}
