/* =====================================================================
   Menu backdrop: festival-cloth waves (seigaiha) under music doodles,
   drawn in the game's ink style (flat colour, one shadow tone, thick
   outline), no two the same side by side. Built once as an SVG tile and
   used as a CSS background. Also the mode buttons' icons.
   ===================================================================== */
const MenuBG = (() => {
  const INK = '#1E1B2E', ink = w => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  // each item is drawn around (0,0) in a box about 100 units tall; s = the shadow tone clip helper
  const shade = (id, shape, col, dx, dy) => `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${shape}" transform="translate(${dx} ${dy})" fill="none"/><g clip-path="url(#${id})"><path d="${shape}" transform="translate(${dx} ${dy})" fill="${col}" opacity="0"/></g>`;
  const ITEMS = {
    acoustic: u => {
      const body = 'M0 -24 C11 -24 17 -17 15 -8 C14 -2 11 1 13 5 C27 9 25 40 0 40 C-25 40 -27 9 -13 5 C-11 1 -14 -2 -15 -8 C-17 -17 -11 -24 0 -24Z';
      return `<rect x="-4.5" y="-60" width="9" height="40" fill="#8A5530" ${ink(3.5)}/>${[-52, -45, -38, -31].map(y => `<path d="M-4.5 ${y} H4.5" ${ink(1.6)}/>`).join('')}
        <path d="M-8 -74 H8 L7 -58 H-7Z" fill="#5A3420" ${ink(3.5)}/>${[-70, -64].map(y => `<circle cx="-11" cy="${y}" r="2.6" fill="#FFF7E6" ${ink(2)}/><circle cx="11" cy="${y}" r="2.6" fill="#FFF7E6" ${ink(2)}/>`).join('')}
        <clipPath id="ac${u}"><path d="${body}"/></clipPath><path d="${body}" fill="#F2B45A"/><g clip-path="url(#ac${u})"><path d="${body}" transform="translate(9 3)" fill="#D98E34"/><path d="${body}" transform="translate(0 0)" fill="none"/></g><path d="${body}" fill="none" ${ink(3.5)}/>
        <circle cx="0" cy="6" r="7" fill="${INK}"/><circle cx="0" cy="6" r="10" fill="none" stroke="#FFF7E6" stroke-width="2"/><rect x="-9" y="24" width="18" height="5" rx="2" fill="#5A3420" ${ink(2)}/>`;
    },
    electric: u => {
      const body = 'M-4 -14 C8 -22 22 -26 23 -15 C24 -7 15 -3 18 5 C23 17 19 34 1 36 C-19 38 -27 22 -21 10 C-17 2 -25 -2 -23 -10 C-21 -18 -12 -10 -4 -14Z';
      return `<rect x="-3.5" y="-62" width="7" height="52" fill="#E8C48A" ${ink(3)}/>${[-54, -47, -40, -33, -26].map(y => `<path d="M-3.5 ${y} H3.5" ${ink(1.4)}/>`).join('')}
        <path d="M-6 -74 L8 -78 L7 -60 H-5Z" fill="#FF5E7E" ${ink(3)}/>
        <clipPath id="el${u}"><path d="${body}"/></clipPath><path d="${body}" fill="#FF5E7E"/><g clip-path="url(#el${u})"><path d="${body}" transform="translate(8 4)" fill="#D93F61"/></g><path d="${body}" fill="none" ${ink(3.5)}/>
        <path d="M-12 6 C-8 -4 8 -6 10 2 C12 14 4 22 -6 22 C-14 22 -16 14 -12 6Z" fill="#FFF7E6" ${ink(2.5)}/>
        <rect x="-8" y="0" width="14" height="5" rx="1.5" fill="${INK}"/><rect x="-8" y="10" width="14" height="5" rx="1.5" fill="${INK}"/><circle cx="12" cy="20" r="2.6" fill="#FFCE3A" ${ink(1.8)}/>`;
    },
    metronome: () => `<path d="M-12 -40 H12 L28 36 H-28Z" fill="#8FE3A0" ${ink(3.5)}/><path d="M6 -40 H12 L28 36 H16Z" fill="#6CC786"/><path d="M-12 -40 H12 L28 36 H-28Z" fill="none" ${ink(3.5)}/>
      <rect x="-20" y="16" width="40" height="20" fill="#FFF7E6" ${ink(3)}/><path d="M0 16 L14 -30" ${ink(4)}/><circle cx="9" cy="-15" r="5" fill="#FFCE3A" ${ink(2.5)}/>${[-10, -2, 6].map(y => `<path d="M-6 ${y} H-2" ${ink(2)}/>`).join('')}`,
    headphones: () => `<path d="M-26 8 V0 C-26 -34 26 -34 26 0 V8" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M-26 8 V0 C-26 -34 26 -34 26 0 V8" fill="none" stroke="#7B5CF0" stroke-width="6" stroke-linecap="round"/>
      <rect x="-37" y="0" width="17" height="30" rx="8" fill="#7B5CF0" ${ink(3.5)}/><rect x="20" y="0" width="17" height="30" rx="8" fill="#7B5CF0" ${ink(3.5)}/>
      <rect x="-24" y="4" width="6" height="22" rx="3" fill="${INK}"/><rect x="18" y="4" width="6" height="22" rx="3" fill="${INK}"/><path d="M-33 6 V22 M24 6 V22" stroke="#A48CFF" stroke-width="2.5" stroke-linecap="round"/>`,
    cassette: () => `<rect x="-38" y="-24" width="76" height="48" rx="6" fill="#2EC4B6" ${ink(3.5)}/><rect x="-38" y="12" width="76" height="12" rx="0" fill="#23A396"/><rect x="-38" y="-24" width="76" height="48" rx="6" fill="none" ${ink(3.5)}/>
      <rect x="-29" y="-18" width="58" height="16" rx="3" fill="#FFF7E6" ${ink(2.5)}/><path d="M-24 -12 H10" stroke="#FF5E7E" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="-18" y="0" width="36" height="12" rx="6" fill="${INK}"/><circle cx="-9" cy="6" r="4" fill="#FFF7E6"/><circle cx="9" cy="6" r="4" fill="#FFF7E6"/>
      <path d="M-20 24 L-15 15 H15 L20 24" fill="#1FA296" ${ink(2.5)}/>`,
    vinyl: () => `<circle r="36" fill="${INK}" ${ink(3)}/>${[30, 25, 20].map(r => `<circle r="${r}" fill="none" stroke="#3A3552" stroke-width="1.6"/>`).join('')}
      <path d="M-24 -20 A31 31 0 0 1 4 -31" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/><circle r="13" fill="#FF5E7E" ${ink(2.5)}/><circle r="3" fill="#FFF7E6"/>`,
    mic: () => `<path d="M-9 0 L9 0 L4 40 H-4Z" fill="#2B2640" ${ink(3.5)}/><rect x="-11" y="-6" width="22" height="9" rx="2" fill="#FFCE3A" ${ink(3)}/>
      <circle cx="0" cy="-24" r="17" fill="#C9C3D8" ${ink(3.5)}/><clipPath id="mh"><circle cx="0" cy="-24" r="17"/></clipPath><g clip-path="url(#mh)"><circle cx="7" cy="-19" r="17" fill="#A59DBB"/>${[-34, -27, -20, -13].map(y => `<path d="M-18 ${y} H18" stroke="${INK}" stroke-width="1.4" opacity=".5"/>`).join('')}</g><circle cx="0" cy="-24" r="17" fill="none" ${ink(3.5)}/>`,
    taiko: () => `<path d="M-30 -12 C-35 6 -33 20 -25 28 H25 C33 20 35 6 30 -12Z" fill="#C8412E" ${ink(3.5)}/><path d="M12 -12 H30 C35 6 33 20 25 28 H14 C20 18 20 0 12 -12Z" fill="#A23324"/><path d="M-30 -12 C-35 6 -33 20 -25 28 H25 C33 20 35 6 30 -12Z" fill="none" ${ink(3.5)}/>
      <ellipse cx="0" cy="-12" rx="30" ry="9" fill="#F3E6C8" ${ink(3.5)}/><path d="M-32 4 H32" ${ink(2.5)}/>${[-24, -12, 0, 12, 24].map(x => `<circle cx="${x}" cy="4" r="2.2" fill="#FFCE3A"/>`).join('')}
      <path d="M8 -46 L-6 -18" ${ink(7)}/><path d="M8 -46 L-6 -18" stroke="#E8C48A" stroke-width="3" stroke-linecap="round"/><path d="M24 -40 L4 -20" ${ink(7)}/><path d="M24 -40 L4 -20" stroke="#E8C48A" stroke-width="3" stroke-linecap="round"/>`,
    keytar: () => `<path d="M-40 -6 H26 L40 -20 L44 -12 L32 4 V14 H-40Z" fill="#FFCE3A" ${ink(3.5)}/><rect x="-34" y="-2" width="54" height="12" fill="#FFF7E6" ${ink(2.5)}/>${[-28, -22, -16, -10, -4, 2, 8, 14].map(x => `<path d="M${x} -2 V10" ${ink(1.5)}/>`).join('')}
      ${[-25, -19, -7, -1, 11].map(x => `<rect x="${x - 1.6}" y="-2" width="3.2" height="7" fill="${INK}"/>`).join('')}<circle cx="-36" cy="4" r="0" />`,
    notes: () => `<path d="M-12 22 V-22 L20 -30 V14" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M-12 -22 L20 -30 V-20 L-12 -12Z" fill="${INK}"/>
      <ellipse cx="-18" cy="23" rx="9" ry="7" transform="rotate(-20 -18 23)" fill="#FF5E7E" ${ink(3)}/><ellipse cx="14" cy="15" rx="9" ry="7" transform="rotate(-20 14 15)" fill="#FF5E7E" ${ink(3)}/>`,
    pick: () => `<path d="M0 32 C-26 8 -30 -24 0 -27 C30 -24 26 8 0 32Z" fill="#FFCE3A" ${ink(3.5)}/><path d="M6 30 C22 8 24 -18 8 -26 C24 -20 26 6 6 30Z" fill="#E5AE14"/><path d="M0 32 C-26 8 -30 -24 0 -27 C30 -24 26 8 0 32Z" fill="none" ${ink(3.5)}/><path d="M-12 -10 Q0 -18 12 -10" fill="none" stroke="#FFF7E6" stroke-width="3" stroke-linecap="round"/>`,
    boombox: () => `<path d="M-22 -24 Q0 -38 22 -24" fill="none" ${ink(6)}/><rect x="-42" y="-24" width="84" height="46" rx="7" fill="#8FB8FF" ${ink(3.5)}/><rect x="-42" y="12" width="84" height="10" fill="#6E98E0"/><rect x="-42" y="-24" width="84" height="46" rx="7" fill="none" ${ink(3.5)}/>
      <circle cx="-24" cy="0" r="13" fill="${INK}"/><circle cx="-24" cy="0" r="5" fill="#8FB8FF"/><circle cx="24" cy="0" r="13" fill="${INK}"/><circle cx="24" cy="0" r="5" fill="#8FB8FF"/>
      <rect x="-9" y="-12" width="18" height="18" rx="2" fill="#FFF7E6" ${ink(2.5)}/><path d="M-6 -18 H6" ${ink(2.5)}/>`,
  };
  // twelve different items, once each per tile: neighbours (across the tile edges too) are never the same
  const ORDER = ['acoustic', 'headphones', 'taiko', 'cassette', 'mic', 'vinyl', 'notes', 'electric', 'boombox', 'pick', 'keytar', 'metronome'];
  function seigaiha(w, h, col){ let d = ''; for (let y = 0; y <= h + 40; y += 20) for (let x = (y / 20 % 2) * 20; x <= w + 40; x += 40) for (const r of [18, 12, 6]) d += `M${x - r} ${y}a${r} ${r} 0 0 1 ${r * 2} 0`; return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2"/>`; }
  function tile(){
    const W = 720, H = 540, cols = 4, rows = 3;
    let body = '', u = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = ORDER[r * cols + c], x = (c + 0.5 + (r % 2 ? 0.5 : 0)) * W / cols, y = (r + 0.5) * H / rows, sc = k === 'keytar' || k === 'boombox' ? 0.56 : 0.64, rot = [-14, 10, -6, 14, -10, 6][(r * cols + c) % 6];
      for (const wx of [0, x > W - 70 ? -W : null]) if (wx !== null) body += `<g transform="translate(${x + wx} ${y}) rotate(${rot}) scale(${sc})">${ITEMS[k](u++)}</g>`;
    }
    // black-and-white sketches: every colour becomes paper, the ink stays, and the lines get a hand-drawn wobble
    body = body.replace(/fill="(#[0-9A-Fa-f]{6}|rgba\([^)]*\))"/g, (m, c) => c.toUpperCase() === INK.toUpperCase() ? m : 'fill="#FFF4E6"')
      .replace(/stroke="(#[0-9A-Fa-f]{6}|rgba\([^)]*\))"/g, (m, c) => c.toUpperCase() === INK.toUpperCase() ? m : 'stroke="#FFF4E6"');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><filter id="sk" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter></defs>
      <rect width="${W}" height="${H}" fill="#FFF4E6"/><g opacity=".38">${seigaiha(W, H, '#5FB7C9')}</g><g filter="url(#sk)" opacity=".85">${body}</g></svg>`;
  }
  // the mode buttons' icons, in the same ink style
  const star = (x, y, R, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (x + q * Math.cos(a)).toFixed(1) + ' ' + (y + q * Math.sin(a)).toFixed(1); } return d + 'Z'; };
  // sticker-style: a thick white border round a bold, simple shape, so it reads on any card colour
  const sticker = (shape, fill, extra) => `<path d="${shape}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="16" stroke-linejoin="round"/><path d="${shape}" fill="${fill}" ${ink(4)}/>${extra || ''}`;
  const ICONS = {
    // a big guitar pick with a play button on it
    play: () => sticker('M0 40 C-10 40 -42 -2 -38 -20 C-34 -38 34 -38 38 -20 C42 -2 10 40 0 40Z', '#FFCE3A',
      `<path d="M8 36 C22 20 40 -4 36 -20 C34 -30 24 -34 14 -35 C30 -28 32 -12 8 36Z" fill="#E5AE14"/><path d="M0 40 C-10 40 -42 -2 -38 -20 C-34 -38 34 -38 38 -20 C42 -2 10 40 0 40Z" fill="none" ${ink(4)}/><path d="M-10 -14 L16 0 L-10 14Z" fill="${INK}" ${ink(3)}/><path d="M-22 -22 Q-12 -30 0 -30" fill="none" stroke="#FFF7C8" stroke-width="4" stroke-linecap="round"/>`),
    // a microphone in front of a big star: your name in lights
    story: () => `${sticker(star(0, -2, 44, 20), '#FFCE3A', `<path d="${star(6, 2, 44, 20)}" fill="#E5AE14" clip-path="url(#stc)"/>`)}<clipPath id="stc"><path d="${star(0, -2, 44, 20)}"/></clipPath><path d="${star(0, -2, 44, 20)}" fill="none" ${ink(4)}/>
      <path d="M-6 6 L6 6 L3 34 H-3Z" fill="${INK}"/><circle cx="0" cy="-8" r="13" fill="#FF5E7E" ${ink(4)}/><path d="M-9 -12 H9 M-11 -6 H11" stroke="#FFF7E6" stroke-width="2.4" stroke-linecap="round"/><path d="M-8 -16 Q-4 -20 2 -20" fill="none" stroke="#FFF7E6" stroke-width="3" stroke-linecap="round"/>`,
    // a VS burst: two sides clash
    battle: () => { let d = ''; for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10, q = i % 2 ? 30 : 46; d += (i ? 'L' : 'M') + (q * Math.cos(a)).toFixed(1) + ' ' + (q * Math.sin(a) * 0.9).toFixed(1); } d += 'Z';
      return sticker(d, '#FF5E3A', `<path d="${d}" transform="scale(.72)" fill="#FFCE3A"/><text x="0" y="12" text-anchor="middle" font-family="'Bagel Fat One','Arial Black',sans-serif" font-size="34" fill="#FFFFFF" stroke="${INK}" stroke-width="3.5" paint-order="stroke" transform="rotate(-8)">VS</text>`); },
  };
  const icon = k => `<svg viewBox="-50 -50 100 100" width="100%" height="100%" aria-hidden="true">${ICONS[k]()}</svg>`;
  let url = '';
  return {
    tile, icon,
    apply(){
      if (!url) url = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tile()) + '")';
      document.documentElement.style.setProperty('--menu-bg', url);
    },
  };
})();

/* ---------- the Story button's icon: the funk drummer, live, on a small canvas ----------
   On hover he goes up to full hype with fills and crashes under a spotlight; a click gives him a crash. */
const ModeIcons = {
  list: [], hov: {}, hit: {}, dSt: null,
  init(){
    for (const [id, k] of [['btn-play', 'play'], ['btn-story', 'story'], ['btn-battle', 'online']]) {
      const card = document.getElementById(id), box = card && card.querySelector('.mi'); if (!box) continue;
      box.textContent = ''; const cv = document.createElement('canvas'); box.appendChild(cv);
      const on = () => { this.hov[k] = true; }, off = () => { this.hov[k] = false; };
      card.addEventListener('pointerenter', on); card.addEventListener('pointerleave', off); card.addEventListener('focus', on); card.addEventListener('blur', off);
      this.list.push({ k, cv, box, c: cv.getContext('2d'), h: 0 });
    }
  },
  kick(k){ this.hit[k] = performance.now() / 1000; },
  draw(t){
    for (const it of this.list) {
      const w = it.box.clientWidth, h = it.box.clientHeight; if (!w || !h) continue;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (it.cv.width !== Math.round(w * dpr)) { it.cv.width = Math.round(w * dpr); it.cv.height = Math.round(h * dpr); }
      it.h += ((this.hov[it.k] ? 1 : 0) - it.h) * 0.15;                 // hover eases in and out
      const age = t - (this.hit[it.k] || -9), c = it.c;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.lineJoin = 'round'; c.lineCap = 'round';
      this[it.k](c, w, h, reduceMotion ? 0 : t, it.h, age);
    }
  },
  star(c, x, y, R, rot, fill){ c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + rot, q = i % 2 ? R * 0.45 : R; c.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)); } c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke(); },
  story(c, w, h, t, hv, age){
    // spotlight
    c.save(); const g = c.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 1.1); g.addColorStop(0, `rgba(255,236,160,${0.25 + 0.45 * hv})`); g.addColorStop(1, 'rgba(255,236,160,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(w * 0.4, 0); c.lineTo(w * 0.6, 0); c.lineTo(w * 1.05, h); c.lineTo(-w * 0.05, h); c.closePath(); c.fill(); c.restore();
    const bpm = 96 + 24 * hv, spb = 60 / bpm, beat = t / spb, b0 = Math.floor(beat), ev = [];
    for (let bb = b0 - 3; bb <= b0 + 3; bb++) { const tt = bb * spb;
      ev.push({ t: tt, kind: 'hat' }, { t: tt, kind: ((bb % 2) + 2) % 2 ? 'snare' : 'kick' });
      if (hv > 0.3) ev.push({ t: tt + spb / 2, kind: 'hat' });
      if (hv > 0.5 && ((bb % 4) + 4) % 4 === 3) ev.push({ t: tt + spb / 2, kind: 'tom' }, { t: tt + spb * 0.75, kind: 'tom' });
      if (hv > 0.5 && ((bb % 4) + 4) % 4 === 0) ev.push({ t: tt, kind: 'crash' }); }
    if (age < 0.4) ev.push({ t: t - age, kind: 'crash' }, { t: t - age, kind: 'kick' });
    ev.sort((a, b) => a.t - b.t);
    this.dSt = this.dSt || FunkDrummer.create();
    FunkDrummer.draw(c, this.dSt, { x: w / 2, floorY: h * 1.02, h: h * 1.18, now: t, real: t, beat, spb, level: hv > 0.5 || age < 1 ? 3 : 1, events: ev, playing: true, missAgo: 9 });
    if (hv > 0.3) for (let i = 0; i < 3; i++) { const cyc = (t * 0.7 + i / 3) % 1; c.globalAlpha = Math.sin(cyc * Math.PI) * hv; this.star(c, w * (0.14 + 0.36 * i), h * (0.22 + 0.12 * ((i + 1) % 2)), 5 + 3 * Math.sin(cyc * Math.PI), cyc * 2, '#FFCE3A'); }
    c.globalAlpha = 1;
  },
  // Play & Learn: an acoustic guitar under a spotlight, strummed on the beat; the strings shiver, notes float off
  play(c, w, h, t, hv, age){
    const s = Math.min(w, h), bpm = 92 + 36 * hv, spb = 60 / bpm, beat = t / spb, ph = beat % 1;
    const sa = Math.min(ph * spb, age), amp = Math.exp(-sa * 7) * (age < 0.5 ? 1.8 : 1);   // string shake since the last strum
    c.save(); const g = c.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, s * 0.7); g.addColorStop(0, `rgba(255,206,58,${0.22 + 0.3 * hv})`); g.addColorStop(1, 'rgba(255,206,58,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
    // floating notes behind the guitar
    for (let i = 0; i < 3 + Math.round(2 * hv); i++) { const cyc = (t * (0.35 + 0.25 * hv) + i * 0.27) % 1, x = w * (0.2 + ((i * 0.37) % 0.7)) + Math.sin(cyc * 6 + i) * 4, y = h * (0.95 - cyc * 0.9);
      c.globalAlpha = Math.sin(cyc * Math.PI); this.note(c, x, y, s * 0.075, i % 2 ? '#FFCE3A' : '#FFF7E6'); }
    c.globalAlpha = 1;
    const bob = Math.pow(1 - ph, 3) * 0.05 + (age < 0.4 ? Math.sin(age * 30) * 0.08 * (1 - age / 0.4) : 0);
    c.save(); c.translate(w * 0.56, h * 0.62); c.rotate(-0.72 + bob); c.scale(s / 128, s / 128);
    const R1 = 23, R2 = 17, NL = 58;   // body: lower bout, upper bout; neck length
    const body = pad => { c.beginPath(); c.arc(0, 12, R1 + pad, 0, Math.PI * 2); c.moveTo(R2 + pad, -14); c.arc(0, -14, R2 + pad, 0, Math.PI * 2); },
      neck = pad => { rr(c, -5.5 - pad, -14 - NL - pad, 11 + pad * 2, NL + pad * 2, 3); }, head = pad => { rr(c, -8 - pad, -14 - NL - 16 - pad, 16 + pad * 2, 18 + pad * 2, 5); };
    // one ink silhouette first, then the colours on top
    c.fillStyle = COL.ink; body(4); c.fill(); neck(4); c.fill(); head(4); c.fill();
    c.fillStyle = '#FFB020'; body(0); c.fill();
    c.save(); body(0); c.clip(); c.fillStyle = '#E0831A'; c.beginPath(); c.arc(9, 18, R1 + 2, 0, Math.PI * 2); c.arc(-40, 30, 10, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#FFB020'; c.beginPath(); c.arc(4, 13, R1 - 1, 0, Math.PI * 2); c.arc(0, -14, R2, 0, Math.PI * 2); c.fill(); c.restore();
    c.fillStyle = '#8A5A3B'; neck(0); c.fill(); c.fillStyle = '#5E3A26'; head(0); c.fill();
    c.fillStyle = 'rgba(30,27,46,.45)'; for (let k = 1; k < 6; k++) c.fillRect(-5.5, -14 - k * 10, 11, 1.6);   // frets
    c.fillStyle = COL.ink; c.beginPath(); c.arc(0, -2, 8.5, 0, Math.PI * 2); c.fill();            // sound hole
    c.fillStyle = COL.ink; rr(c, -9, 22, 18, 5, 2); c.fill();                                        // bridge
    c.fillStyle = '#FFF7E6'; for (const y of [-80, -74]) for (const x of [-10.5, 10.5]) { c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.6; c.strokeStyle = COL.ink; c.stroke(); }
    // the strings shiver after each strum
    c.strokeStyle = '#FFF7E6'; c.lineWidth = 1.3;
    for (let k = 0; k < 4; k++) { const x = -3.6 + k * 2.4; c.beginPath(); c.moveTo(x, -14 - NL - 2);
      for (let y = -14 - NL; y <= 23; y += 3) { const u = (y + 14 + NL) / (NL + 37); c.lineTo(x + Math.sin(u * Math.PI) * Math.sin(t * 90 + k * 1.7 + y * 0.02) * amp * 1.9, y); } c.stroke(); }
    // the pick sweeps across the strings on the beat, with a smear
    const sw = Math.min(1, ph * spb / 0.09), px = -16 + 32 * (1 - Math.pow(1 - sw, 2));
    if (sw < 1 || age < 0.15) { c.fillStyle = 'rgba(255,247,230,.55)'; c.beginPath(); c.moveTo(-16, 4); c.quadraticCurveTo(px * 0.5 - 4, 16, px, 6); c.lineTo(px, 1); c.quadraticCurveTo(px * 0.5 - 4, 10, -16, 4); c.fill(); }
    c.restore();
    const pk = (sw < 1 || age < 0.15) ? px : 16 - 3 * Math.sin(ph * Math.PI);
    c.save(); c.translate(w * 0.56, h * 0.62); c.rotate(-0.72 + bob); c.scale(s / 128, s / 128); c.translate(pk, 6 - 14); c.rotate(0.5);
    c.beginPath(); c.moveTo(-6, -5); c.quadraticCurveTo(0, -9, 6, -5); c.quadraticCurveTo(4, 5, 0, 8); c.quadraticCurveTo(-4, 5, -6, -5); c.closePath();
    c.fillStyle = COL.coral; c.fill(); c.lineWidth = 2.6; c.strokeStyle = COL.ink; c.stroke(); c.restore();
    if (age < 0.5 || hv > 0.3) { const a = age < 0.5 ? 1 - age / 0.5 : hv * Math.pow(1 - ph, 2); c.globalAlpha = a;
      for (let i = 0; i < 5; i++) { const an = -Math.PI * (0.15 + i * 0.17), r0 = s * 0.36, r1 = r0 + s * (0.08 + 0.06 * (1 - a));
        c.beginPath(); c.moveTo(w * 0.52 + Math.cos(an) * r0, h * 0.5 + Math.sin(an) * r0); c.lineTo(w * 0.52 + Math.cos(an) * r1, h * 0.5 + Math.sin(an) * r1); c.lineWidth = 3; c.strokeStyle = '#FFCE3A'; c.stroke(); }
      c.globalAlpha = 1; }
  },
  note(c, x, y, r, fill){
    c.lineWidth = 2; c.strokeStyle = COL.ink; c.fillStyle = fill;
    c.beginPath(); c.ellipse(x, y, r, r * 0.75, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + r * 0.85, y - r * 0.2); c.lineTo(x + r * 0.85, y - r * 2.6); c.quadraticCurveTo(x + r * 1.9, y - r * 2.2, x + r * 1.9, y - r * 1.3); c.lineWidth = 2.4; c.stroke();
  },
  // Online: three players' takes stacked like tracks, lining up under one playhead; a REC light blinks
  online(c, w, h, t, hv, age){
    const s = Math.min(w, h), spb = 60 / (100 + 30 * hv), beat = t / spb, ph = beat % 1, cols = ['#FF5E7E', '#2EC4B6', '#FFCE3A'];
    const x0 = w * 0.12, x1 = w * 0.9, tw = x1 - x0, th = h * 0.16, gap = h * 0.05, top = h * 0.36;
    const hit = age < 0.6 ? 1 - age / 0.6 : 0;
    for (let k = 0; k < 3; k++) {
      // tracks slide in from alternate sides, then lock together on the beat
      const slide = (1 - hv) * Math.sin(t * 1.3 + k * 2.1) * w * 0.035 * (1 - hit), y = top + k * (th + gap);
      c.save(); c.translate(slide, 0);
      c.fillStyle = COL.ink; rr(c, x0 - 3, y - 3, tw + 6, th + 6, 9); c.fill();
      c.fillStyle = '#2A2350'; rr(c, x0, y, tw, th, 7); c.fill();
      c.save(); rr(c, x0, y, tw, th, 7); c.clip();
      const n = 16, bw = tw / n;
      for (let i = 0; i < n; i++) { const bx = x0 + i * bw, pos = (i / n) * 4 - beat * 0.5, local = ((pos % 1) + 1) % 1;
        const v = 0.25 + 0.55 * Math.abs(Math.sin(i * 1.7 + k * 3.1 + Math.floor(beat * 2 + i * 0.13) * 0.9)) * (0.5 + 0.5 * Math.pow(1 - local, 2));
        const bh = Math.min(th - 4, th * v * (0.8 + 0.4 * hv + 0.5 * hit)); c.fillStyle = cols[k]; rr(c, bx + 1.2, y + (th - bh) / 2, bw - 2.4, bh, 2); c.fill(); }
      c.restore();
      // the player's badge
      const bx = x0 + 2, by = y + th / 2; c.beginPath(); c.arc(bx, by, th * 0.42, 0, Math.PI * 2); c.fillStyle = cols[k]; c.fill(); c.lineWidth = 2.4; c.strokeStyle = COL.ink; c.stroke();
      c.fillStyle = COL.ink; c.beginPath(); c.arc(bx, by - th * 0.08, th * 0.12, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(bx, by + th * 0.3, th * 0.2, Math.PI, 0); c.fill();
      c.restore();
    }
    // the playhead sweeps across all three
    const px = x0 + tw * (((t * 0.22) % 1)), yb = top + 3 * th + 2 * gap;
    c.fillStyle = COL.ink; rr(c, px - 3.5, top - 6, 7, yb - top + 12, 3); c.fill(); c.fillStyle = '#FFF7E6'; rr(c, px - 1.5, top - 4, 3, yb - top + 8, 1.5); c.fill();
    // REC light + label
    const on = (t % 1) < 0.6 || hv > 0.5, rx = x0 + 4, ry = h * 0.17;
    c.beginPath(); c.arc(rx, ry, s * 0.055 * (1 + 0.25 * hit), 0, Math.PI * 2); c.fillStyle = on ? '#FF3B5C' : '#6A2A3A'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = COL.ink; c.stroke();
    if (on) { c.save(); c.globalAlpha = 0.35 + 0.3 * hv; c.beginPath(); c.arc(rx, ry, s * 0.1, 0, Math.PI * 2); c.fillStyle = '#FF3B5C'; c.fill(); c.restore(); }
    c.font = `400 ${Math.round(s * 0.13)}px ${DISPLAY_FONT}`; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = COL.ink; c.fillStyle = '#FFF7E6';
    c.strokeText('REC', rx + s * 0.09, ry + 1); c.fillText('REC', rx + s * 0.09, ry + 1);
    // signal arcs: this jam is going out
    c.lineWidth = 2.6; c.strokeStyle = '#FFF7E6';
    for (let i = 0; i < 3; i++) { const a = Math.max(0, Math.sin(((t * (1 + hv) - i * 0.18) % 1) * Math.PI)) * (0.4 + 0.6 * Math.max(hv, hit)); c.globalAlpha = a;
      c.beginPath(); c.arc(x1 - s * 0.06, ry + s * 0.04, s * (0.05 + i * 0.05), -Math.PI * 0.85, -Math.PI * 0.15); c.stroke(); }
    c.globalAlpha = 1;
    c.beginPath(); c.arc(x1 - s * 0.06, ry + s * 0.04, s * 0.028, 0, Math.PI * 2); c.fillStyle = '#FFF7E6'; c.fill(); c.lineWidth = 2; c.strokeStyle = COL.ink; c.stroke();
  },
};
