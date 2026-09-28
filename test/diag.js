const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+__dirname+'/'+process.argv[2],'--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();
await p.goto('file://'+__dirname+'/../dist/strum-jam.html');await p.waitForTimeout(800);await p.click('#btn-start',{force:true});
for(let w=0;w<30&&!(await p.evaluate(()=>Listen.ready));w++)await p.waitForTimeout(300);
await p.click('text=Chord Drill: G, C, D');await p.waitForTimeout(400);await p.evaluate(()=>{Settings.tuneFirst=false;G.practiceSuccess=function(){};});await p.click('#btn-practice');
await p.waitForTimeout(+process.argv[3]*1000);
console.log(await p.evaluate((tg)=>{const T=tg.split(',').map(Number);const NM=m=>['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][m%12]+(Math.floor(m/12)-1);return Listen.strums.map(ts=>{const h=Listen.heard(ts+0.04,Math.min(ts+0.6,Listen.reliableT));if(!h)return ts.toFixed(2)+' -';const r=Listen.judge(h,T,'normal');return ts.toFixed(2)+' ok:'+r.ok+' fresh:'+r.fresh+' '+T.map(m=>NM(m)+' n'+h.note[m].toFixed(2)+' o'+h.onset[m].toFixed(2)+' b'+h.before[m].toFixed(2)).join(' | ')}).join('\n')},process.argv[4]));
await b.close();})();
