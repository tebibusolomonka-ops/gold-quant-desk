const fs = require('fs');
const dataPath = require('./_data');
const bars = JSON.parse(fs.readFileSync(dataPath('xauusd_d1.json')));
const n = bars.length, C = bars.map(b=>b.close), H = bars.map(b=>b.high), L = bars.map(b=>b.low), T = bars.map(b=>b.timestamp);
const ret = C.map((c,i)=>i?Math.log(c/C[i-1]):0);
const tr = bars.map((b,i)=>i?Math.max(H[i]-L[i],Math.abs(H[i]-C[i-1]),Math.abs(L[i]-C[i-1])):H[i]-L[i]);
const atr = []; let s=0; for(let i=0;i<n;i++){ if(i<14){s+=tr[i];atr.push(i===13?s/14:NaN);} else atr.push((atr[i-1]*13+tr[i])/14); }
// forward 1-day return when day i is Thursday close -> Friday (DOW of i+1 = 5)
const xs=[], years={};
for(let i=300;i<n-1;i++){
  if(new Date(T[i+1]).getUTCDay()!==5) continue;
  const x = ret[i+1]/(atr[i]/C[i]);
  xs.push(x);
  const y = new Date(T[i+1]).getUTCFullYear(); (years[y] ||= []).push(x);
}
const m = xs.reduce((a,b)=>a+b,0)/xs.length;
const sd = Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/(xs.length-1));
console.log(`ALL 2003-2026: n=${xs.length} Fridays  mean=+${m.toFixed(4)} ATR  t=${(m/(sd/Math.sqrt(xs.length))).toFixed(2)}`);
let pos=0, tot=0;
for(const y of Object.keys(years).sort()){ const a=years[y]; const mm=a.reduce((x,z)=>x+z,0)/a.length; if(mm>0)pos++; tot++; }
console.log(`years with positive Friday mean: ${pos}/${tot}`);
// in dollar terms at current ATR
console.log(`at today's ATR ~$45: ~ +$${(m*45).toFixed(1)}/oz per Friday`);
