// "How FINN works": the method, on one screen, for the reader who wants to audit it.
import { Sheet } from "./ui.jsx";

const REFS = [
  ["Promise Ledger: goalpost detection", "Richardson, Teoh & Wysocki (2004), The walk-down to beatable analyst forecasts, Contemporary Accounting Research."],
  ["Chance the next promise is kept", "Hutton & Stocken (2009), Prior forecasting accuracy and investor reaction to management earnings forecasts. A Beta(1,1)–Binomial posterior over FINN’s verdicts."],
  ["Candour: non-answers", "Gow, Larcker & Zakolyukina (2021), Non-answers during conference calls, Journal of Accounting Research."],
  ["Candour: tone and uncertainty", "Loughran & McDonald (2011), When is a liability not a liability? Textual analysis, dictionaries, and 10-Ks, Journal of Finance (word-list subsets)."],
  ["Candour: analyst praise", "Milian & Smith (2017), An investigation of analysts’ praise of management during earnings conference calls."],
  ["Narrative vs numbers", "Indian evidence that optimistic concall tone can mask weak future performance (NSE–NYU study of BSE-500 calls). FINN compares the tone trend with the reported-growth trend."],
  ["What the auditor said", "SA 700/705/706/570 (opinion, emphasis of matter, going concern) and CARO 2020 annexure remarks, read from the annual report with rules."],
  ["Triage materiality", "SEBI LODR Reg 30(4), amended July 2023: lower of 2% turnover, 2% net worth, 5% of 3-year average |PAT|."],
  ["Why numbers are never generated", "FinanceBench (Islam et al. 2023): retrieval-augmented GPT-4 failed or refused about 81% of financial questions. FINN’s models only locate and quote, code computes, and every quote is verified against the PDF."],
];

export default function About({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <h1 className="headline" style={{ marginTop: 0 }}>How FINN works</h1>
      <p className="small ink2">FINN is built on one idea: an investor needs to know <b>what to read</b> and <b>whether to believe it</b>. Every judgement on screen has a receipt.</p>
      <h2 className="section">Three rules</h2>
      <ol className="small" style={{ paddingLeft: 18 }}>
        <li><b>Code computes, models quote.</b> Every number is arithmetic over filed statements. Models only find and quote text, and each quote is checked against the source PDF; unverifiable ones are dropped and counted.</li>
        <li><b>Rules before models.</b> Triage, alerts, flags and the Candour metrics are readable rules: free, instant, identical for every company. Models are used only when a card earns your attention.</li>
        <li><b>Measured, not asserted.</b> The triage score is backtested out of sample. The non-answer detector was hand-labelled over three rounds on fresh samples: precision ≈ 86–92%, recall ≈ 55–60%. One idea that didn’t work (script-echo) was dropped.</li>
      </ol>
      <h2 className="section">Model routing</h2>
      <table className="fig">
        <tbody>
          <tr><td className="lab">Triage, numbers, alerts, candour</td><td>plain code · ₹0</td></tr>
          <tr><td className="lab">Reading a filing or transcript</td><td>Claude Haiku 5.5 · ≈ ₹0.2</td></tr>
          <tr><td className="lab">Judging promises, bull vs bear</td><td>Claude Opus 5.5 · ≈ ₹7 per company</td></tr>
        </tbody>
      </table>
      <p className="tiny muted">Every model output is cached by source document, so the same filing is never paid for twice.</p>
      <h2 className="section">What each feature implements</h2>
      {REFS.map(([k, v]) => <div key={k} className="flag" style={{ display: "block" }}><div className="small" style={{ fontWeight: 600 }}>{k}</div><div className="tiny ink2">{v}</div></div>)}
      <h2 className="section">Sources</h2>
      <p className="small ink2">NSE and BSE announcements and filing PDFs. Annual reports, results PDFs and earnings-call transcripts, as filed. Standardised statements and end-of-day prices via screener.in. No news, no broker notes.</p>
      <button className="btn primary mt12" onClick={onClose}>Done</button>
    </Sheet>
  );
}
