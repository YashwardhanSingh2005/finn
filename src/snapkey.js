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
  return null; // filing / callcheck / search are not snapshotted per-URL
}
