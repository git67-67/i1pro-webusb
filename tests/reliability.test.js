const {b64,I,SimTransport}=require('./helpers.js');let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
(async()=>{
const mk=async o=>{const tr=new SimTransport({eepromB64:b64,level:3000,sens:nm=>1+0.25*(nm-555)/175});const dev=new I.I1ProDevice(tr,Object.assign({lampOffMs:50,minTimeoutMs:300},o||{}));await dev.init();tr.covered=true;await dev.calibrateDark();tr.covered=false;return{tr,dev};};
// 1. a locked-up instrument is reset and the measurement retried once
{const {tr,dev}=await mk();tr.hang=1;const r=await dev.measure({reuse:false});
 ok(r&&r.s36&&dev.recoveries>=1&&(tr.stats.resets||0)>=1,'one hang: automatic reset + retry succeeds (recoveries='+dev.recoveries+')');
 ok(/recover/i.test(dev.diagnostics()),'diagnostic log mentions the recovery');}
// 2. persistent failure: reports a clear error with the log attached
{const {tr,dev}=await mk();tr.hang=5;let e=null;try{await dev.measure({reuse:false})}catch(x){e=x}
 ok(e&&e.code==='TIMEOUT'&&e.diag,'two failures in a row: TIMEOUT error carries the diagnostic log');}
// 3. autoRecover:false lets the first error through
{const {tr,dev}=await mk({autoRecover:false});tr.hang=1;let e=null;try{await dev.measure({reuse:false})}catch(x){e=x}
 ok(e&&e.code==='TIMEOUT'&&dev.recoveries===0,'autoRecover:false does not retry');}
// 4. stored ArgyllCMS values + presets
{const {dev}=await mk();const r=await dev.measure({reuse:false});const a=I.argyllValues(dev.cal,dev.fits,r.avgAbs,false);
 ok(a.std36.length===36&&a.hires.v.length===109&&Math.abs(a.hires.step-10/3)<1e-9,'argyllValues: 36 bands + 109-point 370-730 nm grid');
 ok(a.std36.every((v,i)=>Math.abs(v-r.s36[i])<=1e-9*Math.max(1,Math.abs(v))||!dev.userCorr),'argyllValues std36 equals the factory 36 bands');
 ok(I.RES_PRESETS.map(p=>p.id).join()==='std10,hires3,fine1,custom','resolution presets present');}
{const {dev}=await mk();const w=dev.cal.pxnm;let mono=true;for(let i=1;i<128;i++)if(!(w[i]<w[i-1]))mono=false;
 ok(mono&&dev.cal.pxnmErr<0.5,'pixel wavelengths from the matrix are monotonic and fit within 0.5 nm (rms '+dev.cal.pxnmErr.toFixed(4)+')');
 ok(Math.max(...dev.fits.map(f=>Math.abs(f.dx)))<0.5,'band kernels sit on their nominal wavelengths (no leftover offset)');
 ok((w[119]-w[120])>3.4&&(w[13]-w[14])<3.3,'spacing is wider in the blue than in the red');}
{const {dev}=await mk();const c=dev.cal,G=(m,w)=>nm=>Math.exp(-0.5*((nm-m)/w)**2);
 const w=I.argyllFilter(c.pxnm,550,10/3);ok(Math.abs(w.reduce((a,b)=>a+b)-1)<1e-9,'argyll filter weights sum to 1');
 const rs=dev.resampler({lo:380,hi:730,step:10,kernel:'argyll'});
 for(const [n,f] of [['broad',G(520,30)],['narrow 8 nm',G(450,8)]]){const avg=Float64Array.from({length:128},(_,p)=>1000*f(c.pxnm[p]));const std=I.bands36(c,avg),a=rs.apply(avg),pk=Math.max(...std);
  const e=Math.max(...Array.from(a,(v,i)=>Math.abs(v-std[i])))/pk;ok(e<0.002,'argyll kernel at 10 nm reproduces the EEPROM matrix ('+n+': '+(e*100).toFixed(3)+'% of peak)');}}
{ // blackbody temperature series: steps exact, absolute value from an anchor
 const Ts=[2400,2650,2900,3150];let r=7;const rnd=()=>{r=(r*1103515245+12345)&0x7fffffff;return r/0x7fffffff-0.5};
 const mkI=tilt=>Ts.map((T,i)=>({v:I.WL36.map(nm=>(1+0.004*rnd())*Math.exp(tilt*(1e3/nm-1.8)+0.05*Math.sin(nm/40))*(0.6+0.0003*(nm-380))*I.planck(T,nm)*(i+1)*1e-9)}));
 const it=mkI(0.15),a=I.fitBlackbodyTemperatures(it,{anchorIndex:0,anchorT:2400}),g=I.fitBlackbodyTemperatures(it,{});
 ok(a.T.every((x,i)=>Math.abs(x-Ts[i])<15),'temperature series with an anchor recovers the true temperatures ('+a.T.map(x=>x.toFixed(0)).join(', ')+')');
 const inv=x=>1e6*(1/x-1/g.T[0]),invT=x=>1e6*(1/x-1/Ts[0]);
 ok(g.T.every((x,i)=>Math.abs(inv(x)-invT(Ts[i]))<1.5),'without an anchor the steps in 1/T are still right');
 ok(a.gauge==='anchor'&&g.gauge==='grey','gauge reported');
 let e=null;try{I.fitBlackbodyTemperatures(it.slice(0,1),{})}catch(x){e=x}ok(e&&e.code==='CALSIGNAL','one measurement is rejected');
 // absolute level: a laser line of known power
 const {dev}=await mk();const c=dev.cal;
 const rs=dev.resampler({lo:380,hi:730,step:0.5,kernel:'argyll',argyllWidth:3.33});
 const line=Float64Array.from({length:128},(_,p)=>1000*Math.exp(-0.5*((c.pxnm[p]-532)/1.5)**2));
 const v=Array.from(rs.apply(line)),wl=Array.from(rs.wl),E=I.bandIntegral(wl,v,517,547);
 const k=I.absoluteFactor(E,5);dev.setAbsCal(k,true,{});const E2=I.bandIntegral(wl,Array.from(dev.resampler({lo:380,hi:730,step:0.5,kernel:'argyll',argyllWidth:3.33}).apply(line)),517,547);
 ok(Math.abs(E2-5)<1e-9,'absolute factor makes the integrated line equal the known power');
 ok(dev.effectiveCorrection().every(x=>Math.abs(x-k)<1e-12),'abs factor reaches the resampler');dev.setAbsCal(k,false);ok(dev.effectiveCorrection()===null,'disabled factor is not applied');
}
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
})();
