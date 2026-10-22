# Algorithms

How the driver turns raw sensor counts into a spectrum. Steps 1–6 follow ArgyllCMS; the rest are additions of this project.
`spotread -v -D9` shows the same stages for comparison.

## 1. Linearise, normalise, dark-subtract

```
raw[frame][px]        16-bit counts, ≥ maxpve means negative (-65536); ≥ 55000 flags saturation
lin = Horner(lin0, raw)               # per-unit polynomial from the EEPROM
abs = lin / integration_time          # counts per second, comparable between exposures
abs[0] = abs[1];  abs[127] = abs[126] # the two edge pixels are not trusted
abs -= dark(t)                        # interpolated dark, see below
```

Frames of one measurement are averaged (`averageMulti`), after a consistency check (frame-to-frame variation above
10 % marks the result `inconsistent`: flicker, PWM or an unstable light).

## 2. Dark calibration

Two dark readings are taken with the sensor covered: about one second of frames at the shortest integration time
(212 frames at 4.7 ms) and one 4.0 s frame. The dark level is not simply proportional to the integration time, so the
dark for an exposure `t` is interpolated:

```
dark(t) · t = base + slope · t          # fitted through the two readings
```

A dark reading is rejected if it saturates, if it varies by more than 10 % across frames, or if its mean is more than
twice the threshold `(sensDark + 900·t) / t` (light is leaking in). Dark calibration should be repeated when the temperature
changes noticeably; the UI warns after 20 minutes.

## 3. Auto exposure (emission)

```
trial: 1 frame at 0.25 s                        # if saturated: retry at the shortest time, round(0.25/t) frames
optscale = (sensTarget · targoscale / t) / max(highest_pixel, 1)
new_t    = t · optscale
if new_t > 2.0 s:  clamp to 2.0 s if 2.0/new_t > 0.15, else new_t *= 0.15   # too dim: stay at 2 s
clamp to [min integration, max integration]
frames   = round(readTime / t)
```

`targoscale` is 0.9 in ArgyllCMS, so the brightest pixel is aimed at `0.9 × 45000 = 40 500` counts (the UI lets you pick
another target). Saturation is at 55 000. A repeat measurement reuses the exposure unless it saturates or the peak falls
below 12 % of the target. **Manual** exposure skips all of this and fails with `SATURATED` if the sensor clips.

## 4. 128 pixels → 36 bands

Each 10 nm band (380…730) is a weighted sum of up to 16 neighbouring pixels (`coef[band][16]`, starting at `index[band]`)
from the EEPROM. The weights are *not* equal: each band's weights follow a sinc-like window, and the result is multiplied by
the per-band emission factor `emis_coef[band]`.

## 5. Pixel → wavelength

The blue end is on the high pixel numbers. The pixel spacing is not constant: for the tested Rev D it is about 3.6 nm per
pixel at 380 nm, 3.2 nm at 570 nm and 3.1 nm at 730 nm. The driver derives the wavelength of every pixel from the unit's own
factory matrix (`pixelWavelengths()` in `i1pro-core.js`, stored as `cal.pxnm`): row *b* of the matrix is the response of band
380 + 10 *b* nm, its weighted mean pixel position is where that wavelength lands on the sensor, and a cubic through the 36
positions gives wavelength(pixel). On the tested unit the cubic fits within 0.001 nm rms, so the matrix looks as if it was
generated from such a polynomial. The pixels beyond the first and last band (about 0-12 and 121-127) are extrapolated.
A straight line `380 + (px − 120) · (350 / (13 − 120))` (3.27 nm/pixel, `px2nm`) is kept only as a fallback and for old code;
it is off by up to about 9 nm in the middle of the spectrum. Each pixel also responds to a range of wavelengths (roughly
6-10 nm wide, overlapping its neighbours), which is what the matrix rows describe.

## 6. Reflective mode (ArgyllCMS-style)

```
white tile:    read with the lamp on (≥ 1500 ms after any previous lamp use), exposure chosen so the peak ≈ 45000
cal_factor[b]  = white_reference[b] / white_reading[b]          # reading floored at 1000
sample:        lamp-off frames (dark) then lamp-on frames; reflectance = M · (sample − dark) · cal_factor
```

The 36 white-tile reflectance values come from the instrument's EEPROM (its own tile). Lamp warm-up time and the frame count
are fixed in the driver; their best values on real hardware are still to be checked.

## 7. Arbitrary output grid: the resampler

ArgyllCMS's "high resolution" mode narrows the band shapes but still reports a fixed grid. Here the two are separated.

1. **Fit each factory band** with an asymmetric Hann-windowed sinc
   `A · sinc((λ−x0)/W) · hann(λ−x0 ; Ww)` with separate left/right widths and windows (`A, x0, WL, WR, WwL, WwR`) by
   Levenberg–Marquardt. R² ≥ 0.998 on the tested unit.
2. **Interpolate the six parameters across wavelength** (cubic Lagrange over four neighbouring bands, or linear) with the
   centre offset stored as `dx = x0 − band_wavelength`. This gives a plausible band shape at any wavelength.
3. **Build a weight matrix** `W[output][pixel]` for the requested grid: evaluate the shape at each pixel's wavelength,
   then normalise so the row sum matches the interpolated factory row sum (gain-preserving), and multiply by the interpolated
   `emis_coef`.
4. `spectrum = W · avgAbs`.

Kernel options: `argyll` (ArgyllCMS's own filter, see below), `factory` (the fitted shape, optionally scaled in width), `sinc`, `triangle`, `gaussian` (set by FWHM; floor
4 nm). At a 10 nm grid with the factory kernel the result reproduces the 36 exact bands to about 0.2 % of peak. A narrower
kernel sharpens peaks but amplifies noise; below about 6.5 nm FWHM there is no more information in the sensor.

## 8. Source (blackbody) correction

```
c[b] = reference[b] / measured[b]      # bands where measured < 3 % of the maximum hold the nearest good value
c   /= mean(c over 500–600 nm)         # scale-free: the factory absolute level is kept
optional 3-point smoothing
spectrum[b] *= c[b]                    # also applied inside the resampler weights
```

References: an ideal Planck radiator, "tungsten" (Planck × an approximate filament emissivity `0.47 − 0.000133·(λ − 400)`,
which is a rough placeholder, not a measured curve), or a CSV you provide. The correction is only meaningful where the
calibration lamp has signal; the UI reports the usable range (e.g. 430–710 nm).

## 9. Derived numbers

* **Luminance** `Y = 0.683 · Σ ȳ(λ) · s(λ) · Δλ · k` with `s` in mW/m²/nm and `k` the user calibration factor.
* **Radiant power** `Σ s · Δλ` over 380–730 nm. **Photon flux** (400–700 nm) `Σ s · λ / (h·c·N_A)` in µmol/m²/s.
* **Chromaticity, CCT, Duv, CRI, TM-30** come from the host page's colorimetry code.
* **Peaks:** local maxima of the 1 nm spectrum above a prominence threshold, refined by a parabola through three points;
  width = full width at half prominence.

The unit assumption (mW/m²/nm) comes from the scale applied to the factory emission coefficients in ArgyllCMS; whether
the number equals cd/m² for a given geometry depends on the instrument's field of view and whether a display or a lamp is measured.
Compare with a reference meter and use the calibration factor.


## 9. ArgyllCMS's filter, and what the factory matrix is

`i1pro_compute_wav_filters()` builds each output wavelength like this: the 128 pixel values are joined by a cubic Lagrange
interpolation over 4 neighbouring pixels (only the middle span of each window), and that curve is integrated against a
triangle centred on the output wavelength whose half-width equals the output spacing (10 nm for the standard bands,
10/3 nm for `-H`). The result is a weight per pixel (the weights sum to 1), multiplied by the emission calibration of that
wavelength. For the high-resolution grid ArgyllCMS upsamples the 36 emission factors with a smoothing spline; the driver uses
cubic interpolation of them, which is the only difference.

The pixel wavelengths for that come, for Rev A-D, from the factory matrix itself: ArgyllCMS finds where the weight curves
of neighbouring bands cross over and fits a smooth curve through those points. The driver uses the weighted mean pixel
position of each band instead (`pixelWavelengths`). On the tested unit both give the same wavelengths to 0.02 nm.

**Check (in `npm test`):** the `argyll` kernel evaluated on the 10 nm grid reproduces the EEPROM's own 36 × 128 matrix
output to 0.04 % of the peak on a narrow (8 nm) line, so the factory matrix appears to have been generated by this very
algorithm from a polynomial pixel-to-wavelength map. That supports both the pixel wavelengths above and the implementation.
