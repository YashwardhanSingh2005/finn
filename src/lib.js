// Client helpers: API calls, per-viewer preferences, formatting, AI cost ledger.
import { useEffect, useState, useCallback } from "react";

const LS = {
  get(k, d) { try { const v = localStorage.getItem("finn:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("finn:" + k, JSON.stringify(v)); } catch {} },
};
export { LS };

export function usePersist(key, initial) {
  const [v, setV] = useState(() => LS.get(key, initial));
  useEffect(() => LS.set(key, v), [key, v]);
  return [v, setV];
}

// ---- AI spend ledger (what this session cost) ----
const spend = { usd: 0, calls: 0, cached: 0, byModel: {} };
const listeners = new Set();
export function recordMeta(meta, cached) {
  const ms = Array.isArray(meta) ? meta : meta ? [meta] : [];
  if (cached) { spend.cached += 1; listeners.forEach((f) => f({ ...spend })); return; }
  for (const m of ms) {
    if (!m?.model) continue;
    spend.usd += m.usd || 0; spend.calls += 1;
    spend.byModel[m.model] = (spend.byModel[m.model] || 0) + (m.usd || 0);
  }
  listeners.forEach((f) => f({ ...spend }));
}
export function useSpend() {
  const [s, setS] = useState({ ...spend });
  useEffect(() => { listeners.add(setS); return () => listeners.delete(setS); }, []);
  return s;
}

export async function api(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
  const r = await fetch(`/api/${path}${qs ? "?" + qs : ""}`);
  let j;
  try { j = await r.json(); } catch { throw new Error(`Server error (${r.status}). Try again — long documents can take a minute the first time.`); }
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j, status: r.status });
  recordMeta(j.meta || j.cost, j.cached || j._cached);
  return j;
}

/** Fetch with loading/error state; `deps` re-trigger. */
export function useApi(path, params, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ loading: !!enabled, data: null, error: null });
  const key = JSON.stringify([path, params]);
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { setState({ loading: false, data: await api(path, params), error: null }); }
    catch (e) {
      // one retry: long-running extraction may have finished & cached on the server
      if (e.status === 502 || e.status === 504 || /Server error/.test(e.message)) {
        try { setState({ loading: false, data: await api(path, params), error: null }); return; } catch (e2) { e = e2; }
      }
      setState({ loading: false, data: null, error: e });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { if (enabled) run(); }, [key, enabled, ...deps]); // eslint-disable-line
  return { ...state, reload: run };
}

// ---- formatting ----
export const fmtCr = (v) => (v == null ? "–" : `₹${Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN")}`);
export const fmtPct = (v, sign = true) => (v == null ? "–" : `${sign && v > 0 ? "+" : ""}${(Math.round(v * 10) / 10).toFixed(1)}%`);
export const cls = (v) => (v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : "");
export function ago(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
export const istTime = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
