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
| Cross-call judgement, bull/bear | Claude Sonnet 5.5, adaptive thinking, medium effort | One batched call per company (12–16 promise threads) instead of one call per promise: about 10× fewer calls. |

## Reproducing

```bash
npm test                                   # 14 unit tests over the deterministic core
FINN_DISK_CACHE=./.cache NODE_USE_ENV_PROXY=1 node scripts/eval_nonanswers.mjs POLYCAB KAYNES ASIANPAINT HAL JUBLFOOD TCS DIXON RELIANCE SUZLON TRENT
SEED=99991 MODE=unflagged node scripts/eval_recall.mjs    # recall sample
SEED=99991 MODE=flagged   node scripts/eval_recall.mjs    # precision sample
```
