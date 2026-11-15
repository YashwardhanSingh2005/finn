// "Your rules are the algorithm." Everything that decides what reaches you is on this one screen,
// in plain words, and editable. Nothing is learned silently.
import { useState } from "react";
import { Toggle, Icon } from "./ui.jsx";
import { useSpend, useApi } from "./lib.js";

const CATS = [
  ["results", "Results", 90], ["M&A", "M&A", 65], ["management_change", "Management change", 80], ["fund_raise", "Fund raise", 55],
  ["litigation", "Litigation / regulatory", 55], ["pledging", "Promoter pledge", 60], ["capex", "Capex", 60], ["credit_rating", "Credit rating", 45],
  ["insider_trading", "Insider trade", 45], ["press_release", "Press release", 40], ["bonus_split", "Bonus / split", 40], ["dividend", "Dividend", 35],
  ["earnings_call", "Earnings call", 25], ["agm_egm", "AGM / EGM", 15], ["postal_ballot", "Postal ballot", 15], ["investor_meetings", "Investor meet", 10], ["unclassified", "Routine paperwork", 5],
];

export default function Rules({ prefs, setPrefs, rules, setRules, holdings, setHoldings, resetHoldings, theme, setTheme }) {
  const spend = useSpend();
  const [add, setAdd] = useState("");
  const set = (k, v) => setRules({ ...rules, [k]: v });
  return (
    <div className="fade-in">
      <h1 className="headline mt8">Your rules are <em>the algorithm.</em></h1>
      <p className="muted small">FINN ranks filings with the points below. Nothing is learned silently: every “less / more” you tap lands here, where you can read and undo it.</p>

      <Backtest />

      <h2 className="section">Price & volume triggers (end of day)</h2>
      <div className="card stack">
        <Slider label="Price move" value={rules.movePct} min={1} max={15} step={0.5} unit="%" note="absolute day move, either direction" onChange={(v) => set("movePct", v)} />
        <Slider label="Relative move" value={rules.sigma} min={1.5} max={5} step={0.5} unit="σ" note="vs the stock’s own 60-day volatility, so a 3% day in a utility counts but not in a smallcap" onChange={(v) => set("sigma", v)} />
        <Slider label="Volume spike" value={rules.volX} min={1.5} max={6} step={0.5} unit="×" note="vs 20-day average volume" onChange={(v) => set("volX", v)} />
      </div>

      <h2 className="section">What a filing is worth</h2>
      <div className="card flat" style={{ padding: "4px 14px" }}>
        {CATS.map(([k, label, base]) => {
          const muted = !!prefs.muted?.[k], boosted = !!prefs.boost?.[k];
          return (
            <div className="list-row" key={k}>
              <div className="grow"><div style={{ fontWeight: 500 }}>{label}</div><div className="tiny muted">base {base}{boosted ? " +25 (boosted)" : ""}{muted ? " · muted" : ""}</div></div>
              <button className={`pill ${boosted ? "accent" : "neutral"}`} onClick={() => setPrefs({ ...prefs, boost: { ...prefs.boost, [k]: boosted ? 0 : 25 } })}>{boosted ? "Boosted" : "Boost"}</button>
              <Toggle on={!muted} label={`Show ${label}`} onChange={(on) => setPrefs({ ...prefs, muted: { ...prefs.muted, [k]: !on } })} />
            </div>
          );
        })}
      </div>
      <details className="card mt8"><summary className="small"><strong>How the score is built</strong> <span className="muted">(tap)</span></summary>
        <ul className="small ink2" style={{ paddingLeft: 18 }}>
          <li><b>Category</b>: base points above. Classified by readable rules over the exchange subject line, so no model is needed for 90%+ of filings.</li>
          <li><b>Stage</b>: a results <i>date notice</i> −55; a newspaper ad of already-published results −75.</li>
          <li><b>Seniority</b>: CXO/MD/board change +10; anything below −35.</li>
          <li><b>Size</b>: an order or deal amount found in the filing, as a share of trailing revenue: ≥10% +25, ≥3% +15, ≥1% +5, smaller −10.</li>
          <li><b>Market reaction</b>: the stock moved ≥ 2σ in the session after the filing: +15.</li>
          <li><b>Rating direction</b>: downgrade +30, reaffirmation −30. <b>Tone</b>: penalty, demand, default, resignation… +10.</li>
          <li><b>Position size</b>: ≥8% of portfolio +8, ≥4% +3.</li>
          <li>≥ 70 <b>Needs you</b> · 40–69 <b>Worth a read</b> · below 40 <b>Filed away</b> (still one tap away).</li>
        </ul>
      </details>

      <h2 className="section">Portfolio <span className="count">{holdings.length}</span></h2>
      <div className="card flat" style={{ padding: "4px 14px" }}>
        {holdings.map((h) => (
          <div className="list-row" key={h.symbol}>
            <span className="tick">{h.symbol}</span>
            <span className="grow tiny muted ellipsis">{h.sector || ""}</span>
            <input type="number" min="0" max="50" value={h.weight} aria-label={`${h.symbol} weight`} onChange={(e) => setHoldings(holdings.map((x) => (x.symbol === h.symbol ? { ...x, weight: Number(e.target.value) } : x)))} style={{ width: 54, padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }} />
            <span className="tiny muted">%</span>
            <button className="iconbtn" aria-label={`Remove ${h.symbol}`} onClick={() => setHoldings(holdings.filter((x) => x.symbol !== h.symbol))}><Icon.x /></button>
          </div>
        ))}
        <form className="list-row" onSubmit={(e) => { e.preventDefault(); const s = add.trim().toUpperCase(); if (s && !holdings.find((h) => h.symbol === s)) setHoldings([...holdings, { symbol: s, weight: 3 }]); setAdd(""); }}>
          <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add NSE ticker" style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }} />
          <button className="btn">Add</button>
        </form>
      </div>
      <button className="btn ghost small mt4" onClick={resetHoldings}>Reset to demo portfolio</button>

      <h2 className="section">Appearance</h2>
      <div className="chips">{["system", "light", "dark"].map((t) => <button key={t} className={`chip ${theme === t ? "on" : ""}`} onClick={() => setTheme(t)}>{t}</button>)}</div>

      <h2 className="section">What the AI cost you this session</h2>
      <div className="card">
        <div className="row between"><span>Model calls</span><strong className="num">{spend.calls}</strong></div>
        <div className="row between"><span>Served from cache</span><strong className="num">{spend.cached}</strong></div>
        <div className="row between"><span>Spend</span><strong className="num">${spend.usd.toFixed(4)} ≈ ₹{(spend.usd * 88).toFixed(2)}</strong></div>
        {Object.entries(spend.byModel).map(([m, u]) => <div key={m} className="row between tiny muted"><span>{m}</span><span className="num">${u.toFixed(4)}</span></div>)}
        <p className="tiny muted mt8">Routing: rules → no model for triage · Claude Haiku (cheap) to read filings & transcripts · Claude Opus only for cross-quarter judgement. Every model output is cached by document, so the same filing is never paid for twice.</p>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, note, onChange }) {
  return (
    <div>
      <div className="row between"><span style={{ fontWeight: 500 }}>{label}</span><strong className="num">{unit === "%" ? "±" : "≥ "}{value}{unit}</strong></div>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <div className="tiny muted">{note}</div>
    </div>
  );
}

// The run reported in the README and eval/README.md (v2 weights), kept as a fallback for the card below.
const RECORDED = {
  at: "15 Nov 2026",
  T: { act: { meanZ: 1.31, big: 22 }, read: { meanZ: 0.83, big: 8 }, skim: { meanZ: 0.82, big: 7 } },
  V: { act: { meanZ: 1.48, big: 27 }, read: { meanZ: 1.02, big: 12 }, skim: { meanZ: 0.95, big: 11 } },
};

/** "Does the algorithm work?" The ranking checked against what the market did next, out of sample. */
function Backtest() {
  const tuned = useApi("backtest", { days: 180, offset: 0 });
  const valid = useApi("backtest", { days: 180, offset: 180 });
  const loading = tuned.loading || valid.loading;
  // If the live re-run can't reach the exchange feed, show the recorded run (and say so) rather than blanks.
  const live = tuned.data?.filings > 0 && valid.data?.filings > 0;
  const done = !loading && (tuned.data || tuned.error) && (valid.data || valid.error);
  const recorded = done && !live;
  const T = live ? tuned.data : recorded ? RECORDED.T : null, V = live ? valid.data : recorded ? RECORDED.V : null;
  const cell = (st) => <span className="num">{st?.meanZ ?? "–"}σ · <b>{st?.big ?? "–"}%</b></span>;
  return (
    <>
      <h2 className="section">Does the score work?</h2>
      <div className="card">
        <p className="small ink2" style={{ marginTop: 0 }}>Every portfolio filing over the past year was re-scored <b>without</b> the market-reaction term, so the check isn’t circular, then compared with the stock’s next-session move in its own volatility units. Weights were tuned on the last 6 months and <b>validated on the 6 months before</b>.</p>
        {loading && <div className="row small muted"><span className="spin" /> Re-scoring a year of filings…</div>}
        {T && V && (<>
          <table className="fig">
            <thead><tr><th>avg |move| · % ≥ 2σ</th><th>tuned on<br />last 6m</th><th>validation<br />6m before</th></tr></thead>
            <tbody>
              <tr><td className="lab"><span className="dot risk" style={{ display: "inline-block", marginRight: 6 }} />Needs you</td><td>{cell(T.act)}</td><td>{cell(V.act)}</td></tr>
              <tr><td className="lab"><span className="dot watch" style={{ display: "inline-block", marginRight: 6 }} />Worth a read</td><td>{cell(T.read)}</td><td>{cell(V.read)}</td></tr>
              <tr><td className="lab"><span className="dot" style={{ display: "inline-block", marginRight: 6, background: "var(--ink-3)" }} />Filed away</td><td>{cell(T.skim)}</td><td>{cell(V.skim)}</td></tr>
              {live && <tr><td className="lab muted">filings</td><td className="muted">{T.filings}</td><td className="muted">{V.filings}</td></tr>}
            </tbody>
          </table>
          {recorded && <p className="tiny" style={{ color: "var(--watch)" }}>Recorded run of {RECORDED.at}: the live re-run couldn’t reach the exchange feed just now.</p>}
          <p className="small mt8">{V.act?.big && V.skim?.big ? <>On the validation half, a “Needs you” filing was followed by a ≥2σ move <b>{(V.act.big / V.skim.big).toFixed(1)}×</b> as often as a routine one.</> : null}</p>
          <details className="mt4"><summary className="tiny linkish">What the backtest changed</summary>
            <p className="tiny ink2">Version 1 put 17% of filings in “Needs you” with almost no separation (10% vs 7% big moves). Broken down by category, results and management changes carried signal (16% big moves). M&A, fund raises, litigation and credit-rating filings didn’t (0.6–0.7σ). ESOP allotments, takeover-code disclosures and AGM voting results were being misfiled as urgent. Fixes: those phrasings are matched first as routine; M&A base 85→65, fund raise 75→55, litigation 70→55, rating 55→45. The deal-size, SEBI-materiality and tone terms still promote the ones that matter.</p>
          </details>
          <p className="tiny muted mt4">One portfolio, one year, next-session moves only (σ from the trailing 60 days): a sanity check, not proof.</p>
        </>)}
      </div>
    </>
  );
}
