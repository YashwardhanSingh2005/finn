// Exchange announcement feeds (NSE primary, BSE secondary/dedupe). Both exchanges' public JSON
// endpoints only answer browser-like clients, so we send a standard browser user-agent — the same
// approach every open-source NSE/BSE library (nsepython, jugaad-data, bse) uses. Read-only, low rate.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let nseCookie = null, nseCookieAt = 0;
async function nseCookies() {
  if (nseCookie && Date.now() - nseCookieAt < 5 * 60e3) return nseCookie;
  const r = await fetch("https://www.nseindia.com/", { headers: { "user-agent": BROWSER_UA, accept: "text/html", "accept-language": "en-IN,en" } });
  const set = r.headers.getSetCookie?.() || [];
  nseCookie = set.map((c) => c.split(";")[0]).join("; ");
  nseCookieAt = Date.now();
  return nseCookie;
}

const dmy = (d) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

/** NSE corporate announcements for one symbol between two dates. */
export async function nseAnnouncements(symbol, from, to) {
  const url = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(symbol)}&from_date=${dmy(from)}&to_date=${dmy(to)}`;
  const go = async () => fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "application/json", "accept-language": "en-IN,en", referer: "https://www.nseindia.com/companies-listing/corporate-filings-announcements", cookie: await nseCookies() } });
  let r = await go();
  if (r.status === 401 || r.status === 403) { nseCookie = null; r = await go(); }
  if (!r.ok) throw new Error(`nse ${r.status}`);
  const j = await r.json();
  return (Array.isArray(j) ? j : j.data || []).map((x) => ({
    source: "NSE",
    id: `nse:${x.seq_id}`,
    symbol,
    time: parseNseTime(x.an_dt || x.exchdisstime),
    subject: x.desc || "",
    summary: (x.attchmntText || "").replace(/\s+/g, " ").trim(),
    url: x.attchmntFile || null,
    xbrl: !!x.hasXbrl,
  }));
}

function parseNseTime(s) {
  // "09-Nov-2026 17:12:15" (IST)
  const m = s?.match(/(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const mon = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[2]) / 3;
  return new Date(Date.UTC(+m[3], mon, +m[1], +m[4] - 5, +m[5] - 30, +m[6])).toISOString();
}

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/** BSE corporate announcements for one scrip code between two dates. */
export async function bseAnnouncements(scripCode, symbol, from, to) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=${page}&strCat=-1&strPrevDate=${ymd(from)}&strScrip=${scripCode}&strSearch=P&strToDate=${ymd(to)}&strType=C&subcategory=-1`;
    const r = await fetch(url, { headers: { "user-agent": BROWSER_UA, accept: "application/json", referer: "https://www.bseindia.com/", origin: "https://www.bseindia.com" } });
    if (!r.ok) throw new Error(`bse ${r.status}`);
    const j = await r.json();
    const rows = j.Table || [];
    for (const x of rows)
      out.push({
        source: "BSE",
        id: `bse:${x.NEWSID}`,
        symbol,
        time: x.DT_TM ? new Date(x.DT_TM + "+05:30").toISOString() : null,
        subject: [x.CATEGORYNAME, x.SUBCATNAME, x.NEWSSUB].filter(Boolean).join(" - "),
        summary: (x.HEADLINE || "").replace(/\s+/g, " ").trim(),
        url: x.ATTACHMENTNAME ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${x.ATTACHMENTNAME}` : null,
        bseCategory: x.CATEGORYNAME,
      });
    if (rows.length < 50) break;
  }
  return out;
}

/** Same filing is usually posted on both exchanges within minutes: keep one, remember both links. */
export function dedupe(items) {
  const key = (x) => `${x.symbol}|${(x.time || "").slice(0, 13)}|${(x.summary || x.subject).toLowerCase().replace(/[^a-z]/g, "").slice(0, 40)}`;
  const seen = new Map();
  for (const x of items.sort((a, b) => (a.source === "NSE" ? -1 : 1))) {
    const k = key(x);
    if (seen.has(k)) seen.get(k).alsoOn = { source: x.source, url: x.url };
    else seen.set(k, x);
  }
  return [...seen.values()].sort((a, b) => (b.time || "").localeCompare(a.time || ""));
}
