// Deterministic analysis of the standardised statements. Every flag carries the exact numbers it was
// computed from ("evidence") and the rule that fired ("rule"), so the investor can audit the judgement.
// Banks/NBFCs have a different statement shape; we detect it and say so rather than forcing EBITDA.

const pick = (t, names) => {
  if (!t) return null;
  for (const n of names) if (t.rows[n]) return t.rows[n];
  return null;
};
const last = (a, k = 1) => (a ? a[a.length - k] : null);
const pct = (a, b) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const cagr = (a, b, n) => (a > 0 && b > 0 && n > 0 ? (Math.pow(a / b, 1 / n) - 1) * 100 : null);

export function isFinancial(c) {
  const q = c.quarters?.rows || {};
  return !!(q["Financing Profit"] || q["Gross NPA %"] || c.balance?.rows?.["Deposits"]);
}

/** Map screener rows to the four headline numbers the brief asks for. */
export function headlineSeries(c) {
  const q = c.quarters;
  const fin = isFinancial(c);
  const revenue = pick(q, ["Sales", "Revenue"]);
  const intr = pick(q, ["Interest"]);
  const ebitda = fin
    ? revenue?.map((v, i) => (v != null && intr?.[i] != null ? v - intr[i] : null)) // net interest income
    : pick(q, ["Operating Profit"]);
  return {
    periods: q.periods,
    fin,
    metrics: [
      { key: "revenue", label: fin ? "Revenue (interest earned)" : "Revenue", values: revenue },
      {
        key: "ebitda",
        label: fin ? "Net interest income" : "EBITDA",
        note: fin
          ? "Lenders have no EBITDA. Shown instead: net interest income = interest earned − interest expended."
          : "EBITDA = Revenue − operating expenses (before other income, interest, depreciation, tax).",
        values: ebitda,
      },
      { key: "pbt", label: "PBT", values: pick(q, ["Profit before tax"]) },
      { key: "pat", label: "PAT", values: pick(q, ["Net Profit"]) },
    ],
    pdfs: q.pdfs,
  };
}

/** Latest quarter vs previous (QoQ) and same quarter last year (YoY). */
export function resultsCut(c, periodIdx = null) {
  const h = headlineSeries(c);
  const n = h.periods.length;
  const i = periodIdx ?? n - 1;
  const rows = h.metrics.map((m) => {
    const cur = m.values?.[i], prev = i >= 1 ? m.values?.[i - 1] : null, ya = i >= 4 ? m.values?.[i - 4] : null;
    return { key: m.key, label: m.label, note: m.note, cur, prev, yearAgo: ya, qoq: r1(pct(cur, prev)), yoy: r1(pct(cur, ya)) };
  });
  const rev = rows[0], eb = rows[1];
  const margin = (k) => (rev[k] && eb[k] != null ? r1((eb[k] / rev[k]) * 100) : null);
  return {
    period: h.periods[i],
    prevPeriod: h.periods[i - 1],
    yearAgoPeriod: h.periods[i - 4],
    rows,
    margin: { cur: margin("cur"), prev: margin("prev"), yearAgo: margin("yearAgo") },
    rawPdf: h.pdfs?.[h.periods[i]] || null,
    unit: "₹ crore",
    fin: h.fin,
  };
}

function flag(level, title, detail, evidence, rule) {
  return { level, title, detail, evidence, rule };
}

/** Multi-year trajectory: what is growing, what is compressing. */
export function trajectory(c) {
  const a = c.annual;
  if (!a) return null;
  const periods = a.periods.filter((p) => p !== "TTM");
  const n = periods.length;
  const idx = (k) => Math.max(0, n - 1 - k);
  const series = (names) => pick(a, names)?.slice(0, n);
  const rev = series(["Sales", "Revenue"]), pat = series(["Net Profit"]), opm = series(["OPM %", "Financing Margin %"]);
  const eps = series(["EPS in Rs"]);
  const yrs = Math.min(5, n - 1);
  const out = {
    periods: periods.slice(-6),
    revenue: rev?.slice(-6), pat: pat?.slice(-6), opm: opm?.slice(-6), eps: eps?.slice(-6),
    revCagr: r1(cagr(rev?.[n - 1], rev?.[idx(yrs)], yrs)),
    patCagr: r1(cagr(pat?.[n - 1], pat?.[idx(yrs)], yrs)),
    revCagr3: r1(cagr(rev?.[n - 1], rev?.[idx(3)], 3)),
    patCagr3: r1(cagr(pat?.[n - 1], pat?.[idx(3)], 3)),
    years: yrs,
    flags: [],
  };
  if (out.revCagr != null && out.patCagr != null) {
    const gap = out.patCagr - out.revCagr;
    if (gap > 4) out.flags.push(flag("good", "Profit compounding faster than sales", `PAT ${out.patCagr}% vs revenue ${out.revCagr}% a year over ${yrs}y — operating leverage or mix shift.`, { revCagr: out.revCagr, patCagr: out.patCagr }, "PAT CAGR − revenue CAGR > 4 pts"));
    if (gap < -4) out.flags.push(flag("watch", "Profit lagging sales", `PAT ${out.patCagr}% vs revenue ${out.revCagr}% a year over ${yrs}y — margins being given up.`, { revCagr: out.revCagr, patCagr: out.patCagr }, "revenue CAGR − PAT CAGR > 4 pts"));
  }
  if (opm && opm.length >= 4 && !isFinancial(c)) {
    const o0 = opm[n - 4], o1 = opm[n - 1];
    if (o0 != null && o1 != null && Math.abs(o1 - o0) >= 2)
      out.flags.push(flag(o1 > o0 ? "good" : "watch", `Operating margin ${o1 > o0 ? "expanding" : "compressing"}`, `${o0}% → ${o1}% over 3 years.`, { from: o0, to: o1 }, "|ΔOPM| ≥ 2 pts over 3y"));
  }
  if (out.revCagr3 != null && out.revCagr != null && out.revCagr3 < out.revCagr - 4)
    out.flags.push(flag("watch", "Growth decelerating", `3y revenue CAGR ${out.revCagr3}% vs ${yrs}y ${out.revCagr}%.`, { cagr3: out.revCagr3, cagrN: out.revCagr }, "3y CAGR < long CAGR − 4 pts"));
  return out;
}

/** Leverage, working capital, funding structure. */
export function balanceSheet(c) {
  const b = c.balance, e = c.efficiency;
  if (!b) return null;
  const P = b.periods;
  const eq = pick(b, ["Equity Capital"]), res = pick(b, ["Reserves"]), debt = pick(b, ["Borrowings", "Borrowing"]);
  const nw = P.map((_, i) => (eq?.[i] ?? 0) + (res?.[i] ?? 0));
  const de = P.map((_, i) => (nw[i] ? r1((debt?.[i] ?? 0) / nw[i] * 100) / 100 : null));
  const cwip = pick(b, ["CWIP"]), fa = pick(b, ["Fixed Assets"]), inv = pick(b, ["Investments"]);
  const out = {
    periods: P.slice(-5), netWorth: nw.slice(-5), debt: debt?.slice(-5), de: de.slice(-5),
    cwipPctFA: cwip && fa ? P.map((_, i) => (fa[i] ? r1((cwip[i] / fa[i]) * 100) : null)).slice(-5) : null,
    investments: inv?.slice(-5),
    wc: e ? { periods: e.periods.slice(-5), debtorDays: pick(e, ["Debtor Days"])?.slice(-5), inventoryDays: pick(e, ["Inventory Days"])?.slice(-5), payableDays: pick(e, ["Days Payable"])?.slice(-5), ccc: pick(e, ["Cash Conversion Cycle"])?.slice(-5), wcDays: pick(e, ["Working Capital Days"])?.slice(-5), roce: pick(e, ["ROCE %", "ROE %"])?.slice(-5), roceLabel: e.rows["ROCE %"] ? "ROCE %" : "ROE %" } : null,
    flags: [],
    fin: isFinancial(c),
  };
  const deNow = last(de), deThen = de[Math.max(0, de.length - 4)];
  if (!out.fin && deNow != null) {
    if (deNow > 1) out.flags.push(flag("risk", "Highly levered", `Debt/equity ${deNow.toFixed(2)}×.`, { de: deNow }, "D/E > 1.0"));
    else if (deNow < 0.1) out.flags.push(flag("good", "Practically debt-free", `Debt/equity ${deNow.toFixed(2)}×.`, { de: deNow }, "D/E < 0.1"));
    if (deThen != null && deNow - deThen > 0.3) out.flags.push(flag("watch", "Leverage rising", `D/E ${deThen.toFixed(2)} → ${deNow.toFixed(2)}.`, { from: deThen, to: deNow }, "ΔD/E > 0.3 over 3 periods"));
  }
  const ccc = out.wc?.ccc?.filter((x) => x != null), dd = out.wc?.debtorDays?.filter((x) => x != null);
  const wcs = ccc?.length >= 3 ? ccc : dd;
  if (wcs?.length >= 3) {
    const a = wcs[0], z = wcs[wcs.length - 1];
    if (z - a >= 15) out.flags.push(flag("watch", "Working capital stretching", `${ccc?.length >= 3 ? "Cash conversion cycle" : "Debtor days"} ${a} → ${z} days: more cash tied up per rupee of sales.`, { from: a, to: z }, "+15 days over the window"));
    if (a - z >= 15) out.flags.push(flag("good", "Working capital tightening", `${ccc?.length >= 3 ? "Cash conversion cycle" : "Debtor days"} ${a} → ${z} days.`, { from: a, to: z }, "−15 days over the window"));
  }
  const cw = last(out.cwipPctFA || []);
  if (cw != null && cw > 30) out.flags.push(flag("watch", "Large capex under construction", `CWIP is ${cw}% of fixed assets — capacity coming, returns not yet.`, { cwipPctFA: cw }, "CWIP/fixed assets > 30%"));
  return out;
}

/** Do profits turn into cash? */
export function cashQuality(c) {
  const cf = c.cashflow, a = c.annual;
  if (!cf || !a) return null;
  const P = cf.periods;
  const cfo = pick(cf, ["Cash from Operating Activity"]), fcf = pick(cf, ["Free Cash Flow"]);
  const capex = cfo && fcf ? cfo.map((v, i) => (v != null && fcf[i] != null ? v - fcf[i] : null)) : null;
  const patBy = Object.fromEntries(a.periods.map((p, i) => [p, pick(a, ["Net Profit"])?.[i]]));
  const pat = P.map((p) => patBy[p] ?? null);
  const n = Math.min(5, P.length);
  const sl = (x) => x?.slice(-n);
  const sum = (x) => (x || []).reduce((s, v) => s + (v ?? 0), 0);
  const cfoSum = sum(sl(cfo)), patSum = sum(sl(pat));
  const conv = patSum > 0 ? r1((cfoSum / patSum) * 100) : null;
  const out = {
    periods: sl(P), cfo: sl(cfo), pat: sl(pat), fcf: sl(fcf), capex: sl(capex),
    cfoToPat: conv, cfoSum, patSum, fcfSum: sum(sl(fcf)), years: n,
    flags: [],
    fin: isFinancial(c),
  };
  if (out.fin) {
    out.flags.push(flag("info", "Cash-flow conversion is not meaningful for lenders", "A bank's operating cash flow swings with deposits and loans; judge it on NPAs, margins and capital instead.", {}, "financial company"));
    return out;
  }
  if (conv != null) {
    if (conv >= 90) out.flags.push(flag("good", "Profits are real cash", `${n}y operating cash ₹${fmt(cfoSum)} cr vs PAT ₹${fmt(patSum)} cr → ${conv}% conversion.`, { cfoSum, patSum, conv }, "Σ CFO / Σ PAT ≥ 90%"));
    else if (conv < 70) out.flags.push(flag("risk", "Profits not converting to cash", `${n}y operating cash ₹${fmt(cfoSum)} cr vs PAT ₹${fmt(patSum)} cr → only ${conv}%.`, { cfoSum, patSum, conv }, "Σ CFO / Σ PAT < 70%"));
    else out.flags.push(flag("watch", "Partial cash conversion", `${conv}% of ${n}y PAT showed up as operating cash.`, { conv }, "70% ≤ Σ CFO / Σ PAT < 90%"));
  }
  const negF = (sl(fcf) || []).filter((v) => v != null && v < 0).length;
  if (negF >= 3) out.flags.push(flag("watch", "Free cash flow negative most years", `${negF} of ${n} years FCF < 0 — growth is being funded externally.`, { negF }, "≥ 3 of 5 years FCF < 0"));
  return out;
}

export function shareholdingFlags(c) {
  const s = c.shareholding;
  if (!s) return null;
  const P = s.periods;
  const row = (k) => s.rows[k];
  const delta = (k, back = 4) => { const r = row(k); if (!r) return null; const a = r[Math.max(0, r.length - 1 - back)], z = last(r); return a != null && z != null ? r1(z - a) : null; };
  const out = { periods: P.slice(-5), promoters: row("Promoters")?.slice(-5), fii: row("FIIs")?.slice(-5), dii: row("DIIs")?.slice(-5), public: row("Public")?.slice(-5), flags: [] };
  const dp = delta("Promoters");
  if (dp != null && dp <= -2) out.flags.push(flag("watch", "Promoters selling down", `Promoter holding ${dp} pts over the last 4 quarters.`, { delta: dp }, "Δ promoter ≤ −2 pts / 4Q"));
  if (dp != null && dp >= 1) out.flags.push(flag("good", "Promoters adding", `Promoter holding +${dp} pts over 4 quarters.`, { delta: dp }, "Δ promoter ≥ +1 pt / 4Q"));
  const inst = (delta("FIIs") ?? 0) + (delta("DIIs") ?? 0);
  if (Math.abs(inst) >= 3) out.flags.push(flag(inst > 0 ? "good" : "watch", `Institutions ${inst > 0 ? "accumulating" : "exiting"}`, `FII+DII ${inst > 0 ? "+" : ""}${r1(inst)} pts over 4 quarters.`, { delta: r1(inst) }, "|Δ(FII+DII)| ≥ 3 pts / 4Q"));
  return out;
}

export const fmt = (v) => (v == null ? "–" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : (Math.round(v * 10) / 10).toLocaleString("en-IN"));

/** Fiscal helpers (Indian FY ends March). "Sep 2026" -> {fy: 2027, q: 2} */
const MON = { Mar: 4, Jun: 1, Sep: 2, Dec: 3 };
export function periodToFQ(p) {
  const m = p?.match(/^(Mar|Jun|Sep|Dec) (\d{4})$/);
  if (!m) return null;
  const q = MON[m[1]], y = +m[2];
  return { fy: q === 4 ? y : y + 1, q };
}
export const fqLabel = ({ fy, q }) => `Q${q}FY${String(fy).slice(2)}`;

/** Everything deterministic about a company, in one object. */
export function analyse(c) {
  return {
    results: resultsCut(c),
    trajectory: trajectory(c),
    balance: balanceSheet(c),
    cash: cashQuality(c),
    holders: shareholdingFlags(c),
  };
}
