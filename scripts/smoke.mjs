import company from "../netlify/functions/company.mjs";
import search from "../netlify/functions/search.mjs";
const r = await company(new Request("http://x/api/company?symbol=POLYCAB")); const j = await r.json();
console.log(r.status, j.name, j.analysis.results.period, j.analysis.results.rows.map(x=>x.label+":"+x.cur+"/"+x.yoy).join(" "), j.stats?.ret1d, j.stats?.volX);
console.log(Object.values(j.analysis).flatMap(x=>x?.flags||[]).map(f=>f.title));
console.log(j.docs.concalls.map(c=>c.period));
const s = await search(new Request("http://x/api/search?q=kaynes")); console.log(await s.json());
