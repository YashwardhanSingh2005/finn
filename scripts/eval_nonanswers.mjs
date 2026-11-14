// Collect every non-answer detection across companies for a hand-labelled precision audit.
import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { candour } from "../netlify/lib/discourse.js";
import { writeFile } from "node:fs/promises";
const out = [], stats = [];
for (const s of process.argv.slice(2)) {
  try {
    const c = await fetchCompany(s);
    const r = await candour(c, pickCalls(c, 4));
    for (const x of r.calls) {
      if (x.error) { stats.push({ s, period: x.period, error: x.error }); continue; }
      stats.push({ s, period: x.period, parsed: x.parsed, q: x.questions, na: x.nonAnswers.length, prepTone: x.prepared.tone, prepN: x.prepared.n, qaN: x.qa.n });
      for (const na of x.nonAnswers) out.push({ s, period: x.period, ...na });
    }
    console.error(s, "ok", r.divergence?.verdict);
  } catch (e) { console.error(s, "FAIL", e.message); }
}
await writeFile("eval/nonanswers_raw.json", JSON.stringify({ detections: out, calls: stats }, null, 1));
console.log(out.length, "detections;", stats.length, "calls");
