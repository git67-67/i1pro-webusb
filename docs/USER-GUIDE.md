# User guide

This guide covers the instrument console (`standalone.html`) and, where noted, the Measure tab of the full app (`index.html`).
Both use the same driver, so the calibrations and numbers behave the same. Status of verification: everything below was tested
against the built-in simulator and the recorded EEPROM of one Rev D unit; see [HARDWARE-TESTING.md](HARDWARE-TESTING.md) for what
still needs a real instrument.

## 1. Before you start

| Item | What to do |
|---|---|
| Browser | Chrome or Edge (desktop). Firefox and Safari have no WebUSB. The page must be `https://` or a local file. |
| Linux | Install `udev/55-i1pro.rules`, then re-plug the instrument. |
| Windows | Bind the WinUSB driver to the device (for example with Zadig). ArgyllCMS's driver does not work with WebUSB. |
| Other programs | Close spotread / ArgyllCMS. Only one program can own the instrument. |
| USB | Plug into a port on the computer, not an unpowered hub; use a short cable. |

No instrument? Press **Demo**: a simulator with the recorded calibration of a real unit runs the whole workflow.

## 2. The basic workflow

1. **Connect i1 Pro**, pick the device in the browser's dialog. The page reads the instrument's own EEPROM, so the calibration is
   always the connected unit's.
2. **Dark calibration** (cover the sensor, or lay the instrument on a dark surface). About 5 s. Repeat when the room temperature
   changed, or after the chip turns orange (30 minutes).
3. Point at the light and press **Measure** (or the instrument's button). The result is added to the list and drawn.
4. Click a row to see details; export with the buttons under the detail box.

Surfaces (reflective): switch to **Surface**, do the **White tile calibration** with the instrument on the white tile, then
measure. Result is reflectance (1 = 100 %).

## 3. Measuring

### Exposure

- **Auto** adjusts the integration time until the brightest pixel reads about the *target* (default 40 500 counts; the sensor
  saturates near 55 000; the factory aim is 45 000 × 0.9). *Longest auto time* limits dim sources (default 2 s, maximum 4.4 s).
  *Reuse the exposure* skips the search for repeat readings, which is faster.
- **Manual** fixes the integration time in ms. Too long gives a *saturated* error, not a wrong number.
- *Averaging time per reading* is how many seconds of frames are averaged inside one reading (ArgyllCMS uses 1 s).
- *Readings to average* takes several readings and averages them (0 = until Stop). *Pause between readings* spaces them out.

Speed note: a reading takes roughly the averaging time plus the integration-time search on the first reading; the USB transfer
itself is small. Dim light means long integration times, and that dominates.

### Live mode

Repeated readings at the update interval you set. Optional **rolling average** over the last N readings smooths noise at the
cost of lag. The time plot shows two quantities (brightness, radiant power, CCT, x, y) and exports as CSV. *Add current live
spectrum to the list* keeps a snapshot. A flickering or PWM-dimmed light shows up as the warning *light changed during the reading*.

## 4. Resolution: what the numbers really are

The instrument has **128 pixels**. They are not evenly spaced (about 3.6 nm per pixel in the blue, 3.1 nm in the red) and each
pixel responds to a band of wavelengths (about 6–10 nm wide, overlapping its neighbours). Every output spectrum is a weighted
sum of the pixels; the weights come from the instrument's factory matrix (36 bands) or from a filter rule (any other grid).
The wavelength of each pixel is derived from that matrix for the connected unit.

| Preset | Points | What it is |
|---|---|---|
| Standard | 36 × 10 nm, 380–730 | Exactly the bands ArgyllCMS reports. |
| High resolution | 3.33 nm, 370–730 | ArgyllCMS's `-H` grid and its filter algorithm (cubic interpolation of the pixels integrated against a 3.33 nm triangle). Only the upsampling of the emission calibration differs (cubic instead of a smoothing spline). |
| Fine | 1 nm, 380–730 | The 36 factory bands interpolated. Not more information. |
| Custom | any | Grid and kernel: ArgyllCMS filter, factory shape, windowed sinc, triangle, Gaussian; width; interpolation. |

Finer than the pixel spacing is interpolation. Narrow lines (LEDs, lasers) come out about 6–10 nm wide whatever the grid.
**Every measurement stores the original ArgyllCMS values** (36 bands and the 3.33 nm grid) plus the 128 raw pixel values, so
you can change the display later without losing the reference numbers.

## 5. Calibrations

### 5.1 Dark

Subtracts the sensor's dark signal. It is modelled from two readings (shortest and long integration time) so it holds for any
exposure. Required before every session; the console refuses to measure without it.

### 5.2 White tile (reflective only)

Measures the instrument's lamp reflected from the white reference. Reflectance = sample ÷ white × the tile's reflectance
stored in the EEPROM. The lamp warm-up time (default 250 ms) can be changed.

### 5.3 Source (blackbody) correction

*Shape* calibration. Measure a lamp of known colour temperature (tungsten halogen is best, about 2856 K); the page derives a
multiplier per band so that the instrument shows that shape. It is scale-free (mean 1 over 500–600 nm) and applies to later light
measurements while the switch is **on**. The chip beside the switch says **none / ON / OFF**, the reference and the wavelength
range where it is reliable (bands with too little signal take the nearest good value). Turning it off affects *new*
measurements only; rows already in the list keep what they were taken with. A correction can be saved as a JSON profile.
Choose *Tungsten filament* if the lamp's emissivity matters, or load your own reference CSV (wavelength, value).

Caveat: the correction cannot be better than the lamp. A bulb 100 K off its rated temperature, dimmed, or aged, puts a colour tilt
into every later measurement.

### 5.4 Absolute level

*Level* calibration: one factor for the whole spectrum. The factory scale is assumed to be mW/m²/nm; that has **not** been
checked against a reference. Reference options:

- **Known brightness (cd/m²)**: point at a source also measured with a luminance meter, same spot and distance.
- **Known radiant power per area (mW/m²)**: from a calibrated radiometer, 380–780 nm.
- **Laser line**: known power (mW), optional wavelength (blank = strongest peak), integration window ± nm, and the beam area
  on the sensor (mm²). The line is integrated, so the instrument's resolution does not matter. With the area, results are
  calibrated in mW/m²/nm. *Without it* results are power at the sensor (mW/nm) and brightness is shown in lm.
- **Factor**: enter it directly.

The chip and switch work like those of the source correction. Geometry matters: the factor is valid for the same distance, field
of view and diffuser as at calibration. The full app warns if less than 80 % of the light lies inside the laser window; the console does not, so keep other light away.

### 5.5 Blackbody at several temperatures

For a lamp whose temperature you can change but not know exactly (supply voltage, current).

1. Set a temperature, press **Add this temperature**; repeat at least three times, as far apart as the lamp allows
   (optionally enter your own estimate; it is only a starting value).
2. Optional: enter the true temperature of one step (pyrometer, or the filament resistance of a tungsten lamp) and choose which step.
3. **Fit temperatures**, then optionally **Use as source correction**.

What the fit can and cannot know: it removes everything that is the same at all temperatures (instrument colour response,
emissivity of the filament) and leaves the *steps* in temperature, which are exact. A tilt in the instrument's colour
response is indistinguishable from a shift of all temperatures, so the **absolute** values need an anchor. Without an anchor the
factory colour calibration and a grey emitter are trusted, typically good to a few percent. The residual (rms of ln signal) tells
you whether the lamp behaves like a thermal source; above 2 % the page warns.
Bands with less than 3 % of the peak signal in any step are left out, which is why the usable range may start near 510 nm for a
cool lamp.

## 6. Numbers shown

| Quantity | How |
|---|---|
| Brightness | 683 lm/W × Σ ȳ(λ) · spectrum(λ) · Δλ, mW/m²/nm → cd/m² (assuming the factory scale; in lm for the laser without area) |
| Radiant power | Σ spectrum · Δλ |
| x, y | CIE 1931 2° (the console uses the analytic multi-lobe fit of Wyman et al., within about 0.0005 of the tables; the full app uses the tables) |
| CCT | McCamy formula in the console: good near the blackbody locus, rough far from it. The full app gives CCT and Duv by its own method |
| Peaks | Local maxima with a sub-pixel fit, about ±1–2 nm; widths are broader than the true line width |
| CRI, TM-30 | Full app only |

## 7. Files

| Export | Content |
|---|---|
| CSV | `# key,value` metadata lines, then `wavelength,intensity` at the chosen resolution |
| `.sp` | ArgyllCMS spectrum format |
| Argyll values CSV | the stored original 36 bands and 3.33 nm values |
| Pixels CSV | pixel number, wavelength from the factory matrix, dark-subtracted counts/s |
| JSON (all measurements) | everything, including raw pixels, correction multipliers and absolute factor, loadable again |
| EEPROM `.bin` / hex | backup of the instrument's calibration; import accepts `.bin`, a hex dump or spotread `-D9` output |

The list is kept in the browser (the last 60). Clear browser data and it is gone: export JSON for anything you need to keep.
Nothing is sent over the network.

## 8. EEPROM import

Replaces the wavelength matrix, linearisation and white-tile data used by the page (never written to the instrument). Dark and
white calibrations are cleared; repeat them. *Back to the instrument's own* restores the connected unit's calibration. Use this
to analyse old measurements or to compare with an ArgyllCMS log of another unit.

## 9. When something goes wrong

- *Access denied / unable to claim*: udev rule, other program, or another tab owns the device.
- *High-power error*: connect directly to the computer.
- *Instrument did not answer (timeout)*: the driver resets and retries once by itself. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
  and use *Instrument info and diagnostics → Copy diagnostic log* for a report.
- *Saturated*: shorten the manual time, lower the auto target, or move away from the light.
- *Not enough signal to calibrate*: the reference is too dim or too narrow in spectrum.

## 10. Known limits

Not supported: i1Pro 2 / Rev E (different protocol), transmission, scan and ambient modes, high-gain mode. Reflective mode,
live mode, the instrument button and the absolute scale have not been verified on hardware. The tungsten emissivity curve is an
approximation. The simulator proves the maths, not the optics.
