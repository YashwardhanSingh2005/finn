# Build log: how FINN was built with an AI coding agent

FINN was built in one overnight session (14–15 Nov 2026) with **Claude Code** (Claude Opus 5.5) as the coding agent, working in a shell on a university HPC login node. This log records how the work went, including the dead ends. A redacted export of the session (FINN part only) is attached separately.

## How I worked with the agent

- **I set direction and constraints; the agent proposed and built.** My first prompt was the brief: "read everything [in the brief], do literature reviews, look for similar submissions, prioritise explainability and novelty". After that I mostly unblocked the agent (API keys, GitHub access, approving the NSE/BSE fetch) and pushed for a higher bar.
- **Research ran in parallel with the build.** A sub-agent surveyed competitors (Tijori, Trendlyne, Screener AI, Arthneeti, Daloopa, AllMind, Hudson Labs, PromiseTrack) and the literature: guidance credibility, walk-downs, FinanceBench, citation faithfulness, SEBI Reg 30. Its findings became features: the SEBI-materiality line in the score, "not repeated in latest call", "why not higher?", and the backtest.
- **Every surface was checked in a real (headless) phone browser** at 390 px. The agent screenshotted each screen with Playwright and fixed what it saw.

## Timeline (abridged)

| Step | What happened | Decision |
|---|---|---|
| 1 | Probed data sources | screener.in: statements, documents, prices, one page per company. NSE JSON for announcements. Yahoo rate-limited (429) from the cluster, so prices come from screener's chart API instead. |
| 2 | No LLM key on the machine | Use **Netlify AI Gateway**: no key to manage, pay-per-token, and it allows Claude Haiku/Sonnet routing. |
| 3 | Deterministic layer first | Fundamentals, flags, results cut and alerts are all pure code with the rule printed on screen. That way the app is useful even when the AI layer is down. |
| 4 | First ledger run: 0 claims | Output hit the token cap, so the JSON was truncated. Added a salvage parser and stopped caching failed parses. |
| 5 | Still truncating | Root cause: Haiku 5.5 thinks adaptively *by default*, and that silently used up the output budget. Turned thinking off for extraction: 4× faster, 1/4 the tokens. |
| 6 | Ledger worked but was a flat list (29 rows, mostly "pending") | Redesigned it as **promise threads** across calls, with a **goalpost detector**. Open-ended targets are checked against the trailing four quarters, and one *batched* Sonnet judge call covers the rest. |
| 7 | Judge said "Missed" for working capital at 15 days vs a 50–55-day target | Fewer working-capital days is *better*. Told the judge the favourable direction for each metric type. Verdicts without a verified evidence quote are withheld. |
| 8 | Screenshot: KAYNES Sep-quarter results card showed June numbers | Standardised data lags fresh filings. Now the card checks that the period matches and otherwise reads the PDF itself. |
| 9 | Exchange one-liners are boilerplate ("has informed the Exchange…") | Cards that earned attention get a one-line summary read from the PDF with a verified quote. Routine cards cost nothing. |
| 10 | **Backtest v1**: almost no separation; 17% of filings ranked "Needs you" | Broke it down by category. Results and management changes carried signal; M&A, fund raises, litigation and ratings didn't; ESOP, takeover-code and AGM filings were misfiled. Fixed the rule order and lowered four base scores. |
| 11 | Backtest v2, validated on the *previous* six months | "Needs you" filings were followed by a ≥2σ move 27% of the time, vs 11% for routine filings. Only 6% of filings now reach "Needs you". |

| 12 | Netlify free credits ran out mid-night (17 deploys plus AI calls); the site paused | I made the code host-agnostic: Vercel entry points in `api/`, Vercel Blob plus AI Gateway via OIDC. All further work was local, against a dev server and a headless phone browser. |
| 13 | A second literature scan (non-answers, analyst praise, script echo, Indian concall tone) | Built **Candour**: a deterministic non-answer detector (Gow et al. 2021), Loughran–McDonald tone and uncertainty, a narrative-vs-numbers divergence check, analyst praise, pushback asymmetry and recurring topics, plus a portfolio league. |
| 14 | Hand-labelled the detector over 3 rounds, each on a fresh sample | Precision 86–92%, recall about 55–60%; it plateaus as a lexicon. Reported honestly. Script echo (Lee 2016) didn't transfer to Indian calls, so I dropped it. |
| 15 | Six holdings "didn't parse" | 2 publish no transcripts, 1 links HTML, and 3 used new layouts (Airtel, Tata Steel, Eternal). I wrote a generic speaker-header normaliser. **A regression set caught it breaking TCS** (28 → 15 questions), and I fixed it before moving on. |
| 16 | Credibility as a probability | Beta posterior over the ledger verdicts (Hutton & Stocken 2009), with style labels (walks down then beats, raises then misses). |
| 17 | A UI smoke test found a crash on directly opening the Candour tab | Fixed. The test now runs light and dark across every tab. |
| 18 | SEBI 5-working-day transcript rule | The first run flagged Airtel as 31 days late. That was a false positive (it read "quarter *ended* Sep 30" as the call date). Fixed and pinned with a test. |
| 19 | Event study: does dodging predict returns? | n=40, inconclusive. Written up as such, not claimed. |

| 20 | Auditor's-report scanner over the latest annual reports | Found the reports in 20 of 21 at first. Every flag was hand-verified; one going-concern note belonged to a group entity, so it was re-attributed and pinned by a test. |
| 21 | My call: upgrade the judgement tier | Cross-call promise judging and bull vs bear moved from Sonnet 5.5 to **Claude Opus 5.5**. Bulk extraction stays on Haiku 5.5, because quality matters most where the model reasons and cost matters where it reads. |
| 22 | Two views hung for three minutes: transcript PDFs on the NSE archive host never answered from this network | No fetch had a timeout. Added hard timeouts everywhere, a per-host circuit breaker, and parallel transcript downloads. Results built from a failed download are no longer cached (one empty backtest had been cached for 24 hours). |
| 23 | No live backend while the host move was pending | **Snapshot mode**: every demo view is recorded as JSON. The app falls back to the recording when the backend can't answer and says so in a banner. The same recording is inlined into a single HTML file that runs with no server. |
| 24 | Checking the one-file copy in a phone-sized browser | The rupee sign was missing in front of prices. The webfont's ₹ rendered with zero width, so the next digit was drawn over it. That one character now comes from a system font. It had been wrong in every earlier screenshot and I had not seen it. |
| 25 | A fresh deployment would start cold and depend on exchange archives that hang | Exchange PDFs don't change, so the page text of every document already read is shipped as a gzipped seed (1.6 MB). A cold server answered Candour, the auditor scan and the league in under a second with an empty cache. |
| 26 | The one annual report the scanner couldn't locate (Bajaj Finance) | Its title is a running header that the PDF text order puts after the body. Anchored the start on the SA 700 opening sentence as well. Now 22 of 22, with no change on the other 21. The stale result was also sitting in the seed, which is why derived results are versioned by key. |
| 27 | Build history | The raw session contains unrelated work and access tokens, so the attached history is a filtered, redacted export of the FINN part only. |

## Things the agent did *not* get to decide
- Scraping NSE/BSE with browser headers: the agent's safety layer blocked it until I approved it explicitly.
- Creating the GitHub repo and token scopes, and deploying to my Netlify account: I did those or approved them.

## Spend
- AI spend for the whole build, including debugging and warming the cache for 8 companies: well under $2 through the AI Gateway.
- Each new company costs about $0.06 the first time, then nothing (cached).
