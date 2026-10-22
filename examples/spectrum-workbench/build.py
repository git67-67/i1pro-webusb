#!/usr/bin/env python3
"""Insert the i1 Pro "Measure" tab into the single-file "Spectrum Workbench" page.

Usage: python build.py ORIGINAL_PAGE.html OUTPUT.html

Adds a "Measure" tab button after "Colour map", the Measure view before the Illuminant-compare view, patches showTab() so the
tab refreshes when shown, and appends the demo EEPROM, plot module, driver, simulator and UI script as inline <script> blocks
(the result is still one self-contained file). The UI relies on the host page's functions (ledMake, ledPut, cleanLED,
ledChanged, ledSaveSoon, ldSelect, setKind, addFilter, usSaveSoon, recompute, showTab, CMF_TAB, st, TABS, kvOpen, kvPut).
See docs/INTEGRATION.md.
"""
import pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent

def once(src, marker, label):
    assert src.count(marker) == 1, '%s: marker not found exactly once - is this the expected page version?' % label
    return marker

def main(src_path, out_path):
    src = pathlib.Path(src_path).read_text(encoding='utf-8')
    view = (HERE / 'measure-view.html').read_text(encoding='utf-8')
    read = lambda p: (ROOT / p).read_text(encoding='utf-8')
    plot, core, ui = read('src/i1pro-plot.js'), read('src/i1pro-core.js'), read('src/i1pro-ui.js')
    sim = read('src/i1pro-sim.js').replace("require('./i1pro-core.js')", 'null')
    eeprom = read('data/demo-eeprom.b64').strip()
    for name, text in (('plot', plot), ('core', core), ('sim', sim), ('ui', ui), ('view', view)):
        assert '</script' not in text.replace('</script>', '', text.count('</script>') if name == 'view' else 0), name + ' contains </script'

    out = src
    m = '  <button role="tab" id="t-map" aria-selected="true">Colour map</button>\n'
    once(out, m, 'tab button')
    out = out.replace(m, m + '  <button role="tab" id="t-meas" aria-selected="false">Measure</button>\n')
    m = '<div id="view-cmp" hidden>'
    once(out, m, 'view-cmp')
    out = out.replace(m, view + '\n' + m)
    m = "  else if(which==='leds')ledsShow();"
    once(out, m, 'showTab')
    out = out.replace(m, "  else if(which==='meas'){if(window.I1P_onShow)window.I1P_onShow();}\n" + m)
    tail = '</body></html>'
    assert out.rstrip().endswith(tail), 'page does not end with </body></html>'
    i = out.rstrip().rfind(tail)
    blocks = ['window.I1P_DEMO_EEPROM="%s"' % eeprom, plot, core, sim, ui]
    scripts = ''.join('<script>\n%s\n</script>\n' % b for b in blocks)
    out = out[:i] + scripts + tail + '\n'
    assert out.count('<script') == src.count('<script') + 5 + view.count('<script')
    pathlib.Path(out_path).write_text(out, encoding='utf-8')
    print('wrote', out_path, len(out), 'bytes')

if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
