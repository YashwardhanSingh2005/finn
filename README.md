# FINN: a financial investment agent that shows its work

**Live (open it on a phone):** https://finn-investor.netlify.app
**Deep links:** [Polycab: promise ledger](https://finn-investor.netlify.app/?c=POLYCAB) · [Kaynes](https://finn-investor.netlify.app/?c=KAYNES) · [Your rules](https://finn-investor.netlify.app/?tab=rules)

> An investor doesn't need more summaries; they need to know **what to read** and **whether to believe it**.
> FINN does both, and every judgement comes with a receipt.

## The point of view

Most "AI for investors" tools put a summary on top of the firehose. That makes the feed longer, not more useful. FINN is built on three opinions.

1. **Triage, not a feed.** The Push side sorts every filing into *Needs you*, *Worth a read* or *Filed away*. It also shows why each item landed where it did: an itemised score you can read in five seconds. *Filed away* is still one tap away, and each hidden item says why it was hidden.
2. **Analyse management; don't summarise them.** The centrepiece of the Pull side is the **Promise Ledger**:
   - It reads the last four earnings calls and extracts every forward-looking promise.
   - It links the same promise across calls into a *thread*.
   - It catches management **moving the goalposts**: a target raised, lowered, or pushed out a year.
   - It checks each promise against reported numbers and outputs a **say–do score**.
3. **No claim without a receipt.** Numbers are computed in code, never by a model. Every quote a model returns is checked against the source PDF's text before it is shown. Quotes that can't be found are dropped, and the number dropped is shown. The bull and bear cases may cite only evidence IDs produced by earlier, verified layers.

## What's built

### Push: the Today tab
- **Windowed digest** across an 18-stock demo portfolio (large, mid and small caps; banks, an NBFC, IT, FMCG, capital goods, autos, pharma, metals, internet, electronics manufacturing, wind, market infrastructure).
  - Windows: 24h, 3d, 7d, 30d, custom dates, or **since your last visit**.
  - Sources: NSE announcements, plus BSE where reachable. Filings posted on both exchanges are de-duplicated.
- **Explainable 0–100 priority.** Every card opens to an itemised breakdown:
  - **Category base:** from the reference taxonomy. The classifier is a readable rule and shows the phrase it matched; no model is involved.
  - **Stage:** a results *date notice* or a newspaper ad of already-published results is pushed down.
  - **Seniority:** a CXO, MD or board change ranks above lower-level changes.
  - **Deal size:** the amount parsed from the filing, as a percentage of trailing-twelve-month revenue.
  - **SEBI Reg 30 materiality:** whether the amount clears the legal threshold, which is the lowest of 2% of turnover, 2% of net worth and 5% of three-year average absolute PAT.
  - **Market reaction:** the next-session move, in units of *this stock's own* volatility.
  - **Rating direction:** a downgrade counts up; a reaffirmation counts down.
  - **Position weight:** the stock's share of your portfolio.
  - **Your own rules:** any mute or boost you set.
- **Triggered alerts:** price ±X%, volume ≥ N× its 20-day average, or a move ≥ kσ for that stock. All three thresholds are user-set on the Rules tab.
- **Management changes.** FINN reads the filing PDF and returns:
  - who joined or left, their role, and the stated reason;
  - a short profile from the *filing's own "brief profile" section*, which SEBI requires, with a verified quote and page number;
  - a LinkedIn link.
- **Quarterly results:**
  - A first cut of Revenue, EBITDA, PBT and PAT, QoQ and YoY, appears instantly from standardised data, with the EBITDA margin trend.
  - **"Read the filing"** extracts the same lines from the results PDF. EBITDA is then *computed in code* as PBT + finance costs + depreciation − other income − exceptional items. The two sources are reconciled, and the card shows ✓ when they match.
  - If the standardised data hasn't caught up with a fresh filing yet, FINN says so and reads the PDF automatically. It never shows last quarter's numbers under this quarter's headline.
- **Plain English instead of boilerplate.** The exchange's one-liners ("X has informed the Exchange about…") are replaced with a one-line *what happened* and *so what*, read from the PDF, with a verified quote. This is done only for items that earned attention; routine filings never cost a token.
- **New transcript filed → instant call check, with no model:** "Dodged 5 of 28 analyst questions (17.9%), up 4.9 pts vs the July call; Q&A tone cooler", plus the first dodge, quoted. Then **"Audit its promises"** a filed earnings-call transcript links straight to that company's ledger.
- **Listen (60 s):** the browser reads the top items aloud, for the commute. It costs nothing and runs no server code.

### Pull: the Research tab, for any NSE ticker
- **Snapshot:**
  - the business and its segments, in management's own words from the latest call, with verified quotes;
  - the latest quarter, QoQ and YoY;
  - guidance, shown next to the company's **say–do score** so you know how much weight to give it;
  - the five-year trajectory: revenue and PAT, CAGRs and margin trend, with rule flags;
  - "what management admitted is hard".
- **Promises (the Promise Ledger):** promise threads across four calls, the goalpost history of each, and a verdict: *Delivered, On track, Behind, Missed, Too early* or *No evidence*. Each verdict is labelled with how it was reached:
  - **computed:** checked in code against the reported quarters for the promised period. Open-ended targets are checked against the trailing four quarters.
  - **judgement:** a stronger model. It must cite a quote that passes verification, or the verdict is withheld.
- **Candour: how management talks, measured without a model.** Three published ideas, stitched together:
  - **Non-answers:** analyst questions met with a refusal, an inability or a deferral, following Gow, Larcker & Zakolyukina (2021). Every one is shown verbatim with its page.
  - **Uncertainty and tone:** measured with the Loughran–McDonald finance word lists, separately for prepared remarks and Q&A.
  - **Narrative vs numbers:** a flag for when management's tone moves opposite to reported growth, e.g. *"story ahead of numbers"* or *"numbers ahead of story (possible sandbagging)"*.
  - Evaluated by hand-labelling: about 86–92% precision and about 55–60% recall over three rounds, each measured on fresh samples (see `eval/README.md`).
  - Because the same rules apply to every company, the trends and comparisons are valid even though absolute counts are lower bounds.
- **Portfolio candour league** (on the Research landing page): every holding's latest call, ranked by the share of analyst questions met with a non-answer. Holdings that can't be ranked say why, e.g. "doesn't publish transcripts". On the demo portfolio, SUNPHARMA dodged 19% and POLYCAB 17.9%; L&T, Reliance and Bajaj Finance were near 0%.
- **Promises × Candour:** each promise thread shows whether analysts asked about it and management dodged, with the matched terms displayed.
- **SEBI transcript-lag check:** the call date and the filing date are read from the PDF and checked against the 5-working-day rule.
- **Chance the next promise is kept.** Investors weight a manager's forecasts by that manager's track record (Hutton & Stocken 2009). FINN makes the weight explicit: a Beta(1,1) prior updated by the ledger's kept and not-kept verdicts gives a probability with an 80% range. Few promises gives a wide range, honestly shown. A style label comes from goalpost history: *walks down, then beats* (Richardson, Teoh & Wysocki 2004), *raises, then misses*, or *reliable*.
- **What the auditor said:** read from the latest annual report with rules, not a model. Audit reports follow SA 700/705/706/570 and CARO 2020, so the signals are phrase-detectable:
  - the opinion type (unmodified, qualified, adverse or disclaimer) for both the standalone and consolidated reports;
  - any Emphasis of Matter or going-concern uncertainty, quoted with its page;
  - adverse CARO remarks: unpaid statutory dues, defaults, fraud, cash losses.

  Negated phrases ("there were no defaults") are ignored, and unit tests cover this. Example: Suzlon's FY26 auditor draws attention to *"the restatement of the comparative financial information"*.
- **Balance and cash.** Each flag shows the rule that fired, e.g. `rule: Σ CFO / Σ PAT < 70%`. Covers:
  - cash conversion: Σ operating cash flow ÷ Σ PAT, with the yearly table;
  - debt-to-equity;
  - the working-capital cycle;
  - capital work in progress as a share of fixed assets;
  - promoter and institutional holding changes.
- **Bull vs bear:** three points each. Every point cites evidence IDs, and tapping one shows the underlying fact. It ends with *the one question that decides it*.
- **Primary sources only:** annual reports, results and transcripts. No news, no broker notes, and the model is told not to use outside knowledge.

### Rules: "your rules are the algorithm"
- Alert thresholds, plus a mute or boost toggle for each category.
- The scoring formula, written out in plain words.
- The portfolio editor.
- A live **AI cost meter**: model calls, cache hits and spend in $ and ₹.

## Architecture

```
React (Vite) PWA, mobile-first ──► Netlify Functions (Node 22) ──► sources
                                        │                       ├─ NSE corporate announcements (JSON)
                                        │                       ├─ BSE announcements (fallback; blocked from some hosts)
                                        │                       ├─ screener.in: standardised statements, EOD price & volume,
                                        │                       │    links to annual reports, results PDFs, concall transcripts
                                        │                       └─ the primary PDFs themselves (unpdf → per-page text)
                                        ├─ Blob cache: every model output keyed by source-document URL
                                        └─ AI Gateway → Claude Haiku 5.5 (extract) / Claude Opus 5.5 (judge)

Host-agnostic: the same handlers run as Vercel functions (`api/`, Mumbai region next to NSE/BSE,
Vercel Blob + Vercel AI Gateway via the deployment's OIDC token, so no key to manage) or Netlify functions
(`netlify/functions/`, Netlify Blobs + Netlify AI Gateway). A plain ANTHROPIC_API_KEY also works.
```

### Model routing and cost

| Layer | What runs | Cost |
|---|---|---|
| Triage (classify and score every filing) | Regex classifier and arithmetic scorer | ₹0 |
| Numbers (results cut, ratios, CAGRs, cash conversion, alerts) | Plain code over standardised statements | ₹0 |
| Reading PDFs (filing one-liners, management bios, results lines, business snapshot, guidance claims) | **Claude Haiku 5.5**, thinking off, low effort | ≈ $0.002 per document |
| Linking promises across calls into threads | Haiku 5.5 | ≈ $0.001 per company |
| Judging open promises, and bull vs bear | **Claude Opus 5.5**, adaptive thinking, medium effort; one *batched* call per company | ≈ $0.08 per company |
| Verification (quotes exist in source; cited evidence IDs exist) | Plain code (4-gram shingle match) | ₹0 |

A full research page for a company FINN has never seen (four transcripts, snapshot, ledger, bull vs bear) costs about **$0.06 ≈ ₹5**. It then costs **₹0** for every later viewer, because outputs are cached by document URL and the cache key changes only when a new call is filed.

## Does the triage score work? (backtest)

Rules → Does the score work? re-scores every portfolio filing from the past year *without* the market-reaction term, so the test isn't circular. It then compares each filing with the stock's next-session move, in units of that stock's own 60-day volatility.

| Tier | Last 6 months (used for tuning): avg move · share of moves ≥ 2σ | **6 months before (held out): avg move · share ≥ 2σ** |
|---|---|---|
| Needs you | 1.31σ · 22% | **1.48σ · 27%** |
| Worth a read | 0.83σ · 8% | 1.02σ · 12% |
| Filed away | 0.82σ · 7% | 0.95σ · 11% |

**What changed.** Version 1 put 17% of filings in *Needs you* and barely separated them from the rest: 10% vs 7% of filings were followed by a big move.

Broken down by category, the data showed:
- Results and management changes carry signal: 16% of those filings were followed by big moves.
- M&A, fund raises, litigation and credit ratings don't: average next-day moves of 0.6–0.7σ.
- ESOP allotments, takeover-code disclosures and AGM voting results were being misfiled as urgent.

I fixed the rule order and lowered the base scores for M&A, fund raises, litigation and credit ratings. Now 6% of filings reach *Needs you*. On the held-out half, a *Needs you* filing is followed by a ≥2σ move about **2.5× as often** as a routine one.

This covers one portfolio, one year, and next-session moves only: a sanity check, not proof. It is shown in the app with the same caveat.

## Key decisions and trade-offs

- **Rules before models for triage.** Exchange subjects are formulaic, so a readable rule beats a model call on cost, latency *and* explainability. The trade-off is that unusual wording can fall through to "routine". That is visible in the *Filed away* groups, and the fix is one more rule.
- **Models locate and quote; code computes and judges numbers.** This removes the most common failure of financial LLM apps: plausible, wrong numbers. On FinanceBench, GPT-4 with retrieval failed or refused about 81% of questions.
- **Quote verification is mandatory.** Any promise or evidence quote that can't be found in the source text is dropped (fuzzy 4-gram match, 60% threshold), and the count shows on screen.
- **Promise threads and a goalpost detector, not a flat list of promises.** The research shows guidance is "walked down" to beatable levels (Richardson, Teoh & Wysocki 2004). It also shows that forecasts from managers with an accurate record move prices more (Hutton & Stocken 2009). Credibility is the signal, and a flat list would hide it.
- **The strong model only where reasoning needs it:** one batched Opus 5.5 call per company for segment and qualitative promises, and one for bull vs bear. Everything else is Haiku or plain code.
- **Pay for attention, not volume.** Filing PDFs are read only for items that scored into *Needs you* or *Worth a read*, or that you open.
- **Standardised statements and prices come via screener.in.** That data is derived from company filings and links back to each raw results PDF, which FINN can read and reconcile against. Transcripts and annual reports are always read from the company or exchange PDF.
- **Competitive context:**
  - Concall summaries and filing alerts are commodity features in India (Trendlyne, Tijori, Screener).
  - The closest products to the ledger are Tijori's narrative "what they said then vs now" and Arthneeti's quarter-on-quarter scorecard.
  - Neither verifies quotes, threads promises across calls, detects goalpost moves, or explains why an alert ranks where it does.

## What I deliberately left out

- **Push delivery (Web Push, WhatsApp, email).** The digest and triggers are computed on demand. Delivery is a cron job plus a notification channel; I spent the time on making *what* gets pushed right.
- **Deep reads of annual reports (300+ pages).** Guidance lives in transcripts, so the ledger and snapshot use those. Annual-report extraction would reuse the same verify-every-quote pipeline, with chunking.
- **Login and multiple users.** Preferences and the portfolio live in the browser.
- **A chat box.** Chat invites unanswerable questions and unverifiable answers. FINN gives structured views with receipts instead. A question box scoped to one company's documents, under the same evidence-ID rule, is the natural next step.

## Where I'd take it next

1. **A credibility-weighted view of guidance:** discount each new guidance figure by the management team's historical say–do score, and keep that score per CEO or CFO across job changes.
2. **Backtest the triage score:** do *Needs you* filings precede bigger moves than *Filed away* ones? Tune the weights in the open based on the result.
3. **Delivery:** a scheduled end-of-day job, then Web Push or WhatsApp for the *Needs you* tier only.
4. **Silence as a signal:** promises management stops mentioning are already counted as "not in latest call". Next, alert on them.
5. **Annual-report diffs:** year-over-year changes in risk factors, contingent liabilities, related-party transactions and auditor remarks.

## Quality

- **Unit tests:** `npm test` runs 16 tests over the deterministic core: the classifier and its rule order, the scorer, the amount parser, SEBI materiality, the quote verifier, the fiscal calendar, horizon resolution, numeric verdicts, actuals for the year to date, the non-answer lexicon, transcript parsing, alerts, and the credibility posterior.
- **Parser regression set:** `test/parse_regression.mjs` covers 9 real transcripts across 5 layouts.
- **UI smoke test:** `test/ui_smoke.py` opens every screen and sub-tab in a 390 px headless browser, in light and dark mode, and fails on any JavaScript error. It caught a crash on directly opening the Candour tab.
- **Evaluations:** `eval/README.md` covers the triage backtest (tuned on one half, validated out of sample) and three precision/recall rounds for the non-answer detector. It also records the model-routing finding (thinking off for extraction) and the judge-direction bug found by inspection.
- **Caching:** PDF text and every model output are cached by document URL, so an exchange PDF is downloaded once, ever. That's kind to NSE and BSE as well as fast.

## Running it

```bash
npm install
npm run build           # frontend → dist/
npx netlify dev         # functions; AI Gateway credentials are injected after one production deploy,
                        # or set ANTHROPIC_API_KEY yourself
```

Model tiers are configurable with `FINN_MODEL_EXTRACT` and `FINN_MODEL_REASON`.

## Repository map

| Path | What it does |
|---|---|
| `netlify/lib/screener.js` | Statements, document index and EOD prices |
| `netlify/lib/exchanges.js` | NSE and BSE announcement feeds; cross-exchange de-duplication |
| `netlify/lib/classify.js` | Rule classifier and itemised priority score, including SEBI Reg 30 materiality |
| `netlify/lib/alerts.js` | End-of-day price and volume triggers, in absolute and σ terms |
| `netlify/lib/fundamentals.js` | Results cut, trajectory, balance sheet, cash quality and shareholding flags (pure code) |
| `netlify/lib/ledger.js` | Promise Ledger: extraction, quote verification, threads, goalposts, computed checks, batched judge |
| `netlify/lib/filing.js` | Per-filing enrichment: management bio, results lines with EBITDA computed in code, one-liners |
| `netlify/lib/research.js` | Layered research view; bull vs bear restricted to evidence IDs |
| `netlify/lib/llm.js` | Model router, cost accounting, recovery of truncated JSON |
| `netlify/lib/pdf.js` | PDF to per-page text; the quote verifier |
| `src/` | The mobile UI (`Today.jsx`, `Research.jsx`, `Rules.jsx`) |

Built with Claude Code; see `BUILD_LOG.md` for how.
