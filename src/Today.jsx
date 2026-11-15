// PUSH surface. Design stance: a triage desk, not a feed. FINN decides the order, shows its working
// for every decision ("why this rank"), and lets you overrule it with rules you can read.
import { useMemo, useState, useEffect } from "react";
import { api, useApi, fmtCr, fmtPct, istTime, ago } from "./lib.js";
import { Icon, ScoreRing, Spark, Delta, Receipt, Skeleton } from "./ui.jsx";

const WINDOWS = [
  { k: "24h", hours: 24, label: "24 hours" },
  { k: "3d", hours: 72, label: "3 days" },
  { k: "7d", hours: 168, label: "7 days" },
  { k: "30d", hours: 720, label: "30 days" },
];

export default function Today({ prefs, setPrefs, rules, holdings, customHoldings, openCompany, toast }) {
  // "since your last visit": the default window when you come back, so the digest is only what's new
  const [lastSeen] = useState(() => { try { return Number(localStorage.getItem("finn:lastSeen")) || 0; } catch { return 0; } });
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem("finn:lastSeen", String(Date.now())); } catch {} }, 8000); return () => clearTimeout(t); }, []);
  const sinceH = lastSeen ? Math.ceil((Date.now() - lastSeen) / 3600e3) : null;
  const [win, setWin] = useState(sinceH && sinceH >= 2 && sinceH <= 24 * 30 ? "since" : "7d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const w = win === "since" ? { k: "since", hours: sinceH, label: `since your last visit (${sinceH < 48 ? sinceH + "h" : Math.round(sinceH / 24) + "d"})` } : WINDOWS.find((x) => x.k === win);
  const params = {
    ...(win === "custom" && custom.from ? { from: new Date(custom.from).toISOString(), to: custom.to ? new Date(custom.to + "T23:59:59").toISOString() : undefined } : { hours: w?.hours || 168 }),
    prefs: JSON.stringify(prefs),
    rules: JSON.stringify(rules),
    symbols: customHoldings ? holdings.map((h) => `${h.symbol}:${h.weight}`).join(",") : undefined,
  };
  const { data, loading, error, reload } = useApi("digest", params, [], { enabled: win !== "custom" || !!custom.from });

  const mute = (cat, label) => { setPrefs({ ...prefs, muted: { ...prefs.muted, [cat]: true } }); toast(`Muted ${label}. Undo in Rules.`); };
  const boost = (cat, label) => { setPrefs({ ...prefs, boost: { ...prefs.boost, [cat]: 25 } }); toast(`${label} will rank higher from now on.`); };

  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem("finn:introSeen"); } catch { return true; } });
  const closeIntro = () => { setIntro(false); try { localStorage.setItem("finn:introSeen", "1"); } catch {} };
  return (
    <div className="fade-in">
      {intro && (
        <div className="card mt4" style={{ background: "var(--accent-soft)", borderColor: "transparent" }}>
          <div className="row between top"><strong className="serif" style={{ fontSize: 18 }}>FINN reads every filing so you read three.</strong><button className="iconbtn" aria-label="Dismiss" onClick={closeIntro}><Icon.x /></button></div>
          <ul className="small ink2" style={{ paddingLeft: 18, margin: "6px 0 0" }}>
            <li><b>Ranked, with reasons.</b> Tap any card for “why it’s ranked” — every point of the score is itemised, and backtested (Rules tab).</li>
            <li><b>Receipts.</b> Numbers are computed, not generated; every quote is checked against the source PDF.</li>
            <li><b>Promise Ledger.</b> In Research, see what management promised over four calls vs what they delivered.</li>
          </ul>
        </div>
      )}
      <div className="chips mt4" role="tablist" aria-label="Time window">
        {sinceH && sinceH >= 2 && sinceH <= 24 * 30 && <button className={`chip ${win === "since" ? "on" : ""}`} onClick={() => setWin("since")}>Since last visit</button>}
        {WINDOWS.map((x) => (<button key={x.k} className={`chip ${win === x.k ? "on" : ""}`} onClick={() => setWin(x.k)}>{x.label}</button>))}
        <button className={`chip ${win === "custom" ? "on" : ""}`} onClick={() => setWin("custom")}>Custom…</button>
      </div>
      {win === "custom" && (
        <div className="row mt8 wrap small">
          <label>From <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label>To <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>
      )}

      {loading && !data && (<><div className="skeleton mt12" style={{ height: 64 }} /><div className="mt12"><Skeleton h={96} n={4} /></div><p className="muted small mt8">Reading NSE + BSE filings for {holdings.length} holdings…</p></>)}
      {error && <div className="card mt12"><p className="err">Couldn’t load the digest: {error.message}</p><button className="btn" onClick={reload}>Retry</button></div>}
      {data && <Digest data={data} win={win === "custom" ? "the chosen window" : w.label.replace(/^since your last visit/, "since your last visit")} mute={mute} boost={boost} openCompany={openCompany} reloading={loading} />}
    </div>
  );
}

/**
 * Exchange one-liners are boilerplate ("X has informed the Exchange about…"). For the items that
 * earned attention (act + read), read the actual PDF with the cheap model, a few at a time, cached
 * server-side by filing URL. Routine items never cost a token.
 */
function useSummaries(items) {
  const [sum, setSum] = useState({});
  useEffect(() => {
    let alive = true;
    const queue = items.filter((x) => x.tier !== "skim" && x.url && x.category !== "management_change").slice(0, 14);
    let i = 0;
    const worker = async () => {
      while (alive && i < queue.length) {
        const x = queue[i++];
        try {
          const d = await api("filing", { url: x.url, category: x.category === "results" ? "generic" : x.category });
          if (alive && d?.data?.one_line) setSum((m) => ({ ...m, [x.id]: d }));
        } catch {}
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => { alive = false; };
  }, [items]);
  return sum;
}

function Digest({ data, win, mute, boost, openCompany, reloading }) {
  const sums = useSummaries(data.items);
  const act = data.items.filter((x) => x.tier === "act");
  const read = data.items.filter((x) => x.tier === "read");
  const skim = data.items.filter((x) => x.tier === "skim");
  const groups = useMemo(() => {
    const g = {};
    for (const x of skim) (g[x.categoryLabel] ||= []).push(x);
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [skim]);
  const srcs = [...new Set(Object.values(data.sources))];

  return (
    <>
      <h1 className="headline mt12">
        {act.length ? <><em>{act.length} {act.length === 1 ? "thing needs" : "things need"} you</em>{read.length ? `, ${read.length} worth a read.` : "."}</> : read.length ? <>{read.length} worth a read, nothing urgent.</> : <>Quiet. Nothing material.</>}
        {" "}<span className="muted">{skim.length} routine filing{skim.length === 1 ? "" : "s"} filed away.</span>
      </h1>
      <div className="row between wrap">
        <span className="muted small">{data.counts.total} events{data.counts.collapsed ? ` (${data.counts.collapsed} duplicate filings merged)` : ""} · {data.counts.holdings} holdings · {win.startsWith("since") ? win : `last ${win}`} {reloading && <span className="spin" />}</span>
        <div className="row" style={{ gap: 6 }}>
          <ShareBrief act={act} read={read} alerts={data.alerts} win={win} />
          <Listen items={[...act, ...read]} alerts={data.alerts} />
        </div>
      </div>

      {data.alerts.length > 0 && (
        <>
          <h2 className="section">Price & volume triggers <span className="count">{data.alerts.length}</span></h2>
          <div className="chips" style={{ gap: 10 }}>
            {data.alerts.map((a, i) => (
              <button key={i} className="card tap" style={{ minWidth: 230, textAlign: "left", padding: 12 }} onClick={() => openCompany(a.symbol)}>
                <div className="row between"><span className="tick">{a.symbol}</span><Spark data={a.stats.spark} /></div>
                <div className="item-title" style={{ fontSize: 14 }}><span className={a.severity === "high" ? "down" : ""} style={{ color: a.kind === "volume" ? "var(--accent)" : undefined }}><Icon.bolt /></span> {a.title}</div>
                <div className="muted tiny" style={{ whiteSpace: "normal" }}>{a.why}</div>
                <div className="tiny muted mt4">EOD {a.date}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {act.length > 0 && <h2 className="section">Needs you <span className="count">{act.length}</span></h2>}
      <div className="stack">{act.map((x) => <FilingCard key={x.id} x={x} ai={sums[x.id]} mute={mute} boost={boost} openCompany={openCompany} defaultOpen={x === act[0]} />)}</div>

      {read.length > 0 && <h2 className="section">Worth a read <span className="count">{read.length}</span></h2>}
      <div className="stack">{read.map((x) => <FilingCard key={x.id} x={x} ai={sums[x.id]} mute={mute} boost={boost} openCompany={openCompany} />)}</div>

      {groups.length > 0 && (
        <>
          <h2 className="section">Filed away <span className="count">{skim.length}</span></h2>
          <div className="card flat" style={{ padding: "2px 14px" }}>
            {groups.map(([label, xs]) => <RoutineGroup key={label} label={label} xs={xs} />)}
          </div>
          <p className="muted tiny mt8">Routine = scored below 40. Open a group to see what was hidden and why.</p>
        </>
      )}
      {data.failures.filter((f) => !f.partial).length > 0 && <p className="muted tiny mt12">Couldn’t read: {data.failures.filter((f) => !f.partial).map((f) => f.symbol).join(", ")}</p>}
      <p className="muted tiny mt8">Sources: {srcs.join(", ") || "–"}. Filings de-duplicated across exchanges.</p>
    </>
  );
}

function RoutineGroup({ label, xs }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon.chev open={open} /> <span className="grow">{label}</span> <span className="muted small">{xs.length}</span>
      </button>
      {open && xs.map((x) => (
        <div key={x.id} className="small" style={{ padding: "6px 0 8px 24px" }}>
          <div className="row"><span className="tick">{x.symbol}</span><span className="muted tiny">{ago(x.time)}</span><span className="grow" /><span className="muted tiny num">{x.score}</span></div>
          <div className="ink2 mt4">{x.summary || x.subject}</div>
          <div className="muted tiny">{x.parts.filter((p) => p.v < 0).map((p) => p.why).join(" · ") || `${x.parts[0].why}`}</div>
        </div>
      ))}
    </div>
  );
}

const BOILER = /has informed the Exchange|wish to inform|please find (enclosed|attached)|pursuant to regulation|in continuation of our/i;

export function FilingCard({ x, ai, mute, boost, openCompany, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <article className="card fade-in">
      <div className="row top" onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        <div className="grow">
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="tick" onClick={(e) => { e.stopPropagation(); openCompany(x.symbol); }}>{x.symbol}</button>
            <span className="cat">{x.icon} {x.categoryLabel}</span>
            <span className="muted tiny">· {x.datePrecision === "day" ? new Date(x.time).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : istTime(x.time)}</span>
            {x.dayMove != null && Math.abs(x.dayMove) >= 1 && <span className={`pill ${x.dayMove > 0 ? "good" : "risk"}`}>{fmtPct(x.dayMove)} that day</span>}
          </div>
          {ai?.data?.one_line ? (
            <>
              <div className="item-title fade-in">{ai.data.one_line}</div>
              {ai.data.so_what && !/^routine/i.test(ai.data.so_what) && <div className="item-sum">{ai.data.so_what}</div>}
              <div className="muted tiny ellipsis">{x.subject} · <span title="Summary written by a model from the filing PDF; quote checked against the source">read from filing{ai.data.verified ? " ✓" : ""}</span></div>
            </>
          ) : (
            <>
              <div className="item-title">{x.summary && !BOILER.test(x.summary) ? x.summary : x.subject}</div>
              {x.summary && BOILER.test(x.summary) && <div className="muted tiny ellipsis">{x.summary}</div>}
              {x.summary && !BOILER.test(x.summary) && <div className="muted tiny ellipsis">{x.subject}</div>}
            </>
          )}
        </div>
        <ScoreRing score={x.score} tier={x.tier} />
      </div>
      {x.resultsCut && <ResultsCut r={x.resultsCut} />}
      {x.category === "earnings_call" && /transcript/i.test(`${x.subject} ${x.summary}`) && x.url && <CallCheck x={x} />}
      {x.resultsPending && !open && <div className="small muted mt8">{x.resultsPending}</div>}
      {x.related?.length > 0 && (
        <details className="mt8"><summary className="tiny linkish">+{x.related.length} related filing{x.related.length > 1 ? "s" : ""} from the same event</summary>
          {x.related.map((r, i) => <div key={i} className="tiny ink2 mt4">{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="linkish">{r.subject}</a> : r.subject}{r.summary ? ` · ${r.summary.slice(0, 90)}` : ""}</div>)}
        </details>
      )}
      {open && <Expanded x={x} mute={mute} boost={boost} openCompany={openCompany} />}
      {!open && <button className="btn ghost small mt4" onClick={() => setOpen(true)}>Why this rank <Icon.chev /></button>}
    </article>
  );
}

function Expanded({ x, mute, boost, openCompany }) {
  return (
    <div className="why fade-in">
      <div className="small" style={{ fontWeight: 600 }}>Why it’s ranked {x.score}/100</div>
      {x.parts.map((p, i) => (
        <div key={i} className="why-row">
          <span><span className="muted">{p.k}:</span> {p.why}</span>
          <span className={`v ${p.v > 0 && i > 0 ? "up" : p.v < 0 ? "down" : ""}`}>{i === 0 ? p.v : (p.v > 0 ? "+" : "") + p.v}</span>
        </div>
      ))}
      <div className="rule mt4">category rule: {x.classifiedBy}</div>
      <WhyNotHigher x={x} />
      <Enrichment x={x} />
      <div className="row wrap mt12">
        {x.url && <a className="btn" href={x.url} target="_blank" rel="noreferrer">Open filing <Icon.ext /></a>}
        {x.alsoOn?.url && <a className="btn" href={x.alsoOn.url} target="_blank" rel="noreferrer">{x.alsoOn.source} copy <Icon.ext /></a>}
        {x.category === "earnings_call" && /transcript/i.test(`${x.subject} ${x.summary}`) && <button className="btn primary" onClick={() => openCompany(x.symbol, "ledger")}><Icon.ledger width="14" height="14" /> Audit its promises</button>}
        <button className="btn" onClick={() => mute(x.category, x.categoryLabel)}>Less of “{x.categoryLabel}”</button>
        <button className="btn" onClick={() => boost(x.category, x.categoryLabel)}>More</button>
      </div>
    </div>
  );
}

/** Per-type enrichment, fetched only when a card is opened (pay for attention, not for volume). */
function Enrichment({ x }) {
  const auto = (x.category === "management_change" && x.tier !== "skim") || !!x.resultsPending;
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const run = async () => {
    setState({ loading: true });
    try { setState({ loading: false, data: await api("filing", { url: x.url, category: x.category }) }); }
    catch (e) { setState({ loading: false, error: e }); }
  };
  useEffect(() => { if (auto && x.url) run(); }, []); // eslint-disable-line
  if (!x.url) return null;
  const d = state.data;
  const label = x.category === "results" ? "Read the filing: verify the numbers" : x.category === "management_change" ? "Who is this?" : "Summarise this filing";
  return (
    <div className="mt12">
      {!d && !state.loading && <button className="btn primary" onClick={run}>{label}</button>}
      {state.loading && <div className="row small muted"><span className="spin" /> Reading the filing PDF…</div>}
      {state.error && <p className="err">{state.error.message}</p>}
      {d?.error && <p className="muted small">{d.error}</p>}
      {d?.kind === "mgmt" && <MgmtCard d={d} />}
      {d?.kind === "results" && <FilingResults d={d} cut={x.resultsCut} />}
      {d?.kind === "generic" && d.data && (
        <div className="card flat" style={{ background: "var(--surface-2)", border: 0 }}>
          <div style={{ fontWeight: 600 }}>{d.data.one_line}</div>
          <div className="small ink2 mt4">{d.data.so_what}</div>
          {d.data.verified && <><div className="quote">“{d.data.quote}”</div><Receipt url={d.url} page={d.data.page} label="filing" extra="quote verified in source" /></>}
        </div>
      )}
      {d?.meta && <div className="tiny muted mt4">{d.cached ? "cached · " : ""}{d.meta.model} · ${d.meta.usd?.toFixed(4)}</div>}
    </div>
  );
}

function MgmtCard({ d }) {
  const chs = d.data?.changes || [];
  return (
    <div className="stack">
      {d.data?.one_line && <div style={{ fontWeight: 600 }}>{d.data.one_line}</div>}
      {chs.map((c, i) => (
        <div key={i} className="card flat" style={{ background: "var(--surface-2)", border: 0 }}>
          <div className="row between wrap">
            <div><div style={{ fontWeight: 650, fontSize: 16 }}>{c.name}</div><div className="small ink2">{c.role}</div></div>
            <span className={`pill ${/resign|ceas/.test(c.change) ? "risk" : /retir/.test(c.change) ? "watch" : "good"}`}>{c.change}</span>
          </div>
          {c.profile && <p className="small" style={{ margin: "8px 0 4px" }}>{c.profile}</p>}
          {c.previous?.length > 0 && <div className="small ink2">Previously: {c.previous.join(" · ")}</div>}
          {c.education && <div className="small ink2">Education: {c.education}</div>}
          {c.reason && <div className="small"><span className="muted">Stated reason:</span> {c.reason}</div>}
          {c.effective && <div className="small muted">Effective {c.effective}</div>}
          <div className="row wrap mt8">
            <a className="btn" href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn <Icon.ext /></a>
            {c.verified && <Receipt url={d.url} page={c.page} label="filing" extra="profile from the filing itself" />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ResultsCut({ r, title }) {
  if (!r?.rows) return null;
  return (
    <div className="mt8">
      <table className="fig">
        <thead><tr><th>{title || `${r.period} · ${r.unit}`}</th><th>Now</th><th>QoQ</th><th>YoY</th></tr></thead>
        <tbody>{r.rows.map((x) => (
          <tr key={x.key}><td className="lab">{x.label}</td><td>{fmtCr(x.cur).replace("₹", "")}</td><td><Delta v={x.qoq} /></td><td><Delta v={x.yoy} /></td></tr>
        ))}</tbody>
      </table>
      {r.margin?.cur != null && !r.fin && <div className="tiny muted mt4">EBITDA margin {r.margin.cur}% (vs {r.margin.prev}% last quarter, {r.margin.yearAgo}% a year ago){r.rawPdf && <> · <a className="linkish" href={r.rawPdf} target="_blank" rel="noreferrer">results PDF</a></>}</div>}
      {r.fin && <div className="tiny muted mt4">{r.rows[1].note}</div>}
    </div>
  );
}

function FilingResults({ d, cut }) {
  const v = d.derived;
  if (!v) return <p className="muted small">Couldn’t find the statement table in this PDF.</p>;
  // reconcile against standardised numbers (unit may differ: lakh/million) by comparing growth rates
  const agree = cut && v.rows.every((r, i) => r.yoy == null || cut.rows[i].yoy == null || Math.abs(r.yoy - cut.rows[i].yoy) < 2.5);
  const labels = { revenue: "Revenue", ebitda: "EBITDA*", pbt: "PBT", pat: "PAT" };
  return (
    <div className="card flat" style={{ background: "var(--surface-2)", border: 0 }}>
      <div className="row between"><strong className="small">From the filing ({v.basis}, {v.unit})</strong>{cut && <span className={`pill ${agree ? "good" : "watch"}`}>{agree ? <><Icon.check /> matches standardised data</> : "differs: check basis"}</span>}</div>
      <table className="fig mt4">
        <thead><tr><th></th><th>Now</th><th>QoQ</th><th>YoY</th></tr></thead>
        <tbody>{v.rows.map((r) => <tr key={r.key}><td className="lab">{labels[r.key]}</td><td>{r.cur?.toLocaleString("en-IN") ?? "–"}</td><td><Delta v={r.qoq} /></td><td><Delta v={r.yoy} /></td></tr>)}</tbody>
      </table>
      <div className="tiny muted mt4">*{v.formula}</div>
      <Receipt url={d.url} page={d.data?.page} label="results filing" />
    </div>
  );
}

/** Commute mode: the browser reads the brief aloud (no server, no cost). */
function Listen({ items, alerts }) {
  const [on, setOn] = useState(false);
  const ok = typeof window !== "undefined" && "speechSynthesis" in window;
  if (!ok) return null;
  const go = () => {
    if (on) { speechSynthesis.cancel(); setOn(false); return; }
    const lines = [];
    lines.push(items.length ? `${items.length} items worth your time.` : "Nothing material in your filings.");
    items.slice(0, 5).forEach((x) => lines.push(`${x.name}. ${x.categoryLabel}. ${x.summary || x.subject}.`));
    alerts.slice(0, 3).forEach((a) => lines.push(`${a.name}: ${a.title}.`));
    const u = new SpeechSynthesisUtterance(lines.join(" "));
    u.lang = "en-IN"; u.rate = 1.05; u.onend = () => setOn(false);
    speechSynthesis.speak(u); setOn(true);
  };
  return <button className="listen" onClick={go}>{on ? <Icon.stop width="14" height="14" /> : <Icon.speak width="16" height="16" />} {on ? "Stop" : "Listen · 60s"}</button>;
}

/** Counterfactual: the smallest thing that would move this card up a tier. Additive scores make this exact. */
function WhyNotHigher({ x }) {
  if (x.tier === "act") return null;
  const target = x.tier === "read" ? 70 : 40, gap = target - x.score;
  const has = (k) => x.parts.some((p) => p.k === k);
  const ideas = [];
  if (!has("Market reaction")) ideas.push("the stock moving ≥ 2σ in the next session (+15)");
  if (!has("Size")) ideas.push("a deal or order worth ≥ 10% of revenue (+25)");
  if (!x.parts.some((p) => p.k === "Your rule" && p.v > 0)) ideas.push(`boosting “${x.categoryLabel}” in Rules (+25)`);
  return <div className="tiny muted mt4">Why not higher: needs +{gap} to reach {x.tier === "read" ? "Needs you" : "Worth a read"}, e.g. {ideas.slice(0, 2).join(" or ")}.</div>;
}

/** A transcript just landed: read it instantly (no model) and compare with the previous call. */
function CallCheck({ x }) {
  const { data: d, loading, error } = useApi("callcheck", { url: x.url, symbol: x.symbol });
  if (loading) return <div className="row small muted mt8"><span className="spin" /> Reading the transcript: questions, answers, dodges…</div>;
  if (error || !d?.now?.parsed) return null;
  const n = d.now, p = d.prev;
  const dRate = p?.nonAnswerRate != null ? +(n.nonAnswerRate - p.nonAnswerRate).toFixed(1) : null;
  const dTone = p ? +(n.toneQA - p.toneQA).toFixed(2) : null;
  return (
    <div className="mt8" style={{ background: "var(--surface-2)", borderRadius: 10, padding: "8px 10px" }}>
      <div className="small"><b>Dodged {n.nonAnswerCount} of {n.questions} analyst questions</b> ({n.nonAnswerRate}%)
        {dRate != null && <span className={dRate > 2 ? "down" : dRate < -2 ? "up" : "muted"}> · {dRate > 0 ? "up" : dRate < 0 ? "down" : "flat"} {Math.abs(dRate)} pts vs {p.period}</span>}
        {dTone != null && Math.abs(dTone) >= 0.05 && <span className="muted"> · Q&A tone {dTone > 0 ? "warmer" : "cooler"}</span>}
      </div>
      {n.lag && <div className={`tiny mt4 ${n.lag.late ? "down" : "muted"}`}>Transcript filed {n.lag.workingDays} working day{n.lag.workingDays === 1 ? "" : "s"} after the call{n.lag.late ? ": later than SEBI’s 5-day rule" : " (SEBI limit: 5)"}.</div>}
      {n.nonAnswers[0] && <div className="small ink2 mt4">e.g. “{n.nonAnswers[0].answer}” <Receipt url={x.url} page={n.nonAnswers[0].page} label="p" /></div>}
      <div className="tiny muted mt4">Computed from the transcript text with published word lists. Free and instant; no AI model.</div>
    </div>
  );
}

/** Push without infrastructure: the ranked brief as a WhatsApp-ready message (share sheet or wa.me). */
function ShareBrief({ act, read, alerts, win }) {
  const live = typeof window !== "undefined" && !window.__FINN_SNAPSHOT__ && location.protocol.startsWith("http");
  const text = () => {
    const L = [`*FINN brief*: ${win.startsWith("since") ? win : `last ${win}`}`];
    if (act.length) { L.push("", "*Needs you*"); act.slice(0, 5).forEach((x) => L.push(`• ${x.symbol}: ${(x.summary || x.subject).slice(0, 110)} (${x.score})`)); }
    if (alerts.length) { L.push("", "*Triggers*"); alerts.slice(0, 4).forEach((a) => L.push(`• ${a.symbol}: ${a.title}`)); }
    if (read.length) L.push("", `${read.length} more worth a read.`);
    if (live) L.push("", location.origin);
    return L.join("\n");
  };
  // A real link, so it works even where scripts can't open windows (embedded or sandboxed copies);
  // on a phone with a share sheet, the sheet is offered first.
  const href = `https://wa.me/?text=${encodeURIComponent(text())}`;
  const go = async (e) => {
    if (!live || !navigator.share) return;
    e.preventDefault();
    try { await navigator.share({ text: text() }); } catch (err) { if (err?.name !== "AbortError") window.open(href, "_blank", "noopener"); }
  };
  return <a className="listen" href={href} target="_blank" rel="noopener noreferrer" onClick={go} aria-label="Send brief to WhatsApp" style={{ background: "var(--good-soft)", color: "var(--good)", textDecoration: "none" }}>↗ WhatsApp</a>;
}
