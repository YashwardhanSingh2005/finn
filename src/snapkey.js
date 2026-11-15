// Snapshot keys: one saved JSON per view, so FINN still opens when the live backend can't be reached
// (static hosting, exchange feed down, model gateway down). Shared by the client and scripts/snapshot.mjs.
const WINDOWS = [24, 72, 168, 720];
export function snapKey(path, p = {}) {
  if (path === "digest") {
    const h = p.from ? 720 : Number(p.hours) || 168;
    return `digest_${WINDOWS.find((w) => w >= h) || 720}`;
  }
  if (path === "backtest") return `backtest_${p.days || 180}_${p.offset || 0}`;
  if (path === "league") return p.symbol ? `league_${p.symbol}` : "league";
  if (path === "ledger") return `ledger_${p.symbol}_${String(p.judge) === "0" ? 0 : 1}`;
  if (path === "brief") return `brief_${p.symbol}_${p.part || "business"}`;
  if (["company", "candour", "auditor"].includes(path)) return `${path}_${p.symbol}`;
  // per-document views: keyed by a short hash of the document URL
  if (path === "filing" && p.url) return `filing_${hash(p.url)}_${p.category || "generic"}`;
  if (path === "callcheck" && p.url) return `callcheck_${hash(p.url)}`;
  return null; // search is answered from the snapshot's company index
}

/** djb2, base36: short, stable, good enough to name a few dozen files. */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
