import { readdirSync, readFileSync } from "node:fs";
const dir = "/scratch/ee/btech/ee3230385/finn-cache";
for (const f of readdirSync(dir).filter((x) => x.startsWith("arpages_v2"))) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`)).v;
  const hits = Object.entries(d.pages).filter(([, t]) => /auditor/i.test(t) && /members/i.test(t)).slice(0, 2);
  const name = (Object.values(d.pages)[0] || "").slice(0, 0);
  for (const [p, t] of hits) { const i = t.search(/members/i); console.log(f.slice(60, 100), p, JSON.stringify(t.slice(Math.max(0, i - 160), i + 60))); }
}
