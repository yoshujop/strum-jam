const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+__dirname+'/real_right.wav']});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text().slice(0,200))});
await p.goto('file://'+__dirname+'/../dist/strum-jam.html');
for(let i=0;i<20;i++){await p.waitForTimeout(500);const s=await p.evaluate(()=>({ready:Listen.ready,loading:Listen.loading,failed:Listen.failed,backend:Listen.backend,ms:Math.round(Listen.ms)}));if(s.ready||s.failed){console.log(JSON.stringify(s));break;}}
console.log('ERR',errs.slice(0,5).join('\n'));await b.close();})();
