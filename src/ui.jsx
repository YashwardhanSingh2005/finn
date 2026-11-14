// Small shared UI atoms.
import { fmtPct, cls } from "./lib.js";

export const Icon = {
  today: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M4 6h16M4 12h10M4 18h6" /><circle cx="19" cy="17" r="3" /></svg>),
  research: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>),
  rules: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>),
  ledger: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>),
  speak: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>),
  stop: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>),
  ext: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12" {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>),
  chev: ({ open, ...p }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} {...p}><path d="m9 6 6 6-6 6" /></svg>),
  back: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="m15 6-6 6 6 6" /></svg>),
  moon: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>),
  bolt: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>),
  check: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" width="12" height="12" {...p}><path d="m5 12 5 5 9-10" /></svg>),
  x: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" width="12" height="12" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>),
};

/** Score ring: the number IS the priority; colour by tier. */
export function ScoreRing({ score, tier }) {
  const c = tier === "act" ? "var(--risk)" : tier === "read" ? "var(--accent)" : "var(--ink-3)";
  const r = 15, C = 2 * Math.PI * r;
  return (
    <div className="score" title={`Priority ${score}/100`} aria-label={`Priority ${score} of 100`}>
      <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3" /><circle cx="18" cy="18" r={r} fill="none" stroke={c} strokeWidth="3" strokeDasharray={`${(score / 100) * C} ${C}`} strokeLinecap="round" /></svg>
      <span>{score}</span>
    </div>
  );
}

export function Spark({ data, w = 64, h = 22, color }) {
  if (!data?.length) return null;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline points={pts} fill="none" stroke={color || (up ? "var(--good)" : "var(--risk)")} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>);
}

export const Delta = ({ v, suffix }) => <span className={`num ${cls(v)}`}>{fmtPct(v)}{suffix}</span>;

export function Receipt({ url, page, label = "source", extra }) {
  if (!url) return null;
  const href = page ? `${url}#page=${page}` : url;
  return (
    <span className="receipt">
      <Icon.check /> <a href={href} target="_blank" rel="noreferrer">{label}{page ? `, p.${page}` : ""}</a> <Icon.ext />
      {extra && <span>· {extra}</span>}
    </span>
  );
}

export function Skeleton({ h = 80, n = 3 }) {
  return <div className="stack">{Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
}

export function Toggle({ on, onChange, label }) {
  return <button className={`toggle ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (<><div className="sheet-bg" onClick={onClose} /><div className="sheet" role="dialog"><div className="grabber" />{children}</div></>);
}

export const VERDICT = {
  delivered: { cls: "good", label: "Delivered" },
  beat: { cls: "good", label: "Beat" },
  "on track": { cls: "good", label: "On track" },
  partly: { cls: "watch", label: "Partly" },
  behind: { cls: "watch", label: "Behind" },
  missed: { cls: "risk", label: "Missed" },
  "too early": { cls: "neutral", label: "Too early" },
  "no evidence": { cls: "neutral", label: "No evidence" },
  pending: { cls: "neutral", label: "Pending" },
};
