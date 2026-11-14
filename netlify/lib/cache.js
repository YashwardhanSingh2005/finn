// Two-level cache: in-memory (per warm function instance) + Netlify Blobs (shared, persistent).
// Every LLM output is keyed by the source document URL, so a filing/transcript is paid for once, ever.
// Persistent layer is host-specific: Vercel Blob (BLOB_READ_WRITE_TOKEN) or Netlify Blobs; else memory only.
import { getStore } from "@netlify/blobs";
import { put, head } from "@vercel/blob";

const mem = new Map();
let store = null;
function blobs() {
  if (store !== null) return store;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    store = {
      async get(k) {
        try {
          const h = await head(`finn-cache/${k}.json`);
          const r = await fetch(h.url, { cache: "no-store" });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      },
      async setJSON(k, v) { await put(`finn-cache/${k}.json`, JSON.stringify(v), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }); },
    };
    return store;
  }
  try { store = process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT ? getStore({ name: "finn-cache", consistency: "eventual" }) : false; } catch { store = false; }
  return store;
}
const safe = (k) => k.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 600);

export const cache = {
  async get(key, maxAgeMs = Infinity) {
    const k = safe(key);
    const m = mem.get(k);
    if (m && Date.now() - m.t < maxAgeMs) return m.v;
    const s = blobs();
    if (!s) return null;
    try {
      const r = await s.get(k, { type: "json" });
      if (r && Date.now() - r.t < maxAgeMs) { mem.set(k, r); return r.v; }
    } catch {}
    return null;
  },
  async set(key, v) {
    const k = safe(key), rec = { t: Date.now(), v };
    mem.set(k, rec);
    const s = blobs();
    if (s) try { await s.setJSON(k, rec); } catch {}
  },
};

/** Memoise an async producer under a key with a max age. */
export async function memo(key, maxAgeMs, fn) {
  const hit = await cache.get(key, maxAgeMs);
  if (hit) return { ...hit, _cached: true };
  const v = await fn();
  if (v && v._noCache) { delete v._noCache; return v; } // producer says: don't persist (e.g. model output failed to parse)
  await cache.set(key, v);
  return v;
}
