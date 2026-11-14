// Pre-compute every demo view on a deployed instance so graders get instant pages.
// usage: node scripts/warm.mjs https://your-deployment.example
const BASE = process.argv[2];
if (!BASE) { console.error("usage: node scripts/warm.mjs <base-url>"); process.exit(1); }
const DEMO = ["POLYCAB", "KAYNES", "ASIANPAINT", "HAL", "JUBLFOOD", "TCS", "DIXON", "RELIANCE", "SUNPHARMA", "HDFCBANK"];
const PORTFOLIO = ["RELIANCE", "HDFCBANK", "TCS", "BHARTIARTL", "LT", "ITC", "BAJFINANCE", "SUNPHARMA", "MARUTI", "TATASTEEL", "ETERNAL", "TRENT", "DIXON", "POLYCAB", "SUZLON", "CDSL", "KPITTECH", "KAYNES"];
async function hit(path) {
  const t0 = Date.now();
  for (let a = 0; a < 2; a++) {
    try {
      const r = await fetch(BASE + path, { signal: AbortSignal.timeout(90e3) });
      const ok = r.ok;
      console.log(`${ok ? "ok " : "ERR"} ${r.status} ${((Date.now() - t0) / 1000).toFixed(1)}s ${path}`);
      if (ok) return;
    } catch (e) { console.log(`ERR ${e.name} ${path}`); }
  }
}
await hit("/api/digest?hours=168");
await hit("/api/backtest?days=180&offset=0");
await hit("/api/backtest?days=180&offset=180");
for (const s of PORTFOLIO) await hit(`/api/league?symbol=${s}`);
for (const s of DEMO) {
  await hit(`/api/company?symbol=${s}`);
  await hit(`/api/candour?symbol=${s}`);
  await hit(`/api/brief?symbol=${s}&part=business`);
  await hit(`/api/ledger?symbol=${s}&judge=0`);
  await hit(`/api/ledger?symbol=${s}&judge=1`);
  await hit(`/api/brief?symbol=${s}&part=bullbear`);
}
