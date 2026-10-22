#!/usr/bin/env python3
"""Build the single-file i1 Pro console: python build.py [OUTPUT.html]  (default: ../../standalone.html)
Inlines src/i1pro-plot.js, i1pro-core.js, i1pro-sim.js and the demo EEPROM into template.html."""
import pathlib, sys
HERE = pathlib.Path(__file__).resolve().parent; ROOT = HERE.parent.parent
def main(out_path):
    t = (HERE / 'template.html').read_text(encoding='utf-8'); assert t.count('<!--SCRIPTS-->') == 1
    read = lambda p: (ROOT / p).read_text(encoding='utf-8')
    parts = ['window.I1P_DEMO_EEPROM="%s"' % read('data/demo-eeprom.b64').strip(), read('src/i1pro-plot.js'), read('src/i1pro-core.js'), read('src/i1pro-sim.js').replace("require('./i1pro-core.js')", 'null')]
    for p in parts: assert '</script' not in p
    out = t.replace('<!--SCRIPTS-->', ''.join('<script>\n%s\n</script>\n' % p for p in parts))
    pathlib.Path(out_path).write_text(out, encoding='utf-8')
    print('wrote', out_path, len(out), 'bytes')
if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / 'standalone.html'))
