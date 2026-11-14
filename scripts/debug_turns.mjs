import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { parseTranscript } from "../netlify/lib/discourse.js";
const c = await fetchCompany(process.argv[2]);
const d = await fetchPdfPages(pickCalls(c, 1)[0].transcript, { maxPages: 45 });
const { turns } = parseTranscript(d.pages);
const sp = {};
for (const t of turns) { const k = `${t.speaker} [${t.role}/${t.section || "-"}]`; sp[k] = (sp[k] || 0) + 1; }
console.log(Object.entries(sp).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v}× ${k}`).join("\n"));
