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
