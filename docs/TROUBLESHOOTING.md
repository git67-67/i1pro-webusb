# Troubleshooting

## "Instrument did not answer (timeout)"

**What is known.** The driver waits for the 128-pixel frames on the bulk endpoint; the wait is the ArgyllCMS formula
(base time + expected measurement time) with a wider margin. A timeout means the instrument sent no (or too little) data.
ArgyllCMS itself documents that the i1 Pro can lock up after a short or failed read.

**What is not known.** The cause of the intermittent timeouts on the author's Rev D has not been reproduced or isolated;
the items below are the plausible causes the driver now defends against, not confirmed diagnoses.

| Suspected cause | Mitigation in the driver | What you can do |
|---|---|---|
| Instrument left in a bad state by an earlier aborted read | USB reset + instrument reset (`0xCA`) + one automatic retry | none; the log shows `recover` |
| Dropped to low power after idle / weak USB port or hub | power-mode check before measuring after idle | plug directly into a port on the machine, short cable |
| Button polling on endpoint `0x84` competing with the measurement | polling paused during a measurement | none |
| Another program (spotread, a second tab) owns the device | none possible | close it; only one program can own the instrument |
| Integration time very long (dim light, auto exposure up to 2 s) | timeout scales with the expected time | use a brighter source or set a manual exposure |
| Browser/OS USB stack stall | reset path | try another USB port or another browser profile |

**If it still happens**, open *Advanced settings → Instrument info and diagnostics* and use *Save log*. The log lists
recent events, USB state, clock modes and whether a recovery was attempted. Please include: operating system, browser
version, hub or direct port, light level, and how long the instrument had been idle.

`autoRecover: false` and `minTimeoutMs` (see [INTEGRATION.md](INTEGRATION.md)) turn the retry off or widen the wait.
