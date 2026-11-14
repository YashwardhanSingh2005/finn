// PUSH: the windowed digest. For each holding: filings in the window (NSE+BSE, de-duplicated;
// screener mirror as fallback), classified by rules, scored with an itemised breakdown, and joined
// to that day's price reaction. Results filings get the QoQ/YoY cut attached immediately (pure code).
import { fetchCompany, fetchPrices } from "./screener.js";
import { nseAnnouncements, bseAnnouncements, dedupe } from "./exchanges.js";
import { classify, score, CATEGORIES } from "./classify.js";
import { resultsCut } from "./fundamentals.js";
import { priceStats, evaluate, DEFAULT_RULES } from "./alerts.js";
import { memo } from "./cache.js";

const MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";
function screenerDate(t, now = new Date()) {
  const m = t?.match(/(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]) / 3;
  let y = m[3] ? +m[3] : now.getFullYear();
  if (!m[3] && mon > now.getMonth()) y -= 1;
  return new Date(Date.UTC(y, mon, +m[1], 6, 30)).toISOString(); // noon IST placeholder (date-level precision)
}

/** All the per-company context the scorer needs, cached ~30 min. */
export async function companyContext(symbol) {
  return memo(`ctx:v3:${symbol}`, 30 * 60e3, async () => {
    const c = await fetchCompany(symbol);
    const prices = c.companyId ? await fetchPrices(c.companyId, 400).catch(() => []) : [];
    const st = priceStats(prices);
    const ttm = c.annual?.rows?.["Sales"] || c.annual?.rows?.["Revenue"];
    return {
      symbol: c.symbol, name: c.name, companyId: c.companyId, bseCode: c.bseCode,
      ttmSalesCr: ttm ? ttm[ttm.length - 1] : null,
      mcapCr: c.ratios?.["Market Cap"]?.value ?? null,
      stats: st,
      results: resultsCut(c),
      screenerAnnouncements: c.docs.announcements,
      concalls: c.docs.concalls.slice(0, 2),
    };
  });
}

async function filingsFor(ctx, from, to) {
  const errors = [];
  let items = [];
  const [n, b] = await Promise.allSettled([
    nseAnnouncements(ctx.symbol, from, to),
    ctx.bseCode ? bseAnnouncements(ctx.bseCode, ctx.symbol, from, to) : Promise.resolve([]),
  ]);
  if (n.status === "fulfilled") items.push(...n.value); else errors.push(`NSE: ${n.reason?.message}`);
  if (b.status === "fulfilled") items.push(...b.value); else errors.push(`BSE: ${b.reason?.message}`);
  let source = [n.status === "fulfilled" && "NSE", b.status === "fulfilled" && "BSE"].filter(Boolean).join("+");
  if (!source) {
    // exchanges unreachable from this host: fall back to screener's mirror (latest 5 filings)
    source = "screener mirror";
    items = ctx.screenerAnnouncements.map((a, i) => ({ source: "BSE via screener", id: `scr:${ctx.symbol}:${i}:${a.url}`, symbol: ctx.symbol, time: screenerDate(a.dateText), subject: a.subject, summary: a.summary, url: a.url }));
  }
  items = dedupe(items).filter((x) => !x.time || (x.time >= from.toISOString() && x.time <= to.toISOString()));
  return { items, source, errors };
}

/**
 * Build the digest.
 * opts: { from, to, holdings:[{symbol, weight}], prefs, rules }
 */
export async function buildDigest({ from, to, holdings, prefs = {}, rules = DEFAULT_RULES }) {
  const per = await Promise.all(holdings.map(async (h) => {
    try {
      const ctx = await companyContext(h.symbol);
      const f = await memo(`fil:v2:${h.symbol}:${from.toISOString().slice(0, 13)}:${to.toISOString().slice(0, 13)}`, 15 * 60e3, () => filingsFor(ctx, from, to));
      return { h, ctx, f };
    } catch (e) {
      return { h, error: e.message };
    }
  }));

  const items = [], alerts = [], sources = {}, failures = [];
  for (const { h, ctx, f, error } of per) {
    if (error) { failures.push({ symbol: h.symbol, error }); continue; }
    sources[h.symbol] = f.source;
    // price/volume alerts (EOD)
    for (const a of evaluate(ctx.stats, rules)) alerts.push({ ...a, symbol: h.symbol, name: ctx.name, date: ctx.stats.date, stats: pickStats(ctx.stats) });
    for (const x of f.items) {
      const cls = classify(x.subject, x.summary);
      const day = x.time ? toISTDate(x.time) : null;
      const move = day && ctx.stats?.returnsByDate?.[nextTradingKey(ctx.stats.returnsByDate, day)];
      const sc = score({ ...x, category: cls.category }, { weightPct: h.weight, ttmSalesCr: ctx.ttmSalesCr, dayMovePct: move ?? null, sigma: ctx.stats?.sigma, prefs });
      const item = {
        ...x, name: ctx.name, weight: h.weight,
        category: cls.category, categoryLabel: CATEGORIES[cls.category].label, icon: CATEGORIES[cls.category].icon, classifiedBy: cls.rule,
        ...sc, dayMove: move ?? null,
      };
      // Results: attach the first cut straight away if the filing is the outcome (not a date notice)
      if (cls.category === "results" && sc.score >= 60 && ctx.results) item.resultsCut = ctx.results;
      items.push(item);
    }
  }
  items.sort((a, b) => b.score - a.score || (b.time || "").localeCompare(a.time || ""));
  const tiers = { act: items.filter((x) => x.tier === "act"), read: items.filter((x) => x.tier === "read"), skim: items.filter((x) => x.tier === "skim") };
  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    counts: { total: items.length, act: tiers.act.length, read: tiers.read.length, skim: tiers.skim.length, holdings: holdings.length },
    items, alerts: alerts.sort((a, b) => (a.severity === "high" ? -1 : 1)), sources, failures,
    generatedAt: new Date().toISOString(),
  };
}

const pickStats = (s) => ({ close: s.close, ret1d: s.ret1d, sigma: s.sigma, z: s.z, volX: s.volX, vol: s.vol, avgVol: s.avgVol, spark: s.spark.slice(-30), date: s.date });
const toISTDate = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
// a filing after market close moves the NEXT session's price
function nextTradingKey(map, day) {
  const keys = Object.keys(map).sort();
  return keys.find((k) => k >= day) || null;
}
