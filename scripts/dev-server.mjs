// Local server: serves dist/ and routes /api/* to the same handlers the hosts use. For local testing only.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const PORT = Number(process.env.PORT || 8787);
const DIST = new URL("../dist/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json", ".png": "image/png" };
const handlers = {};
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z]/g, "");
      handlers[name] ||= (await import(`../api/${name}.js`)).GET;
      const r = await handlers[name](new Request(url));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = join(DIST, url.pathname);
    let body;
    try { body = await readFile(p); } catch { p = join(DIST, "index.html"); body = await readFile(p); }
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e.stack || e)); }
}).listen(PORT, "127.0.0.1", () => console.log(`FINN local on http://127.0.0.1:${PORT}`));
