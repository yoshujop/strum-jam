// The game's own sound (drums, clicks, effects) leaking from speakers into the mic, while the player does NOTHING
// (or plays single notes). Counts how often the fretboard shows notes that were not played.
const { chromium } = require('playwright');
const wav = process.argv[2] || 'silence.wav', secs = +(process.argv[3] || 30), level = +(process.argv[4] || 2);
(async()=>{const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+__dirname+'/'+wav,'--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+__dirname+'/../dist/strum-jam.html');await p.waitForTimeout(800);await p.click('#btn-start',{force:true});
for(let w=0;w<30&&!(await p.evaluate(()=>Listen.ready));w++)await p.waitForTimeout(300);
await p.click('text=Chord Drill: G, C, D');await p.waitForTimeout(400);await p.evaluate(()=>{Settings.tuneFirst=false;});await p.click('#btn-practice');await p.waitForTimeout(800);
await p.evaluate(lv => { // leak: the game's output goes into the mic chain at a speaker-ish level, plus some room reverb
  const ctx = AudioEngine.ctx, g = ctx.createGain(); g.gain.value = 0.5; AudioEngine.master.connect(g);
  const d = ctx.createDelay(0.1); d.delayTime.value = 0.023; g.connect(d);
  if (Listen.node) d.connect(Listen.node); d.connect(Mic.anLong); d.connect(Mic.anSmall);
  G.hype = [0.05, 0.3, 0.5, 0.7, 0.95][lv]; G.setLevel(lv); G.practiceSuccess = function(){};   // stay on G
  Sfx.gotIt && setInterval(() => { Sfx.gotIt(3); }, 4000);        // effects that play after a success
}, level);
const shows = { green: 0, red: 0, wrong: 0, samples: 0, wrongNotes: {} , strums: 0};
for (let i = 0; i < secs * 4; i++) { await p.waitForTimeout(250);
  const f = await p.evaluate(() => ({ fb: G.fb ? { s: G.fb.states.slice(), w: G.fb.wrong.map(w => midiName(w.midi)) } : null, n: Listen.strums.length, now: Listen.now().map(o => midiName(o.m)).join(' ') }));
  if (f.now) shows.nowNotes = (shows.nowNotes || '') + '[' + f.now + ']';
  if (f.fb) f.fb.s.forEach((x, i) => { if (x === 'heard') shows['str' + i] = (shows['str' + i] || 0) + 1; });
  shows.samples++; shows.strums = f.n; if (f.fb) { if (f.fb.s.includes('heard')) shows.green++; if (f.fb.s.includes('miss')) shows.red++; if (f.fb.w.length) { shows.wrong++; for (const w of f.fb.w) shows.wrongNotes[w] = (shows.wrongNotes[w] || 0) + 1; } } }
console.log(wav, 'level', level, JSON.stringify(shows)); console.log('ERR', errs.join(';')); await b.close();})();
