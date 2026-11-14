// Re-run the auditor analysis over every cached annual report (no downloads).
import { readdirSync, readFileSync } from "node:fs";
import { analyseAudit } from "../netlify/lib/auditor.js";
const dir = "/scratch/ee/btech/ee3230385/finn-cache";
for (const f of readdirSync(dir).filter((x) => x.startsWith("arpages_v2"))) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`)).v;
  const r = analyseAudit(d.pages, d.nPages);
  const who = (Object.values(d.pages).join(" ").match(/To the Members of\s+([A-Z][A-Za-z&().\s]{3,60}?(?:Limited|LIMITED|Ltd))/) || [])[1] || f.slice(40, 60);
  console.log(who.replace(/\s+/g, " ").slice(0, 40).padEnd(42), r.reports.map((x) => `${x.basis}:p${x.startPage}:${x.opinion}`).join(" "), "| flags:", r.flags.map((x) => `${x.title}@p${x.ev?.page}`).join("; "));
}
