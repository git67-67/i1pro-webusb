const fs=require('fs');const {b64,eepromBytes,I,SimTransport}=require('./helpers.js');let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
(async()=>{
const ee=eepromBytes();
const cal=I.decodeEEPROM(ee);
console.log('serial',cal.serial,'sat',cal.sat0,'target',cal.sensTarget,'idx0',cal.index[0],'emis0',cal.emis[0].toFixed(6));
// optional: compare with a real spotread -D9 log (set I1P_ARGYLL_LOG=path/to/log.txt)
if(process.env.I1P_ARGYLL_LOG){
const txt=fs.readFileSync(process.env.I1P_ARGYLL_LOG,'utf8');
const abs=new Float64Array(128);for(const m of txt.matchAll(/^\s+(\d+):rval\s+0x[0-9a-f]+.*?absval\s+([-\d.]+)/gm))abs[+m[1]]=+m[2];
abs[0]=abs[1];abs[127]=abs[126];
const ref=txt.match(/in 36 steps\n([^\n]+)/)[1].split(',').map(Number);
const mine=I.bands36(cal,abs);let mx=0;for(let i=0;i<36;i++)mx=Math.max(mx,Math.abs(mine[i]-ref[i]));
console.log('36-band result vs Argyll, max abs diff',mx.toFixed(4));}
ok(cal.serial===715997&&cal.sat0>0&&cal.sensTarget>0,'EEPROM decodes (serial, saturation, target)');
// fits
const t0=Date.now();const fits=I.fitAllBands(cal);ok(Math.min(...fits.map(f=>f.r2))>=0.995,'all 36 band shapes fit with R2 >= 0.995');console.log('fit ms',Date.now()-t0,'min R2',Math.min(...fits.map(f=>f.r2)).toFixed(5),'band560',fits[18].WL.toFixed(2),fits[18].x0off.toFixed(2));
// sim end to end
const spd=nm=>Math.exp(-0.5*((nm-450)/10)**2)+0.7*Math.exp(-0.5*((nm-560)/45)**2)+0.35*Math.exp(-0.5*((nm-630)/30)**2);
for(const level of [3000,60,400000]){
 const tr=new SimTransport({eepromB64:b64,level,spd});
 const dev=new I.I1ProDevice(tr);const info=await dev.init();
 tr.covered=true;await dev.calibrateDark();tr.covered=false;
 const r=await dev.measure({});
 const truth=new Float64Array(128);for(let p=0;p<128;p++)truth[p]=level*spd(cal.pxnm[p]);truth[0]=truth[1];truth[127]=truth[126];
 const exp=I.bands36(cal,truth);let worst=0,pk=0;for(let i=0;i<36;i++){pk=Math.max(pk,Math.abs(exp[i]));}
 for(let i=0;i<36;i++)worst=Math.max(worst,Math.abs(r.s36[i]-exp[i])/pk);
 ok(worst<(level<100?0.05:0.02),'level '+level+': 36-band result close to exact (worst '+(worst*100).toFixed(2)+'% of peak'+(level<100?', very dim: noise-limited':'')+')');
 console.log('level',level,'inttime',r.inttime.toFixed(4),'frames',r.nFrames,'peak',r.peakCounts.toFixed(0),'worst err/peak',(worst*100).toFixed(2)+'%','reads',tr.stats.reads);
 const r2=await dev.measure({});console.log('  repeat (reuse):',r2.reusedExposure,'trials',r2.trials,'reads total',tr.stats.reads);
 if(level===3000){
  const rs=dev.resampler({step:10,kernel:'factory'});const v=rs.apply(r.avgAbs);let w=0;for(let i=0;i<36;i++)w=Math.max(w,Math.abs(v[i]-r.s36[i])/pk);
  ok(w<0.01,'resampler at 10 nm / factory kernel reproduces the bands (worst '+(w*100).toFixed(2)+'% of peak)');
  for(const k of ['factory','sinc','triangle','gaussian']){const q=dev.resampler({step:1,kernel:k,fwhm:k==='factory'?0:8});const y=q.apply(r.avgAbs);console.log('  1nm',k,'n',y.length,'val@450',y[70].toFixed(4),'val@560',y[180].toFixed(4));}
 }
}
console.log(fails?'FAILURES: '+fails:'ALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
