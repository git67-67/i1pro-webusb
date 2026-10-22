# i1 Pro USB protocol (as used by this driver)

Source: ArgyllCMS `spectro/i1pro_imp.c` and `i1pro_imp.h` (the reference implementation this driver was ported from).
Everything below is what `src/i1pro-core.js` does; **"verified" in this document means "matches the ArgyllCMS source and
the simulator"**. Items still to be confirmed on hardware are listed in [HARDWARE-TESTING.md](HARDWARE-TESTING.md).
There is no public vendor documentation of this protocol.

## Device

| | |
|---|---|
| USB ID | `0971:2000` (Gretag-Macbeth), class vendor-specific, one interface, config 1 |
| Generations | Rev A–D share this protocol. Rev E (i1Pro2) uses a different protocol and is **not** supported |
| Endpoints | `0x82` bulk IN: sensor frames. `0x84` interrupt IN: the instrument's button, 1 byte |
| Power | needs "high power" (500 mA) mode; the driver switches to it and fails with a clear message when a hub refuses |
| Identify | firmware revision from `getmisc` (e.g. 506 on a Rev D); serial number from the EEPROM |

The firmware revision matters: from 301 on the instrument has two selectable sensor clock modes (below); older units
use a fixed one and a longer minimum integration time (8.84 ms instead of 4.716 ms).

## Requests

All are **control transfers**, `requestType: vendor`, `recipient: device`, `value = 0`, `index = 0`. Multi-byte values are big-endian.

| bRequest | Name | Direction / payload |
|---|---|---|
| `0xCA` | reset | OUT, 1 byte: `0x1f` full reset, `0x01` request high-power mode |
| `0xC9` | getmisc | IN, 8 bytes: firmware `u16` (bytes 0–1), `maxpve` `u16` (bytes 4–5, the largest positive raw value; 64000 on the tested unit), power-mode byte (byte 7; 8 = low power) |
| `0xC4` | read EEPROM | OUT 8 bytes: address `u32`, size `u16`, 2 pad bytes; the data is then read from the bulk endpoint (the driver requests all 8192 bytes at address 0 in one go) |
| `0xC1` | set measurement parameters | OUT 8 bytes: integration clocks `u16`, lamp clocks `u16`, number of frames `u16`, flags, 0 |
| `0xC0` | trigger measurement | OUT, no payload |
| `0xC2` | get measurement parameters | IN |
| `0xCF` | set clock mode | OUT, 1 byte (`1` or `2`; firmware ≥ 301) |
| `0xD1` | get clock mode | IN, 6 bytes: max, current, unknown, sub-clock divider, clock period in µs, sub-tick mode |

Flags byte of `setmeasparams` as the driver sends it: `0x06` for emission (lamp off, lamp clocks 0) and `0x04` for a
reflective reading with the lamp on (lamp clocks = lamp time ÷ (sub-clock divider × clock period), at most 256). In
ArgyllCMS (`i1pro_imp.c`) the bits are `I1PRO_MMF_NOLAMP` (`0x02`, lamp stays off) and `I1PRO_MMF_LOWGAIN` (`0x04`, the
normal gain setting despite the name), so emission sends both and reflective sends only low gain. The values are copied
from that code; their meaning inside the firmware was not independently verified.

## Recovery after a timeout

ArgyllCMS notes that the instrument can lock up after a short or failed read. The driver therefore (a) checks the power
mode after the instrument has been idle, (b) uses a timeout of `minTimeoutMs` (default 3 s) + 1.5 × the expected
measurement time, (c) pauses the button-endpoint polling on `0x84` while a measurement runs, and (d) on `TIMEOUT` or `USB`
errors does a USB reset, an instrument reset (`0xCA`) and one automatic retry. `dev.diagnostics()` returns a text log
of events and USB state. Whether the lock-ups seen on real hardware come from one of these causes is not yet verified; see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Init sequence

```
reset(0x1f)  →  getmisc  →  read EEPROM (8192 bytes, in blocks)  →  establish high-power  →  getmeasparams
```

## A measurement

1. Choose clocks. The integration time is `clocks × clock period`, `clocks ≤ 65535`. Two clock modes exist:

   | mode | clock period | sub-clocks | shortest integration |
   |---|---|---|---|
   | 1 | 68 µs | 136 | 9.248 ms |
   | 2 | 36 µs | 131 | 4.716 ms |

   The driver uses mode 1 unless the requested time is shorter than mode 1 allows (`t < period × subclk × 0.99`), then mode 2.
2. `setmeasparams(intclocks, lampclocks, nframes, flags)`. The bulk read of `nframes × 256` bytes is started first, then (after about 10 ms) `trigger` is sent.
3. Read `nframes × 256` bytes from `0x82`: each frame is 128 big-endian `u16`.
4. Values `≥ maxpve` are negative (stored two's-complement-like): the driver subtracts 65536. A raw value above the
   saturation threshold (55 000) marks the pixel as saturated.
5. The button endpoint (`0x84`) is read with a 1-byte transfer; a read that returns data is treated as "pressed" (this is the one place the transfer type is an assumption).

The data stream cannot be cancelled in WebUSB: if a read times out the session should be re-initialised.

## EEPROM

8192 bytes. A key table at `0x1000`: `u16 id, u16 length`, then `(u16 key, u32 address)` entries; a value's size is the
distance to the next address. Contents used here (key → meaning) include the serial number, the manufacture date, the
linearisation polynomial, the sensor-to-wavelength matrix (36 bands × 16 coefficients with a start-pixel index per band),
the emission calibration (36 factors), the white-tile reflectance (36 values), integration limits, the saturation level and the
target level (45 000), and the dark sensitivity. The decoder is `decodeEEPROM()`; it was checked against one unit's dump
(55 keys, 334 bytes of key table).

The calibration tables are stored as **32-bit floats**; the integer-valued keys are 32-bit integers.

## What this means for performance

A measurement is a handful of control transfers and a bulk read of at most a few hundred kilobytes. The time is spent
integrating light: `frames × integration time`, plus the lamp warm-up in reflective mode. The USB requests themselves are small and
fast compared with the exposure of a typical light measurement; this has not been profiled on hardware yet.
