const fsx=require('fs');
let code=fsx.readFileSync('eartest.js','utf8');
code=code.slice(0, code.indexOf("const CHORDS =")).replace(/^const /gm,'var ').replace(/^let /gm,'var ');
eval(code); global.DETUNE=8;
const which = process.argv[2] || 'G', micN = process.argv[3] || 'webcam';
const target=chordMidis(which);
for (const sd of [3,5,9]) { seed=sd;
const sig=addNoise(MICS[micN](room(strum(target,1.6))),0.002);
const end=Math.round(0.9*SR); const an=Ear.analyze(sig.subarray(0,end),SR,null); const r=Ear.matchTarget(an,{midis:target},'normal');
const nm=m=>T.noteName(m)+(Math.floor(m/12)-1);
const R=an.R0; const isP=new Set(); for(const m of target) for(const o of [0,12,19,24,28,31,34,36,38,40,42,43]) isP.add(m+o);
const un=[...R].map((v,m)=>[m,v]).filter(x=>x[1]>0&&!isP.has(x[0])).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([m,v])=>nm(m)+':'+v.toFixed(3));
const ex=target.map(m=>nm(m)+':'+Math.max(R[m],R[m+12],R[m+19],R[m+24]).toFixed(3));
console.log('seed',sd,'ok',r.ok,'wrong',r.wrongNotes.map(nm),'\n expected',ex.join(' '),'\n unexplained',un.join(' '));
}
