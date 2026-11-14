// PDF -> per-page text. Pages are kept separate so every extracted claim can cite "p. N".
import { extractText, getDocumentProxy } from "unpdf";
import { cache } from "./cache.js";

const UA = "FINN-prototype/0.1 (+https://github.com/YashwardhanSingh2005/finn)";

/** Cached by URL: exchange PDFs are immutable, so each is downloaded and parsed once. */
export async function fetchPdfPages(url, opts = {}) {
  const key = `pdf:v1:${url}`;
  const hit = await cache.get(key);
  if (hit) return { ...hit, pages: hit.pages.slice(0, opts.maxPages || 60) };
  const doc = await fetchPdfPagesRaw(url, { maxPages: 60 });
  await cache.set(key, doc);
  return { ...doc, pages: doc.pages.slice(0, opts.maxPages || 60) };
}

async function fetchPdfPagesRaw(url, { maxPages = 60 } = {}) {
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    r = await fetch(url, { headers: { "user-agent": UA, accept: "application/pdf,*/*", "accept-language": "en-IN,en" }, redirect: "follow" });
    if (r.ok || ![406, 429, 500, 502, 503].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1))); // exchange servers throttle bursts
  }
  if (!r.ok) throw new Error(`pdf ${r.status} ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.slice(0, maxPages).map((t) => t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim());
  return { url, nPages: pdf.numPages, pages };
}

/** Join pages with explicit page markers the LLM is told to cite. */
export const withPageMarkers = (pages) => pages.map((t, i) => `[[p.${i + 1}]]\n${t}`).join("\n\n");

/** Normalise for quote verification: lowercase, collapse whitespace/punctuation. */
export const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9%.]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Verify an LLM-supplied quote really occurs in the source (anti-hallucination gate).
 * Returns {ok, page, score}. Uses token-window overlap so minor transcription differences pass,
 * but paraphrases and inventions fail.
 */
export function verifyQuote(quote, pages) {
  const q = norm(quote).split(" ").filter(Boolean);
  if (q.length < 4) return { ok: false, page: null, score: 0 };
  let best = { ok: false, page: null, score: 0 };
  pages.forEach((p, i) => {
    const t = " " + norm(p) + " ";
    // exact substring first
    if (t.includes(" " + q.join(" ") + " ")) { best = { ok: true, page: i + 1, score: 1 }; return; }
    // otherwise share of 4-gram shingles found on the page
    const sh = [];
    for (let k = 0; k + 4 <= q.length; k++) sh.push(q.slice(k, k + 4).join(" "));
    const hit = sh.filter((s) => t.includes(" " + s + " ")).length / Math.max(1, sh.length);
    if (hit > best.score) best = { ok: hit >= 0.6, page: i + 1, score: +hit.toFixed(2) };
  });
  return best;
}
