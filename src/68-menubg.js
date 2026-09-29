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
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#FFF4E6"/><g opacity=".38">${seigaiha(W, H, '#5FB7C9')}</g>${body}</svg>`;
  }
  // the mode buttons' icons, in the same ink style
  const star = (x, y, R, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (x + q * Math.cos(a)).toFixed(1) + ' ' + (y + q * Math.sin(a)).toFixed(1); } return d + 'Z'; };
  const ICONS = {
    // an electric guitar with a note flying off it
    play: () => `<g transform="translate(-6 8) rotate(28) scale(.9)">${ITEMS.electric('i1')}</g><g transform="translate(30 -30) rotate(12) scale(.55)">${ITEMS.notes()}</g>`,
    // a gold record with a star on the label: the career
    story: () => `<circle r="40" fill="#FFCE3A" ${ink(4)}/><clipPath id="gr"><circle r="40"/></clipPath><g clip-path="url(#gr)"><circle cx="9" cy="8" r="40" fill="#E5AE14"/></g><circle r="40" fill="none" ${ink(4)}/>
      ${[33, 27, 21].map(r => `<circle r="${r}" fill="none" stroke="#C78F0C" stroke-width="1.8"/>`).join('')}<path d="M-28 -22 A34 34 0 0 1 2 -34" fill="none" stroke="#FFF1A8" stroke-width="4" stroke-linecap="round"/>
      <circle r="14" fill="#FF5E7E" ${ink(3)}/><path d="${star(0, 0, 9, 4)}" fill="#FFF7E6" ${ink(2)}/><path d="${star(34, -34, 9, 4)}" fill="#FFF7E6" ${ink(2.5)}/>`,
    // two guitars crossed like swords, with a spark where they meet
    battle: () => `<g transform="translate(18 16) rotate(-32) scale(.72)">${ITEMS.electric('b1')}</g><g transform="scale(-1 1) translate(18 16) rotate(-32) scale(.72)">${ITEMS.electric('b2').replace(/#FF5E7E/g, '#2EC4B6').replace(/#D93F61/g, '#23A396')}</g>
      <path d="${star(0, -14, 15, 6.5)}" fill="#FFCE3A" ${ink(3)}/>`,
  };
  const icon = k => `<svg viewBox="-50 -50 100 100" width="100%" height="100%" aria-hidden="true">${ICONS[k]()}</svg>`;
  let url = '';
  return {
    tile, icon,
    apply(){
      if (!url) url = 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tile()) + '")';
      document.documentElement.style.setProperty('--menu-bg', url);
      for (const [id, k] of [['btn-play', 'play'], ['btn-story', 'story'], ['btn-battle', 'battle']]) { const m = document.querySelector('#' + id + ' .mi'); if (m) m.innerHTML = icon(k); }
    },
  };
})();
