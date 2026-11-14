# Build log: how FINN was built with an AI coding agent

FINN was built in one overnight session (14–15 Nov 2026) with **Claude Code** (Claude Opus 5.5) as the coding agent, working in a shell on a university HPC login node. This log records how the work went, including the dead ends. The full session export is attached separately.

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

## Things the agent did *not* get to decide
- Scraping NSE/BSE with browser headers: the agent's safety layer blocked it until I approved it explicitly.
- Creating the GitHub repo and token scopes, and deploying to my Netlify account: I did those or approved them.

## Spend
- AI spend for the whole build, including debugging and warming the cache for 8 companies: well under $2 through the AI Gateway.
- Each new company costs about $0.06 the first time, then nothing (cached).
