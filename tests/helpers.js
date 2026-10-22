'use strict';
/* Shared test helpers. The demo EEPROM image is a recording from a real Rev D unit (see data/). */
const fs = require('fs'), path = require('path');
const b64 = fs.readFileSync(path.join(__dirname, '..', 'data', 'demo-eeprom.b64'), 'utf8').trim();
function eepromBytes() { const full = new Uint8Array(0x2000).fill(0xff); full.set(Uint8Array.from(Buffer.from(b64, 'base64'))); return full; }
module.exports = { b64, eepromBytes, I: require('../src/i1pro-core.js'), SimTransport: require('../src/i1pro-sim.js').SimTransport };
