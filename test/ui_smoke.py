# UI smoke test: open every screen and sub-tab on a phone-sized headless browser; fail on any JS error.
# usage: python test/ui_smoke.py http://127.0.0.1:8787
import sys, asyncio
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.firefox.launch(firefox_user_prefs={"network.proxy.type": 0})
        for scheme in ("light", "dark"):
            pg = await b.new_page(viewport={"width": 390, "height": 844}, color_scheme=scheme)
            pg.on("pageerror", lambda e, s=scheme: errors.append(f"[{s}] {e}"))
            async def visit(url, clicks=(), wait=4000):
                await pg.goto(BASE + url, timeout=60000)
                await pg.wait_for_timeout(wait)
                for c in clicks:
                    await pg.get_by_role("tab", name=c).first.click() if c in ("Snapshot","Promises","Candour","Balance & cash","Bull vs bear") else await pg.get_by_text(c).first.click()
                    await pg.wait_for_timeout(2500)
                print(f"ok [{scheme}] {url} {list(clicks)}")
            await visit("/")
            await visit("/?tab=rules")
            await visit("/?tab=research", ["Which managements dodge"], 2000)
            await visit("/?c=POLYCAB", ["Promises", "Candour", "Balance & cash", "Bull vs bear", "Snapshot"], 6000)
            await visit("/?c=KAYNES", ["Candour"], 6000)
            await visit("/?c=NOSUCHTICKERXYZ", [], 6000)
            await pg.get_by_label("How FINN works").click(); await pg.wait_for_timeout(800)
            await pg.close()
        await b.close()
    if errors:
        print("JS ERRORS:\n" + "\n".join(errors)); sys.exit(1)
    print("UI smoke: no JS errors")
asyncio.run(main())
