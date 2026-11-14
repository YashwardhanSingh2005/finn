import { fetchCompany, fetchPrices, searchCompany } from "../netlify/lib/screener.js";
const c = await fetchCompany(process.argv[2] || "TCS");
console.log(c.name, c.consolidated, Object.keys(c.quarters.rows).join("|"));
console.log("bal", Object.keys(c.balance.rows).join("|"), "\ncf", Object.keys(c.cashflow.rows).join("|"), "\neff", Object.keys(c.efficiency.rows).join("|"));
console.log("concalls", JSON.stringify(c.docs.concalls.slice(0,3)), c.docs.concalls.length, "ARs", JSON.stringify(c.docs.annualReports.slice(0,2)));
console.log("ann", JSON.stringify(c.docs.announcements.slice(0,2)));
console.log("sh", c.shareholding?.periods.slice(-2), Object.keys(c.shareholding?.rows||{}).join("|"));
const p = await fetchPrices(c.companyId, 60); console.log(JSON.stringify(p.slice(-2)), p.length);
console.log(JSON.stringify(await searchCompany("hdfc")).slice(0,300));
