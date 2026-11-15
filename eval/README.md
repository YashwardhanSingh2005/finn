# Evaluations and ablations

Every number FINN shows is either computed in code or checked against its source. This folder records how those checks were evaluated, including what didn't work.

## 1. Non-answer detector (Candour tab)

**Method.** The detector pairs each analyst question with the management turn that follows. It flags a pair when the answer matches a phrase lexicon in three categories:
- **refuse:** "we don't give…", "would not like to comment"
- **unable:** "difficult to say", "too early to say"
- **defer:** "take it offline", "come back to you"

The categories follow Gow, Larcker & Zakolyukina (2021), *Non-answers during conference calls*, JAR. No model is involved.

**Protocol.** Labels are hand-judged: *did management withhold the specific information asked for?* Each version was measured on a **new random sample** of pairs, never on the pairs used to write its rules.

| Version | What changed | Precision (flagged pairs judged real dodges) | Unflagged answers that were dodges | Est. recall |
|---|---|---|---|---|
| v1 | Base lexicon, 15 patterns | **37 / 40 = 92.5%** (all 40 detections, 10 companies, 36 calls) | 3 / 40 (7.5%) | ≈ 55% |
| v2 | +5 patterns from v1's misses ("don't want to comment", "let's see how it pans out", …) | n/a | 4 / 40 (10%), fresh sample | ≈ 50% |
| v3 | +4 patterns from v2's misses; pleasantries ("thanks, happy Diwali") excluded from the denominator | **18 / 21 = 86%** (fresh sample) | 2–3 / 40 (5–7.5%), fresh sample | ≈ 55–60% |

**Reading.**
- Precision is high: when FINN says management dodged, it almost always did, and the receipt (the verbatim answer with its page) lets the user check.
- Recall plateaus at roughly 55–60%. Every new sample shows new wording for the same dodge: "restrict myself to saying", "hazard a guess", "drill into it". This is the known ceiling of lexicon methods.
- What still holds: **the same rules apply to every company and call**, so the detector undercounts consistently. Comparisons across calls and companies (the trend chart, the peer contrast) stay meaningful. Absolute rates should be read as lower bounds; the UI says this.
- All false positives are "unable"-type caveats inside an otherwise substantive answer. Refusals and deferrals were 100% precise in v1.

**Next step (not built, by choice):** a cheap model as a second-stage classifier on *unflagged* pairs, with the lexicon kept as a transparent first stage. That would raise recall at the cost of explainability and money. For a credibility signal, I prioritised explainability.

**Files:**
- `nonanswers_raw.json` and `nonanswers_labelled.json`: v1 census of detections and their labels.
- `recall_sample*.txt` and `sample_v3_*.txt`: the random samples, with seeds in `scripts/eval_recall.mjs`.

### 1b. Candour features that were tested and kept or dropped

| Feature | Source | Result on 24 calls (6 companies) | Decision |
|---|---|---|---|
| Analyst praise rate | Milian & Smith 2017 | Varies widely and meaningfully: POLYCAB 11–22%, TCS about 0%, KAYNES 0%; trends move between calls | **Kept** (Candour table) |
| Recurring topics (bigrams asked by 3 or more different analysts) | analyst-skepticism literature; Chen, Nagar & Schoenfeld 2018 | After a finance stop-list: "volume growth (5)", "order book / working capital / metering (3)", "gross margin (4)" | **Kept** |
| Pushback asymmetry (dodge rate on hard vs routine questions) | GLZ 2021 + question-tone cue list | Informative but small-sample (5–18 hard questions per call); POLYCAB's latest call 23% vs 13% | **Kept, guarded**: shown only when there are 6 or more hard questions, with raw counts |
| Script echo (5-gram overlap of answers with prepared remarks) | Lee 2016, TAR | Almost never fires: 0% in 23 of 24 calls. Indian concall answers aren't read from a script | **Dropped**: computed, not shown |

### 1c. Transcript parser coverage

Indian transcripts come in several layouts:
- `Name: text` (most issuers)
- standalone `Name – Firm` headers (Bharti Airtel)
- `Name: Role - Company` with `Name, Firm` analyst headers (Tata Steel)
- `Questioner (…)` / `Company Speaker (…)` (Reliance)
- numbered management lists (Eternal)

A header-line normaliser classifies each speaker by affiliation: brokerages and funds count as analysts, officer titles as management. `test/parse_regression.mjs` pins the expected analyst-question count for 9 transcripts.

**One regression caught by the set:** an early version of the rule treated short management replies that mentioned "capital" as analyst headers, and TCS dropped from 28 to 15 questions. Now a `Name: …` line counts as a header only if it **ends** with an affiliation or title.

**Coverage of the 18-stock portfolio:**
- 2 companies don't publish transcripts (ITC, Trent).
- 1 links a non-PDF (Maruti).
- The remaining holdings parse.

### 1d. Transcript lag (SEBI LODR: transcript within 5 working days)

FINN reads the filing date from the exchange cover letter and the call date from the transcript header.
- **First run:** Bharti Airtel showed as 31 working days late. That was a false positive: the parser had taken "Q2 *ended* September 30, 2026" as the call date.
- **Fix:** dates preceded by "ended / ending / quarter / period" are ignored. A unit test pins this.
- **After the fix:** 24 calls across 13 holdings, all within the limit (0–5 working days). Tata Steel and L&T were skipped because they have no cover letter. The feature shows up as a hygiene row; it would flag a late filer.

### 1e. Does dodging predict the stock's reaction? (mini event study, inconclusive)

This tests Gow et al.'s finding on our own data. The sample is 40 recent calls across 16 holdings, dated with the transcript-lag parser. The return measure is the post-call cumulative return in units of each stock's own 60-day σ.

| Calls | n | Next session | Next 5 sessions |
|---|---|---|---|
| Above-median non-answer rate (> 5.9%) | 19 | −0.18σ | +0.29σ |
| At or below median | 21 | +0.07σ | +0.12σ |

The correlation between non-answer rate and the next-session return is −0.08, and −0.13 over five sessions.

**Reading:** the next-day difference points the way the literature predicts, but at n=40 it is not statistically meaningful (t ≈ −0.8), and over 5 days the sign reverses. **We do not claim that Candour predicts returns.** We present it as an explainable credibility lens with a verbatim receipt for every dodge. A proper test needs hundreds of calls (all NSE-500 companies over several years), which is the obvious next step once transcripts are cached at scale. Data: `candour_event_study.json`; script: `scripts/event_study_candour.mjs`.

### 1f. Auditor's-report scanner

This covers the 22 latest annual reports for the portfolio plus the demo set.

**Locating the reports.**
- The first version found the auditor's reports in 16 of the first 21. The misses were curly apostrophes ("Auditor’s") and titles broken across lines ("To\nThe Members").
- After making the patterns whitespace- and apostrophe-tolerant, it found them in 20 of 21. Bajaj Finance was the miss.
- Bajaj Finance prints the title as a running header ("Independent Auditor's Report on the Standalone Financial Statements"), and on the consolidated report the PDF text order puts that header *after* the body. The start is now also anchored on the SA 700 opening sentence ("We have [jointly] audited the accompanying…") on a page that carries the title and "To the Members of", and "(Contd.)" pages never count as a start.
- Result: **22 of 22** located, each with both the standalone and the consolidated report. I re-ran the new rule over the other 21 cached reports and nothing changed (same start pages, opinions and flags). A unit test pins the layout.

**Every flag, checked by hand:**

| Company | Flag | Verdict |
|---|---|---|
| Suzlon | Emphasis of matter: restatement of FY25 comparatives after an NCLT scheme | Genuine |
| Maruti | Emphasis of matter: can't reliably estimate end-of-life-vehicle EPR obligations | Genuine |
| Eternal | Emphasis of matter: GST orders on delivery charges | Genuine |
| Dixon | Emphasis of matter: ₹1,110 cr of PLI incentive income recognised at a subsidiary | Genuine |
| HAL | Emphasis of matter, standalone and consolidated: pay-revision and contribution notes | Genuine |
| HAL | "Going-concern uncertainty" (₹12.8 lakh net liability) | **Mis-attributed**: it concerns a group entity reproduced in the consolidated report. Fix: a going-concern paragraph that appears only in the consolidated report is now a "watch" flag labelled *group company*, pinned by a unit test. |

The table has 10 flags in 5 companies (Suzlon, Maruti and Eternal each carry the same paragraph in both the standalone and the consolidated report). 9 of the 10 were correct as originally labelled, and all 10 after the fix. A script also confirms that each quote is on the page it cites, under the right heading. All opinions were unmodified, so there were no qualified, adverse or disclaimer cases in this sample to test against; the unit tests cover those paths synthetically.

## 2. Triage score (Push): backtest

This is reproduced in the app under Rules → *Does the score work?* and in the main README.

Every portfolio filing from the past year was re-scored **without** the market-reaction term, then compared with the stock's next-session move in units of its own 60-day volatility (σ).

| Tier | v1 (before the per-category review), last 6 months: avg move · share of moves ≥ 2σ | v2, last 6 months (tuning half): avg move · share ≥ 2σ | **v2, the 6 months before (held out): avg move · share ≥ 2σ** |
|---|---|---|---|
| Needs you | 0.86σ · 10% (17% of filings) | 1.31σ · 22% (5% of filings) | **1.48σ · 27%** |
| Worth a read | 0.92σ · 9% | 0.83σ · 8% | 1.02σ · 12% |
| Filed away | 0.83σ · 7% | 0.82σ · 7% | 0.95σ · 11% |

**What the per-category breakdown showed** (v1, 180 days, 1,199 filings):
- Results (1.18σ, 16% big moves) and management changes (1.00σ, 16%) carried signal.
- M&A (0.64σ), fund raises (0.68σ), litigation (0.65σ) and credit ratings (0.72σ) didn't, yet v1 weighted them 70–85.
- Routine filings were misfiled as urgent: ESOP allotments as "fund raise", takeover-code disclosures as "M&A", and AGM e-voting results as "results".

**v2 changes:**
- Those routine phrasings are now matched first.
- Base scores lowered: M&A 85→65, fund raise 75→55, litigation 70→55, rating 55→45.

**Caveats:** one portfolio, one year, next-session moves only, and σ estimated from the trailing 60 days. This is a sanity check, not proof.

## 3. Promise Ledger: quote verification

Every quote a model returns is checked against the source transcript text, using a fuzzy 4-gram match with a 60% threshold.
- On POLYCAB's four calls, 29 of 29 extracted promises verified; none were dropped.
- The UI shows the drop count per call, so a hallucinated quote would be visible as a "dropped" count, never shown as fact.
- Unit tests cover verbatim, reflowed and invented quotes (`test/core.test.mjs`).

**Judge error found by inspection.** The model marked a working-capital target of 50–55 days as "missed" when the actual was 15 days, which is better. Fix: the judge prompt now states the favourable direction for each metric type, and verdicts without a verified evidence quote are withheld.

## 4. Model routing

| Task | Model | Observation |
|---|---|---|
| Extraction (claims, bios, results lines, business) | Claude Haiku 5.5, thinking **off** | With default adaptive thinking it hit `max_tokens` on every transcript, returning truncated JSON and 0 claims. With thinking off: 4.4 s, about 1k output tokens, $0.002 per transcript. |
| Cross-call judgement, bull/bear | Claude Opus 5.5, adaptive thinking, medium effort | One batched call per company (12–16 promise threads) instead of one call per promise: about 10× fewer calls. |

## Reproducing

```bash
npm test                                   # 24 unit tests over the deterministic core
FINN_DISK_CACHE=./.cache NODE_USE_ENV_PROXY=1 node scripts/eval_nonanswers.mjs POLYCAB KAYNES ASIANPAINT HAL JUBLFOOD TCS DIXON RELIANCE SUZLON TRENT
SEED=99991 MODE=unflagged node scripts/eval_recall.mjs    # recall sample
SEED=99991 MODE=flagged   node scripts/eval_recall.mjs    # precision sample
```
