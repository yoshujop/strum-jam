const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1366,height:640}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+__dirname+'/../dist/strum-jam.html');await p.waitForTimeout(800);await p.click('#btn-start',{force:true});await p.waitForTimeout(1500);
await p.click('text=Chord Drill: G, C, D');await p.waitForTimeout(400);await p.evaluate(()=>Settings.tuneFirst=false);await p.click('#btn-practice');await p.waitForTimeout(2500);
for (const L of [0,2,4]) { await p.evaluate(L=>{G.hype=[0.05,0.45,0.95][L/2];G.setLevel(L);},L); for(let k=0;k<3;k++){ await p.waitForTimeout(170+k*90); await p.screenshot({path:`${__dirname}/shots/drum-L${L}-${k}.png`,clip:{x:350,y:60,width:700,height:260}}); } }
console.log('ERR',errs.join(';'));await b.close();})();
