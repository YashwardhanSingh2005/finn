// Unit tests for the deterministic core — everything that decides what the investor sees without a model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, score, amountCr } from "../netlify/lib/classify.js";
import { verifyQuote, norm } from "../netlify/lib/pdf.js";
import { resolveHorizon, numericVerdict, actualFor, callToFQ } from "../netlify/lib/ledger.js";
import { periodToFQ } from "../netlify/lib/fundamentals.js";
import { NON_ANSWER, parseTranscript, analyseCall } from "../netlify/lib/discourse.js";
import { priceStats, evaluate } from "../netlify/lib/alerts.js";

test("classifier: routine phrasings are caught before the material categories they resemble", () => {
  assert.equal(classify("Allotment of Securities", "allotment of equity shares under ESOP 2021").category, "unclassified");
  assert.equal(classify("Disclosure under SEBI Takeover Regulations", "").category, "insider_trading");
  assert.equal(classify("Shareholders meeting", "results of e-voting at the AGM").category, "agm_egm");
  assert.equal(classify("Outcome of Board Meeting", "approved the unaudited financial results for the quarter").category, "results");
  assert.equal(classify("Change in Directors", "resignation of Chief Financial Officer").category, "management_change");
  assert.equal(classify("Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of the earnings call").category, "earnings_call");
  assert.equal(classify("Analysts/Institutional Investor Meet/Con. Call Updates", "schedule of analyst meet").category, "investor_meetings");
  assert.equal(classify("Acquisition", "acquisition of 100% stake in XYZ").category, "M&A");
  assert.equal(classify("Reference To The Financial Results Issued By Suzuki Motor Corporation", "").category, "press_release", "parent's results are not the filer's results");
});

test("classifier: every decision carries a readable reason", () => {
  const c = classify("Credit Rating", "ICRA reaffirmed AA+");
  assert.match(c.rule, /matched/);
});

test("amount parser: crore, lakh, million, USD", () => {
  assert.equal(amountCr("order worth Rs. 1,250 crore"), 1250);
  assert.equal(amountCr("INR 50 lakh"), 0.5);
  assert.equal(amountCr("₹ 300 million"), 30);
  assert.ok(Math.abs(amountCr("USD 10 million contract") - 88) < 1);
  assert.equal(amountCr("no money here"), null);
});

test("score: itemised parts sum to the total and tiers follow thresholds", () => {
  const s = score({ category: "results", subject: "Outcome of Board Meeting", summary: "financial results" }, { weightPct: 9 });
  assert.equal(s.parts.reduce((a, p) => a + p.v, 0), s.score);
  assert.equal(s.tier, "act");
  const r = score({ category: "results", subject: "Board Meeting Intimation", summary: "to consider financial results" }, {});
  assert.ok(r.score < 70, "a date notice is not urgent");
  const m = score({ category: "management_change", subject: "Change in KMP", summary: "appointment of Company Secretary" }, {});
  assert.ok(m.score < 70, "non-CXO change is not urgent");
});

test("score: SEBI Reg 30 materiality line appears when an amount is present", () => {
  const s = score({ category: "press_release", subject: "Order win", summary: "order of Rs 500 crore" }, { ttmSalesCr: 4000, sebiThresholdCr: 80 });
  assert.ok(s.parts.some((p) => p.k === "SEBI materiality" && p.v > 0));
});

test("score: user rules can mute a category", () => {
  const s = score({ category: "dividend", subject: "Dividend", summary: "" }, { prefs: { muted: { dividend: true } } });
  assert.equal(s.score, 0);
});

test("quote verification: verbatim passes, minor reflow passes, invention fails", () => {
  const pages = ["Intro text.", "We remain confident of sustaining medium- to long-term EBITDA margins within our guided range of 11% to 13% for the business."];
  assert.equal(verifyQuote("we remain confident of sustaining medium- to long-term EBITDA margins within our guided range of 11% to 13%", pages).page, 2);
  assert.ok(verifyQuote("We remain confident of sustaining medium to long term EBITDA margins within our guided range of 11% to 13%", pages).ok);
  assert.equal(verifyQuote("We expect revenue to double next year driven by exports and new plants", pages).ok, false);
  assert.equal(norm("Hello,  World!"), "hello world");
});

test("fiscal calendar: Indian FY ends March", () => {
  assert.deepEqual(periodToFQ("Sep 2026"), { fy: 2027, q: 2 });
  assert.deepEqual(periodToFQ("Mar 2026"), { fy: 2026, q: 4 });
  assert.deepEqual(callToFQ("Oct 2026"), { fy: 2027, q: 2 });
  assert.deepEqual(callToFQ("Feb 2026"), { fy: 2026, q: 3 });
});

test("horizon resolution", () => {
  assert.equal(resolveHorizon("FY27").quarters.length, 4);
  assert.equal(resolveHorizon("Q3FY27").label, "Q3FY27");
  assert.equal(resolveHorizon("H2 FY27").quarters.length, 2);
  assert.equal(resolveHorizon("next quarter", { fy: 2027, q: 4 }).label, "Q1FY28");
  assert.equal(resolveHorizon("medium term", { fy: 2027, q: 2 }), null);
});

test("numeric verdicts: bands, floors, partial periods, tolerance", () => {
  assert.equal(numericVerdict({ low: 10, high: 12 }, { actual: 11, unit: "% YoY", reported: 4, total: 4 }).verdict, "delivered");
  assert.equal(numericVerdict({ low: 10, high: 12 }, { actual: 9.6, unit: "% YoY", reported: 4, total: 4 }).verdict, "delivered", "within 0.5pt tolerance");
  assert.equal(numericVerdict({ low: 10, high: 12 }, { actual: 8, unit: "% YoY", reported: 4, total: 4 }).verdict, "missed");
  assert.equal(numericVerdict({ low: 10, high: 12 }, { actual: 15, unit: "% YoY", reported: 4, total: 4 }).verdict, "beat");
  assert.equal(numericVerdict({ low: 10, high: null }, { actual: 8, unit: "% YoY", reported: 2, total: 4 }).verdict, "behind");
  assert.equal(numericVerdict({ low: 10, high: null }, { actual: 12, unit: "% YoY", reported: 2, total: 4 }).verdict, "on track");
});

test("actuals are computed from reported quarters, year-to-date when the period is open", () => {
  const qi = new Map([["2026-1", { period: "Jun 2025", rev: 100, op: 10, pat: 5 }], ["2026-2", { period: "Sep 2025", rev: 100, op: 10, pat: 5 }], ["2027-1", { period: "Jun 2026", rev: 112, op: 14, pat: 6 }], ["2027-2", { period: "Sep 2026", rev: 118, op: 15, pat: 7 }]]);
  const a = actualFor({ metric: "revenue_growth" }, resolveHorizon("FY27"), qi);
  assert.equal(a.actual, 15);
  assert.equal(a.reported, 2);
  const m = actualFor({ metric: "ebitda_margin" }, resolveHorizon("FY27"), qi);
  assert.equal(m.actual, 12.6);
});

test("non-answer lexicon: catches refusals/inability/deferrals, ignores real answers", () => {
  const hit = (t) => NON_ANSWER.find(([re]) => re.test(t))?.[1] || null;
  assert.equal(hit("We don't give a split of the FMEG portfolio."), "refuse");
  assert.equal(hit("It is too early to say what the impact will be."), "unable");
  assert.equal(hit("Can I suggest we take it offline?"), "defer");
  assert.equal(hit("Margins were 14.2% this quarter, up 90 bps sequentially."), null);
});

test("transcript parsing: Q&A starts at the first question, not at the opening announcement", () => {
  const pages = [
    "MANAGEMENT: MR. NIKHIL JAISINGHANI – MD\nMR. NIYANT MARU – CFO\n",
    "Moderator: Welcome. There will be an opportunity for you to ask questions after the presentation.\nNiyant Maru: Revenue grew strongly and margins improved this quarter.\nModerator: The first question is from the line of Kevin Shah.\nKevin Shah: What is the split of FMEG?\nNiyant Maru: We don't give a split of the FMEG portfolio.\nModerator: The next question is from Ravi.\nRavi Kumar: What were margins?\nNikhil Jaisinghani: Margins were 14.2%, up 90 basis points.",
  ];
  const { turns } = parseTranscript(pages);
  assert.equal(turns.find((t) => t.speaker === "Niyant Maru").section, "prepared");
  const r = analyseCall(pages);
  assert.equal(r.questions, 2);
  assert.equal(r.nonAnswers.length, 1);
  assert.equal(r.nonAnswerRate, 50);
});

test("alerts: volume and sigma triggers explain themselves", () => {
  const s = Array.from({ length: 80 }, (_, i) => ({ date: `2026-01-${String(i).padStart(2, "0")}`, close: 100 + (i % 2 ? 0.5 : -0.5), volume: 1000 }));
  s.push({ date: "2026-03-30", close: 106, volume: 5000 });
  const st = priceStats(s);
  const al = evaluate(st, { movePct: 5, volX: 2, sigma: 2.5, volWindow: 20, sigmaWindow: 60 });
  assert.ok(al.some((a) => a.kind === "volume" && /5× normal/.test(a.title)));
  assert.ok(al.some((a) => a.kind === "move"));
});

import { betaQuantile, credibility } from "../netlify/lib/credibility.js";
test("credibility: Beta posterior quantiles and style labels", () => {
  assert.ok(Math.abs(betaQuantile(0.5, 1, 1) - 0.5) < 1e-6);
  assert.ok(Math.abs(betaQuantile(0.1, 2, 2) - 0.1958) < 1e-3);
  const c = credibility([
    { verdict: "delivered", history: [{ change: "first said" }, { change: "lowered" }] },
    { verdict: "delivered", history: [{ change: "first said" }] },
    { verdict: "missed", history: [{ change: "first said" }] },
    { verdict: "too early", history: [] },
  ]);
  assert.equal(c.scored, 3);
  assert.equal(c.pNext, 60); // Beta(3,2) mean
  assert.equal(c.style, "walks down, then beats");
  assert.equal(credibility([{ verdict: "too early", history: [] }]), null);
});

import { transcriptLag } from "../netlify/lib/discourse.js";
test("transcript lag: cover-letter date vs call date, in working days", () => {
  const pages = ["Date: October 19, 2026\nTo BSE Limited, Listing Department", "Polycab India Limited Q2 FY27 Earnings Conference Call\nOctober 15, 2026"];
  const r = transcriptLag(pages);
  assert.equal(r.callDate, "2026-10-15");
  assert.equal(r.filedDate, "2026-10-19");
  assert.equal(r.workingDays, 2); // Fri 16, Mon 19
  assert.equal(r.late, false);
  assert.equal(transcriptLag(["no cover letter here", "x"]), null);
  const airtel = transcriptLag(["Date: November 12, 2026\nBSE Limited", "Transcript of Bharti Airtel Q2 ended September 30, 2026 Earnings Webinar held on November 10, 2026"]);
  assert.equal(airtel.callDate, "2026-11-10", "quarter-end date is not the call date");
});

import { revenueMix } from "../netlify/lib/research.js";
test("revenue mix parsed from the cited investor-presentation breakup", () => {
  const r = revenueMix("Revenue Breakup (Q2 FY27):[1] - BFSI: 32.8% - Consumer Business: 14.9% - Life Sciences & Healthcare: 10.3% - Manufacturing: 9.0% - Technology & Services: 8.6% - Energy, Resources & Utilities: 6.2% - Communication & Media: 5.8% - Regional Markets & Others: 12.4%");
  assert.equal(r.segments.length, 8);
  assert.equal(r.segments[0].name, "BFSI");
  assert.equal(r.label, "Q2 FY27");
  assert.equal(revenueMix("Leader in wires with 25% share"), null);
});

import { analyseAudit } from "../netlify/lib/auditor.js";
test("auditor scan: opinion type, emphasis of matter, CARO flags (and negations ignored)", () => {
  const clean = analyseAudit({
    10: "Independent Auditor’s Report\nTo the Members of X Limited\nReport on the Audit of the Standalone Financial Statements\nOpinion\nIn our opinion the financial statements give a true and fair view.\nKey Audit Matters\nRevenue recognition",
    20: "Annexure A to the Independent Auditor’s Report\nCompanies (Auditor's Report) Order, 2020\nThere were no defaults in repayment of loans. The Company has not incurred cash losses.",
  }, 30);
  assert.equal(clean.reports.length, 1);
  assert.equal(clean.reports[0].opinion, "unmodified");
  assert.equal(clean.clean, true, "negated CARO phrases must not flag");
  const bad = analyseAudit({
    10: "Independent Auditor’s Report\nTo the Members of Y Limited\nReport on the Audit of the Consolidated Financial Statements\nQualified Opinion\nBasis for Qualified Opinion\nThe company has not provided for interest.\nEmphasis of Matter\nWe draw attention to Note 17 which describes the restatement of comparative figures. Our opinion is not modified in respect of this matter.",
    20: "Annexure A to the Independent Auditor’s Report\nCompanies (Auditor's Report) Order, 2020\nThe Company has defaulted in the repayment of loans to a bank.",
  }, 30);
  assert.equal(bad.reports[0].opinion, "qualified");
  assert.ok(bad.flags.some((f) => /Qualified audit opinion/.test(f.title)));
  assert.ok(bad.flags.some((f) => /Emphasis of matter/.test(f.title) && /restatement/.test(f.ev.quote)));
  assert.ok(bad.flags.some((f) => /Default on borrowings/.test(f.title)));
});

test("auditor scan: going-concern only in the consolidated report is attributed to a group company", () => {
  const r = analyseAudit({
    10: "Independent Auditor’s Report\nTo the Members of Z Limited\nReport on the Audit of the Standalone Financial Statements\nOpinion\nIn our opinion the financial statements give a true and fair view.",
    40: "Independent Auditor’s Report\nTo the Members of Z Limited\nReport on the Audit of the Consolidated Financial Statements\nOpinion\ngive a true and fair view.\nMaterial uncertainty related to going concern\nThe JV company has a net liability of 12 lakhs indicating an uncertainty.",
  }, 60);
  assert.ok(r.flags.some((f) => /group company/.test(f.title) && f.level === "watch"));
  assert.ok(!r.flags.some((f) => f.level === "risk"));
});

test("auditor scan: running-title layout (title after the body in text order) is located; continuation pages are not starts", () => {
  const r = analyseAudit({
    10: "226 Annual Report 2025-26\nIndependent Auditor's Report on the Standalone Financial Statements\nTo the Members of Q Limited\nOpinion\n1. We have jointly audited the accompanying standalone financial statements of Q Limited. In our opinion the aforesaid standalone financial statements give a true and fair view.",
    11: "Key audit matter How our audit addressed\nIndependent Auditor's Report on the Standalone Financial Statements (Contd.)\nTo the Members of Q Limited we report our opinion; we have audited the accompanying statements.",
    40: "366 Annual Report 2025-26\nTo the Members of Q Limited\nOpinion\n1. We have jointly audited the accompanying consolidated financial statements of Q Limited. In our opinion the aforesaid consolidated financial statements give a true and fair view.\nIndependent Auditor's Report on the Consolidated Financial Statements",
    41: "Emphasis handled elsewhere.\nIndependent Auditor's Report on the Consolidated Financial Statements (Contd.)",
  }, 60);
  assert.deepEqual(r.reports.map((x) => [x.basis, x.startPage, x.opinion]), [["standalone", 10, "unmodified"], ["consolidated", 40, "unmodified"]]);
  assert.equal(r.clean, true);
});

test("snapshot keys: digest windows bucket up, custom ranges use the widest, per-URL views are not snapshotted", async () => {
  const { snapKey } = await import("../src/snapkey.js");
  assert.equal(snapKey("digest", { hours: 24 }), "digest_24");
  assert.equal(snapKey("digest", { hours: 30 }), "digest_72");
  assert.equal(snapKey("digest", { hours: 5000 }), "digest_720");
  assert.equal(snapKey("digest", { from: "2026-10-01T00:00:00Z" }), "digest_720");
  assert.equal(snapKey("ledger", { symbol: "POLYCAB", judge: 0 }), "ledger_POLYCAB_0");
  assert.equal(snapKey("brief", { symbol: "POLYCAB", part: "bullbear" }), "brief_POLYCAB_bullbear");
  assert.match(snapKey("filing", { url: "https://www.bseindia.com/a.pdf", category: "results" }), /^filing_[0-9a-z]+_results$/);
  assert.notEqual(snapKey("filing", { url: "https://www.bseindia.com/a.pdf" }), snapKey("filing", { url: "https://www.bseindia.com/b.pdf" }));
  assert.equal(snapKey("search", { q: "x" }), null);
});

test("seed cache: a document already read is served from the shipped seed, with no persistent store", async () => {
  const { readdirSync } = await import("node:fs");
  const dir = new URL("../seed/", import.meta.url).pathname;
  const f = readdirSync(dir).find((x) => x.startsWith("auditor_v3_"));
  assert.ok(f, "seed/ has auditor entries");
  const saved = process.env.FINN_DISK_CACHE; delete process.env.FINN_DISK_CACHE;
  const { cache } = await import("../netlify/lib/cache.js?seedtest");
  const key = f.replace(/\.json\.gz$/, ""); // already in its file-safe form, which safe() leaves unchanged
  const v = await cache.get(key);
  assert.ok(v && Array.isArray(v.reports), "seeded auditor analysis is returned");
  assert.equal(await cache.get("auditor_v3_no_such_document"), null);
  if (saved) process.env.FINN_DISK_CACHE = saved;
});
