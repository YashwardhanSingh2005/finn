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

export default function Research({ symbol, setSymbol }) {
  if (symbol) return <Company symbol={symbol} back={() => setSymbol(null)} />;
  return <Finder onPick={setSymbol} />;
}

function Finder({ onPick }) {
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
  { k: "money", label: "Balance & cash" },
  { k: "bb", label: "Bull vs bear" },
];

function Company({ symbol, back }) {
  const { data: c, loading, error } = useApi("company", { symbol });
  const [tab, setTab] = useState("snap");
  const [recent, setRecent] = usePersist("recent", []);
  useEffect(() => { if (c?.symbol) setRecent([c.symbol, ...recent.filter((s) => s !== c.symbol)].slice(0, 8)); }, [c?.symbol]); // eslint-disable-line
  // Start the slow layers immediately in the background so they're warm when the tab is opened.
  const ledger = useApi("ledger", { symbol }, [], { enabled: !!c });
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
          <div className="kpi" key={k}><div className="k">{k}</div><div className="v">{c.ratios[k].replace("Cr.", "cr")}</div></div>
        ))}
      </div>
      <div className="segmented mt12" role="tablist">
        {TABS.map((t) => <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)} role="tab" aria-selected={tab === t.k}>{t.label}{t.k === "ledger" && ledger.data?.sayDo != null ? ` · ${ledger.data.sayDo}` : ""}</button>)}
      </div>
      <div className="mt12">
        {tab === "snap" && <Snapshot c={c} biz={biz} />}
        {tab === "ledger" && <Ledger st={ledger} />}
        {tab === "money" && <Money a={c.analysis} />}
        {tab === "bb" && <BullBear symbol={symbol} ready={!ledger.loading} />}
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

function Snapshot({ c, biz }) {
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
  const max = Math.max(...a.filter(Boolean), 1);
  return (
    <div>
      <div className="row" style={{ alignItems: "flex-end", height: 90, gap: 6 }}>
        {a.map((v, i) => (
          <div key={i} className="grow" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div className="row" style={{ alignItems: "flex-end", gap: 2, height: 72 }}>
              <div title={`${la} ${fmtCr(v)} cr`} style={{ width: 9, height: `${Math.max(2, ((v || 0) / max) * 72)}px`, background: "var(--ink-3)", borderRadius: "3px 3px 0 0" }} />
              <div title={`${lb} ${fmtCr(b?.[i])} cr`} style={{ width: 9, height: `${Math.max(2, ((b?.[i] || 0) / max) * 72)}px`, background: "var(--accent)", borderRadius: "3px 3px 0 0" }} />
            </div>
            <span className="tiny muted">{periods[i]?.replace("Mar ", "FY").replace(/FY20(\d\d)/, "FY$1")}</span>
          </div>
        ))}
      </div>
      <div className="legend mt4"><span><i style={{ background: "var(--ink-3)" }} />{la}</span><span><i style={{ background: "var(--accent)" }} />{lb}</span><span>₹ cr, latest {fmtCr(a[a.length - 1])} / {fmtCr(b?.[b.length - 1])}</span></div>
    </div>
  );
}

function Ledger({ st }) {
  const { data: L, loading, error, reload } = st;
  if (loading) return (
    <div className="card"><div className="row"><span className="spin" /> <strong>Building the promise ledger…</strong></div>
      <p className="small muted">Reading the last 4 earnings calls, extracting every forward-looking promise, verifying each quote against the transcript, then checking it against what was actually reported. First run ≈ 30–50 s; then it’s cached.</p></div>);
  if (error) return <div className="card"><p className="err">{error.status === 503 ? "AI layer offline on this deployment." : error.message}</p><button className="btn" onClick={reload}>Retry</button></div>;
  if (!L) return null;
  const order = ["missed", "behind", "partly", "on track", "delivered", "beat", "too early", "no evidence", "pending"];
  const rows = [...L.rows].sort((a, b) => order.indexOf(a.verdict || "pending") - order.indexOf(b.verdict || "pending"));
  const total = rows.length || 1;
  const segs = [["delivered", "var(--good)"], ["beat", "var(--good)"], ["on track", "color-mix(in srgb, var(--good) 60%, transparent)"], ["partly", "var(--watch)"], ["behind", "var(--watch)"], ["missed", "var(--risk)"], ["too early", "var(--line)"], ["no evidence", "var(--line)"]];
  return (
    <div className="stack">
      <section className="card">
        <div className="dial">
          <div className="big">{L.sayDo ?? "–"}</div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>Say–do score</div>
            <div className="small ink2">{L.sayDo == null ? "Not enough checkable promises yet." : `Across ${L.sayDoBasis} promise${L.sayDoBasis === 1 ? "" : "s"} that can be scored. 100 = everything delivered.`}</div>
          </div>
        </div>
        <div className="bar mt12">{segs.map(([k, col]) => L.tally[k] ? <i key={k} style={{ width: `${(L.tally[k] / total) * 100}%`, background: col }} /> : null)}</div>
        <div className="legend mt4">{Object.entries(L.tally).map(([k, n]) => <span key={k}>{VERDICT[k]?.label || k} {n}</span>)}</div>
        <div className="tiny muted mt8">
          {L.calls.map((c) => <span key={c.url} style={{ marginRight: 10 }}><a className="linkish" href={c.url} target="_blank" rel="noreferrer">{c.callQuarter || c.period}</a> {c.claims} found{c.dropped ? `, ${c.dropped} dropped (quote not in transcript)` : ""}</span>)}
        </div>
      </section>
      {rows.length === 0 && <p className="empty">No forward-looking guidance found in the last four calls. This management team doesn’t guide.</p>}
      {rows.map((r, i) => <PromiseRow key={i} r={r} />)}
      <p className="tiny muted">How verdicts are made: numeric promises (growth, margin) are checked in code against reported quarterly numbers for the promised period, with ±0.5 pt tolerance. If the period isn’t over, they show as on track or behind on the quarters reported so far. Qualitative promises are judged by a stronger model, using only later transcripts; those are labelled “judgement”.</p>
    </div>
  );
}

function PromiseRow({ r }) {
  const [open, setOpen] = useState(false);
  const v = VERDICT[r.verdict || "pending"] || VERDICT.pending;
  return (
    <article className="card">
      <button className="row top" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="grow">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tick">{r.callQuarter}</span>
            <span className="muted tiny">promised for {r.horizonResolved || r.horizon}</span>
            <span className="pill neutral tiny">{r.check === "computed" ? "computed" : r.check === "judgement" ? "judgement" : r.check}</span>
          </div>
          <div className="item-title">{r.statement}</div>
          {r.actual && <div className="small"><span className="muted">target</span> {r.target} <span className="muted">· actual</span> <strong>{r.actual}</strong>{r.partial && <span className="muted"> ({r.coverage})</span>}</div>}
          {r.reason && !r.actual && <div className="small ink2">{r.reason}</div>}
        </div>
        <span className={`pill ${v.cls}`}>{v.label}</span>
      </button>
      {open && (
        <div className="why fade-in">
          <div className="small muted">{r.speaker ? `${r.speaker} said` : "Management said"} on the {r.callQuarter} call:</div>
          <div className="quote">“{r.quote}”</div>
          <Receipt url={r.transcript} page={r.page} label="transcript" extra={`quote match ${Math.round((r.verifyScore || 1) * 100)}%`} />
          {r.calc && <div className="mt8 small"><span className="muted">Check:</span> {r.calc}</div>}
          {r.evidence && (<><div className="small muted mt8">Evidence from the {r.evidence.call} call:</div><div className="quote">“{r.evidence.quote}”</div><Receipt url={r.evidence.url} page={r.evidence.page} label="later transcript" /></>)}
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
          <table className="fig mt8">
            <thead><tr><th>₹ cr</th>{c.periods.map((p) => <th key={p}>{p.replace("Mar 20", "FY")}</th>)}</tr></thead>
            <tbody>
              <tr><td className="lab">PAT</td>{c.pat.map((v, i) => <td key={i}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
              <tr><td className="lab">Op. cash</td>{c.cfo.map((v, i) => <td key={i} className={c.pat[i] && v < c.pat[i] * 0.7 ? "down" : ""}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
              <tr><td className="lab">Free cash</td>{c.fcf.map((v, i) => <td key={i} className={cls(v) === "down" ? "down" : ""}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
            </tbody>
          </table>
          <div className="mt8"><Flags flags={c.flags} /></div>
        </section>
      )}
      {b && (
        <section className="card">
          <h3>Balance sheet</h3>
          <table className="fig">
            <thead><tr><th>₹ cr</th>{b.periods.map((p) => <th key={p}>{p.replace("Mar 20", "FY").replace("Sep 20", "H1FY")}</th>)}</tr></thead>
            <tbody>
              <tr><td className="lab">Net worth</td>{b.netWorth.map((v, i) => <td key={i}>{fmtCr(v).replace("₹", "")}</td>)}</tr>
              {b.debt && <tr><td className="lab">{b.fin ? "Borrowings" : "Debt"}</td>{b.debt.map((v, i) => <td key={i}>{fmtCr(v).replace("₹", "")}</td>)}</tr>}
              {!b.fin && <tr><td className="lab">Debt / equity</td>{b.de.map((v, i) => <td key={i}>{v == null ? "–" : v.toFixed(2)}</td>)}</tr>}
            </tbody>
          </table>
          {b.wc && (
            <table className="fig mt12">
              <thead><tr><th>days</th>{b.wc.periods.map((p) => <th key={p}>{p.replace("Mar 20", "FY")}</th>)}</tr></thead>
              <tbody>
                {[["Debtor days", b.wc.debtorDays], ["Inventory days", b.wc.inventoryDays], ["Payable days", b.wc.payableDays], ["Cash cycle", b.wc.ccc], [b.wc.roceLabel, b.wc.roce]].filter(([, v]) => v?.some((x) => x != null)).map(([l, v]) => (
                  <tr key={l}><td className="lab">{l}</td>{v.map((x, i) => <td key={i}>{x ?? "–"}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt8"><Flags flags={b.flags} /></div>
        </section>
      )}
      {h && (
        <section className="card">
          <h3>Who owns it</h3>
          <table className="fig">
            <thead><tr><th>%</th>{h.periods.map((p) => <th key={p}>{p.replace(" 20", " '")}</th>)}</tr></thead>
            <tbody>{[["Promoters", h.promoters], ["FIIs", h.fii], ["DIIs", h.dii], ["Public", h.public]].filter(([, v]) => v).map(([l, v]) => <tr key={l}><td className="lab">{l}</td>{v.map((x, i) => <td key={i}>{x ?? "–"}</td>)}</tr>)}</tbody>
          </table>
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
