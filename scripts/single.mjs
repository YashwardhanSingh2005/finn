// Build ONE self-contained HTML file: the app + the recorded snapshot inlined. It needs no server at
// all, so it can be opened from disk, attached to an email, or dropped on any static host.
//   npm run build && node scripts/single.mjs [out.html] [--fragment]
// --fragment writes the page without <html>/<head>/<body> wrappers (for hosts that add their own).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fragment = args.includes("--fragment");
const out = args.find((a) => !a.startsWith("--")) || join(root, "dist", "finn-snapshot.html");

const assets = join(root, "dist", "assets");
const pick = (ext) => readFileSync(join(assets, readdirSync(assets).find((f) => f.endsWith(ext))), "utf8");
const js = pick(".js"), css = pick(".css");

const snapDir = join(root, "public", "snapshot");
const index = JSON.parse(readFileSync(join(snapDir, "index.json"), "utf8"));
const data = Object.fromEntries(index.keys.map((k) => [k, JSON.parse(readFileSync(join(snapDir, `${k}.json`), "utf8"))]));

// Safe to embed inside <script>: no "</script", no "<!--", no raw line separators.
const esc = (s) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const head = `<title>FINN</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="FINN: triages exchange filings and audits management's promises, with receipts. Recorded snapshot.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap">
<style>${css}
/* single-file copy: side gutters and edge bars respect a phone's system bars */
.app { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.tabs { padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }
${fragment ? `/* the host already pads the page by the top inset: the sticky bar sits below it, and the band above is painted */
.topbar { top: env(safe-area-inset-top, 0px); padding-top: 10px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.app { padding-bottom: 84px; }
.tabs { padding-bottom: env(safe-area-inset-bottom, 0px); }` : ""}
</style>`;
const body = `<div id="root"></div>
<script>window.__FINN_SNAPSHOT__ = ${esc(JSON.stringify({ index, data }))};</script>
<script type="module">${esc(js)}</script>`;

const html = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1024).toFixed(0)} kB, ${index.keys.length} recorded views from ${index.at}`);
