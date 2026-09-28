const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});const p=await b.newPage({viewport:{width:1280,height:760}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/claude/strumjam/dist/strum-jam.html');await p.waitForTimeout(800);await p.click('#btn-start',{force:true});await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/title.png'});
await p.click('text=Chord Drill: G, C, D');await p.waitForTimeout(400);await p.evaluate(()=>Settings.tuneFirst=false);await p.click('#btn-practice');await p.waitForTimeout(3000);
for(let i=0;i<3;i++){console.log(await p.evaluate(()=>{const a=Stage.dAnims||[];return {n:a.length,rate:a[0]&&a[0].playbackRate,state:a[0]&&a[0].playState,t:a[0]&&Math.round(a[0].currentTime%4000),beat:+(((G.beatNow%8)+8)%8).toFixed(2),bpm:Math.round(60/Groove.cfg.beatDur)}}));await p.waitForTimeout(700);}
await p.evaluate(()=>G.pause());await p.waitForTimeout(300);console.log(await p.evaluate(()=>Stage.dAnims[0].playState));
console.log('ERR',errs.join(';'));await b.close();})();
