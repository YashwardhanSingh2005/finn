// Ship the document-level cache with the deployment. Exchange PDFs are immutable, and exchange hosts
// often refuse or tarpit cloud IPs, so the text of every transcript FINN has already read (and the
// code-only analyses derived from it) is bundled as a read-only seed. A fresh deployment is then warm
// for the whole portfolio and does not depend on the exchange archives answering.
//   FINN_DISK_CACHE=/path/to/cache node scripts/seed.mjs
// Only current-version, document-keyed entries are copied. No model output is seeded.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
const SRC = process.env.FINN_DISK_CACHE, OUT = new URL("../seed/", import.meta.url).pathname;
if (!SRC) { console.error("set FINN_DISK_CACHE to the cache directory to seed from"); process.exit(1); }
const KEEP = /^(pdf_v1_|callstat_v3_|callcheck_v3_|auditor_v3_|candour_v4_)/;
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
let n = 0, raw = 0, gz = 0;
for (const f of readdirSync(SRC)) {
  if (!KEEP.test(f)) continue;
  const b = readFileSync(`${SRC}/${f}`);
  const rec = JSON.parse(b);
  if (rec?.v?.error || rec?.v?.degraded) continue; // never seed a failure
  const z = gzipSync(b, { level: 9 });
  writeFileSync(`${OUT}${f}.gz`, z); n++; raw += b.length; gz += z.length;
}
console.log(`${n} entries, ${(raw / 1e6).toFixed(1)} MB → ${(gz / 1e6).toFixed(1)} MB gzipped in seed/`);
