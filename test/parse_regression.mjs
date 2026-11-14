// Parser regression set: expected analyst-question counts on known transcripts (needs the local PDF cache).
// Run: FINN_DISK_CACHE=... node test/parse_regression.mjs
import { fetchCompany } from "../netlify/lib/screener.js";
import { pickCalls } from "../netlify/lib/ledger.js";
import { fetchPdfPages } from "../netlify/lib/pdf.js";
import { analyseCall } from "../netlify/lib/discourse.js";
const EXPECT = { POLYCAB: [25, 32], TCS: [24, 32], KAYNES: [20, 28], BHARTIARTL: [20, 35], RELIANCE: [10, 20], DIXON: [25, 36], SUZLON: [30, 45], ETERNAL: [30, 50], TATASTEEL: [8, 30] };
let bad = 0;
for (const [s, [lo, hi]] of Object.entries(EXPECT)) {
  try {
    const c = await fetchCompany(s);
    const r = analyseCall((await fetchPdfPages(pickCalls(c, 1)[0].transcript, { maxPages: 45 })).pages);
    const ok = r.questions >= lo && r.questions <= hi;
    if (!ok) bad++;
    console.log(ok ? "ok  " : "FAIL", s.padEnd(11), `Q=${r.questions} (expect ${lo}-${hi}) analysts=${r.analysts} NA=${r.nonAnswers.length}`);
  } catch (e) { console.log("SKIP", s, e.message.slice(0, 40)); }
}
process.exit(bad ? 1 : 0);
