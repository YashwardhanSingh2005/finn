**To:** assessment@enam.com
**Subject:** IIT Delhi – AI Engineer - 2027

Dear ENAM team,

Please find my submission for the FINN build challenge below.

- **Prototype (open on a phone):** {{LIVE_URL}}
- **Repository:** https://github.com/YashwardhanSingh2005/finn
- **AI build history:** the Claude Code session export is attached (`FINN_build_history.html`, with access tokens redacted); `BUILD_LOG.md` in the repo summarises the main steps.
- **If the live link is slow or down:** `docs/index.html` in the repo is the whole app with a recorded snapshot in one file. It runs with no server and says on screen that it is a recording.

**What I built.** FINN is built on two ideas: an investor needs to know *what to read* and *whether to believe it*.

- **Push is a triage desk, not a feed.**
  - Every NSE filing across an 18-stock portfolio is sorted into *Needs you*, *Worth a read* or *Filed away*, for any time window, including "since your last visit".
  - Each card opens to an itemised 0–100 score: category, stage, seniority, deal size as a share of revenue, the SEBI Reg 30 materiality threshold, the market reaction in the stock's own volatility units, position weight, and your own rules.
  - Price and volume triggers are user-defined, either absolute or in σ.
  - Management changes come with the appointee's profile taken from the filing itself, plus LinkedIn.
  - Results come with Revenue, EBITDA, PBT and PAT, QoQ and YoY. EBITDA is computed in code from the filing's own lines and reconciled with standardised data.
- **Pull centres on two audits of management.**
  - **Candour** needs no model and costs nothing. Every analyst question is paired with management's answer. Non-answers are flagged after Gow, Larcker & Zakolyukina (2021), and each one is shown verbatim with its page. Tone and uncertainty are tracked over four calls, and a *narrative vs numbers* check fires when tone moves against reported growth. The same view shows topics several analysts kept pressing on, analyst praise, and a ranking of all holdings by how often their management dodges.
- **The Promise Ledger is the second audit.**
  - FINN reads a company's last four earnings calls and extracts every forward-looking promise, verifying each quote against the transcript.
  - It links the same promise across calls and flags when management moves the goalposts (a target lowered, or a deadline pushed out).
  - It checks each promise against reported numbers and turns the track record into a probability: *"83% chance the next promise is kept (80% range 63–98%)"*. This is a Beta posterior, following Hutton & Stocken (2009) on credibility being priced. It also labels the pattern, e.g. *"walks down, then beats"*.
  - The same view covers the business snapshot, trajectory, balance sheet, cash quality and a bull/bear case. Each bull or bear point may cite only verified evidence.
  - It works for any NSE ticker.
- **The auditor's report is read too.** A scanner with no model reads the latest annual report for the opinion type, emphasis-of-matter and going-concern paragraphs and adverse CARO remarks, each quoted with its page. It found the audit report in all 22 annual reports I ran it on and raised 10 flags in 5 companies, and I checked every one by hand.

**Key decisions**

1. **Models locate and quote; code computes.** No number on screen is produced by a model. Every model-supplied quote is checked against the source PDF; quotes that fail are dropped, and the drop is counted on screen.
2. **Rules before models for triage.** Rules are free, instant and explainable. Models are spent only on items that earn attention: a cheap model (Haiku) reads documents, and a stronger model (Opus) is used only for cross-call judgement, batched to one call per company. Everything is cached by document. A new company costs about ₹9 the first time and nothing after that, and a cost meter in the app shows the spend.
3. **I measured instead of asserting.** I hand-labelled the non-answer detector over three rounds on fresh samples: 86–92% precision and about 55–60% recall, reported as lower bounds. One literature idea, script-echo, didn't transfer to Indian calls, so I dropped it and documented why. A parser regression set covers 9 transcript layouts, and 24 unit tests cover the deterministic core.
4. **I tested whether the ranking works.** I re-scored a year of portfolio filings, leaving out the market-reaction term so the test isn't circular.
   - The first version barely separated urgent filings from routine ones.
   - A per-category breakdown showed which weights were wrong.
   - After re-tuning, the result held on the six months I hadn't tuned on: *Needs you* filings were followed by a ≥2σ move **27%** of the time, vs **11%** for routine ones. Only 6% of filings now reach *Needs you*.
   - The result is shown in the app, with its caveats.

5. **It fails in steps, and says so.** Exchange feeds hang from cloud hosts, so every call has a hard timeout and a circuit breaker. The digest falls back from NSE to BSE to a mirror, and failures are never cached. The text of documents already read ships with the deployment, so a cold start doesn't depend on the exchange archives. If a model call fails, the judgement tier drops one model; failing that, the ledger keeps only the verdicts computed in code and bull vs bear is sorted by rule. If the backend can't answer at all, the app shows a labelled recording.

**What I left out on purpose.** Notification delivery (WhatsApp or Web Push): the digest and triggers are computed on demand. Deep reads of annual reports. Logins. A chat box: chat invites answers that can't be checked, so FINN gives structured views with receipts instead.

**Where I'd take it next.** Discount each new guidance figure by management's historical say–do score. Track credibility per CEO and CFO. Alert when a promise goes silent in the latest call. Diff annual reports year over year (risk factors, contingent liabilities, related-party transactions, auditor remarks). Then deliver only the *Needs you* tier as a push.

**Landscape.** Concall summaries and filing alerts are already common in India (Trendlyne, Tijori, Screener). The closest things to the ledger are Tijori's narrative "then vs now" and Arthneeti's quarter-on-quarter scorecard. Neither verifies quotes, threads promises across calls, detects goalpost moves, or explains why an alert ranks where it does.

Thank you for a well-designed brief. I enjoyed building this.

Best regards,
Yashwardhan Singh
IIT Delhi
