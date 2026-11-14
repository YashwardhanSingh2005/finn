import { fetchPdfPages } from "../netlify/lib/pdf.js";
const t0=Date.now(); const d = await fetchPdfPages(process.argv[2]);
console.log(d.nPages, "pages", Date.now()-t0, "ms", d.pages.map(p=>p.length).reduce((a,b)=>a+b,0), "chars");
console.log(d.pages[Number(process.argv[3]||1)].slice(0,1500));
