// Mini event study: does dodging on the call go with a worse post-call stock reaction?
// For each (holding, call): non-answer rate, call date (from the transcript), and the stock's
// cumulative return over the next 1 and 5 sessions, in units of its own 60-day daily σ.
import { fetchCompany, fetchPrices } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { analyseCall } from "../netlify/lib/discourse.js";
import { writeFile } from "node:fs/promises";
const SYMS = process.argv.slice(2);
const rows = [];
for (const s of SYMS) {
  try {
    const c = await fetchCompany(s);
    const px = (await fetchPrices(c.companyId, 400)).filter((x) => x.close > 0);
    const rets = px.slice(1).map((x, i) => ({ date: x.date, r: Math.log(x.close / px[i].close) }));
    for (const call of pickCalls(c, 4)) {
      try {
        const a = analyseCall((await fetchPdfPages(call.transcript, { maxPages: 45 })).pages);
        if (!a.parsed || !a.lag) continue;
        const i0 = rets.findIndex((x) => x.date > a.lag.callDate); // first session after the call
        if (i0 < 61 || i0 + 5 > rets.length) continue;
        const win = rets.slice(i0 - 61, i0 - 1).map((x) => x.r), m = win.reduce((p, q) => p + q, 0) / win.length;
        const sd = Math.sqrt(win.reduce((p, q) => p + (q - m) ** 2, 0) / win.length);
        const car = (k) => rets.slice(i0, i0 + k).reduce((p, q) => p + q.r, 0) / (sd * Math.sqrt(k));
        rows.push({ s, call: call.period, date: a.lag.callDate, na: a.nonAnswerRate, q: a.questions, praise: a.praiseRate, toneQA: a.qa.tone, z1: +car(1).toFixed(2), z5: +car(5).toFixed(2) });
      } catch {}
    }
  } catch (e) { console.error(s, e.message); }
}
await writeFile("eval/candour_event_study.json", JSON.stringify(rows, null, 1));
const med = [...rows].map((r) => r.na).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
const hi = rows.filter((r) => r.na > med), lo = rows.filter((r) => r.na <= med);
const avg = (a, k) => +(a.reduce((p, r) => p + r[k], 0) / a.length).toFixed(2);
const corr = (k1, k2) => { const n = rows.length, x = rows.map((r) => r[k1]), y = rows.map((r) => r[k2]); const mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return +(sxy / Math.sqrt(sxx * syy)).toFixed(2); };
console.log(`events=${rows.length} median non-answer rate=${med}%`);
console.log(`high-dodge calls (n=${hi.length}): mean z1=${avg(hi, "z1")} z5=${avg(hi, "z5")}`);
console.log(`low-dodge  calls (n=${lo.length}): mean z1=${avg(lo, "z1")} z5=${avg(lo, "z5")}`);
console.log(`corr(non-answer rate, z1)=${corr("na", "z1")}  corr(na, z5)=${corr("na", "z5")}  corr(praise, z1)=${corr("praise", "z1")}  corr(toneQA, z1)=${corr("toneQA", "z1")}`);
