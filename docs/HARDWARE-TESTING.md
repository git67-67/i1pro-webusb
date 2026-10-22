# Hardware test plan

Most of the driver is checked against a simulator. These items need a real instrument. If you run them, please open an
issue with the result (and the browser console log, which the driver fills with `[i1pro]` lines).

Reported so far: the first version (connect, dark calibration, auto-exposure measurement) was used by its author with a
Rev D (firmware 506, S/N 715997). Nothing below has a recorded result yet.

| # | Check | Expected | Notes |
|---|---|---|---|
| 1 | Connect on Linux with the udev rule | opens, status shows serial and firmware | fails with "Unable to claim"/"Access denied" without the rule or while `spotread` runs |
| 2 | Connect via an unpowered hub | clear "high-power" error | expected, not a bug |
| 3 | Dark calibration, cap on | completes in ~5 s | repeat with a leak of light: should be rejected |
| 4 | Measure a stable light, auto exposure | peak ≈ 40 500 counts, integration time shown | compare with `spotread -e -s` on the same light |
| 5 | Same light, 36-band output vs `spotread -s` spectrum | within a few percent of peak | the main correctness check |
| 6 | Manual exposure, too long | `SATURATED` message, no hang | |
| 7 | Instrument button | measures (or stops live mode) | the endpoint/transfer type is the least certain part |
| 8 | Live mode on a steady light | stable updates; no stalls | watch for timeouts: a timed-out WebUSB read cannot be cancelled, reconnect |
| 9 | Live mode on a flickering / PWM-dimmed LED | `inconsistent` warning and a spread in the log | |
| 10 | Source calibration with a halogen lamp of known colour temperature | CCT of the lamp is right after correction | the tungsten emissivity curve is approximate |
| 11 | Reflective: white tile, then a known colour tile | reflectance matches a reference | lamp timing (warm-up, 1.5 s off wait) not yet tuned |
| 12 | Brightness vs a luminance meter on a display | matches after the calibration factor; note the factor | geometry-dependent |
| 13 | Import your own EEPROM dump | serial changes, dark/white calibration cleared | |
| 14 | Windows (WinUSB via Zadig) and macOS | connects | untested |
| 17 | Absolute level: a display measured with a luminance meter, or a laser of known power | after the calibration, a second measurement of the same source reads the known value; try another source to see how geometry-dependent it is | |
| 18 | Temperature series: lamp at 4+ voltages, with one true temperature known | fitted temperatures follow the lamp; with a tungsten lamp compare with the filament resistance | |
| 15 | Timeouts: 20 measurements in a row, then wait 5 minutes and measure again | no `timeout`; if one occurs, the recovery log shows a reset and the retry succeeds | send **Advanced settings → Instrument info and diagnostics → Save log** with any report |
| 16 | High-resolution preset vs `spotread -H -s` | 3.33 nm values agree closely (the filter is ArgyllCMS's own algorithm; only the upsampled emission calibration differs slightly) | |

To capture a comparable log from ArgyllCMS: `spotread -v -s -S -e -T -D9`; set `I1P_ARGYLL_LOG` to compare it in `npm test`.
