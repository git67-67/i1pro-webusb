# Spectrum Workbench integration

`measure-view.html` is the Measure tab; `build.py` inserts it, the plot module, the driver, the simulator, the UI script and a demo
EEPROM into a copy of the single-file "Spectrum Workbench" page (`site-src/spectrum-workbench.html`) (the page itself is not part of this repository).

```sh
python build.py ../../site-src/spectrum-workbench.html out.html
python ../../tests/ui_demo.py out.html      # optional smoke test with the simulator
```

The page then has a Measure tab: connect, dark calibration, measure or run live, adjust exposure, average,
calibrate against a source, switch to reflective mode for pigments (results go to the "Artist pigments" data set), and add
the result to the library to get CCT, Duv, CRI and TM-30. See [../../docs/INTEGRATION.md](../../docs/INTEGRATION.md).
