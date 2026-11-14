import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { transcriptLag } from "../netlify/lib/discourse.js";
for (const s of process.argv.slice(2)) {
  const c = await fetchCompany(s);
  for (const call of pickCalls(c, 2)) {
    try { console.log(s, call.period, JSON.stringify(transcriptLag((await fetchPdfPages(call.transcript, { maxPages: 3 })).pages))); } catch (e) { console.log(s, call.period, "ERR", e.message.slice(0, 30)); }
  }
}
