/* =====================================================================
   Story intros: before a Story song's Stage run, a short backstage scene.
   The artist (a cartoon performer drawn in the game's own style, coloured
   from their name and the era's palette) says a few lines about this
   moment in their career, typed out with a burbly made-up voice.
   The lines come from Claude when it's set up (grounded in the public
   story of that song and era, first person, no lyrics), otherwise from a
   built-in script that uses the era, album and year. Cached per song.
   Shown once per song per session; Skip is always there.
   ===================================================================== */
const Intro = {
  seen: new Set(), running: null,
  key(c, L, s){ return 'intro:' + (c.artist + '|' + s.title).toLowerCase(); },
  should(ctx){ const c = Story.get(ctx.careerId), L = c && c.levels[ctx.li], s = L && L.songs[ctx.si]; return !!(s && Settings.storyIntros !== false && !this.seen.has(this.key(c, L, s))); },

  /* ---------- the words ---------- */
  template(c, L, s, li, n){
    const t = `“${s.title}”`, al = s.album && s.album !== s.title ? `“${s.album}”` : '', yr = s.year || L.years || '';
    const stage = li === 0 ? 0 : li >= n - 1 ? 3 : li / (n - 1) < 0.5 ? 1 : 2;
    const pick = arr => arr[Lookup.fnv(s.title + c.artist) % arr.length];
    return [
      pick([`This is it. ${yr ? yr + '. ' : ''}Nobody out there knows my name yet, but they came tonight, and I’m giving them ${t}. After this, they won’t forget it.`,
            `First real stage. For years it was cramped rooms and people who didn’t listen. Tonight I walk out there with ${t} and I find out if all of it was worth it.`]),
      pick([`${al ? al + ' changed things. ' : ''}The rooms are bigger now and so are the doubts. They want to know if the first time was luck. ${t} is my answer.`,
            `People are starting to sing my songs back to me. That’s a whole new kind of pressure. Let’s see if ${t} hits as hard out there as it does in my head.`]),
      pick([`${L.name ? L.name + '. ' : ''}Everyone says I’m at the top now, so of course they’re waiting for the fall. Not tonight. ${t}, loud as it goes.`,
            `I changed my sound${al ? ' for ' + al : ''} and half the room thinks I lost it. Good. ${t} is where I prove the new me is the real me.`]),
      pick([`All these years, all these stages. I don’t need to prove anything anymore, so tonight ${t} is just for the people who stayed with me from the start.`,
            `This one feels like a full circle. Every city, every mistake, every sold-out night led to right here. ${t}. Let’s make it count.`]),
    ][stage];
  },
  async words(ctx){
    const c = Story.get(ctx.careerId), L = c.levels[ctx.li], s = L.songs[ctx.si], k = this.key(c, L, s);
    const cached = Store.get(k, null); if (cached && cached.speech) return cached.speech;
    const fallback = this.template(c, L, s, ctx.li, c.levels.length);
    // Claude, when this browser has it (the player's own key, or the claude.ai viewer); a few seconds at most
    if (UI.sample || (!UI.inViewer && Settings.apiKey)) {
      const prompt = `You write the short backstage monologue that plays before a level in a rhythm game's career mode.
Speaker: ${c.artist}, in the first person, moments before walking on stage to perform "${s.title}"${s.album ? ` (from ${s.album}` + (s.year ? `, ${s.year})` : ')') : ''}.
Career chapter: ${L.name || ''}${L.years ? ' (' + L.years + ')' : ''}. This is level ${ctx.li + 1} of ${c.levels.length}.
Ground it in the real, publicly known story of this point in their career and what the song is about (the struggle, the doubts, the turning point).
Rules: 2 to 3 sentences, 45 to 75 words, dramatic and personal, present tense. Do not quote or paraphrase any lyrics. No invented private events, no insults to real people.
Reply with JSON only: {"speech": "..."}`;
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 9000);
        const j = await UI.askClaude(prompt, ctl.signal, 'fast'); clearTimeout(tm);
        const sp = j && typeof j.speech === 'string' ? j.speech.replace(/\s+/g, ' ').trim().slice(0, 520) : '';
        if (sp.length > 30) { Store.set(k, { speech: sp, at: Date.now() }); return sp; }
      } catch (e) { /* the built-in script it is */ }
    }
    return fallback;
  },

  /* ---------- the voice: one burble per syllable, pitched from the letter ---------- */
  blip(ch, base){
    if (!Settings.sfxOn) return;
    const ctx = AudioEngine.ensure(), t = ctx.currentTime + 0.005, v = 'aeiouy'.includes(ch.toLowerCase());
    const f = base * Math.pow(2, ((ch.toLowerCase().charCodeAt(0) * 7) % 12) / 24) * (v ? 1.12 : 1);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
    o.type = 'square'; o2.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (v ? 1.18 : 0.9), t + 0.06);
    o2.frequency.setValueAtTime(f * 2, t); bp.type = 'bandpass'; bp.frequency.value = v ? 1400 : 900; bp.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * (Settings.sfxVol == null ? 0.7 : Settings.sfxVol), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.connect(bp); o2.connect(bp); bp.connect(g).connect(AudioEngine.master || ctx.destination);
    o.start(t); o2.start(t); o.stop(t + 0.09); o2.stop(t + 0.09);
  },

  /* ---------- the scene ---------- */
  look(c, L){
    const h = Lookup.fnv(c.artist), pal = (L.scene && L.scene.palette) || ['#FF5E7E', '#2EC4B6', '#FFCE3A', '#7B5CF0'];
    const skins = ['#8D5524', '#C68642', '#E0AC69', '#F1C27D', '#FFDBAC', '#6B3F1F'], hairs = ['#1E1B2E', '#3B2A1E', '#7A4A1E', '#C9A14A', '#E8E0D0', '#B8323C'];
    return { skin: skins[h % skins.length], hair: hairs[(h >> 3) % hairs.length], style: (h >> 6) % 5, coat: pal[(h >> 9) % pal.length], trim: pal[((h >> 9) + 1) % pal.length],
      shades: (h >> 12) % 3 === 0, base: 170 + (h % 120) };
  },
  drawScene(cv, t, st){
    const c = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1), r = cv.getBoundingClientRect(), W = r.width, H = r.height;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const pal = st.pal;
    // backstage: the era's colour washed dark, light spilling in from the stage on the right, velvet curtain edges
    const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#1A1530'); g.addColorStop(1, '#2D2150'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const spill = c.createRadialGradient(W * 1.05, H * 0.45, 0, W * 1.05, H * 0.45, W * 0.75); spill.addColorStop(0, 'rgba(255,230,160,.55)'); spill.addColorStop(1, 'rgba(255,230,160,0)'); c.fillStyle = spill; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.18; c.fillStyle = pal[0]; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    // a road case with stickers, a mic stand, cables: the wings
    const F = Math.min(H * 0.9, (st.talkTop || H * 0.7) - 10);          // the floor meets the artist's feet, just above the dialogue box c.fillStyle = '#15111F'; c.fillRect(0, F, W, H - F); c.strokeStyle = COL.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(0, F); c.lineTo(W, F); c.stroke();
    c.fillStyle = '#2A2438'; rr(c, W * 0.06, F - H * 0.2, W * 0.2, H * 0.2, 8); c.fill(); c.stroke();
    c.fillStyle = '#9A94B0'; for (const [x, y] of [[0.08, 0.2], [0.24, 0.2], [0.08, 0.02], [0.24, 0.02]]) { c.fillRect(W * x - 5, F - H * y - 5, 10, 10); }
    [[0.1, 0.13, pal[1]], [0.17, 0.09, pal[2]], [0.21, 0.15, pal[3] || pal[0]]].forEach(([x, y, col], k) => { c.save(); c.translate(W * x, F - H * y); c.rotate((k - 1) * 0.2); c.fillStyle = col; rr(c, -14, -9, 28, 18, 5); c.fill(); c.lineWidth = 2; c.stroke(); c.restore(); });
    c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.82, F); c.lineTo(W * 0.82, F - H * 0.5); c.stroke(); c.beginPath(); c.moveTo(W * 0.74, F); c.lineTo(W * 0.9, F); c.stroke();
    c.fillStyle = '#C9C4D8'; c.beginPath(); c.arc(W * 0.82, F - H * 0.52, 9, 0, Math.PI * 2); c.fill(); c.stroke();
    for (const side of [0, 1]) { const x0 = side ? W - W * 0.07 : 0; const cg = c.createLinearGradient(x0, 0, x0 + W * 0.07, 0); cg.addColorStop(0, '#6E1026'); cg.addColorStop(0.5, '#A8203C'); cg.addColorStop(1, '#6E1026');
      c.fillStyle = cg; c.fillRect(x0, 0, W * 0.07, H); c.strokeStyle = 'rgba(30,27,46,.5)'; c.lineWidth = 2; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x0 + k * W * 0.0175, 0); c.lineTo(x0 + k * W * 0.0175, H); c.stroke(); } }
    // the artist, standing just above the dialogue box, sized to the room between the title and it
    const topY = st.topY || H * 0.12, foot = F, s = Math.max(80, Math.min((foot - topY) / 1.3, W * 0.5)), x = W * 0.5;
    const talk = st.talking && !reduceMotion ? Math.abs(Math.sin(t * 18)) : 0;
    c.fillStyle = 'rgba(255,230,160,.12)'; c.beginPath(); c.ellipse(x, foot, s * 0.7, s * 0.12, 0, 0, Math.PI * 2); c.fill();
    drawStar(c, x, foot, s, { ...st.look, t, talk, gesture: st.gesture, blink: (t % 3.3) < 0.12 });
  },

  /* ---------- the run ---------- */
  show(ctx){
    const c = Story.get(ctx.careerId), L = c && c.levels[ctx.li], s = L && L.songs[ctx.si];
    if (!s) return Promise.resolve();
    this.seen.add(this.key(c, L, s));
    return new Promise(done => {
      const box = $('m-intro'), cv = $('intro-cv'), txt = $('intro-text');
      box.hidden = false; UI.openModal = 'm-intro';
      $('intro-name').textContent = c.artist; $('intro-where').textContent = `Level ${ctx.li + 1} · ${L.name || ''}${L.years ? ' · ' + L.years : ''}`;
      $('intro-song').textContent = `Next up: ${s.title}`;
      txt.textContent = ''; txt.classList.add('wait');
      const st = { look: this.look(c, L), pal: (L.scene && L.scene.palette) || ['#FF5E7E', '#2EC4B6', '#FFCE3A', '#7B5CF0'], talking: false, gesture: 0 };
      let raf = 0, alive = true, full = '', shown = 0, nextAt = 0;
      const t0 = performance.now();
      const frame = () => {
        if (!alive) return;
        if (box.hidden) { alive = false; return; }            // closed with Escape: back to the song screen
        const t = (performance.now() - t0) / 1000;
        if (full && shown < full.length && t >= nextAt) {
          const ch = full[shown++]; txt.textContent = full.slice(0, shown);
          st.talking = true;
          if (/[a-z]/i.test(ch) && shown % 2) this.blip(ch, st.look.base);
          nextAt = t + (/[.!?]/.test(ch) ? 0.32 : /[,;:—]/.test(ch) ? 0.16 : 0.032);
          if (/[.!?]/.test(ch)) st.gesture = (st.gesture + 1) % 3;
        } else if (full && shown >= full.length) st.talking = false;
        else if (full) st.talking = t < nextAt - 0.1 ? false : st.talking;
        { const cr = cv.getBoundingClientRect(), tr = box.querySelector('.intro-talk').getBoundingClientRect(), hr = box.querySelector('.intro-top').getBoundingClientRect(); st.talkTop = tr.top - cr.top - 14; st.topY = hr.bottom - cr.top + 6; }
        this.drawScene(cv, t, st);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      this.words(ctx).then(w => { full = w; txt.classList.remove('wait'); });
      const finish = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); box.hidden = true; if (UI.openModal === 'm-intro') UI.openModal = null; done(); };
      $('btn-intro-go').onclick = () => { if (full && shown < full.length) { shown = full.length; txt.textContent = full; st.talking = false; return; } Sfx.found && Sfx.found(); finish(); };
      $('btn-intro-skip').onclick = () => finish();
    });
  },
};

/* A performer in the band's style: one tall bean (head and body in a single ink outline, like Bo), a jacket with a
   V collar, a hairdo, optional shades, thin arms with round hands, sneakers. The mouth flaps with the voice.
   o: {skin, hair, style (0 afro, 1 pompadour, 2 long, 3 cap, 4 buzz), coat, trim, shades, t, talk (0..1), gesture (0..2), blink} */
function drawStar(c, x, footY, s, o){
  const lw = Math.max(3, s * 0.03), ink = COL.ink, t = o.t || 0;
  const bob = reduceMotion ? 0 : Math.sin(t * 2.4) * s * 0.012, lean = reduceMotion ? 0 : Math.sin(t * 1.3) * 0.025 + (o.talk ? 0.02 : 0);
  c.save(); c.translate(x, footY); c.lineWidth = lw; c.strokeStyle = ink; c.lineJoin = 'round'; c.lineCap = 'round';
  c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 0, s * 0.3, s * 0.05, 0, 0, Math.PI * 2); c.fill();
  // legs + sneakers
  c.lineWidth = lw * 1.1; c.beginPath(); c.moveTo(-s * 0.08, -s * 0.24); c.lineTo(-s * 0.1, -s * 0.04); c.moveTo(s * 0.08, -s * 0.24); c.lineTo(s * 0.1, -s * 0.04); c.stroke(); c.lineWidth = lw;
  for (const sx of [-1, 1]) { c.fillStyle = '#F4F1FA'; c.beginPath(); c.ellipse(sx * s * 0.13, -s * 0.035, s * 0.085, s * 0.042, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = o.trim; c.fillRect(sx * s * 0.13 - s * 0.05, -s * 0.045, s * 0.1, s * 0.012); }
  c.translate(0, bob); c.rotate(lean);
  const cx = 0, cy = -s * 0.68, rw = s * 0.27, rh = s * 0.48;                       // the bean
  const bean = () => { c.beginPath(); c.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); };
  // hair that sits behind the bean
  if (o.style === 0) { c.fillStyle = o.hair; c.beginPath(); for (let k = 0; k < 9; k++) { const a = Math.PI * (1.02 + k * 0.12); c.moveTo(cx + Math.cos(a) * rw * 1.02 + rw * 0.36, cy - rh * 0.55 + Math.sin(a) * rh * 0.5); c.arc(cx + Math.cos(a) * rw * 1.02, cy - rh * 0.55 + Math.sin(a) * rh * 0.5, rw * 0.36, 0, Math.PI * 2); } c.fill(); c.stroke(); }
  if (o.style === 2) { c.fillStyle = o.hair; c.beginPath(); c.moveTo(cx - rw * 1.08, cy - rh * 0.1); c.quadraticCurveTo(cx - rw * 1.25, cy + rh * 0.35, cx - rw * 0.8, cy + rh * 0.3); c.lineTo(cx + rw * 0.8, cy + rh * 0.3);
    c.quadraticCurveTo(cx + rw * 1.25, cy + rh * 0.35, cx + rw * 1.08, cy - rh * 0.1); c.quadraticCurveTo(cx + rw, cy - rh * 1.08, cx, cy - rh * 1.08); c.quadraticCurveTo(cx - rw, cy - rh * 1.08, cx - rw * 1.08, cy - rh * 0.1); c.closePath(); c.fill(); c.stroke(); }
  // the bean: skin on top, the jacket below (one shadow tone), one outline round both
  c.save(); bean(); c.clip();
  c.fillStyle = o.skin; c.fillRect(cx - rw, cy - rh, rw * 2, rh * 2);
  c.fillStyle = o.coat; c.beginPath(); c.moveTo(cx - rw * 1.1, cy + rh * 0.02); c.quadraticCurveTo(cx - rw * 0.4, cy - rh * 0.02, cx, cy + rh * 0.22); c.quadraticCurveTo(cx + rw * 0.4, cy - rh * 0.02, cx + rw * 1.1, cy + rh * 0.02); c.lineTo(cx + rw * 1.1, cy + rh * 1.1); c.lineTo(cx - rw * 1.1, cy + rh * 1.1); c.closePath(); c.fill();
  c.strokeStyle = ink; c.lineWidth = lw * 0.9; c.stroke();
  c.fillStyle = o.trim; c.beginPath(); c.moveTo(cx - rw * 0.14, cy + rh * 0.14); c.lineTo(cx, cy + rh * 0.22); c.lineTo(cx + rw * 0.14, cy + rh * 0.14); c.lineTo(cx + rw * 0.08, cy + rh * 1.1); c.lineTo(cx - rw * 0.08, cy + rh * 1.1); c.closePath(); c.fill();
  c.fillStyle = 'rgba(30,27,46,.18)'; c.beginPath(); c.ellipse(cx + rw * 0.95, cy + rh * 0.1, rw * 0.5, rh * 1.2, 0, 0, Math.PI * 2); c.fill();      // shadow side
  c.restore();
  bean(); c.lineWidth = lw; c.strokeStyle = ink; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = lw * 1.1; c.beginPath(); c.arc(cx - rw * 0.45, cy - rh * 0.62, rw * 0.3, Math.PI * 1.1, Math.PI * 1.5); c.stroke(); c.strokeStyle = ink; c.lineWidth = lw;
  // hair on top
  const top = cy - rh;
  if (o.style === 0 || o.style === 2) { c.fillStyle = o.hair; c.beginPath(); c.ellipse(cx, top + rh * 0.12, rw * 0.92, rh * 0.2, 0, Math.PI, 0); c.closePath(); c.fill(); }
  if (o.style === 1) { c.fillStyle = o.hair; c.beginPath(); c.moveTo(cx - rw * 0.95, top + rh * 0.3); c.quadraticCurveTo(cx - rw, top - rh * 0.08, cx - rw * 0.2, top - rh * 0.1);
    c.quadraticCurveTo(cx + rw * 0.9, top - rh * 0.28, cx + rw * 1.1, top + rh * 0.02); c.quadraticCurveTo(cx + rw * 0.5, top - rh * 0.02, cx + rw * 0.2, top + rh * 0.12); c.quadraticCurveTo(cx - rw * 0.4, top + rh * 0.06, cx - rw * 0.95, top + rh * 0.3); c.closePath(); c.fill(); c.stroke(); }
  if (o.style === 3) { c.fillStyle = o.trim; c.beginPath(); c.ellipse(cx, top + rh * 0.14, rw * 0.95, rh * 0.2, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(cx - rw * 0.6, top + rh * 0.12); c.quadraticCurveTo(cx - rw * 1.3, top + rh * 0.1, cx - rw * 1.35, top + rh * 0.2); c.lineWidth = lw * 1.8; c.stroke(); c.lineWidth = lw; }
  if (o.style === 4) { c.fillStyle = o.hair; c.save(); bean(); c.clip(); c.beginPath(); c.ellipse(cx, top + rh * 0.08, rw * 1.1, rh * 0.18, 0, 0, Math.PI * 2); c.fill(); c.restore(); bean(); c.stroke(); }
  // face
  const ey = cy - rh * 0.45;
  if (o.shades) { c.fillStyle = ink; rr(c, cx - rw * 0.72, ey - rh * 0.08, rw * 0.62, rh * 0.17, rh * 0.06); c.fill(); rr(c, cx + rw * 0.1, ey - rh * 0.08, rw * 0.62, rh * 0.17, rh * 0.06); c.fill();
    c.fillRect(cx - rw * 0.12, ey - rh * 0.04, rw * 0.24, lw * 0.8); c.strokeStyle = 'rgba(255,255,255,.65)'; c.lineWidth = lw * 0.6; c.beginPath(); c.moveTo(cx - rw * 0.6, ey - rh * 0.02); c.lineTo(cx - rw * 0.45, ey - rh * 0.05); c.stroke(); c.strokeStyle = ink; c.lineWidth = lw; }
  else for (const sx of [-0.36, 0.36]) { if (o.blink) { c.beginPath(); c.moveTo(cx + sx * rw - rw * 0.12, ey); c.lineTo(cx + sx * rw + rw * 0.12, ey); c.stroke(); continue; }
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(cx + sx * rw, ey, rw * 0.15, rh * 0.1, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = ink; c.beginPath(); c.arc(cx + sx * rw + rw * 0.04, ey + rh * 0.01, rw * 0.07, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(226,122,106,.45)'; for (const sx of [-0.6, 0.6]) { c.beginPath(); c.ellipse(cx + sx * rw, ey + rh * 0.14, rw * 0.13, rh * 0.04, 0, 0, Math.PI * 2); c.fill(); }
  const my = ey + rh * 0.24, open = o.talk || 0;
  if (open > 0.1) { c.fillStyle = '#5A0F1E'; c.beginPath(); c.ellipse(cx, my, rw * (0.16 + open * 0.05), rh * (0.03 + open * 0.08), 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#FF6F8E'; c.beginPath(); c.ellipse(cx, my + rh * (0.02 + open * 0.04), rw * 0.1, rh * 0.025 * open + 0.1, 0, 0, Math.PI * 2); c.fill(); }
  else { c.beginPath(); c.arc(cx, my - rh * 0.03, rw * 0.16, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); }
  // arms: one hand talks (a new pose on each sentence), the other rests on the hip
  const g = o.gesture || 0, lift = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.2) * (o.talk ? 1 : 0.25);
  const sh = [cx + rw * 0.9, cy + rh * 0.12], hand = [[cx + rw * 1.75, cy - rh * 0.1 - lift * rh * 0.12], [cx + rw * 1.45, cy - rh * 0.5], [cx + rw * 1.9, cy + rh * 0.2 - lift * rh * 0.06]][g];
  c.lineWidth = lw * 1.1; c.beginPath(); c.moveTo(sh[0], sh[1]); c.quadraticCurveTo(cx + rw * 1.5, cy + rh * 0.3, hand[0], hand[1]); c.stroke();
  c.beginPath(); c.moveTo(cx - rw * 0.9, cy + rh * 0.12); c.quadraticCurveTo(cx - rw * 1.6, cy + rh * 0.25, cx - rw * 1.05, cy + rh * 0.45); c.stroke(); c.lineWidth = lw;
  c.fillStyle = o.skin; c.beginPath(); c.arc(hand[0], hand[1], rw * 0.2, 0, Math.PI * 2); c.fill(); c.stroke();
  c.restore();
}

// Story songs: the intro plays before the first Stage run of each song in a session
UI.storyIntro = async function(mode){
  if (mode !== 'stage' || !this.storyCtx || !Intro.should(this.storyCtx)) return;
  await Intro.show(this.storyCtx);
};
