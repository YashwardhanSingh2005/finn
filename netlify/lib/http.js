export const json = (data, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store" } });
export const fail = (e) => json({ error: e.message || String(e), suggestions: e.suggestions || undefined }, e.status || 500);
export const sym = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9&_-]/g, "").slice(0, 20);

import { readFile } from "node:fs/promises";
/** No model access (local development, or a deployment without a gateway): serve a recorded response if one
 *  exists. It carries `fixture: true`, and the UI labels it as a recording. */
export async function fixture(kind, symbol) {
  // FINN_FIXTURES, else the fixtures/ folder shipped with the deployment
  const dirs = process.env.FINN_FIXTURES ? [process.env.FINN_FIXTURES] : [new URL("../../fixtures", import.meta.url).pathname, `${process.cwd()}/fixtures`];
  for (const dir of dirs) { try { return { ...JSON.parse(await readFile(`${dir}/${kind}_${symbol}.json`, "utf8")), fixture: true }; } catch { /* try the next place */ } }
  return null;
}
