import { fetchCompany } from "../netlify/lib/screener.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { writeFile } from "node:fs/promises";
const c = await fetchCompany(process.argv[2]);
const call = c.docs.concalls.find((x) => x.transcript);
const d = await fetchPdfPages(call.transcript, { maxPages: 40 });
await writeFile(process.argv[3], JSON.stringify(d));
console.log(call.period, d.nPages, d.pages.slice(0, 3).map((p) => p.slice(0, 700)).join("\n-----\n"));
