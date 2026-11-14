// Does the triage score work? Score every filing of the last N days for the portfolio WITHOUT the
// market-reaction term (that would be circular), then look at the stock's next-session move in units
// of its own volatility. If the ranking carries information, "Needs you" filings should be followed
// by bigger moves than "Filed away" ones.
import { nseAnnouncements, dedupe } from "./exchanges.js";
import { classify, score } from "./classify.js";
import { companyContext } from "./digest.js";
import { memo } from "./cache.js";

const reactionDay = (iso) => {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 3600e3);
  if (ist.getUTCHours() * 60 + ist.getUTCMinutes() > 15 * 60 + 30) ist.setUTCDate(ist.getUTCDate() + 1);
  return ist.toISOString().slice(0, 10);
};

export async function backtest(holdings, days = 180, offset = 0) {
  const day = new Date().toISOString().slice(0, 10);
  return memo(`bt:v3:${days}:${offset}:${day}:${holdings.map((h) => h.symbol).join(",")}`, 24 * 3600e3, async () => {
    const to = new Date(Date.now() - offset * 864e5), from = new Date(Date.now() - (offset + days) * 864e5);
    const rows = [];
    let failed = 0;
    // a few at a time: be gentle with the exchange
    for (let i = 0; i < holdings.length; i += 4) {
      await Promise.all(holdings.slice(i, i + 4).map(async (h) => {
        try {
          const ctx = await companyContext(h.symbol);
          const items = dedupe(await nseAnnouncements(h.symbol, from, to));
          const rets = ctx.stats?.returnsByDate || {};
          const dates = Object.keys(rets).sort();
          const sig = ctx.stats?.sigma;
          for (const x of items) {
            if (!x.time || !sig) continue;
            const d = dates.find((k) => k >= reactionDay(x.time));
            if (!d || rets[d] == null) continue;
            const cls = classify(x.subject, x.summary);
            const sc = score({ ...x, category: cls.category }, { weightPct: h.weight, ttmSalesCr: ctx.ttmSalesCr, sebiThresholdCr: ctx.sebiThresholdCr }); // no market term
            rows.push({ tier: sc.tier, z: Math.abs(rets[d]) / sig, cat: cls.category, score: sc.score, subj: x.subject.slice(0, 60), sym: h.symbol, day: d });
          }
        } catch { failed++; }
      }));
    }
    const by = (t) => rows.filter((r) => r.tier === t);
    const stat = (rs) => ({ n: rs.length, meanZ: rs.length ? +(rs.reduce((s, r) => s + r.z, 0) / rs.length).toFixed(2) : null, big: rs.length ? Math.round((rs.filter((r) => r.z >= 2).length / rs.length) * 100) : null });
    const cats = {};
    for (const r of rows) (cats[r.cat] ||= []).push(r);
    const byCategory = Object.fromEntries(Object.entries(cats).map(([k, rs]) => [k, stat(rs)]));
    // same-day clustering: a results day produces 5-10 filings; count each (stock, day) event once
    const ev = new Map();
    for (const r of rows) { const k = r.sym + r.day; if (!ev.has(k) || ev.get(k).score < r.score) ev.set(k, r); }
    const events = [...ev.values()];
    const evBy = (t) => events.filter((r) => r.tier === t);
    const subjects = {};
    for (const r of rows.filter((r) => r.tier === "act")) subjects[r.subj] = (subjects[r.subj] || 0) + 1;
    return { days, offset, filings: rows.length, byCategory, events: { n: events.length, act: stat(evBy("act")), read: stat(evBy("read")), skim: stat(evBy("skim")) }, topActSubjects: Object.entries(subjects).sort((a, b) => b[1] - a[1]).slice(0, 15), failed, act: stat(by("act")), read: stat(by("read")), skim: stat(by("skim")), all: stat(rows), note: "Score excludes the market-reaction term. z = |next-session return| / stock's 60-day daily σ.", at: new Date().toISOString() };
  });
}
