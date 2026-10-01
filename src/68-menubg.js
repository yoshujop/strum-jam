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
  // Story's icon: the drummer on tour. Every couple of seconds the stage behind him swings to the next stop: a poster-flat
  // backdrop (a sky gradient and two layers of silhouettes in the sky's own darker tones, no outlines, so he stays the star).
  TOUR_N: 5,
  tourScene(c, w, h, i, t){
    const sky = stops => { const g = c.createLinearGradient(0, 0, 0, h); stops.forEach((col, k) => g.addColorStop(k / (stops.length - 1), col)); c.fillStyle = g; c.fillRect(0, 0, w, h); };
    const poly = (pts, fill) => { c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h)); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = fill; c.fill(); };
    const glow = (x, y, r, col) => { const g = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * h); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); };
    if (i === 0) {        // city at night
      sky(['#15123A', '#34276E', '#6A3F8F']); glow(0.74, 0.22, 0.32, 'rgba(255,214,150,.45)');
      c.fillStyle = '#FFE9B8'; c.beginPath(); c.arc(w * 0.74, h * 0.22, h * 0.1, 0, Math.PI * 2); c.fill();
      poly([[0, 0.52], [0.1, 0.52], [0.1, 0.4], [0.2, 0.4], [0.2, 0.47], [0.34, 0.47], [0.34, 0.33], [0.44, 0.33], [0.44, 0.5], [0.6, 0.5], [0.6, 0.38], [0.7, 0.38], [0.7, 0.46], [0.86, 0.46], [0.86, 0.36], [0.96, 0.36], [0.96, 0.5], [1, 0.5]], '#3F2F7A');
      poly([[0, 0.62], [0.16, 0.62], [0.16, 0.55], [0.3, 0.55], [0.3, 0.6], [0.5, 0.6], [0.5, 0.52], [0.62, 0.52], [0.62, 0.61], [0.8, 0.61], [0.8, 0.56], [1, 0.56]], '#261D55');
      c.fillStyle = '#FFD86B'; [[0.37, 0.38], [0.4, 0.44], [0.63, 0.42], [0.89, 0.41], [0.92, 0.46], [0.13, 0.45]].forEach(([x, y], k) => { if ((k + Math.floor(t * 1.5)) % 4) c.fillRect(x * w, y * h, w * 0.025, h * 0.03); });
    } else if (i === 1) { // desert sunset, a striped retro sun
      sky(['#FF7A59', '#FF9E6B', '#FFD08A']);
      c.save(); c.beginPath(); c.arc(w * 0.5, h * 0.5, h * 0.24, Math.PI, 0); c.clip(); c.fillStyle = '#FFE36E'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#FF9E6B'; for (let k = 0; k < 4; k++) c.fillRect(0, h * (0.36 + k * 0.035), w, h * (0.008 + k * 0.004)); c.restore();
      poly([[0, 0.56], [0.08, 0.44], [0.24, 0.44], [0.3, 0.56], [0.6, 0.56], [0.66, 0.4], [0.9, 0.4], [0.96, 0.56], [1, 0.56]], '#C8566A');
      poly([[0, 0.64], [0.4, 0.6], [1, 0.64]], '#9C3F62');
    } else if (i === 2) { // beach, palms against the evening sea
      sky(['#3FC6C8', '#8FE0CF', '#FFD6A8']); glow(0.3, 0.42, 0.3, 'rgba(255,240,190,.6)');
      c.fillStyle = '#FFF2C4'; c.beginPath(); c.arc(w * 0.3, h * 0.42, h * 0.09, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1F9AA8'; c.fillRect(0, h * 0.5, w, h); c.fillStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 3; k++) c.fillRect(w * (0.15 + k * 0.28 + Math.sin(t + k) * 0.02), h * (0.54 + k * 0.03), w * 0.14, 2);
      for (const [x, lean] of [[0.84, -0.18], [0.94, 0.12]]) { c.strokeStyle = '#16606E'; c.lineWidth = w * 0.028; c.lineCap = 'round'; c.beginPath(); c.moveTo(x * w, h * 0.66); c.quadraticCurveTo((x + lean * 0.3) * w, h * 0.4, (x + lean) * w, h * 0.22); c.stroke();
        c.fillStyle = '#16606E'; for (let a = 0; a < 5; a++) { const an = Math.PI * (0.9 + a * 0.3); c.beginPath(); c.ellipse((x + lean) * w + Math.cos(an) * w * 0.07, h * 0.22 + Math.sin(an) * h * 0.035 + h * 0.02, w * 0.08, h * 0.02, an + Math.PI / 2 * 0.2, 0, Math.PI * 2); c.fill(); } }
    } else if (i === 3) { // mountains under the northern lights
      sky(['#0E1838', '#1C2F5E', '#2F4F7F']);
      for (let k = 0; k < 2; k++) { c.strokeStyle = k ? 'rgba(160,120,255,.35)' : 'rgba(120,255,190,.45)'; c.lineWidth = h * 0.07; c.lineCap = 'round'; c.beginPath();
        for (let x = 0; x <= 1.001; x += 0.05) { const y = 0.2 + k * 0.08 + Math.sin(x * 5 + t * 0.9 + k) * 0.05; x ? c.lineTo(x * w, y * h) : c.moveTo(0, y * h); } c.stroke(); }
      c.fillStyle = '#fff'; for (let k = 0; k < 10; k++) { const x = (k * 0.37 % 1) * w, y = (k * 0.23 % 0.3) * h; c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + k); c.fillRect(x, y, 1.6, 1.6); } c.globalAlpha = 1;
      poly([[0, 0.6], [0.22, 0.34], [0.4, 0.52], [0.6, 0.3], [0.84, 0.54], [1, 0.42]], '#3B5A8C');
      poly([[0, 0.66], [0.3, 0.5], [0.55, 0.64], [0.8, 0.52], [1, 0.62]], '#26406C');
    } else {              // the stadium: beams and a sea of lights
      sky(['#1A0F3A', '#3B1F6E', '#6B2F8F']);
      for (const [x, a] of [[0.1, 0.5], [0.9, -0.5]]) { const sw = Math.sin(t * 1.2 + x * 6) * 0.25; c.save(); c.translate(x * w, h * 0.62); c.rotate(-Math.PI / 2 + a + sw);
        const g = c.createLinearGradient(0, 0, h * 0.9, 0); g.addColorStop(0, 'rgba(255,240,200,.45)'); g.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(h * 0.9, -h * 0.14); c.lineTo(h * 0.9, h * 0.14); c.closePath(); c.fill(); c.restore(); }
      poly([[0, 0.58], [0.5, 0.52], [1, 0.58]], '#2A1650');
      for (let k = 0; k < 18; k++) { const x = (k * 0.137 % 1), y = 0.6 + (k * 0.29 % 0.12); c.fillStyle = `rgba(255,230,150,${0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + k * 1.7))})`; c.beginPath(); c.arc(x * w, y * h, 1.5, 0, Math.PI * 2); c.fill(); }
    }
    // the stage he plays on: a dark deck with a warm lip of light
    c.fillStyle = '#1E1830'; c.fillRect(0, h * 0.8, w, h); c.fillStyle = 'rgba(255,206,58,.55)'; c.fillRect(0, h * 0.8, w, 2);
  },
  story(c, w, h, t, hv, age){
    // on tour: a new stop every 2.6 s; the backdrop swings across (the old one slides out, the new one in)
    const per = 2.6, n = this.TOUR_N, k = Math.floor(t / per), f = t / per - k, i = ((k % n) + n) % n, j = (i + n - 1) % n;
    const p = reduceMotion ? 1 : Math.min(1, f / 0.22), e = p < 1 ? (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) : 1;
    if (e < 1) { c.save(); c.translate(-e * w, 0); this.tourScene(c, w, h, j, t); c.restore(); }
    c.save(); c.translate((1 - e) * w, 0); this.tourScene(c, w, h, i, t); c.restore();
    this.storyBand(c, w, h, t, hv, age);
  },
  storyBand(c, w, h, t, hv, age){
    // spotlight
    c.save(); const g = c.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 1.1); g.addColorStop(0, `rgba(255,236,160,${0.12 + 0.3 * hv})`); g.addColorStop(1, 'rgba(255,236,160,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(w * 0.4, 0); c.lineTo(w * 0.6, 0); c.lineTo(w * 1.05, h); c.lineTo(-w * 0.05, h); c.closePath(); c.fill(); c.restore();
    const bpm = 104, spb = 60 / bpm, beat = t / spb, b0 = Math.floor(beat), ev = [];
    for (let bb = b0 - 3; bb <= b0 + 3; bb++) { const tt = bb * spb;
      ev.push({ t: tt, kind: 'hat' }, { t: tt, kind: ((bb % 2) + 2) % 2 ? 'snare' : 'kick' });
      ev.push({ t: tt + spb / 2, kind: 'hat' });
      if (((bb % 8) + 8) % 8 === 7) ev.push({ t: tt + spb / 2, kind: 'tom' }, { t: tt + spb * 0.75, kind: 'tom' });
      if (((bb % 8) + 8) % 8 === 0) ev.push({ t: tt, kind: 'crash' }); }
    if (age < 0.4) ev.push({ t: t - age, kind: 'crash' }, { t: t - age, kind: 'kick' });
    ev.sort((a, b) => a.t - b.t);
    this.dSt = this.dSt || FunkDrummer.create();
    FunkDrummer.draw(c, this.dSt, { x: w / 2, floorY: h * 1.02, h: h * 1.18, now: t, real: t, beat, spb, level: age < 1 ? 3 : 2, events: ev, playing: true, missAgo: 9 });
    if (hv > 0.3) for (let i = 0; i < 3; i++) { const cyc = (t * 0.7 + i / 3) % 1; c.globalAlpha = Math.sin(cyc * Math.PI) * hv; this.star(c, w * (0.14 + 0.36 * i), h * (0.22 + 0.12 * ((i + 1) % 2)), 5 + 3 * Math.sin(cyc * Math.PI), cyc * 2, '#FFCE3A'); }
    c.globalAlpha = 1;
  },
  // Play & Learn, guitar: an acoustic guitar under a spotlight, strummed on the beat; the strings shiver, notes float off
  i_guitar(c, w, h, t, hv, age){
    const s = Math.min(w, h), bpm = 104, spb = 60 / bpm, beat = t / spb, ph = beat % 1;
    const sa = Math.min(ph * spb, age), amp = Math.exp(-sa * 7) * (age < 0.5 ? 1.8 : 1);   // string shake since the last strum
    c.save(); const g = c.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, s * 0.7); g.addColorStop(0, `rgba(255,206,58,${0.22 + 0.3 * hv})`); g.addColorStop(1, 'rgba(255,206,58,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
    // floating notes behind the guitar
    for (let i = 0; i < 4; i++) { const cyc = (t * 0.42 + i * 0.27) % 1, x = w * (0.2 + ((i * 0.37) % 0.7)) + Math.sin(cyc * 6 + i) * 4, y = h * (0.95 - cyc * 0.9);
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
  // the Play & Learn and Online icons swap between scenes the way the Story one tours: every few seconds the next one swings in
  // (each has its own backdrop colour, and a little label under it so you can read what it is)
  swing(c, w, h, t, n, per, off, draw){
    const tt = t + off, k = Math.floor(tt / per), f = tt / per - k, i = ((k % n) + n) % n, j = (i + n - 1) % n;
    const p = reduceMotion ? 1 : Math.min(1, f / 0.2), e = p < 1 ? (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) : 1;
    if (e < 1) { c.save(); c.translate(-e * w, 0); draw(j, 1); c.restore(); }
    c.save(); c.translate((1 - e) * w, 0); draw(i, f); c.restore();
  },
  label(c, w, h, text){
    const s = Math.min(w, h), fs = Math.max(8, Math.round(s * 0.1));
    c.font = `800 ${fs}px ${UI_FONT}`; const tw = c.measureText(text).width + fs * 1.1, th = fs * 1.45, x = w / 2 - tw / 2, y = h - th - s * 0.05;
    c.fillStyle = COL.ink; rr(c, x, y, tw, th, th / 2); c.fill(); c.fillStyle = '#FFF7E6'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, y + th / 2 + 0.5); c.textAlign = 'left';
  },
  bgFill(c, w, h, col, glow, hv){
    c.fillStyle = col; c.fillRect(0, 0, w, h);
    const s = Math.min(w, h), g = c.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, s * 0.72); g.addColorStop(0, glow.replace('A', String(0.22 + 0.3 * hv))); g.addColorStop(1, glow.replace('A', '0'));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  },
  PLAY_SCENES: [['guitar', 'GUITAR', '#5E2240', 'rgba(255,206,58,A)'], ['vocals', 'VOCALS', '#3A2F63', 'rgba(255,143,199,A)'], ['bass', 'BASS', '#173F4A', 'rgba(46,196,182,A)'],
    ['keys', 'KEYS', '#22305E', 'rgba(108,200,255,A)'], ['drums', 'DRUMS', '#5A2A14', 'rgba(255,176,32,A)']],
  play(c, w, h, t, hv, age){
    const L = this.PLAY_SCENES;
    this.swing(c, w, h, t, L.length, 2.6, 0.9, (i, f) => { const [k, name, bg, glow] = L[i]; this.bgFill(c, w, h, bg, glow, hv); c.save(); this['i_' + k](c, w, h, t, hv, age, f); c.restore(); this.label(c, w, h, name); });
  },
  ONLINE_SCENES: [['battle', 'BATTLE', '#3A1238'], ['record', 'RECORD', '#241C4A'], ['share', 'SHARE', '#113A42']],
  online(c, w, h, t, hv, age){
    const L = this.ONLINE_SCENES;
    this.swing(c, w, h, t, L.length, 2.6, 1.7, (i, f) => { const [k, name, bg] = L[i]; c.fillStyle = bg; c.fillRect(0, 0, w, h); c.save(); this['o_' + k](c, w, h, t, hv, age, f); c.restore(); this.label(c, w, h, name); });
  },
  // Vocals: a microphone bobbing on the beat, sound rings coming off its head, notes floating up
  i_vocals(c, w, h, t, hv, age){
    const s = Math.min(w, h), spb = 60 / 104, ph = (t / spb) % 1, pump = Math.pow(1 - ph, 3);
    for (let i = 0; i < 3; i++) { const cyc = (t * 0.45 + i * 0.33) % 1; c.globalAlpha = Math.sin(cyc * Math.PI); this.note(c, w * (0.72 + 0.12 * Math.sin(i * 2 + cyc * 4)), h * (0.78 - cyc * 0.6), s * 0.06, i % 2 ? '#FF8FC7' : '#FFF7E6'); }
    c.globalAlpha = 1;
    c.save(); c.translate(w * 0.44, h * 0.48); c.rotate(-0.35 + Math.sin(t * 2.4) * 0.06 - pump * 0.05); c.scale(s / 128, s / 128); c.translate(0, -pump * 3);
    // rings of sound from the grille
    for (let i = 0; i < 3; i++) { const a = Math.max(0, 1 - ((ph + i * 0.33) % 1)); c.globalAlpha = a * (0.6 + 0.4 * hv); c.strokeStyle = '#FF8FC7'; c.lineWidth = 3.2;
      c.beginPath(); c.arc(0, -22, 30 + (1 - a) * 26, -Math.PI * 0.85, -Math.PI * 0.15); c.stroke(); }
    c.globalAlpha = 1;
    c.lineJoin = 'round';
    c.fillStyle = COL.ink; rr(c, -12, -2, 24, 62, 11); c.fill(); c.beginPath(); c.arc(0, -22, 26, 0, Math.PI * 2); c.fill();          // one ink silhouette
    c.fillStyle = COL.coral; rr(c, -8, 2, 16, 54, 8); c.fill(); c.fillStyle = '#D93E62'; rr(c, 2, 2, 6, 54, 3); c.fill();
    c.fillStyle = '#3A3552'; rr(c, -11, -4, 22, 10, 3); c.fill();
    c.fillStyle = '#D9DDE6'; c.beginPath(); c.arc(0, -22, 22, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(0, -22, 22, 0, Math.PI * 2); c.clip(); c.strokeStyle = '#8E94A4'; c.lineWidth = 1.6;
    for (let k = -30; k <= 30; k += 7) { c.beginPath(); c.moveTo(k, -50); c.lineTo(k + 20, 6); c.stroke(); c.beginPath(); c.moveTo(k, 6); c.lineTo(k + 20, -50); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-8, -32, 7, 4, -0.6, 0, Math.PI * 2); c.fill(); c.restore();
    c.lineWidth = 3; c.strokeStyle = COL.ink; c.beginPath(); c.arc(0, -22, 22, 0, Math.PI * 2); c.stroke();
    c.restore();
  },
  // Bass: a four-string bass plucked on the beat; its strings wobble and low booms ripple out of the body
  i_bass(c, w, h, t, hv, age){
    const s = Math.min(w, h), spb = 60 / 104, beat = t / spb, ph = beat % 1, amp = Math.exp(-Math.min(ph * spb, age) * 6) * (age < 0.5 ? 1.8 : 1);
    for (let i = 0; i < 2; i++) { const a = Math.max(0, 1 - ((ph + i * 0.5) % 1)); c.globalAlpha = a * 0.55; c.strokeStyle = '#2EC4B6'; c.lineWidth = 3;
      c.beginPath(); c.arc(w * 0.44, h * 0.62, s * (0.16 + (1 - a) * 0.28), 0, Math.PI * 2); c.stroke(); }
    c.globalAlpha = 1;
    c.save(); c.translate(w * 0.5, h * 0.6); c.rotate(-0.8 + Math.pow(1 - ph, 3) * 0.04); c.scale(s / 132, s / 132);
    const B = new Path2D('M-5 -8 C-9 -26 -27 -30 -22 -10 C-31 2 -30 28 -17 38 C-7 46 13 46 21 35 C31 23 27 6 20 -1 C27 -20 19 -36 7 -22 C5 -17 4 -12 4 -8 Z');
    const neck = pad => rr(c, -4.5 - pad, -86 - pad, 9 + pad * 2, 82 + pad * 2, 3), head = pad => rr(c, -7 - pad, -104 - pad, 13 + pad * 2, 20 + pad * 2, 4);
    c.lineJoin = 'round'; c.strokeStyle = COL.ink; c.lineWidth = 8; c.stroke(B); c.fillStyle = COL.ink; neck(4); c.fill(); head(4); c.fill();
    c.fillStyle = '#2EC4B6'; c.fill(B);
    c.save(); c.clip(B); c.fillStyle = '#1E948A'; c.translate(7, 6); c.fill(B); c.restore();
    c.save(); c.clip(B); c.fillStyle = '#2EC4B6'; c.translate(2, 1); c.scale(0.94, 0.94); c.fill(B); c.restore();
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(-15, 8, 3, 12, 0.15, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8A5A3B'; neck(0); c.fill(); c.fillStyle = '#5E3A26'; head(0); c.fill();
    c.fillStyle = 'rgba(30,27,46,.45)'; for (let k = 1; k < 7; k++) c.fillRect(-4.5, -4 - k * 11, 9, 1.5);
    c.fillStyle = COL.ink; rr(c, -9, 8, 18, 7, 3); c.fill(); rr(c, -8, 28, 16, 5, 2); c.fill();
    c.fillStyle = '#FFF7E6'; for (const y of [-101, -95, -89]) { c.beginPath(); c.arc(-10, y, 2.3, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.5; c.strokeStyle = COL.ink; c.stroke(); }
    c.strokeStyle = '#FFF7E6'; c.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { const x = -3 + k * 2; c.beginPath(); c.moveTo(x, -88);
      for (let y = -86; y <= 33; y += 3) { const u = (y + 86) / 119; c.lineTo(x + Math.sin(u * Math.PI) * Math.sin(t * 60 + k * 2 + y * 0.03) * amp * 2.2, y); } c.stroke(); }
    c.restore();
    // a plucking thumb
    c.save(); c.translate(w * 0.5, h * 0.6); c.rotate(-0.8); c.scale(s / 132, s / 132); const pk = Math.min(1, ph * spb / 0.08);
    c.translate(-6 + 12 * pk, 10); c.fillStyle = '#C98A5C'; c.beginPath(); c.ellipse(0, 0, 5, 7, 0.3, 0, Math.PI * 2); c.fill(); c.lineWidth = 2.4; c.strokeStyle = COL.ink; c.stroke(); c.restore();
  },
  // Keys: a little synth whose keys go down in chords on the beat, a note popping up off each one
  i_keys(c, w, h, t, hv, age){
    const s = Math.min(w, h), spb = 60 / 104, beat = t / spb, b = Math.floor(beat), ph = beat % 1;
    const chords = [[0, 2, 4], [3, 5, 0], [4, 6, 1], [3, 5, 0]], down = chords[((b % 4) + 4) % 4], hit = ph < 0.55 || age < 0.3;
    const x0 = w * 0.1, kw = w * 0.8, y0 = h * 0.4, kh = h * 0.3, n = 7, ww = kw / n;
    c.fillStyle = COL.ink; rr(c, x0 - 5, h * 0.2 - 4, kw + 10, kh + h * 0.22 + 8, 9); c.fill();
    c.fillStyle = '#3A3354'; rr(c, x0 - 2, h * 0.2 - 1, kw + 4, h * 0.19, 6); c.fill();
    c.fillStyle = '#12343F'; rr(c, x0 + kw * 0.36, h * 0.235, kw * 0.34, h * 0.11, 3); c.fill();
    c.strokeStyle = '#8FE3A0'; c.lineWidth = 1.6; c.beginPath(); for (let k = 0; k <= 20; k++) { const x = x0 + kw * (0.37 + 0.32 * k / 20), y = h * 0.29 + Math.sin(k * 0.9 + t * 8) * h * 0.03 * (hit ? 1 : 0.4); k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    for (const [kx, col] of [[0.12, COL.coral], [0.24, COL.sun], [0.84, COL.teal]]) { c.beginPath(); c.arc(x0 + kw * kx, h * 0.29, s * 0.04, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 1.6; c.strokeStyle = COL.ink; c.stroke(); }
    for (let k = 0; k < n; k++) { const on = hit && down.includes(k), dy = on ? 2 : 0;
      c.fillStyle = on ? '#FFE37A' : '#FFF7E6'; rr(c, x0 + k * ww + 1, y0 + dy, ww - 2, kh - dy, 3); c.fill(); c.lineWidth = 1.8; c.strokeStyle = COL.ink; c.stroke();
      if (on && ph < 0.4) { c.globalAlpha = 1 - ph / 0.4; this.note(c, x0 + (k + 0.5) * ww, y0 - s * 0.02 - ph * s * 0.35, s * 0.045, '#FFE37A'); c.globalAlpha = 1; } }
    c.fillStyle = COL.ink; for (const k of [1, 2, 4, 5, 6]) rr(c, x0 + k * ww - ww * 0.28, y0, ww * 0.56, kh * 0.58, 2), c.fill();
  },
  // Drums: a snare with two sticks trading hits, the head squashing and a star popping off each hit
  i_drums(c, w, h, t, hv, age){
    const s = Math.min(w, h), spb = 60 / 104, eighth = t / (spb / 2), e = Math.floor(eighth), ph = eighth % 1, lr = ((e % 2) + 2) % 2;
    const q = Math.exp(-ph * 5) * (age < 0.3 ? 1.5 : 1), cx = w * 0.5, cy = h * 0.52, rx = s * 0.3, ry = s * 0.09, dh = s * 0.2;
    c.save(); c.translate(cx, cy); c.scale(1 + 0.04 * q, 1 - 0.06 * q); c.translate(-cx, -cy);
    c.fillStyle = COL.ink; c.beginPath(); c.ellipse(cx, cy + dh, rx + 3, ry + 3, 0, 0, Math.PI * 2); c.fill(); c.fillRect(cx - rx - 3, cy, rx * 2 + 6, dh); c.beginPath(); c.ellipse(cx, cy, rx + 3, ry + 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = COL.coral; c.beginPath(); c.ellipse(cx, cy + dh, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.fillRect(cx - rx, cy, rx * 2, dh);
    c.fillStyle = '#D93E62'; c.fillRect(cx + rx * 0.45, cy, rx * 0.55, dh);
    c.fillStyle = '#D9DDE6'; for (let k = 0; k < 5; k++) { const x = cx - rx * 0.8 + k * rx * 0.4; rr(c, x - 2.5, cy + dh * 0.2, 5, dh * 0.6, 2); c.fill(); }
    c.fillStyle = '#FFF7E6'; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.lineWidth = 2; c.strokeStyle = COL.ink; c.stroke();
    c.restore();
    // sticks: each one swings down on its own eighth note
    for (const side of [0, 1]) { const mine = side === lr, lift = mine ? Math.min(1, ph / 0.5) : 1 - Math.min(1, ph / 0.2) * 0.6, sg = side ? 1 : -1;
      const hx = cx + sg * s * 0.36, hy = cy - s * 0.3, ang = Math.atan2(cy - hy, (cx + sg * s * 0.06) - hx) - sg * lift * 0.9;
      c.save(); c.translate(hx, hy); c.rotate(ang); c.lineCap = 'round'; c.strokeStyle = COL.ink; c.lineWidth = s * 0.07; c.beginPath(); c.moveTo(-s * 0.06, 0); c.lineTo(s * 0.34, 0); c.stroke();
      c.strokeStyle = '#F6DCA8'; c.lineWidth = s * 0.035; c.stroke(); c.restore();
      if (mine && ph < 0.3) { c.globalAlpha = 1 - ph / 0.3; this.star(c, cx + sg * s * 0.16, cy - s * 0.12 - ph * s * 0.2, s * (0.06 + ph * 0.1), ph * 3, '#FFCE3A'); c.globalAlpha = 1; } }
  },
  // Online, battle: two players face off over a VS with a lightning bolt, lunging in on the beat, a tug of war for the lead
  o_battle(c, w, h, t, hv, age, f){
    const s = Math.min(w, h), spb = 60 / 108, beat = t / spb, ph = beat % 1, lunge = Math.pow(1 - ph, 3), who = Math.floor(beat) % 2;
    c.save(); const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,94,126,.35)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(46,196,182,.35)'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.restore();
    // the bolt behind the VS
    c.save(); c.translate(w / 2, h * 0.44); c.rotate(0.15); c.beginPath(); c.moveTo(-s * 0.05, -s * 0.28); c.lineTo(s * 0.1, -s * 0.28); c.lineTo(s * 0.02, -s * 0.04); c.lineTo(s * 0.12, -s * 0.04); c.lineTo(-s * 0.08, s * 0.28); c.lineTo(0, s * 0.02); c.lineTo(-s * 0.1, s * 0.02); c.closePath();
    c.fillStyle = '#FFCE3A'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke(); c.restore();
    const pl = (x, col, dir, act) => { const px = x + dir * s * 0.05 * (act ? lunge : 0), py = h * 0.5 - (act ? lunge * s * 0.03 : 0), r = s * 0.15;
      c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 3; c.strokeStyle = COL.ink; c.stroke();
      c.fillStyle = COL.ink; c.beginPath(); c.arc(px, py - r * 0.18, r * 0.34, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(px, py + r * 0.72, r * 0.55, Math.PI * 1.08, Math.PI * 1.92); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(px + dir * r * 0.12, py - r * 0.22, r * 0.09, 0, Math.PI * 2); c.fill(); };
    pl(w * 0.2, COL.coral, 1, who === 0); pl(w * 0.8, COL.teal, -1, who === 1);
    c.font = `${Math.round(s * 0.2)}px ${DISPLAY_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 5; c.strokeStyle = COL.ink;
    c.strokeText('VS', w / 2, h * 0.47); c.fillStyle = '#FFF7E6'; c.fillText('VS', w / 2, h * 0.47); c.textAlign = 'left';
    // the lead: a bar across the top that swings toward whoever just scored
    const lead = 0.5 + Math.sin(t * 1.7) * 0.22, bx = w * 0.12, bw = w * 0.76, by = h * 0.12, bh = h * 0.08;
    c.fillStyle = COL.ink; rr(c, bx - 2, by - 2, bw + 4, bh + 4, bh); c.fill();
    c.fillStyle = COL.coral; rr(c, bx, by, bw * lead, bh, bh / 2); c.fill(); c.fillStyle = COL.teal; rr(c, bx + bw * lead, by, bw * (1 - lead), bh, bh / 2); c.fill();
    c.fillStyle = '#FFF7E6'; c.fillRect(bx + bw * lead - 1.5, by - 3, 3, bh + 6);
  },
  o_record(c, w, h, t, hv, age){ c.save(); c.scale(1, 0.8); this.onlineRec(c, w, h, t, hv, age); c.restore(); },
  // Online, share: a paper plane carries your take from the record to three friends, who light up as it passes
  o_share(c, w, h, t, hv, age, f){
    const s = Math.min(w, h), k = Math.min(1, Math.max(0, (f - 0.12) / 0.7)), ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    // the take: a little record with a play triangle
    const rx = w * 0.2, ry = h * 0.58, R = s * 0.14;
    c.beginPath(); c.arc(rx, ry, R, 0, Math.PI * 2); c.fillStyle = '#1D1A2B'; c.fill(); c.lineWidth = 3; c.strokeStyle = COL.ink; c.stroke();
    c.strokeStyle = '#3A3552'; c.lineWidth = 1.2; for (const q of [0.55, 0.75]) { c.beginPath(); c.arc(rx, ry, R * q, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.arc(rx, ry, R * 0.35, 0, Math.PI * 2); c.fillStyle = COL.coral; c.fill();
    c.fillStyle = '#FFF7E6'; c.beginPath(); c.moveTo(rx - R * 0.1, ry - R * 0.16); c.lineTo(rx + R * 0.18, ry); c.lineTo(rx - R * 0.1, ry + R * 0.16); c.closePath(); c.fill();
    // the three friends and the dashed flight path to them
    const fr = [[0.8, 0.26, COL.sun], [0.86, 0.52, COL.teal], [0.72, 0.74, COL.coral]];
    const path = u => { const x0 = rx + R, y0 = ry - R * 0.4, x2 = w * 0.78, y2 = h * 0.2; return [x0 + (x2 - x0) * u, y0 + (y2 - y0) * u - Math.sin(u * Math.PI) * h * 0.2]; };
    c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,247,230,.55)'; c.lineWidth = 2; c.beginPath(); for (let u = 0; u <= 1.001; u += 0.05) { const [x, y] = path(u); u ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
    fr.forEach(([fx, fy, col], i) => { const lit = ease > 0.55 + i * 0.12, x = w * fx, y = h * fy, r = s * 0.075 * (lit ? 1.12 : 1);
      if (lit) { c.globalAlpha = 0.35; c.beginPath(); c.arc(x, y, r * 1.8, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.globalAlpha = 1; }
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = lit ? col : '#4A4462'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = COL.ink; c.stroke();
      c.fillStyle = COL.ink; c.beginPath(); c.arc(x, y - r * 0.18, r * 0.34, 0, Math.PI * 2); c.fill();
      if (lit) this.star(c, x + r * 0.9, y - r * 0.9, r * 0.45, t * 2 + i, '#FFF7E6'); });
    // the plane
    const [px, py] = path(ease), [qx, qy] = path(Math.min(1, ease + 0.02)), a = Math.atan2(qy - py, qx - px);
    if (k > 0 && k < 1) { c.save(); c.translate(px, py); c.rotate(a); const L = s * 0.13;
      c.beginPath(); c.moveTo(L * 0.6, 0); c.lineTo(-L * 0.5, -L * 0.45); c.lineTo(-L * 0.25, 0); c.lineTo(-L * 0.5, L * 0.3); c.closePath(); c.fillStyle = '#FFF7E6'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = COL.ink; c.stroke();
      c.beginPath(); c.moveTo(L * 0.6, 0); c.lineTo(-L * 0.25, 0); c.stroke(); c.restore(); }
  },
  note(c, x, y, r, fill){
    c.lineWidth = 2; c.strokeStyle = COL.ink; c.fillStyle = fill;
    c.beginPath(); c.ellipse(x, y, r, r * 0.75, -0.4, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x + r * 0.85, y - r * 0.2); c.lineTo(x + r * 0.85, y - r * 2.6); c.quadraticCurveTo(x + r * 1.9, y - r * 2.2, x + r * 1.9, y - r * 1.3); c.lineWidth = 2.4; c.stroke();
  },
  // Online, record: three players' takes stacked like tracks, lining up under one playhead; a REC light blinks
  onlineRec(c, w, h, t, hv, age){
    const s = Math.min(w, h), spb = 60 / 108, beat = t / spb, ph = beat % 1, cols = ['#FF5E7E', '#2EC4B6', '#FFCE3A'];
    const x0 = w * 0.12, x1 = w * 0.9, tw = x1 - x0, th = h * 0.16, gap = h * 0.05, top = h * 0.36;
    const hit = age < 0.6 ? 1 - age / 0.6 : 0;
    for (let k = 0; k < 3; k++) {
      // tracks slide in from alternate sides, then lock together on the beat
      const slide = Math.sin(t * 1.3 + k * 2.1) * w * 0.035 * (1 - hit) * (1 - hv * 0.8), y = top + k * (th + gap);
      c.save(); c.translate(slide, 0);
      c.fillStyle = COL.ink; rr(c, x0 - 3, y - 3, tw + 6, th + 6, 9); c.fill();
      c.fillStyle = '#2A2350'; rr(c, x0, y, tw, th, 7); c.fill();
      c.save(); rr(c, x0, y, tw, th, 7); c.clip();
      const n = 16, bw = tw / n;
      for (let i = 0; i < n; i++) { const bx = x0 + i * bw, pos = (i / n) * 4 - beat * 0.5, local = ((pos % 1) + 1) % 1;
        const v = 0.25 + 0.55 * Math.abs(Math.sin(i * 1.7 + k * 3.1 + Math.floor(beat * 2 + i * 0.13) * 0.9)) * (0.5 + 0.5 * Math.pow(1 - local, 2));
        const bh = Math.min(th - 4, th * v * (0.9 + 0.5 * hit)); c.fillStyle = cols[k]; rr(c, bx + 1.2, y + (th - bh) / 2, bw - 2.4, bh, 2); c.fill(); }
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
    for (let i = 0; i < 3; i++) { const a = Math.max(0, Math.sin(((t * 1.2 - i * 0.18) % 1) * Math.PI)) * (0.4 + 0.6 * Math.max(hv, hit)); c.globalAlpha = a;
      c.beginPath(); c.arc(x1 - s * 0.06, ry + s * 0.04, s * (0.05 + i * 0.05), -Math.PI * 0.85, -Math.PI * 0.15); c.stroke(); }
    c.globalAlpha = 1;
    c.beginPath(); c.arc(x1 - s * 0.06, ry + s * 0.04, s * 0.028, 0, Math.PI * 2); c.fillStyle = '#FFF7E6'; c.fill(); c.lineWidth = 2; c.strokeStyle = COL.ink; c.stroke();
  },
};
