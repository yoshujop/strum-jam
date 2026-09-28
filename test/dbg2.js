const fsx=require('fs');
let code=fsx.readFileSync('eartest.js','utf8');
code=code.slice(0, code.indexOf("const CHORDS =")).replace(/^const /gm,'var ').replace(/^let /gm,'var ');
eval(code);
const which = process.argv[2] || 'G', micN = process.argv[3] || 'studio';
const target=chordMidis(which);
seed=3;
const sig=addNoise(MICS[micN](room(strum(target,1.6))),0.002);
for (let t=0.5;t<=1.4;t+=0.3){ const end=Math.round(t*SR); const an=Ear.analyze(sig.subarray(0,end),SR,null); const r=Ear.matchTarget(an,{midis:target},'normal');
 const R=an.R0; const top=[...R].map((v,m)=>[m,v]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,18).map(([m,v])=>T.noteName(m)+(Math.floor(m/12)-1)+':'+v.toFixed(3));
 console.log(t.toFixed(2),'fit',r.fit.toFixed(2),'ok',r.ok,'wrong',r.wrongNotes.map(m=>T.noteName(m)+(Math.floor(m/12)-1)),'\n  top',top.join(' ')); }
