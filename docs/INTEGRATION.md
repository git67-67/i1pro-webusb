# API and integration

`src/i1pro-core.js` is a UMD module: `window.I1Pro` in a browser, `require()` in Node. It has no dependencies.

## Device

```js
const transport = await I1Pro.WebUSBTransport.request();     // browser: permission prompt, or an already paired device
const dev = new I1Pro.I1ProDevice(transport, { log: console.log, lampOffMs: 1500 });
const info = await dev.init();      // { serial, firmware, minInt, maxInt, sensTarget, sat0, lin0, clocks, ... }
await dev.close();
dev.onButton(() => ...);            // instrument button (WebUSB only)
```

Errors are `I1Error` with a `code`: `NODARK`, `SATURATED`, `NOWHITE`, `POWER`, `TIMEOUT`, `USB`, `EEPROM`, `NOWEBUSB`, `INTTOOBIG`, `CALSIGNAL`, `ABORT` …

### Calibration and measurement

| call | does |
|---|---|
| `calibrateDark({progress})` | two dark readings; keep the sensor covered. Required before any measurement. |
| `measure(opts)` | emission measurement, see options below. Returns a result object. |
| `measureSeries({count, intervalSec, onSample, shouldStop, ...measureOpts})` | several measurements and their mean (`count: 0` = until `shouldStop()` is true) |
| `calibrateWhite({progress})` | reflective: white-tile calibration (stores `dev.refl`) |
| `measureReflective({readTime, lampTime})` | reflective measurement (needs the white calibration) |
| `reflectance(result, gridOpts)` | reflectance on any grid: ratio of resampled sample and white × the tile reflectance |
| `resampler(gridOpts)` | builds the pixel→spectrum matrix; `rs.wl`, `rs.apply(avgAbs)`, `rs.extrap` |
| `setCorrection(c36, enabled, meta)` | per-band source correction (null clears); the resampler honours it |
| `loadEEPROM(u8)` | replace the calibration (clears the dark and white calibrations); `dev.eeprom` holds the current image |
| `quantize(t)` | the integration time the instrument will really use for a requested time |

`measure` options: `readTime` (seconds of frames to average, default 1), `reuse` (reuse the previous auto exposure),
`targoscale` (target = `sensTarget × targoscale`, default 0.9), `maxAutoTime` (default 2.0 s), `manualTime` (seconds; > 0
switches to manual), `progress(msg, fraction)`.

Result fields: `s36` (36 bands, mW/m²/nm, with correction if enabled), `s36raw`, `wl36`, `avgAbs` (128 pixels, counts/s,
dark-subtracted), `rawFrames` (Int array, frames × 128, as read), `nFrames`, `inttime`, `exposureMode`, `targetCounts`,
`peakCounts`, `headroom` (peak ÷ saturation), `variation`, `inconsistent`, `elapsedMs`, `darkAgeSec`, `serial`, `when`.

`gridOpts`: `{ lo, hi, step, kernel: 'argyll'|'factory'|'sinc'|'triangle'|'gaussian', widthScale, fwhm, interp: 'lagrange'|'linear' }`.

### Reliability, resolutions and stored ArgyllCMS values

| call / option | does |
|---|---|
| `new I1ProDevice(t, {autoRecover, minTimeoutMs, lampOffMs})` | `autoRecover` (default true): reset and retry once after `TIMEOUT`/`USB`; `minTimeoutMs` (default 3000) |
| `dev.recover(why)` | USB reset + instrument reset + re-init; `dev.recoveries` counts them |
| `dev.diagnostics()` | multi-line text: events, USB info, clock modes, last errors. Attach it to bug reports |
| `RES_PRESETS` | `std10` (36 × 10 nm, 380-730), `hires3` (3.33 nm, 370-730, ArgyllCMS `-H` grid), `fine1`, `custom`; each has `opts` for `resampler()` |
| `argyllValues(cal, fits, avgAbs, refl)` | what ArgyllCMS itself would report for these pixels: `{std36, hires:{lo,hi,step,v}}` (emission only) |
| `reflectanceFromAbs(cal, fits, sampleAbs, whiteAbs, opts)` | the function behind `dev.reflectance` |

The Measure tab stores `argyll.std36` and `argyll.hires` with every measurement, next to the 128 raw pixels, so any display
grid or kernel can be changed later without losing the original values. The `argyll` kernel (used by
`hires3`) is ArgyllCMS's own filter algorithm, `argyllFilter(cal.pxnm, wavelength, halfWidth)`: see ALGORITHMS.md. Only its
emission-calibration upsampling is an approximation. It has not been compared with a real `spotread -H` run yet.

### Calibration against known sources

| call | does |
|---|---|
| `setAbsCal(k, enabled, meta)` | one factor for the whole emission spectrum (absolute level); `dev.absCal`; results carry `absApplied`, `absK` |
| `effectiveCorrection()` | the per-band multiplier really applied: source correction × absolute factor, or `null` |
| `bandIntegral(wl, v, lo, hi)` | integral of a sampled spectrum (mW/m² for a mW/m²/nm spectrum), e.g. a laser line |
| `absoluteFactor(measured, target)` | `target / measured` with input checks |
| `fitBlackbodyTemperatures(items, {lo, hi, anchorIndex, anchorT})` | several spectra of one thermal source at different temperatures → `T[]`, `corr[36]`, `resid`, `gauge` |

`fitBlackbodyTemperatures` models `ln v_i(b) = f(b) + g_i + ln Planck(λ_b, T_i)`: the instrument response and emissivity `f`
(same for all temperatures) and the levels `g_i` are fitted away, which leaves the temperatures. The data fix only the
*differences* of 1/T; a tilt in `f` proportional to 1/λ is indistinguishable from a common shift of 1/T. With
`anchorIndex`/`anchorT` (the true temperature of one step) the absolute values follow; without, `f` is assumed to have no
such tilt (grey emitter, factory colour calibration trusted). `corr` is the resulting per-band source correction.

### Helpers

`averageResults(list)`, `computeCorrection(meas36, ref36)` → `{c, usable, lo, hi}`, `referenceBands('blackbody'|'tungsten', T)`,
`planck(T, nm)`, `parseEEPROMText(text)`, `eepromToHexDump(u8)`, `decodeEEPROM(u8)`, `toCSV(wl, v, meta)`, `toSP(wl, v, name)`
(ArgyllCMS `.sp` format), `px2nm(px)`.

## Transport interface

Anything with this shape can drive the device (WebUSB, a Node `usb` binding, a recorded session, the simulator):

```js
open(); close();
controlOut(request, bytesOrUndefined);          // vendor/device control transfer, value = index = 0
controlIn(request, length) -> Uint8Array;
readBulk(length, timeoutMs) -> Uint8Array;      // endpoint 0x82
watchButton(cb);                                 // optional
```

## Simulator

```js
const sim = new I1ProSim.SimTransport({ eepromB64, level: 20000, speed: 0.15, spd: nm => ..., noise: 0 });
sim.covered = true;            // the dark-calibration state
sim.mode = 'emission' | 'reflective'; sim.target = 'white' | 'sample'; sim.sample = nm => reflectance;
```

It answers the same requests as the instrument, models the linearisation, a dark offset that grows with integration time, and clips at
saturation. Use `speed < 1` to make waits shorter than the real integration time.

## Putting the panel into a page

`src/i1pro-ui.js` is the full Measure tab (with `src/i1pro-plot.js`, a small chart module). It expects the markup of
`examples/spectrum-workbench/measure-view.html` and these host-page globals: `ledMake, ledPut, cleanLED, ledChanged,
ledSaveSoon, ldSelect, setKind, addFilter, usSaveSoon, recompute, showTab, st, TABS, CMF_TAB, kvOpen, kvPut` (the "Spectrum
Workbench" web app provides them; `build.py` also patches `showTab` to call `window.I1P_onShow()` for the `meas` tab). For another host, copy the panel, reimplement those
hooks (they are used only to add the result to your own library and to compute colour metrics) and reuse the rest.

```sh
python examples/spectrum-workbench/build.py spectrum-workbench.html out.html
```

The build is deterministic: it adds a Measure tab button and view and appends five inline scripts (demo EEPROM, plot, driver, simulator, UI).

## Hosting on GitHub Pages

`index.html` in the repository root is the built app. After changing anything in `src/`, `panel.html` or the source page, run
`npm run build:site` and commit the new `index.html` (CI fails if it is out of date). WebUSB only works on `https://` (or
`localhost`), which GitHub Pages provides. Only Chromium-based browsers have WebUSB; the page says so and the demo still works.
The page loads its fonts from Google Fonts; remove that `<link>` from the source page if that is a privacy concern.
