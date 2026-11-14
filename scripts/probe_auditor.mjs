import { fetchCompany } from "../netlify/lib/screener.js";
import { auditorFindings } from "../netlify/lib/auditor.js";
for (const s of process.argv.slice(2)) {
  try {
    const c = await fetchCompany(s);
    const r = await auditorFindings(c.docs.annualReports[0]);
    console.log("=====", s, r.year, "pages", r.nPages, "clean", r.clean, r.error || "");
    for (const x of r.reports || []) console.log("  report", x.basis, "p" + x.startPage, x.opinion, "EoM:", x.emphasisOfMatter?.page || "-", "GC:", x.goingConcern?.page || "-", "KAM×", x.kamMentions, "| op ev:", (x.opinionEv?.quote || "").slice(0, 90));
    for (const f of r.flags || []) console.log("  FLAG", f.level, f.title, "p" + f.ev?.page, "|", (f.ev?.quote || "").slice(0, 160));
  } catch (e) { console.log(s, "ERR", e.message); }
}
