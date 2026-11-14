import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { candour } from "../netlify/lib/discourse.js";
for (const s of process.argv.slice(2)) {
  const c = await fetchCompany(s);
  const r = await candour(c, pickCalls(c, 4));
  console.log("=====", s, JSON.stringify(r.divergence));
  for (const x of r.calls) {
    if (x.error) { console.log(x.period, "ERR", x.error); continue; }
    console.log(x.period, `turns=${x.turns} Q=${x.questions} analysts=${x.analysts} NA=${x.nonAnswers.length} (${x.nonAnswerRate}%)`, "prep", JSON.stringify(x.prepared), "qa", JSON.stringify(x.qa), "g", JSON.stringify(x.growth));
    for (const na of x.nonAnswers.slice(0, 3)) console.log("   NA[" + na.kind + "] «" + na.phrase + "» p" + na.page + " | " + na.answer.slice(0, 160));
  }
}
