import { readdirSync, readFileSync } from "node:fs";
import { analyseAudit } from "../netlify/lib/auditor.js";
const dir = "/scratch/ee/btech/ee3230385/finn-cache";
for (const f of readdirSync(dir).filter((x) => x.startsWith("arpages_v2"))) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`)).v;
  const r = analyseAudit(d.pages, d.nPages);
  if (!r.flags.length) continue;
  const who = (Object.values(d.pages).join(" ").match(/To the Members of\s+([A-Z][A-Za-z&().\s]{3,60}?(?:Limited|LIMITED|Ltd))/i) || [])[1] || f.slice(40, 90);
  console.log("=====", who.replace(/\s+/g, " "));
  for (const x of r.flags) console.log(" -", x.title, "p" + x.ev?.page, "|", (x.ev?.quote || "").slice(0, 330));
}
