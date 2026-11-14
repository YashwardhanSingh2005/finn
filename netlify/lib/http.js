export const json = (data, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" } });
export const fail = (e) => json({ error: e.message || String(e), suggestions: e.suggestions || undefined }, e.status || 500);
export const sym = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9&_-]/g, "").slice(0, 20);
