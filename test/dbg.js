const fsx=require('fs');
let code=fsx.readFileSync('eartest.js','utf8');
code=code.slice(0, code.indexOf("const CHORDS =")).replace(/^const /gm,'var ').replace(/^let /gm,'var ');
eval(code);
const target=chordMidis('Em'), played=chordMidis('E');
console.log('target', target, 'played', played);
seed=7;
const sig=addNoise(MICS.laptop(room(strum(played,1.4))),0.002);
for (let t=0.35;t<=0.9;t+=0.15){ const end=Math.round(t*SR); const an=Ear.analyze(sig.subarray(0,end),SR,null); const r=Ear.matchTarget(an,{midis:target},'normal');
 const R=an.R0; console.log(t.toFixed(2),'fit',r.fit.toFixed(2),'ok',r.ok,'state',JSON.stringify(r.noteState),'wrong',r.wrongNotes, 'R55..57',[54,55,56,57,67,68,79,80].map(m=>m+':'+R[m].toFixed(4)).join(' ')); }
