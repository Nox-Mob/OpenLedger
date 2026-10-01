"""Release smoke test: signs in as the demo user and visits every page.
Reports page crashes, console errors and failed requests. Read-only (never saves anything).
Usage: python3 scripts/smoke/smoke.py [base_url]   (default http://localhost:8080)
Requires the demo seed (supabase/seed/demo.sql) on a dev/test backend.
"""
import asyncio, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
PAGES = ["/", "/accounts", "/transactions", "/transactions/new", "/import", "/reconcile",
         "/reports", "/projects", "/funds", "/settings", "/settings/accounts", "/settings/members",
         "/settings/preferences", "/settings/close", "/terms", "/privacy", "/not-advice", "/no-such-page"]
IGNORE = ("favicon", "AbortError", "aborted", "net::ERR_ABORTED")

async def main():
    problems = []
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        page = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
        page.on("pageerror", lambda e: problems.append(f"{page.url} crash: {e}"))
        page.on("console", lambda m: m.type == "error" and not any(i in m.text for i in IGNORE)
                and problems.append(f"{page.url} console: {m.text[:200]}"))
        page.on("response", lambda r: r.status >= 500 and problems.append(f"{page.url} HTTP {r.status} {r.url[:120]}"))
        await page.goto(f"{BASE}/auth", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.locator("input[type=email]").fill("demo@demo.org")
        await page.locator("input[type=password]").fill("demo1234")
        await page.get_by_role("button", name="Sign in").click()
        for _ in range(40):
            if "/auth" not in page.url: break
            await page.wait_for_timeout(500)
        else: raise SystemExit("Sign-in failed: " + (await page.inner_text("body"))[:300])
        await page.wait_for_timeout(2000)
        for btn in ("I understand", "Continue", "Accept"):
            loc = page.get_by_role("button", name=btn)
            if await loc.count(): await loc.first.click()
        for path in PAGES:
            await page.goto(BASE + path, wait_until="networkidle")
            body = (await page.inner_text("body")).strip()
            if len(body) < 20: problems.append(f"{path}: blank page")
            if "This page didn't load" in body: problems.append(f"{path}: error screen shown")
            print("ok  " if len(body) >= 20 else "BLANK", path)
        await b.close()
    print("\n".join(problems) or "No problems found.")
    sys.exit(1 if problems else 0)

asyncio.run(main())
