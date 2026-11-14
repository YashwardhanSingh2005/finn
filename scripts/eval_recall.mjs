// Random sample of UNFLAGGED question/answer pairs, for estimating recall by hand.
import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { parseTranscript, qaPairs, NON_ANSWER } from "../netlify/lib/discourse.js";
let seed = Number(process.env.SEED || 7); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pool = [];
for (const s of ["POLYCAB", "ASIANPAINT", "JUBLFOOD", "DIXON", "SUZLON", "TCS", "KAYNES", "HAL"]) {
  const c = await fetchCompany(s);
  let d = null;
  for (const call of pickCalls(c, 4)) { try { d = await fetchPdfPages(call.transcript, { maxPages: 45 }); break; } catch { /* exchange refused; try the previous call */ } }
  if (!d) { console.error(s, "no transcript fetchable"); continue; }
  for (const p of qaPairs(parseTranscript(d.pages).turns)) {
    const a = p.a.map((x) => x.text).join(" ").replace(/\s+/g, " ");
    const flagged = NON_ANSWER.some(([re]) => re.test(a));
    if (process.env.MODE === "flagged" ? !flagged : flagged) continue;
    pool.push({ s, q: p.q.text.replace(/\s+/g, " ").slice(0, 230), a: a.slice(0, 330) });
  }
}
const sample = pool.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).slice(0, 40).map((x) => x[1]);
console.log("pool", pool.length);
sample.forEach((x, i) => console.log(`\n#${i} ${x.s}\nQ: ${x.q}\nA: ${x.a}`));
