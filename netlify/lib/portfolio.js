// Demo portfolio: 18 NSE names chosen to span sectors, sizes and statement shapes (banks, NBFC,
// IT, FMCG, capital goods, auto, pharma, metals, internet, EMS, power equipment, market infra).
// Weights are illustrative. Users can edit this in the app; the engine is ticker-agnostic.
export const PORTFOLIO = [
  { symbol: "RELIANCE", bse: "500325", weight: 9, sector: "Energy & telecom", size: "Large" },
  { symbol: "HDFCBANK", bse: "500180", weight: 9, sector: "Private bank", size: "Large" },
  { symbol: "TCS", bse: "532540", weight: 7, sector: "IT services", size: "Large" },
  { symbol: "BHARTIARTL", bse: "532454", weight: 7, sector: "Telecom", size: "Large" },
  { symbol: "LT", bse: "500510", weight: 6, sector: "Engineering & construction", size: "Large" },
  { symbol: "ITC", bse: "500875", weight: 5, sector: "FMCG & hotels", size: "Large" },
  { symbol: "BAJFINANCE", bse: "500034", weight: 6, sector: "NBFC", size: "Large" },
  { symbol: "SUNPHARMA", bse: "524715", weight: 5, sector: "Pharma", size: "Large" },
  { symbol: "MARUTI", bse: "532500", weight: 5, sector: "Autos", size: "Large" },
  { symbol: "TATASTEEL", bse: "500470", weight: 4, sector: "Metals", size: "Large" },
  { symbol: "ETERNAL", bse: "543320", weight: 5, sector: "Internet (food & quick commerce)", size: "Large" },
  { symbol: "TRENT", bse: "500251", weight: 4, sector: "Retail", size: "Large" },
  { symbol: "DIXON", bse: "540699", weight: 5, sector: "Electronics manufacturing", size: "Mid" },
  { symbol: "POLYCAB", bse: "542652", weight: 4, sector: "Cables & wires", size: "Mid" },
  { symbol: "SUZLON", bse: "532667", weight: 4, sector: "Wind turbines", size: "Mid" },
  { symbol: "CDSL", bse: "", weight: 3, sector: "Market infrastructure", size: "Mid" },
  { symbol: "KPITTECH", bse: "542651", weight: 3, sector: "Auto software", size: "Mid" },
  { symbol: "KAYNES", bse: "543664", weight: 3, sector: "Electronics manufacturing", size: "Small" },
];

// Companies outside the portfolio used to demo on-demand research (the engine works on any ticker).
export const RESEARCH_DEMO = ["ASIANPAINT", "HAL", "JUBLFOOD", "PIDILITIND"];
