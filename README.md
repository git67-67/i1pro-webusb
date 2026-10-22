# i1pro-webusb

A WebUSB driver for the X-Rite / Gretag-Macbeth **i1 Pro** (Rev A–D) spectrometer. It runs in Chrome or Edge, so a web
page can connect to the instrument, measure a light or a colour sample, and show the spectrum with colour metrics —
no command-line tools, no local server, no intermediate files.

The measurement logic is a port of the i1 Pro driver in [ArgyllCMS](https://www.argyllcms.com/) (`spectro/i1pro_imp.c`).
On top of that it adds things `spotread` does not offer:

| | |
|---|---|
| **Raw access** | all 128 sensor pixels per frame, every frame, the linearised and dark-subtracted counts, the exposure used |
| **Any output grid** | 1 nm (or any step) spectra instead of the fixed 36 × 10 nm bands, with a choice of kernel (factory sinc, windowed sinc, triangle, Gaussian) |
| **Exposure control** | auto (with a visible, adjustable target) or a manual integration time |
| **Live mode** | continuous measurement with rolling or cumulative averaging and time plots of brightness, CCT, Duv, CRI, TM-30 … |
| **Reflective mode** | white-tile calibration and pigment / sample measurement (reflectance) |
| **Source calibration** | correct the response against a known blackbody or tungsten lamp, or your own reference spectrum |
| **EEPROM** | back up the factory calibration, or import another (`.bin`, hex dump, or a `spotread -D9` log) |
| **Readouts** | brightness, radiant power, photon flux, chromaticity, peak wavelengths; hover, zoom and pan on the charts |
| **Simulator** | a software i1 Pro for demos and tests, no hardware needed |

> **Status: early.** The maths is tested against a simulator that speaks the instrument's USB protocol, and the 36-band
> output was compared with a real `spotread -D9` log during development (not automated, see Tests). The first version of the driver was reported to work with a real
> Rev D by its author. Everything added after that (live mode, reflective mode, source calibration, exposure modes) has
> **not yet been verified on real hardware**. See [docs/HARDWARE-TESTING.md](docs/HARDWARE-TESTING.md) for what to check,
> and please report what you find.

This project is not affiliated with X-Rite or the ArgyllCMS project.

## Try it

**Live page:** once GitHub Pages is on (Settings → Pages → deploy from branch `main`, folder `/ (root)`), the full app is at
`https://<you>.github.io/i1pro-webusb/` — that is `index.html`, a single self-contained file. GitHub Pages is https, which
WebUSB requires, so visitors with Chrome or Edge can connect their own i1 Pro there; everyone else can use the demo button.
Nothing is uploaded anywhere: the page talks to the instrument locally in the browser.


No hardware needed:

```sh
git clone https://github.com/<you>/i1pro-webusb && cd i1pro-webusb
# open examples/minimal/index.html in Chrome or Edge (file:// works), click "Demo"
```

With an instrument (Chrome/Edge on Linux, macOS or Windows; Firefox and Safari have no WebUSB):

1. **Linux only:** install the udev rule so the browser may open the device, then re-plug it:
   ```sh
   sudo cp udev/55-i1pro.rules /etc/udev/rules.d/ && sudo udevadm control --reload && sudo udevadm trigger
   ```
2. Close ArgyllCMS / `spotread`. Only one program can own the instrument.
3. Plug the i1 Pro **directly into a USB port** (it needs full bus power; an unpowered hub fails with a "high power" error).
4. Open the page over `https://` or as a local file, press *Connect*, choose the instrument, then:
   1. cover the sensor → **dark calibration** (about 5 s),
   2. point at the light → **measure**.

Windows additionally needs the WinUSB driver bound to the device (for example with [Zadig](https://zadig.akeo.ie/));
ArgyllCMS's own driver does not work with WebUSB. On macOS no driver step is expected, but that is untested here.

## Standalone console (`standalone.html`)

If you only want the driver and the instrument tools, without the colour-map app: `standalone.html` is one self-contained file
(about 140 KB) with connection, dark and white calibration, auto/manual exposure, averaging, live mode with rolling average
and a time plot, output resolution presets and custom grids/kernels (including ArgyllCMS's own filter), source (blackbody)
correction, absolute level calibration (brightness, radiant power, laser), the multi-temperature blackbody fit, EEPROM
backup/import, a diagnostic log, and CSV / `.sp` / JSON export that always includes the original ArgyllCMS values and the raw
pixels. It computes brightness, radiant power, x y, CCT (McCamy) and peaks; no CRI/TM-30 (those live in the full app). Build:
`npm run build:standalone`; source: `examples/standalone/template.html`.

## The Measure tab

Connect → dark calibration → **Measure**. Every reading is a row in a table (tick rows to overlay them in the chart, click a
row for CCT, Duv, CRI, TM-30, peaks), which you can rename, export (CSV, `.sp`, JSON backup) or add to the Illuminant
library / Artist pigments. Everything optional lives under **Advanced settings**: exposure, resolution (10 nm bands or the
ArgyllCMS 3.33 nm high-resolution grid, or a custom grid and kernel), live recording and averaging, blackbody calibration,
EEPROM import, diagnostics. A chip beside the Measure button always says whether a blackbody (source) correction is applied;
the toggle only affects new measurements. A second chip and toggle do the same for the absolute level calibration (a known brightness, a known radiant power, or a laser line of known power) and the Advanced page can find the true temperature of a lamp from a series of measurements at several temperatures. Each measurement keeps the original ArgyllCMS values (36 bands and the 3.33 nm
grid) plus the raw pixels, whatever display settings are chosen. If you see `Instrument did not answer (timeout)`, read
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Use it in your page

```html
<script src="src/i1pro-core.js"></script>
<script>
  const dev = new I1Pro.I1ProDevice(await I1Pro.WebUSBTransport.request());
  await dev.init();                                        // reset, read EEPROM, power mode, clocks
  await dev.calibrateDark();                               // sensor covered
  const r = await dev.measure({ readTime: 1.0 });          // auto exposure; r.avgAbs = 128 pixels, counts/s
  const rs = dev.resampler({ lo: 380, hi: 730, step: 1, kernel: 'factory' });
  const spectrum = rs.apply(r.avgAbs);                     // mW/m²/nm on a 1 nm grid (rs.wl = wavelengths)
</script>
```

[docs/INTEGRATION.md](docs/INTEGRATION.md) has the full API. `examples/minimal` is a complete short page;
`examples/spectrum-workbench` builds the full panel (live mode, plots, CRI/TM-30) into an existing single-file web app.

## How it works, and what limits it

- The i1 Pro is a 128-pixel diode-array spectrometer. One **frame** is 128 raw 16-bit counts. A measurement is a few to
  hundreds of frames at an **integration time** between 4.7 ms and 4.5 s, chosen so the brightest pixel reads about 40 500
  counts (the CCD saturates at 55 000).
- Raw counts are linearised (a per-unit polynomial from the EEPROM), divided by the integration time, and a
  dark reading (interpolated for the exposure) is subtracted.
- The factory turns 128 pixels into 36 bands of 10 nm with a stored matrix. This project does the same and also fits the
  shape of each band so it can build a different matrix for any output grid. See [docs/ALGORITHMS.md](docs/ALGORITHMS.md).
- **Speed is set by the instrument, not by USB or the driver.** The wait for photons (integration time × frames) dominates:
  a bright light needs milliseconds, a dim one up to seconds. The USB transfers are a few kilobytes.
- **Resolution is set by the optics.** The pixel spacing is about 3.1-3.6 nm (worked out from the unit's own calibration matrix) and the optical bandwidth about 6.5 nm. A 1 nm output grid is
  interpolation of that, not extra information; narrow LED peaks come out broadened.
- **Absolute units** (cd/m², mW/m²) assume the factory calibration is in mW/m²/nm. This is not verified for every
  geometry; there is a calibration factor in the UI to match a reference meter.

Protocol details are in [docs/PROTOCOL.md](docs/PROTOCOL.md).

Using the tools (workflow, calibrations, what the numbers mean, file formats): [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

## Repository layout

```
src/                 i1pro-core.js (driver + maths, UMD), i1pro-sim.js (simulated instrument), i1pro-ui.js + i1pro-plot.js (Measure tab)
examples/minimal/    smallest complete page
standalone.html      the instrument console only (one file, generated)
index.html           the full app (Spectrum Workbench: colour map, Measure tab for the i1 Pro, illuminant library and compare), generated, served by GitHub Pages
site-src/            the original single-file app that index.html is built from
examples/spectrum-workbench/   Measure-tab markup and the build script (npm run build:site)
data/                recorded EEPROM of one Rev D unit, used by the simulator and tests
docs/                user guide, protocol, algorithms, integration, hardware test plan, troubleshooting
tests/               Node tests (npm test) and a headless-browser smoke test (python tests/ui_demo.py)
udev/                Linux device rule
```

## Tests

```sh
npm test                    # driver maths against the simulator (Node 18+, no dependencies)
python tests/ui_demo.py     # headless Chromium smoke test of the example pages (pip install playwright)
```

Optionally set `I1P_ARGYLL_LOG=/path/to/spotread-D9.log` to compare the 36-band output with a real `spotread -D9` log.

## Scope and limits

Supported: i1 Pro Rev A–D (USB `0971:2000`, firmware ≥ 301 handled; the Rev D here is firmware 506). Not supported:
i1Pro2 / Rev E (a different protocol), transmission and scan modes, the ambient diffuser calibration, high-gain mode
(disabled in ArgyllCMS too). Calibration data written back to the instrument: none, the driver never writes the EEPROM.

## Licence

AGPL-3.0-or-later, the same licence as ArgyllCMS (see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md)): the driver is a
port of Graeme Gill's ArgyllCMS code. `data/demo-eeprom.*` is a calibration recording from one instrument, included
only so the demo mode and the tests have a realistic simulated device. **With a real instrument the driver reads that
instrument's own EEPROM at connect time and uses its calibration; the recording is never used.**
