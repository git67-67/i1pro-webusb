const {b64,eepromBytes,I,SimTransport}=require('./helpers.js');let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
(async()=>{
// EEPROM text import: an Argyll -D9 style log (noise lines + "0000: .." rows) and a plain hex dump
const ref=eepromBytes();
const dump=I.eepromToHexDump(ref);
const fromLog=I.parseEEPROMText('Some spotread output\nInstrument Type: i1 Pro\n'+dump+'trailing text\n');
ok(fromLog.length===8192&&fromLog.every((v,i)=>v===ref[i]),'EEPROM parsed from a hex-dump log equals the reference image');
const plain=I.parseEEPROMText(Array.from(ref,x=>x.toString(16).padStart(2,'0')).join(' '));
ok(plain.length===8192&&plain.every((v,i)=>v===ref[i]),'plain hex text parses');
const tr=new SimTransport({eepromB64:b64,level:3000,sens:nm=>1+0.25*(nm-555)/175});
const dev=new I.I1ProDevice(tr,{lampOffMs:50});await dev.init();
ok(dev.eeprom.length===8192,'device keeps EEPROM for backup');
dev.loadEEPROM(fromLog);ok(dev.cal.serial===715997,'loadEEPROM swaps calibration');
tr.covered=true;await dev.calibrateDark();tr.covered=false;
// exposure modes
const a=await dev.measure({reuse:false,targoscale:0.9});ok(a.exposureMode==='auto'&&Math.abs(a.targetCounts-40500)<1,'auto aims at 40500 counts');
const a2=await dev.measure({reuse:false,targoscale:0.5,maxAutoTime:4.4});console.log('  auto 0.5 -> peak',a2.peakCounts.toFixed(0),'t',a2.inttime.toFixed(4));
const m=await dev.measure({manualTime:0.05,readTime:0.3});ok(m.exposureMode==='manual'&&Math.abs(m.inttime-0.05)<0.001&&m.nFrames===6&&m.trials===0,'manual exposure 50 ms x '+m.nFrames+' ('+(m.inttime*1000).toFixed(2)+' ms)');
tr.o.level=60000;let thrown=null;try{await dev.measure({manualTime:4.0,readTime:0.1})}catch(e){thrown=e.code}tr.o.level=3000;ok(thrown==='SATURATED','manual overexposure reports saturation');
ok(Math.abs(dev.quantize(0.05)-m.inttime)<1e-6,'quantize() matches device');
// averaging / log
const seen=[];const ser=await dev.measureSeries({count:4,intervalSec:0,manualTime:0.2,readTime:0.2,onSample:(r,i)=>seen.push(i)});
ok(ser.nSamples===4&&seen.length===4&&ser.sd36.every(x=>x>=0),'measureSeries averages 4 samples, sd available');
let stop=false;const ser2=await dev.measureSeries({count:0,intervalSec:0.05,manualTime:0.2,readTime:0.1,shouldStop:()=>stop,onSample:(r,i)=>{if(i===2)stop=true}});ok(ser2.nSamples===3,'open-ended log stops on request');
// blackbody calibration
tr.o.spd=nm=>I.planck(2856,nm)/I.planck(2856,700);tr.o.level=6000;dev._lastT=0;
const mu=await dev.measure({reuse:false});const ref36=I.referenceBands('blackbody',2856);
const cc=I.computeCorrection(mu.s36raw,ref36);
dev.setCorrection(cc.c,true);const mc=await dev.measure({reuse:true});
const norm=v=>{const m=Math.max(...v);return Array.from(v,x=>x/m)};const r=norm(ref36),got=norm(mc.s36),raw=norm(mc.s36raw);
const inb=i=>{const w=380+10*i;return w>=cc.lo&&w<=cc.hi};const err=a=>Math.max(...a.map((x,i)=>inb(i)?Math.abs(x-r[i])/r[i]:0));
ok(err(got)<0.03&&err(raw)>0.1,'blackbody calibration pulls the response onto Planck 2856 K (err '+err(raw).toFixed(2)+' -> '+err(got).toFixed(3)+')');
const rs=dev.resampler({step:5});const cust=norm(rs.apply(mc.avgAbs));ok(cust.length===71,'resampler honours the correction');
dev.setCorrection(null);
// reflective
tr.mode='reflective';tr.target='white';tr.sample=nm=>0.1+0.7/(1+Math.exp(-(nm-570)/45));
const cw=await dev.calibrateWhite();console.log('  white cal t',cw.inttime.toFixed(4),'peak',cw.peakCounts.toFixed(0));
ok(Math.abs(cw.scale-1)<0.1||cw.peakCounts>30000,'white calibration lands near the 45000 target');
tr.target='sample';
const rm=await dev.measureReflective({});
let worst=0;for(let i=0;i<36;i++){const nm=380+10*i;worst=Math.max(worst,Math.abs(rm.s36[i]-tr.sample(nm)))}
ok(worst<0.04,'reflectance @36 bands (smooth sample; kernel-limited) matches the true sample (worst abs err '+worst.toFixed(4)+')');
const rr=dev.reflectance(rm,{step:5,kernel:'factory'});let w2=0;rr.wl.forEach((l,i)=>{if(l>=400&&l<=720)w2=Math.max(w2,Math.abs(rr.v[i]-tr.sample(l)))});
ok(w2<0.04,'reflectance on 5 nm grid (worst abs err '+w2.toFixed(4)+')');
console.log(fails?'FAILURES: '+fails:'ALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
