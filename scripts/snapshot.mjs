// Record every demo view from a running FINN instance into public/snapshot/, so the app still opens
// (clearly labelled as a snapshot) when the live backend can't answer: static hosting, exchange feed
// down, model gateway down. Only successful responses are saved; nothing is synthesised.
// usage: node scripts/snapshot.mjs http://127.0.0.1:8787 [outDir]
import { mkdir, writeFile, rm } from "node:fs/promises";
import { snapKey } from "../src/snapkey.js";
import { PORTFOLIO, RESEARCH_DEMO } from "../netlify/lib/portfolio.js";
const BASE = process.argv[2], OUT = process.argv[3] || new URL("../public/snapshot/", import.meta.url).pathname;
if (!BASE) { console.error("usage: node scripts/snapshot.mjs <base-url> [outDir]"); process.exit(1); }
const syms = [...new Set([...PORTFOLIO.map((h) => h.symbol), ...(RESEARCH_DEMO || []).map((x) => x.symbol || x)])];
const jobs = [];
for (const h of [24, 72, 168, 720]) jobs.push(["digest", { hours: h }]);
jobs.push(["backtest", { days: 180, offset: 0 }], ["backtest", { days: 180, offset: 180 }], ["league", {}]);
for (const s of PORTFOLIO.map((h) => h.symbol)) jobs.push(["league", { symbol: s }]);
for (const s of syms) jobs.push(["company", { symbol: s }], ["candour", { symbol: s }], ["auditor", { symbol: s }], ["ledger", { symbol: s, judge: 0 }], ["ledger", { symbol: s, judge: 1 }], ["brief", { symbol: s, part: "business" }], ["brief", { symbol: s, part: "bullbear" }]);
await rm(OUT, { recursive: true, force: true }); await mkdir(OUT, { recursive: true });
const keys = [], companies = [];
let bytes = 0;
const seen = new Set();
const add = (path, params) => { const k = snapKey(path, params); if (k && !seen.has(k) && seen.size < 120) { seen.add(k); jobs.push([path, params]); } };
for (let n = 0; n < jobs.length; n++) {
  const [path, params] = jobs[n];
  const key = snapKey(path, params), qs = new URLSearchParams(params).toString();
  try {
    const r = await fetch(`${BASE}/api/${path}${qs ? "?" + qs : ""}`, { signal: AbortSignal.timeout(180e3) });
    const j = await r.json();
    const empty = j.error || (path === "callcheck" && !j.now?.parsed) || (path === "backtest" && !j.filings) || (path === "league" && params.symbol && j.error);
    if (!r.ok || empty) { console.log(`skip ${r.status} ${key} ${j.error || "empty"}`.slice(0, 110)); continue; }
    const body = JSON.stringify(j);
    await writeFile(`${OUT}/${key}.json`, body); keys.push(key); bytes += body.length;
    // what a tap on a card would fetch: the PDF read behind each card that earned attention, and the
    // instant transcript check. Same parameters as the client sends (src/Today.jsx).
    if (path === "digest") for (const x of j.items || []) {
      if (!x.url) continue;
      if (x.category === "earnings_call" && /transcript/i.test(`${x.subject} ${x.summary}`)) add("callcheck", { url: x.url, symbol: x.symbol });
      if (x.tier === "skim" && x.category !== "results") continue;
      add("filing", { url: x.url, category: x.category });
      if (x.category === "results") add("filing", { url: x.url, category: "generic" });
    }
    if (path === "company" && j.name) companies.push({ symbol: params.symbol, name: j.name, url: `/company/${params.symbol}/` });
    console.log(`ok   ${key} ${(body.length / 1024).toFixed(1)}kB`);
  } catch (e) { console.log(`ERR  ${key} ${e.message}`); }
}
await writeFile(`${OUT}/index.json`, JSON.stringify({ at: new Date().toISOString(), keys, companies }));
console.log(`${keys.length} views, ${(bytes / 1024).toFixed(0)} kB → ${OUT}`);
