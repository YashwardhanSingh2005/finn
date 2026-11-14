import { fetchCompany } from "../netlify/lib/screener.js";
import { analyse } from "../netlify/lib/fundamentals.js";
for (const s of process.argv.slice(2)) {
  const c = await fetchCompany(s); const a = analyse(c);
  console.log("=====", s, a.results.period, JSON.stringify(a.results.rows.map(r=>[r.label,r.cur,r.qoq,r.yoy])), a.results.margin);
  for (const k of ["trajectory","balance","cash","holders"]) console.log(k, a[k]?.flags.map(f=>`[${f.level}] ${f.title}: ${f.detail}`));
  console.log("traj", a.trajectory.revCagr, a.trajectory.patCagr, "cash", a.cash.cfoToPat, "de", a.balance.de);
}
