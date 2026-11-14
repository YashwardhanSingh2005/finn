// screener.in adapter: one HTTP fetch gives the standardised financial tables, the document index
// (annual reports, concall transcripts, raw results PDFs) and the five most recent exchange filings.
// Everything downstream (snapshot, trajectory, cash quality, promise ledger) is computed from this
// in plain code — the LLM never invents a number.
import { parse } from "node-html-parser";

const BASE = "https://www.screener.in";
const UA = "FINN-prototype/0.1 (+https://github.com/YashwardhanSingh2005/finn)";

const num = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[,%₹\s]/g, "").replace(/\+$/, "");
  if (t === "" || t === "-") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const clean = (s) => (s || "").replace(/[\s\u00a0]+/g, " ").trim().replace(/\s*\+$/, "").trim();

async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json" } });
  if (!r.ok) throw Object.assign(new Error(`screener ${r.status} for ${url}`), { status: r.status });
  return r;
}

function parseTable(root, id) {
  const sec = root.querySelector(`section#${id}`);
  const table = sec?.querySelector("table.data-table");
  if (!table) return null;
  const head = table.querySelectorAll("thead th").map((th) => clean(th.text));
  const periods = head.slice(1);
  const rows = {};
  const pdfs = {};
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = tr.querySelectorAll("td");
    if (!cells.length) continue;
    const label = clean(cells[0].text);
    if (/raw pdf/i.test(label)) {
      cells.slice(1).forEach((td, i) => {
        const a = td.querySelector("a");
        if (a) pdfs[periods[i]] = abs(a.getAttribute("href"));
      });
      continue;
    }
    rows[label] = cells.slice(1).map((td) => num(td.text));
  }
  return { periods, rows, pdfs };
}

const abs = (h) => (h && h.startsWith("/") ? BASE + h : h);

function parseDocs(root) {
  const docs = { annualReports: [], concalls: [], announcements: [], ratings: [] };
  const sec = root.querySelector("section#documents");
  if (!sec) return docs;
  for (const li of sec.querySelectorAll(".annual-reports li")) {
    const a = li.querySelector("a");
    if (!a) continue;
    const m = clean(a.text).match(/(\d{4})/);
    docs.annualReports.push({ year: m ? +m[1] : null, url: abs(a.getAttribute("href")), label: clean(a.text) });
  }
  for (const li of sec.querySelectorAll(".concalls li")) {
    const period = clean(li.querySelector(".nowrap, div")?.text || "").slice(0, 8);
    const item = { period, transcript: null, ppt: null, rec: null };
    for (const a of li.querySelectorAll("a")) {
      const t = clean(a.text).toLowerCase();
      const href = abs(a.getAttribute("href"));
      if (t.startsWith("transcript")) item.transcript = href;
      else if (t === "ppt") item.ppt = href;
      else if (t === "rec") item.rec = href;
    }
    docs.concalls.push(item);
  }
  for (const li of sec.querySelectorAll("#company-announcements-tab li")) {
    const a = li.querySelector("a");
    if (!a) continue;
    const dateTxt = clean(li.querySelector(".ink-600, .smaller")?.text || "");
    docs.announcements.push(parseAnnouncementLi(a, dateTxt));
  }
  return docs;
}

function parseAnnouncementLi(a, dateTxt) {
  // the anchor text is "<Subject> <date> - <one-line exchange summary>"
  const full = clean(a.text);
  const m = full.match(/^(.*?)\s+(\d{1,2} [A-Z][a-z]{2}(?: \d{4})?)\s*-\s*(.*)$/);
  return {
    subject: m ? m[1] : full,
    dateText: m ? m[2] : dateTxt,
    summary: m ? m[3] : "",
    url: abs(a.getAttribute("href")),
  };
}

function parseTopRatios(root) {
  const out = {};
  for (const li of root.querySelectorAll("#top-ratios li")) {
    const k = clean(li.querySelector(".name")?.text);
    const v = clean(li.querySelector(".value")?.text);
    if (k) out[k] = { text: v, value: num(v.replace(/Cr\.?|\/.*$/g, "")) };
  }
  return out;
}

function parseShareholding(root) {
  const sec = root.querySelector("section#shareholding");
  const table = sec?.querySelector("table.data-table");
  if (!table) return null;
  const periods = table.querySelectorAll("thead th").map((th) => clean(th.text)).slice(1);
  const rows = {};
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = tr.querySelectorAll("td");
    if (cells.length) rows[clean(cells[0].text)] = cells.slice(1).map((td) => num(td.text));
  }
  return { periods, rows };
}

/** Fetch and parse a company. Tries consolidated first (group view), falls back to standalone. */
export async function fetchCompany(symbol) {
  const sym = symbol.replace(/^__retry:/, "").toUpperCase().replace(/\.(NS|BO)$/, "");
  let html = null, url, root;
  for (const path of [`/company/${encodeURIComponent(sym)}/consolidated/`, `/company/${encodeURIComponent(sym)}/`]) {
    try {
      url = BASE + path;
      const h = await (await get(url)).text();
      const r = parse(h);
      const q = parseTable(r, "quarters");
      const firstRow = q && Object.values(q.rows)[0];
      html = h; root = r;
      // companies without subsidiaries have an empty consolidated view -> use standalone
      if (firstRow && firstRow.some((v) => v != null)) break;
    } catch (e) {
      if (e.status === 404) continue;
      throw e;
    }
  }
  if (!html) {
    // renamed / demerged tickers: resolve through screener search and retry once
    const hits = await searchCompany(sym).catch(() => []);
    const alt = hits.find((h) => h.symbol && h.symbol.toUpperCase() !== sym);
    if (alt && !symbol.startsWith("__retry:")) {
      const c = await fetchCompany("__retry:" + alt.symbol);
      return { ...c, resolvedFrom: sym };
    }
    throw Object.assign(new Error(`Unknown ticker ${sym}`), { status: 404, suggestions: hits });
  }
  const companyId = root.querySelector("[data-company-id]")?.getAttribute("data-company-id");
  const name = clean(root.querySelector("h1")?.text);
  const about = clean(root.querySelector(".company-profile .about p, .company-profile .about")?.text);
  const keyPoints = clean(root.querySelector(".company-profile .commentary")?.text);
  const bseLink = root.querySelectorAll("a").map((a) => a.getAttribute("href") || "").find((h) => /bseindia\.com\/stock-share-price\/.+\/(\d{6})\/?$/.test(h));
  const bseCode = bseLink?.match(/\/(\d{6})\/?$/)?.[1] || null;
  const pros = root.querySelectorAll(".pros li").map((li) => clean(li.text));
  const cons = root.querySelectorAll(".cons li").map((li) => clean(li.text));
  return {
    symbol: sym,
    name,
    url,
    consolidated: url.includes("/consolidated/"),
    companyId,
    bseCode,
    about,
    keyPoints,
    ratios: parseTopRatios(root),
    quarters: parseTable(root, "quarters"),
    annual: parseTable(root, "profit-loss"),
    balance: parseTable(root, "balance-sheet"),
    cashflow: parseTable(root, "cash-flow"),
    efficiency: parseTable(root, "ratios"),
    shareholding: parseShareholding(root),
    docs: parseDocs(root),
    screenerPros: pros, // screener's own machine-generated pros/cons: NOT used in analysis (secondary)
    screenerCons: cons,
    fetchedAt: new Date().toISOString(),
  };
}

/** End-of-day price & volume series from screener's chart API (same data as NSE bhavcopy). */
export async function fetchPrices(companyId, days = 400) {
  // NB: screener returns DAILY points up to ~400 days (verified: 400d → 270 daily points); 450d+ comes back weekly-sampled.
  days = Math.min(days, 400);
  const r = await get(`${BASE}/api/company/${companyId}/chart/?q=Price-Volume&days=${days}&consolidated=true`);
  const j = await r.json();
  const price = j.datasets.find((d) => d.metric === "Price")?.values || [];
  const vol = new Map((j.datasets.find((d) => d.metric === "Volume")?.values || []).map(([d, v]) => [d, Number(v)]));
  return price.map(([d, p]) => ({ date: d, close: Number(p), volume: vol.get(d) ?? null }));
}

/** Recent filings (screener mirrors the exchange feed; 5 most recent with the exchange one-liner). */
export async function fetchRecentAnnouncements(companyId) {
  const r = await get(`${BASE}/announcements/recent/${companyId}/`);
  const root = parse(await r.text());
  return root.querySelectorAll("li").map((li) => li.querySelector("a")).filter(Boolean).map((a) => parseAnnouncementLi(a, ""));
}

export async function searchCompany(q) {
  const r = await get(`${BASE}/api/company/search/?q=${encodeURIComponent(q)}&v=3&fts=1`);
  const j = await r.json();
  return j.slice(0, 8).map((x) => ({ name: x.name, url: x.url, symbol: (x.url.match(/\/company\/([^/]+)\//) || [])[1] }));
}
