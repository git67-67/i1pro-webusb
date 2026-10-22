"""Headless-Chromium smoke test of the minimal example and (optionally) a built integrated page, using the built-in demo
instrument. Needs: pip install playwright && playwright install chromium.
Usage: python tests/ui_demo.py [path/to/built-page.html]"""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

async def minimal(b):
    pg = await b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto((ROOT / 'examples/minimal/index.html').as_uri())
    await pg.click('#demo'); await pg.wait_for_function("!document.getElementById('dark').disabled", timeout=30000)
    await pg.click('#dark'); await pg.wait_for_function("!document.getElementById('measure').disabled", timeout=60000)
    await pg.click('#measure'); await pg.wait_for_function("document.getElementById('status').textContent.startsWith('Done')", timeout=60000)
    assert not errs, errs
    print('minimal example: OK ->', await pg.inner_text('#status'))

async def integrated(b, page):
    pg = await b.new_page(viewport={'width': 1300, 'height': 1000}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(pathlib.Path(page).resolve().as_uri()); await pg.click('#t-meas')
    assert await pg.evaluate("document.getElementById('ms-adv').hidden"), 'advanced settings must be hidden by default'
    await pg.click('#i1p-demo'); await pg.wait_for_selector('#i1p-ctl:not([hidden])')
    await pg.click('#i1p-dark'); await pg.wait_for_function("!document.getElementById('i1p-meas').disabled", timeout=60000)
    for i in range(2):
        await pg.click('#i1p-meas'); await pg.wait_for_function("document.querySelectorAll('#ms-table tbody tr').length>=%d" % (i + 1), timeout=60000)
    assert 'FACTORY' in (await pg.inner_text('#i1p-rchip')).upper()
    await pg.click('#ms-adv-open'); await pg.evaluate("document.getElementById('i1p-d-src').open=true")
    await pg.fill('#i1p-rT', '2856'); await pg.click('#i1p-rcal'); await pg.wait_for_function("document.getElementById('i1p-rchip').textContent.startsWith('ON')", timeout=60000)
    await pg.click('#ms-adv-back')
    await pg.reload(); await pg.click('#t-meas')
    assert await pg.evaluate("document.querySelectorAll('#ms-table tbody tr').length") == 2, 'measurements persist across reload'
    assert not errs, errs
    print('integrated page: OK')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await minimal(b)
        if len(sys.argv) > 1: await integrated(b, sys.argv[1])
        await b.close()
asyncio.run(main())
