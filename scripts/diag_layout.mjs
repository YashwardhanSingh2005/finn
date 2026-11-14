import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { analyseCall } from "../netlify/lib/discourse.js";
for (const s of process.argv.slice(2)) {
  const c = await fetchCompany(s);
  const calls = pickCalls(c, 2);
  if (!calls.length) { console.log(s, "NO TRANSCRIPTS LISTED"); continue; }
  for (const call of calls) {
    try {
      const d = await fetchPdfPages(call.transcript, { maxPages: 45 });
      const r = analyseCall(d.pages);
      const sample = d.pages.slice(2, 6).join("\n").split("\n").filter((l) => /^[A-Z][^a-z]{0,3}[A-Za-z .()–-]{3,60}$/.test(l.trim()) || /:\s/.test(l.slice(0, 40))).slice(0, 6);
      console.log(s, call.period, "Q=" + r.questions, "pages=" + d.nPages, "| host", new URL(call.transcript).host, "| sample lines:", JSON.stringify(sample).slice(0, 300));
      break;
    } catch (e) { console.log(s, call.period, "FETCH", e.message.slice(0, 50)); }
  }
}
