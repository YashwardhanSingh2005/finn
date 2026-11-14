for (const f of ["company","ledger","brief","digest","filing","search","backtest"]) { const m = await import(`../api/${f}.js`); console.log(f, typeof m.GET, m.config); }
const { GET } = await import("../api/company.js");
const r = await GET(new Request("http://x/api/company?symbol=KAYNES")); const j = await r.json(); console.log(r.status, j.name, j.analysis.results.period);
