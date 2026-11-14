// PULL surface. Any NSE ticker. Ordered by what an analyst needs first, and layered by cost:
// the numbers appear instantly (computed), the narrative layers stream in after (model-read,
// quote-verified), and every claim links to the page it came from.
import { useState, useEffect } from "react";
import { api, useApi, fmtCr, fmtPct, cls, usePersist } from "./lib.js";
import { Icon, Spark, Delta, Receipt, Skeleton, VERDICT } from "./ui.jsx";
import { ResultsCut } from "./Today.jsx";

const DEMO = [
  { s: "POLYCAB", why: "explicit 5-year targets to audit" },
  { s: "KAYNES", why: "fast-growing EMS smallcap" },
  { s: "ASIANPAINT", why: "margin pressure story" },
  { s: "HAL", why: "order book & guidance" },
  { s: "JUBLFOOD", why: "consumer slowdown" },
];

export default function Research({ symbol, setSymbol, startTab, holdings }) {
  const [sub, setSub] = useState(startTab);
  if (symbol) return <Company key={symbol + (sub || "")} symbol={symbol} startTab={sub || startTab} back={() => { setSymbol(null); setSub(null); }} />;
  return <Finder onPick={(s, t) => { setSub(t || null); setSymbol(s); }} holdings={holdings} />;
}

function Finder({ onPick, holdings }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [recent] = usePersist("recent", []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api("search", { q }).then(setHits).catch(() => setHits([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  const go = (s) => onPick(s.toUpperCase());
  return (
    <div className="fade-in">
      <h1 className="headline mt8">Research any company, <em>from its own documents.</em></h1>
      <p className="muted small">Annual reports, results and earnings-call transcripts only. No news, no broker notes. Every claim links to its page.</p>
      <form className="search mt12" onSubmit={(e) => { e.preventDefault(); if (hits[0]) go(hits[0].symbol); else if (q.trim()) go(q.trim()); }}>
        <Icon.research width="18" height="18" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or NSE ticker" autoCapitalize="characters" aria-label="Search company" />
      </form>
      {hits.length > 0 && (
        <div className="card flat sugg mt8" style={{ padding: 0 }}>
          {hits.map((h) => <button key={h.url} onClick={() => go(h.symbol)}><strong>{h.symbol}</strong> <span className="muted small">{h.name}</span></button>)}
        </div>
      )}
      {recent.length > 0 && (<><h2 className="section">Recent</h2><div className="chips wrap">{recent.map((s) => <button key={s} className="chip" onClick={() => go(s)}>{s}</button>)}</div></>)}
      {holdings?.length > 0 && <League holdings={holdings} onPick={onPick} />}
      <h2 className="section">Try</h2>
      <div className="stack">
        {DEMO.map((d) => (
          <button key={d.s} className="card tap row between" style={{ width: "100%", textAlign: "left" }} onClick={() => go(d.s)}>
            <span><strong>{d.s}</strong> <span className="muted small">· {d.why}</span></span><Icon.chev />
          </button>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { k: "snap", label: "Snapshot" },
  { k: "ledger", label: "Promises" },
  { k: "candour", label: "Candour" },
  { k: "money", label: "Balance & cash" },
  { k: "bb", label: "Bull vs bear" },
];

function Company({ symbol, back, startTab }) {
  const { data: c, loading, error } = useApi("company", { symbol });
  const [tab, setTab] = useState(startTab || "snap");
  const [recent, setRecent] = usePersist("recent", []);
  useEffect(() => { if (c?.symbol) setRecent([c.symbol, ...recent.filter((s) => s !== c.symbol)].slice(0, 8)); }, [c?.symbol]); // eslint-disable-line
  // Start the slow layers immediately in the background so they're warm when the tab is opened.
  const ledger = useApi("ledger", { symbol, judge: 0 }, [], { enabled: !!c });
  const judged = useApi("ledger", { symbol, judge: 1 }, [], { enabled: !!ledger.data });
  const cand = useApi("candour", { symbol }, [], { enabled: !!c && (tab === "ledger" || tab === "candour") });
  const biz = useApi("brief", { symbol, part: "business" }, [], { enabled: !!c });

  if (loading) return <><button className="btn ghost" onClick={back}><Icon.back width="18" height="18" /> Back</button><Skeleton h={120} n={3} /></>;
  if (error) return (
    <div><button className="btn ghost" onClick={back}><Icon.back width="18" height="18" /> Back</button>
      <p className="err">{error.message}</p>
      {error.data?.suggestions?.filter((s) => s.symbol).length > 0 && <p className="small">Did you mean {error.data.suggestions.filter((s) => s.symbol).map((s) => <button key={s.symbol} className="chip" style={{ marginRight: 6 }} onClick={() => location.assign(`/?c=${s.symbol}`)}>{s.symbol}</button>)}</p>}
    </div>);
  const st = c.stats;
  return (
    <div className="fade-in">
      <button className="btn ghost" onClick={back}><Icon.back width="18" height="18" /> Back</button>
      <div className="row between top mt4">
        <div className="grow">
          <div className="row"><span className="tick">{c.symbol}</span>{c.resolvedFrom && <span className="muted tiny">(was {c.resolvedFrom})</span>}<span className="muted tiny">{c.consolidated ? "consolidated" : "standalone"}</span></div>
          <h1 className="headline" style={{ fontSize: 23 }}>{c.name}</h1>
        </div>
        {st && <div style={{ textAlign: "right" }}><div className="num" style={{ fontWeight: 650, fontSize: 18 }}>₹{st.close.toLocaleString("en-IN")}</div><div className="small"><Delta v={st.ret1d} /> <span className="muted tiny">1d</span></div><Spark data={st.spark} w={80} /></div>}
      </div>
      <div className="kpis mt8">
        {["Market Cap", "Stock P/E", "ROCE", "ROE", "Dividend Yield", "Book Value"].filter((k) => c.ratios[k]).slice(0, 6).map((k) => (
          <div className="kpi" key={k}><div className="k">{k}</div><div className="v">{k === "Market Cap" ? mcap(c.ratios[k]) : c.ratios[k].replace("Cr.", "cr")}</div></div>
        ))}
      </div>
      <div className="segmented mt12" role="tablist">
        {TABS.map((t) => <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)} role="tab" aria-selected={tab === t.k}>{t.label}{t.k === "ledger" && (judged.data || ledger.data)?.sayDo != null ? ` · ${(judged.data || ledger.data).sayDo}` : ""}</button>)}
      </div>
      <div className="mt12">
        {tab === "snap" && <Snapshot c={c} biz={biz} L={judged.data || ledger.data} goLedger={() => setTab("ledger")} />}
        {tab === "ledger" && <Ledger st={ledger} judged={judged} cand={cand.data} />}
        {tab === "money" && <Money a={c.analysis} />}
        {tab === "candour" && <Candour symbol={symbol} st={cand} />}
        {tab === "bb" && <BullBear symbol={symbol} ready={!!judged.data || !!judged.error} />}
      </div>
      <p className="costbar">Numbers: {c.consolidated ? "consolidated" : "standalone"} statements as filed (via screener.in) · fetched {new Date(c.fetchedAt).toLocaleString("en-IN")}</p>
    </div>
  );
}

function Flags({ flags }) {
  if (!flags?.length) return <p className="muted small">No rule fired. Nothing unusual here.</p>;
  return (
    <div>{flags.map((f, i) => (
      <div className="flag" key={i}>
        <span className={`dot ${f.level}`} />
        <div><div style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</div><div className="small ink2">{f.detail}</div><div className="rule">rule: {f.rule}</div></div>
      </div>
    ))}</div>
  );
}

function Snapshot({ c, biz, L, goLedger }) {
  const a = c.analysis, t = a.trajectory;
  const b = biz.data?.data;
  return (
    <div className="stack">
      <section className="card">
        <h3>What it does</h3>
        {biz.loading && <div className="row small muted"><span className="spin" /> Reading the latest earnings call…</div>}
        {biz.error && <p className="muted small">{biz.error.status === 503 ? "AI layer offline: showing numbers only." : biz.error.message}</p>}
        {b && (<>
          <p style={{ margin: "0 0 8px" }}>{b.what_it_does}</p>
          {b.segments?.length > 0 && <SegmentBar segs={b.segments} />}
          {b.segments?.map((s, i) => <div key={i} className="small mt4"><strong>{s.name}</strong>{s.share_pct != null && ` · ${s.share_pct}%`} <span className="ink2">{s.comment}</span></div>)}
          <div className="mt8"><Receipt url={biz.data.url} label={`${biz.data.call} earnings call`} extra={`${(b.segments?.length || 0) + (b.guidance?.length || 0) + (b.watch_items?.length || 0)} quotes verified${biz.data.dropped ? `, ${biz.data.dropped} unverifiable dropped` : ""}`} /></div>
        </>)}
      </section>

      <section className="card">
        <h3>Latest quarter</h3>
        <ResultsCut r={a.results} />
      </section>

      {b?.guidance?.length > 0 && (
        <section className="card">
          <h3>What management guided (latest call)</h3>
          {L?.sayDo != null && (
            <button className="row small" style={{ background: "var(--surface-2)", borderRadius: 10, padding: "8px 10px", width: "100%", textAlign: "left", marginBottom: 6 }} onClick={goLedger}>
              <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>{L.sayDo}</span>
              <span className="grow ink2">{L.credibility ? `${L.credibility.pNext}% chance management keeps its next promise (range ${L.credibility.lo}–${L.credibility.hi}%)` : `say–do score across ${L.sayDoBasis} checked promises`}{L.goalpostMoves ? `, ${L.goalpostMoves} goalpost move${L.goalpostMoves > 1 ? "s" : ""}` : ""}. Weigh this guidance accordingly.</span><Icon.chev />
            </button>
          )}
          {b.guidance.map((g, i) => (
            <details key={i} className="flag" style={{ display: "block" }}>
              <summary><span className="pill accent">{g.topic}</span> <span style={{ fontWeight: 500 }}>{g.statement}</span></summary>
              <div className="quote">“{g.quote}”</div><Receipt url={biz.data.url} page={g.page} label="transcript" />
            </details>
          ))}
        </section>
      )}

      {t && (
        <section className="card">
          <h3>Trajectory <span className="muted small">({t.years}-year)</span></h3>
          <MiniBars periods={t.periods} a={t.revenue} b={t.pat} la="Revenue" lb="PAT" />
          <div className="kpis mt8">
            <div className="kpi"><div className="k">Revenue CAGR</div><div className="v">{fmtPct(t.revCagr)}</div></div>
            <div className="kpi"><div className="k">PAT CAGR</div><div className="v">{fmtPct(t.patCagr)}</div></div>
            <div className="kpi"><div className="k">OPM now</div><div className="v">{t.opm?.[t.opm.length - 1] ?? "–"}%</div></div>
          </div>
          <div className="mt8"><Flags flags={t.flags} /></div>
        </section>
      )}

      {b?.watch_items?.length > 0 && (
        <section className="card">
          <h3>What management admitted is hard</h3>
          {b.watch_items.map((w, i) => (
            <details key={i} className="flag" style={{ display: "block" }}>
              <summary><span className="dot watch" style={{ display: "inline-block", marginRight: 8 }} />{w.item}</summary>
              <div className="quote">“{w.quote}”</div><Receipt url={biz.data.url} page={w.page} label="transcript" />
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

const SEG_COLORS = ["#8a5f00", "#3b5bab", "#1f7a4d", "#b3261e", "#6b4fa0", "#5f6b7a"];
function SegmentBar({ segs }) {
  const s = segs.filter((x) => x.share_pct != null);
  if (s.length < 2) return null;
  return (
    <div className="mt4">
      <div className="bar" style={{ height: 10 }}>{s.map((x, i) => <i key={i} style={{ width: `${x.share_pct}%`, background: SEG_COLORS[i % 6] }} title={`${x.name} ${x.share_pct}%`} />)}</div>
      <div className="legend mt4">{s.map((x, i) => <span key={i}><i style={{ background: SEG_COLORS[i % 6] }} />{x.name} {x.share_pct}%</span>)}</div>
    </div>
  );
}

function MiniBars({ periods, a, b, la, lb }) {
  if (!a?.length) return null;
  // two rows, each scaled to its own maximum: profit is ~10% of sales, one shared axis would flatten it
  const Row = ({ vals, label, color }) => {
    const max = Math.max(...vals.filter((v) => v != null).map(Math.abs), 1);
    return (
      <div className="mt8">
        <div className="row between tiny muted"><span>{label}</span><span className="num">₹{Math.round(vals[vals.length - 1] ?? 0).toLocaleString("en-IN")} cr latest</span></div>
        <div className="row" style={{ alignItems: "flex-end", height: 46, gap: 6 }}>
          {vals.map((v, i) => <div key={i} className="grow" title={`${periods[i]}: ₹${Math.round(v ?? 0).toLocaleString("en-IN")} cr`} style={{ height: `${Math.max(3, (Math.abs(v || 0) / max) * 46)}px`, background: v < 0 ? "var(--risk)" : color, borderRadius: "4px 4px 0 0", opacity: 0.35 + (0.65 * (i + 1)) / vals.length }} />)}
        </div>
      </div>
    );
  };
  return (
    <div>
      <Row vals={a} label={la} color="var(--ink-2)" />
      <Row vals={b || []} label={lb} color="var(--accent)" />
      <div className="row" style={{ gap: 6 }}>{periods.map((p, i) => <span key={i} className="grow tiny muted" style={{ textAlign: "center" }}>{p?.replace("Mar 20", "FY")}</span>)}</div>
    </div>
  );
}

function Ledger({ st, judged, cand }) {
  const { data: L0, loading, error, reload } = st;
  const L = judged.data || L0;
  if (loading && !L) return (
    <div className="card"><div className="row"><span className="spin" /> <strong>Building the promise ledger…</strong></div>
      <p className="small muted">Reading the last 4 earnings calls, pulling out every forward-looking promise, checking each quote really appears in the transcript, linking the same promise across calls, then checking it against reported numbers. About 30 s the first time, then cached.</p></div>);
  if (error && !L) return <div className="card"><p className="err">{error.status === 503 ? "AI layer offline on this deployment." : error.message}</p><button className="btn" onClick={reload}>Retry</button></div>;
  if (!L) return null;
  const order = ["missed", "behind", "partly", "on track", "delivered", "beat", "too early", "no evidence", "pending"];
  const moved = (t) => t.history.some((h) => ["raised", "lowered", "pushed out", "pulled in"].includes(h.change));
  const threads = [...L.threads].sort((a, b) => (moved(b) - moved(a)) || order.indexOf(a.verdict || "pending") - order.indexOf(b.verdict || "pending") || b.versions.length - a.versions.length);
  const total = threads.length || 1;
  const segs = [["delivered", "var(--good)"], ["beat", "var(--good)"], ["on track", "color-mix(in srgb, var(--good) 55%, var(--surface))"], ["partly", "var(--watch)"], ["behind", "var(--watch)"], ["missed", "var(--risk)"], ["too early", "var(--line)"], ["no evidence", "var(--line)"], ["pending", "var(--line)"]];
  return (
    <div className="stack">
      <section className="card">
        <div className="dial">
          <div className="big">{L.sayDo ?? "–"}</div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>Say–do score</div>
            <div className="small ink2">{L.sayDo == null ? "Not enough checkable promises yet." : `From ${L.sayDoBasis} promise${L.sayDoBasis === 1 ? "" : "s"} that can be scored. 100 = all delivered or on track.`}</div>
          </div>
        </div>
        <div className="bar mt12">{segs.map(([k, col]) => L.tally[k] ? <i key={k} style={{ width: `${(L.tally[k] / total) * 100}%`, background: col }} /> : null)}</div>
        <div className="legend mt4">{Object.entries(L.tally).map(([k, n]) => <span key={k}>{VERDICT[k]?.label || k} {n}</span>)}</div>
        {L.credibility && (
          <div className="mt12" style={{ background: "var(--surface-2)", borderRadius: 12, padding: "10px 12px" }}>
            <div className="row between wrap">
              <div className="small"><b>Chance the next promise is kept</b></div>
              {L.credibility.style && <span className={`pill ${L.credibility.style === "reliable" ? "good" : "watch"}`} title={L.credibility.styleWhy}>{L.credibility.style}</span>}
            </div>
            <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
              <span className="serif" style={{ fontSize: 30, fontWeight: 600 }}>{L.credibility.pNext}%</span>
              <span className="small ink2">80% range {L.credibility.lo}–{L.credibility.hi}% · from {L.credibility.kept} of {L.credibility.scored} kept</span>
            </div>
            <div style={{ position: "relative", height: 8, background: "var(--line)", borderRadius: 4, marginTop: 6 }}>
              <div style={{ position: "absolute", left: `${L.credibility.lo}%`, width: `${L.credibility.hi - L.credibility.lo}%`, top: 0, bottom: 0, background: "color-mix(in srgb, var(--accent) 45%, transparent)", borderRadius: 4 }} />
              <div style={{ position: "absolute", left: `calc(${L.credibility.pNext}% - 1px)`, width: 3, top: -3, bottom: -3, background: "var(--accent)", borderRadius: 2 }} />
            </div>
            {L.credibility.styleWhy && <div className="tiny muted mt4">{L.credibility.styleWhy}.</div>}
            <div className="tiny muted mt4">A manager’s track record is priced: investors weight forecasts by past accuracy (Hutton & Stocken 2009). FINN makes that weight explicit as a Beta posterior. Few promises means a wide range.</div>
          </div>
        )}
        <div className="kpis mt12">
          <div className="kpi"><div className="k">Promises tracked</div><div className="v">{L.threads.length}</div></div>
          <div className="kpi"><div className="k">Goalposts moved</div><div className={`v ${L.goalpostMoves ? "down" : ""}`}>{L.goalpostMoves}</div></div>
          <div className="kpi"><div className="k">Not repeated in latest call</div><div className="v">{L.notRepeated}</div></div>
        </div>
        <div className="tiny muted mt8">
          Calls read: {L.calls.map((c) => <span key={c.url} style={{ marginRight: 8 }}><a className="linkish" href={c.url} target="_blank" rel="noreferrer">{c.callQuarter}</a> ({c.claims}{c.dropped ? `, ${c.dropped} unverifiable dropped` : ""})</span>)}
        </div>
        {!L.judged && <div className="row small muted mt8"><span className="spin" /> Checking open promises against the latest calls…</div>}
      </section>
      {threads.length === 0 && <p className="empty">No forward-looking guidance in the last four calls. This management team doesn’t guide.</p>}
      {threads.map((t, i) => <Thread key={i} t={t} dodges={dodgesFor(t, cand)} />)}
      <p className="tiny muted">How verdicts are made. <b>Computed</b>: consolidated growth or margin promises are checked in code against reported quarterly numbers for the promised period (±0.5 pt tolerance). Open-ended targets (“medium term”) are checked against the last four quarters. <b>Judgement</b>: segment-level or non-financial promises are judged by a stronger model, using only the latest transcripts. Each judgement must quote the transcript, and the quote is checked, or the verdict is withheld.</p>
    </div>
  );
}

const UP_GOOD = new Set(["ebitda_margin", "revenue_growth", "pat_growth", "ebitda_growth"]);
// direction only means good/bad for metrics where higher is unambiguously better; else just "revised"
const changeCls = (h, metric) => h.change === "pushed out" ? "risk" : h.change === "pulled in" ? "good" : ["raised", "lowered"].includes(h.change) ? (UP_GOOD.has(metric) ? (h.change === "raised" ? "good" : "risk") : "watch") : "neutral";
const changeLabel = (h, metric) => ["raised", "lowered"].includes(h.change) && !UP_GOOD.has(metric) ? `revised ${h.change === "raised" ? "↑" : "↓"}` : h.change;

// Promises × Candour: did analysts ask about this promise, and did management dodge? (keyword join)
const STOPW = new Set("with from that this have will into over margin margins growth target range basis term long medium short year years revenue business segment percent than faster first rate market markets grow growing more much also there their about what which when quarter quarters next last time industry overall total good number numbers guidance expect expected sustain sustainable level levels terms".split(" "));
const keyw = (t) => new Set((t.toLowerCase().match(/[a-z][a-z&-]{3,}/g) || []).filter((w) => !STOPW.has(w)));
function dodgesFor(t, cand) {
  if (!cand?.calls) return [];
  const title = keyw(t.title), k = keyw(`${t.title} ${t.latest?.statement || ""}`);
  const out = [];
  for (const c of cand.calls) for (const na of c.nonAnswers || []) {
    const q = keyw(na.question);
    const shared = [...k].filter((w) => q.has(w));
    if (shared.length >= 2 && shared.some((w) => title.has(w))) out.push({ ...na, call: c.period, url: c.url, shared });
  }
  return out.slice(0, 2);
}

function Thread({ t, dodges = [] }) {
  const [open, setOpen] = useState(false);
  const v = VERDICT[t.verdict || "pending"] || VERDICT.pending;
  const l = t.latest;
  const moves = t.history.filter((h) => !["reiterated", "first said"].includes(h.change));
  return (
    <article className="card">
      <button className="row top" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="grow">
          <div className="item-title" style={{ marginTop: 0 }}>{t.title}</div>
          <div className="row wrap mt4" style={{ gap: 4 }}>
            {t.history.map((h, i) => (
              <span key={i} className={`pill ${changeCls(h, l.metric)}`} title={`${h.call}: ${h.band || ""} ${h.horizon || ""}`}>{h.call}{h.change !== "first said" && h.change !== "reiterated" ? ` · ${changeLabel(h, l.metric)}` : ""}</span>
            ))}
            {t.notRepeated && <span className="pill neutral">not in latest call</span>}
          </div>
          {t.actual && <div className="small mt4"><span className="muted">target</span> {t.target} <span className="muted">· actual</span> <strong>{t.actual}</strong>{t.coverage && <span className="muted"> ({t.coverage})</span>}</div>}
          {!t.actual && t.actualText && <div className="small mt4"><span className="muted">latest:</span> {t.actualText}</div>}
          {t.reason && <div className="small ink2 mt4">{t.reason}</div>}
          {dodges.length > 0 && <div className="small mt4" style={{ color: "var(--watch)", fontWeight: 500 }}>Analysts asked about this; management dodged ({dodges.map((d) => d.call).join(", ")})</div>}
          {moves.length > 0 && <div className={`small mt4 ${moves.some((m) => changeCls(m, l.metric) === "risk") ? "down" : ""}`} style={{ fontWeight: 500 }}>Goalpost {moves.map((m) => { const prev = t.history[t.history.indexOf(m) - 1]; return `${changeLabel(m, l.metric)} in ${m.call}${prev?.band && m.band ? `: ${prev.band} → ${m.band}` : m.band ? ` (to ${m.band})` : ""}${m.change.startsWith("pushed") || m.change.startsWith("pulled") ? `: ${prev?.horizon} → ${m.horizon}` : ""}`; }).join("; ")}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <span className={`pill ${v.cls}`}>{v.label}</span>
          <div className="tiny muted mt4">{t.check || "open"}</div>
        </div>
      </button>
      {open && (
        <div className="why fade-in">
          <div className="small muted">{l.speaker ? `${l.speaker}` : "Management"}, {l.callQuarter} call:</div>
          <div className="quote">“{l.quote}”</div>
          <Receipt url={l.transcript} page={l.page} label="transcript" extra={`quote match ${Math.round((l.verifyScore || 1) * 100)}%`} />
          {t.calc && <div className="mt8 small"><span className="muted">Check:</span> {t.calc}</div>}
          {t.evidence && (<><div className="small muted mt8">Evidence, {t.evidence.call} call:</div><div className="quote">“{t.evidence.quote}”</div><Receipt url={t.evidence.url} page={t.evidence.page} label="transcript" extra="verified" /></>)}
          {dodges.map((d, i) => (
            <div key={i} className="mt8">
              <div className="small muted">{d.analyst} asked on the {d.call} call <span className="tiny">(shared terms: {d.shared.join(", ")})</span>:</div>
              <div className="small ink2">“{d.question}”</div>
              <div className="quote">“{d.answer}”</div>
              <Receipt url={d.url} page={d.page} label={`${d.responder}, transcript`} extra={`${d.kind}: “${d.phrase}”`} />
            </div>
          ))}
          {t.versions.length > 1 && (
            <details className="mt8"><summary className="small linkish">How the wording changed across {t.versions.length} calls</summary>
              {t.versions.map((x, i) => <div key={i} className="small mt8"><span className="tick">{x.callQuarter}</span> {x.statement} <Receipt url={x.transcript} page={x.page} label="p" /></div>)}
            </details>
          )}
        </div>
      )}
    </article>
  );
}

function Money({ a }) {
  const b = a.balance, c = a.cash, h = a.holders;
  return (
    <div className="stack">
      {c && (
        <section className="card">
          <h3>Cash quality</h3>
          {!c.fin && <div className="dial mb8"><div className="big" style={{ fontSize: 36 }}>{c.cfoToPat ?? "–"}%</div><div className="small ink2">of {c.years}-year profit arrived as operating cash<br /><span className="muted">Σ CFO ₹{Math.round(c.cfoSum).toLocaleString("en-IN")} cr ÷ Σ PAT ₹{Math.round(c.patSum).toLocaleString("en-IN")} cr</span></div></div>}
          <div className="xscroll"><table className="fig mt8">
            <thead><tr><th>₹ cr</th>{c.periods.map((p) => <th key={p}>{p.replace("Mar 20", "FY")}</th>)}</tr></thead>
            <tbody>
              <tr><td className="lab">PAT</td>{c.pat.map((v, i) => <td key={i}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
              <tr><td className="lab">Op. cash</td>{c.cfo.map((v, i) => <td key={i} className={c.pat[i] && v < c.pat[i] * 0.7 ? "down" : ""}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
              <tr><td className="lab">Free cash</td>{c.fcf.map((v, i) => <td key={i} className={cls(v) === "down" ? "down" : ""}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
            </tbody>
          </table></div>
          <div className="mt8"><Flags flags={c.flags} /></div>
        </section>
      )}
      {b && (
        <section className="card">
          <h3>Balance sheet</h3>
          <div className="xscroll"><table className="fig">
            <thead><tr><th>₹ cr</th>{b.periods.map((p) => <th key={p}>{p.replace("Mar 20", "FY").replace("Sep 20", "H1FY")}</th>)}</tr></thead>
            <tbody>
              <tr><td className="lab">Net worth</td>{b.netWorth.map((v, i) => <td key={i}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
              {b.debt && <tr><td className="lab">{b.fin ? "Borrowings" : "Debt"}</td>{b.debt.map((v, i) => <td key={i}>{fmtCr(v).replace("₹", "")}</td>)}</tr>}
              {!b.fin && <tr><td className="lab">Debt / equity</td>{b.de.map((v, i) => <td key={i}>{v == null ? "–" : v.toFixed(2)}</td>)}</tr>}
            </tbody>
          </table></div>
          {b.wc && (
            <div className="xscroll"><table className="fig mt12">
              <thead><tr><th>days</th>{b.wc.periods.map((p) => <th key={p}>{p.replace("Mar 20", "FY")}</th>)}</tr></thead>
              <tbody>
                {[["Debtor days", b.wc.debtorDays], ["Inventory days", b.wc.inventoryDays], ["Payable days", b.wc.payableDays], ["Cash cycle", b.wc.ccc], [b.wc.roceLabel, b.wc.roce]].filter(([, v]) => v?.some((x) => x != null)).map(([l, v]) => (
                  <tr key={l}><td className="lab">{l}</td>{v.map((x, i) => <td key={i}>{x ?? "–"}</td>)}</tr>
                ))}
              </tbody>
            </table></div>
          )}
          <div className="mt8"><Flags flags={b.flags} /></div>
        </section>
      )}
      {h && (
        <section className="card">
          <h3>Who owns it</h3>
          <div className="xscroll"><table className="fig">
            <thead><tr><th>%</th>{h.periods.map((p) => <th key={p}>{p.replace(" 20", " '")}</th>)}</tr></thead>
            <tbody>{[["Promoters", h.promoters], ["FIIs", h.fii], ["DIIs", h.dii], ["Public", h.public]].filter(([, v]) => v).map(([l, v]) => <tr key={l}><td className="lab">{l}</td>{v.map((x, i) => <td key={i}>{x ?? "–"}</td>)}</tr>)}</tbody>
          </table></div>
          <div className="mt8"><Flags flags={h.flags} /></div>
        </section>
      )}
    </div>
  );
}

function BullBear({ symbol, ready }) {
  const st = useApi("brief", { symbol, part: "bullbear" }, [], { enabled: ready });
  const [ref, setRef] = useState(null);
  if (!ready || st.loading) return <div className="card"><div className="row"><span className="spin" /> <strong>Weighing the evidence…</strong></div><p className="small muted">The bull and bear cases are written last. They may only cite evidence already on this page: computed flags, verified quotes, ledger verdicts.</p></div>;
  if (st.error) return <div className="card"><p className="err">{st.error.status === 503 ? "AI layer offline." : st.error.message}</p></div>;
  const d = st.data;
  const ev = Object.fromEntries((d.evidence || []).map((e) => [e.id, e]));
  const Side = ({ title, pts, tone }) => (
    <section className="card">
      <h3 className={tone === "good" ? "up" : "down"}>{title}</h3>
      {pts.map((p, i) => (
        <div key={i} className="flag" style={{ gridTemplateColumns: "8px 1fr" }}>
          <span className={`dot ${tone}`} />
          <div><div style={{ fontWeight: 500 }}>{p.point}</div>
            <div className="row wrap mt4" style={{ gap: 4 }}>{p.refs.map((r) => <button key={r} className={`pill ${ref === r ? "accent" : "neutral"}`} onClick={() => setRef(ref === r ? null : r)}>{r} · {ev[r]?.kind}</button>)}</div>
            {p.refs.includes(ref) && ev[ref] && <div className="small ink2 mt4 fade-in" style={{ background: "var(--surface-2)", padding: 8, borderRadius: 8 }}>{ev[ref].text} <span className="muted tiny">({ev[ref].src})</span></div>}
          </div>
        </div>
      ))}
    </section>
  );
  return (
    <div className="stack">
      {d.question && <div className="card" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}><div className="tiny muted">The question that decides it</div><div className="serif" style={{ fontSize: 19 }}>{d.question}</div></div>}
      <Side title="Bull case" pts={d.bull} tone="good" />
      <Side title="Bear case" pts={d.bear} tone="risk" />
      <details className="card"><summary className="small"><strong>All {d.evidence.length} evidence items</strong> <span className="muted">(the only facts the model was allowed to use)</span></summary>
        {d.evidence.map((e) => <div key={e.id} className="small mt4"><span className="tick">{e.id}</span> {e.text} <span className="muted tiny">· {e.src}</span></div>)}
      </details>
      {d.meta && <div className="tiny muted">{d.meta.model} · ${d.meta.usd?.toFixed(4)}</div>}
    </div>
  );
}

const NA_CLS = { refuse: "risk", unable: "watch", defer: "info" };

/** How management talks: non-answers, uncertainty, tone, and whether the story matches the numbers. */
function Candour({ symbol, st }) {
  const { data: d, loading, error } = st;
  if (loading || (!d && !error)) return <div className="card"><div className="row"><span className="spin" /> <strong>Reading the last four calls…</strong></div><p className="small muted">Pairing every analyst question with management’s answer and flagging non-answers. No AI model involved: published word lists, applied the same way every time.</p></div>;
  if (error) return <div className="card"><p className="err">{error.message}</p></div>;
  const calls = d.calls.filter((x) => x.parsed).slice().reverse(); // oldest -> newest
  const dv = d.divergence;
  const maxNA = Math.max(20, ...calls.map((x) => x.nonAnswerRate || 0));
  const vcls = !dv ? "neutral" : dv.verdict === "aligned" ? "good" : dv.verdict === "story ahead of numbers" ? "risk" : "watch";
  return (
    <div className="stack">
      {dv && (
        <section className="card" style={{ background: vcls === "risk" ? "var(--risk-soft)" : vcls === "watch" ? "var(--watch-soft)" : undefined, borderColor: vcls === "good" ? undefined : "transparent" }}>
          <div className="tiny muted">Narrative vs numbers, {dv.from} → {dv.to} calls</div>
          <div className="serif" style={{ fontSize: 21, fontWeight: 600 }}>{dv.verdict[0].toUpperCase() + dv.verdict.slice(1)}</div>
          <div className="small ink2">{dv.why}</div>
          <div className="rule mt4">rule: {dv.rule}</div>
        </section>
      )}
      <section className="card">
        <h3>Questions dodged, call by call</h3>
        <div className="row" style={{ alignItems: "flex-end", gap: 10, height: 96 }}>
          {calls.map((x) => (
            <div key={x.period} className="grow" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span className="tiny num" style={{ fontWeight: 600 }}>{x.nonAnswerRate}%</span>
              <div title={`${x.nonAnswers.length} of ${x.questions} questions`} style={{ width: "60%", height: `${Math.max(3, (x.nonAnswerRate / maxNA) * 64)}px`, background: "var(--accent)", borderRadius: "4px 4px 0 0" }} />
              <span className="tiny muted">{x.period.replace(" 20", " '")}</span>
            </div>
          ))}
        </div>
        <p className="tiny muted">Share of analyst questions answered with a refusal (“we don’t give…”), an inability (“difficult to say”), or a deferral (“take it offline”). {calls.map((x) => `${x.period}: ${x.nonAnswers.length}/${x.questions}`).join(" · ")}</p>
        <div className="xscroll"><table className="fig mt8">
          <thead><tr><th>per call</th>{calls.map((x) => <th key={x.period}>{x.period.replace(" 20", " '")}</th>)}</tr></thead>
          <tbody>
            <tr><td className="lab">Revenue YoY (quarter discussed)</td>{calls.map((x) => <td key={x.period}><Delta v={x.growth?.yoy} /></td>)}</tr>
            <tr><td className="lab">Tone, prepared remarks</td>{calls.map((x) => <td key={x.period}>{x.prepared.tone.toFixed(2)}</td>)}</tr>
            <tr><td className="lab">Tone, Q&A answers</td>{calls.map((x) => <td key={x.period}>{x.qa.tone.toFixed(2)}</td>)}</tr>
            <tr><td className="lab">Uncertainty words /1k (Q&A)</td>{calls.map((x) => <td key={x.period}>{x.qa.uncPer1k}</td>)}</tr>
            <tr><td className="lab">Hedges /1k (Q&A)</td>{calls.map((x) => <td key={x.period}>{x.qa.hedgePer1k}</td>)}</tr>
            <tr><td className="lab">Analysts / questions</td>{calls.map((x) => <td key={x.period}>{x.analysts}/{x.questions}</td>)}</tr>
            <tr><td className="lab">Transcript filed (working days; SEBI ≤ 5)</td>{calls.map((x) => <td key={x.period} className={x.lag?.late ? "down" : ""} title={x.lag ? `call ${x.lag.callDate}, filed ${x.lag.filedDate}` : "dates not found"}>{x.lag ? `${x.lag.workingDays}d${x.lag.late ? " ⚠" : ""}` : "–"}</td>)}</tr>
            <tr><td className="lab">Analyst praise (“congratulations…”)</td>{calls.map((x) => <td key={x.period}>{x.praiseRate ?? "–"}%</td>)}</tr>
            <tr><td className="lab">Dodged: hard vs routine Qs</td>{calls.map((x) => <td key={x.period} title={`${x.pushback?.hard} hard / ${x.pushback?.easy} routine questions`}>{x.pushback?.hard >= 6 ? `${x.pushback.hardRate}% / ${x.pushback.easyRate}%` : "–"}</td>)}</tr>
          </tbody>
        </table></div>
        <p className="tiny muted mt4">Tone = (positive − negative) / (positive + negative) finance words; 1 = all positive. Praise: share of questions opening with a compliment. Analysts praise more when the news is good, so a drop is a quiet skepticism signal (Milian & Smith 2017). “Hard” questions contain doubt or bad-news cues (why, but, concern, decline, delay…); a much higher dodge rate on them than on routine questions is the evasive pattern. Shown only when there are at least 6 hard questions.</p>
      </section>
      {calls.length > 0 && calls[calls.length - 1].topics?.length > 0 && (
        <section className="card">
          <h3>What the street kept asking about ({calls[calls.length - 1].period} call)</h3>
          <p className="tiny muted" style={{ marginTop: 0 }}>Topics raised by three or more <i>different</i> analysts. Repetition across analysts marks the real worry.</p>
          {calls[calls.length - 1].topics.map((t) => (
            <details key={t.topic} className="flag" style={{ display: "block" }}>
              <summary><span className="pill accent">{t.analysts} analysts</span> <b style={{ textTransform: "capitalize" }}>{t.topic}</b></summary>
              {t.examples.map((e, i) => <div key={i} className="small ink2 mt4">{e.analyst}: “{e.q}” <Receipt url={calls[calls.length - 1].url} page={e.page} label="p" /></div>)}
            </details>
          ))}
        </section>
      )}
      {d.calls.filter((x) => x.parsed).map((x) => x.nonAnswers.length > 0 && (
        <section key={x.period} className="card">
          <h3>{x.period} call: {x.nonAnswers.length} non-answer{x.nonAnswers.length > 1 ? "s" : ""}</h3>
          {x.nonAnswers.map((na, i) => (
            <div key={i} className="flag" style={{ display: "block" }}>
              <div className="row wrap" style={{ gap: 6 }}><span className={`pill ${NA_CLS[na.kind]}`}>{na.kind}</span><span className="tiny muted">{na.analyst} asked</span></div>
              <div className="small muted mt4">“{na.question}”</div>
              <div className="quote">“{na.answer}”</div>
              <Receipt url={x.url} page={na.page} label={`${na.responder}, transcript`} extra={`matched “${na.phrase}”`} />
            </div>
          ))}
        </section>
      ))}
      <p className="tiny muted">Method: question–answer pairing from the transcript’s speaker turns. Non-answer phrases after Gow, Larcker & Zakolyukina (2021), “Non-answers during conference calls” (JAR). Tone and uncertainty use subsets of the Loughran & McDonald (2011) finance word lists. Deterministic, free, same rules for every company.{d.calls.some((x) => x.error) ? ` ${d.calls.filter((x) => x.error).length} transcript(s) couldn’t be fetched.` : ""}</p>
    </div>
  );
}

// "₹ 1,19,121 Cr." -> "₹1.19 L cr" (lakh crore), "₹ 8,450 Cr." -> "₹8,450 cr"
function mcap(t) {
  const v = Number(String(t).replace(/[^\d.]/g, ""));
  if (!v) return t;
  return v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L cr` : `₹${Math.round(v).toLocaleString("en-IN")} cr`;
}

/** Your holdings' managements, ranked by how often they dodged analysts on the latest call. Loads progressively. */
function League({ holdings, onPick }) {
  const [rows, setRows] = useState({});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true, i = 0;
    const list = holdings.map((h) => h.symbol);
    const worker = async () => {
      while (alive && i < list.length) {
        const s = list[i++];
        try { const r = await api("league", { symbol: s }); if (alive) setRows((m) => ({ ...m, [s]: r })); }
        catch { if (alive) setRows((m) => ({ ...m, [s]: { symbol: s, error: true } })); }
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => { alive = false; };
  }, [open]); // eslint-disable-line
  const ok = Object.values(rows).filter((r) => !r.error && !r.reason && r.nonAnswerRate != null).sort((a, b) => b.nonAnswerRate - a.nonAnswerRate);
  const skipped = Object.values(rows).filter((r) => r.reason || r.error);
  const pending = holdings.length - Object.keys(rows).length;
  const max = Math.max(20, ...ok.map((r) => r.nonAnswerRate));
  const med = ok.length ? ok.map((r) => r.nonAnswerRate).sort((a, b) => a - b)[Math.floor(ok.length / 2)] : null;
  return (
    <>
      <h2 className="section">Your holdings, by candour</h2>
      <div className="card">
        {!open ? (
          <button className="row between" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpen(true)}>
            <span className="small"><b>Which managements dodge their analysts?</b><br /><span className="muted">Reads each holding’s latest earnings call and ranks them by the share of analyst questions met with a non-answer. Free, no AI model.</span></span><Icon.chev />
          </button>
        ) : (<>
          {ok.map((r) => (
            <button key={r.symbol} className="list-row" style={{ width: "100%", textAlign: "left" }} onClick={() => onPick(r.symbol, "candour")}>
              <span className="tick" style={{ width: 92, textAlign: "center" }}>{r.symbol}</span>
              <div className="grow">
                <div className="bar" style={{ height: 8 }}><i style={{ width: `${(r.nonAnswerRate / max) * 100}%`, background: r.nonAnswerRate > (med ?? 0) * 1.5 ? "var(--risk)" : "var(--accent)" }} /></div>
                <div className="tiny muted mt4">{r.nonAnswers}/{r.questions} questions dodged · {r.period} call · praise {r.praiseRate}%</div>
              </div>
              <span className="num small" style={{ width: 44, textAlign: "right", fontWeight: 600 }}>{r.nonAnswerRate}%</span>
            </button>
          ))}
          {pending > 0 && <div className="row small muted mt8"><span className="spin" /> Reading {pending} more call{pending > 1 ? "s" : ""}…</div>}
          {skipped.length > 0 && <p className="tiny muted mt8">Not ranked: {skipped.map((r) => `${r.symbol} (${r.reason || "failed"})`).join(" · ")}</p>}
          {med != null && <p className="tiny muted mt8">Portfolio median {med}%. Red = more than 1.5× the median. Tap a name for the dodged questions, verbatim. Counts are lower bounds (detector recall ≈ 55–60%), with the same rules for every company.</p>}
        </>)}
      </div>
    </>
  );
}
