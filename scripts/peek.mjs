import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
const [s, pg, n] = process.argv.slice(2);
const c = await fetchCompany(s);
const d = await fetchPdfPages(pickCalls(c, 1)[0].transcript, { maxPages: 45 });
console.log(d.pages[Number(pg)].slice(0, Number(n || 1500)));
