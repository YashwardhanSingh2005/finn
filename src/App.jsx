import { useEffect, useState } from "react";
import Today from "./Today.jsx";
import Research from "./Research.jsx";
import Rules from "./Rules.jsx";
import About from "./About.jsx";
import { Icon } from "./ui.jsx";
import { usePersist, useSnapshot } from "./lib.js";
import { PORTFOLIO } from "../netlify/lib/portfolio.js";

const DEFAULT_RULES = { movePct: 5, volX: 2, sigma: 2.5 };

export default function App() {
  const url = new URL(location.href);
  const [tab, setTab] = useState(url.searchParams.get("c") ? "research" : url.searchParams.get("tab") || "today");
  const [symbol, setSymbol] = useState(url.searchParams.get("c"));
  const [prefs, setPrefs] = usePersist("prefs", { muted: {}, boost: {} });
  const [rules, setRules] = usePersist("rules", DEFAULT_RULES);
  const [holdings, setHoldings] = usePersist("holdings", null);
  const [theme, setTheme] = usePersist("theme", "system");
  const [toastMsg, setToast] = useState(null);
  const [about, setAbout] = useState(false);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toastMsg]);
  useEffect(() => {
    const u = new URL(location.href);
    u.search = "";
    if (tab === "research" && symbol) u.searchParams.set("c", symbol);
    else if (tab !== "today") u.searchParams.set("tab", tab);
    history.replaceState(null, "", u);
  }, [tab, symbol]);

  const [startTab, setStartTab] = useState(null);
  const openCompany = (s, sub) => { setSymbol(s); setStartTab(sub || null); setTab("research"); window.scrollTo(0, 0); };
  const h = holdings || PORTFOLIO;
  const snapshot = useSnapshot();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">FIN<b>N</b></div>
        <div className="sub">{tab === "today" ? "what changed, ranked" : tab === "research" ? "research with receipts" : "your rules"}</div>
        <span className="spacer" />
        <button className="iconbtn" aria-label="How FINN works" onClick={() => setAbout(true)} style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600 }}>i</button>
        <button className="iconbtn" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon.moon /></button>
      </header>
      {snapshot.used > 0 && (
        <div className="snapbar" role="status">
          Saved snapshot from {new Date(snapshot.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST. {snapshot.noBackend ? "This copy has no live backend" : "The live source didn’t answer"}, so some views are a recording: rule changes don’t re-rank it and new tickers can’t be read.
        </div>
      )}
      <main>
        {tab === "today" && <Today prefs={prefs} setPrefs={setPrefs} rules={rules} holdings={h} customHoldings={!!holdings} openCompany={openCompany} toast={setToast} />}
        {tab === "research" && <Research symbol={symbol} setSymbol={setSymbol} startTab={startTab} holdings={h} />}
        {tab === "rules" && <Rules prefs={prefs} setPrefs={setPrefs} rules={rules} setRules={setRules} holdings={h} setHoldings={setHoldings} resetHoldings={() => setHoldings(null)} theme={theme} setTheme={setTheme} />}
      </main>
      <nav className="tabs" aria-label="Main">
        <div className="tabs-inner">
          {[["today", "Today", Icon.today], ["research", "Research", Icon.research], ["rules", "Rules", Icon.rules]].map(([k, label, I]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => { if (k === "research" && tab === "research") setSymbol(null); setTab(k); window.scrollTo(0, 0); }} aria-current={tab === k}>
              <I /> {label}
            </button>
          ))}
        </div>
      </nav>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      <About open={about} onClose={() => setAbout(false)} />
    </div>
  );
}
