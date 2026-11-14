// Vercel entry point: same handler as the Netlify function (Web Request -> Response).
import handler from "../netlify/functions/brief.mjs";
export const config = { maxDuration: 60 };
export function GET(request) { return handler(request); }
