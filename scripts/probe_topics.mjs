import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { analyseCall } from "../netlify/lib/discourse.js";
for (const s of process.argv.slice(2)) {
  const c = await fetchCompany(s);
  for (const call of pickCalls(c, 4)) {
    try {
      const r = analyseCall((await fetchPdfPages(call.transcript, { maxPages: 45 })).pages);
      console.log(s, call.period, "praise", r.praiseRate + "%", "push", JSON.stringify(r.pushback), "scripted", r.scriptedRate + "%/" + r.scriptedHard, "| topics:", r.topics.map((t) => `${t.topic}(${t.analysts})`).join(", "));
    } catch (e) { console.log(s, call.period, "ERR", e.message.slice(0, 40)); }
  }
}
