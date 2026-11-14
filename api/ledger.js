// Vercel entry point: same handler as the Netlify function (Web Request -> Response).
import handler from "../netlify/functions/ledger.mjs";
export const config = { maxDuration: 60 };
export function GET(request) { return handler(request); }
