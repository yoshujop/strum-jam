/* =====================================================================
   Scenes: Story-mode backdrops, one per era of an artist's career.
   Claude picks a setting, time of day, weather, palette, props and a
   sign from this vocabulary; the scene is drawn here as an SVG (cached
   per size, like the street venue) plus a few live effects on canvas.
   Places only: never people, logos or album art.
   ===================================================================== */
const Scenes = (() => {
  const SETTINGS = ['street', 'campus', 'club', 'garage', 'studio', 'church', 'theater', 'arena', 'festival', 'mansion', 'rooftop', 'beach', 'countryside', 'mountains', 'desert', 'cosmic', 'artspace'];
  const PROPS = ['cd-table', 'boombox', 'books', 'speakers', 'amps', 'turntables', 'piano', 'trophies', 'plants', 'flowers', 'candles', 'surfboards', 'hay-bales', 'campfire', 'crystals', 'sculpture', 'balloons',
    'disco-ball', 'chandelier', 'pennants', 'string-lights', 'lasers', 'pyro'];
  const WEATHER = ['none', 'rain', 'snow', 'confetti', 'embers', 'haze', 'stars'];
  const TIMES = ['day', 'dusk', 'night'];
  const DEF = {
    street:      { time: 'night', pal: ['#4B3F7A', '#FF5E7E', '#FFCE3A'], props: ['cd-table', 'boombox'], sign: 'THE BLOCK' },
    campus:      { time: 'day',   pal: ['#9A4A36', '#FFCE3A', '#2EC4B6'], props: ['books', 'pennants'], sign: 'STATE U' },
    club:        { time: 'night', pal: ['#3A2350', '#FF4FA0', '#4FE3FF'], props: ['disco-ball', 'speakers'], sign: 'LIVE' },
    garage:      { time: 'dusk',  pal: ['#56607A', '#FFB020', '#FF5E7E'], props: ['amps', 'plants'], sign: 'PRACTICE' },
    studio:      { time: 'night', pal: ['#2E3A5C', '#FFCE3A', '#FF5E7E'], props: ['speakers', 'turntables'], sign: 'RECORDING' },
    church:      { time: 'day',   pal: ['#CDBB94', '#7B5CF0', '#FFCE3A'], props: ['candles', 'flowers'], sign: '' },
    theater:     { time: 'night', pal: ['#8E1B3D', '#FFCE3A', '#FFB199'], props: ['flowers', 'piano'], sign: 'TONIGHT' },
    arena:       { time: 'night', pal: ['#1A1633', '#FF5E7E', '#4FE3FF'], props: ['pyro', 'lasers'], sign: 'SOLD OUT' },
    festival:    { time: 'dusk',  pal: ['#3B2A63', '#FF8A5B', '#FFCE3A'], props: ['balloons', 'string-lights'], sign: 'FEST' },
    mansion:     { time: 'night', pal: ['#EFE2C6', '#D4A537', '#7B5CF0'], props: ['piano', 'chandelier'], sign: '' },
    rooftop:     { time: 'night', pal: ['#2B2456', '#FFCE3A', '#FF5E7E'], props: ['string-lights', 'plants'], sign: 'ROOFTOP' },
    beach:       { time: 'dusk',  pal: ['#2E7BB8', '#FF8A5B', '#FFCE3A'], props: ['surfboards'], sign: 'SURF' },
    countryside: { time: 'day',   pal: ['#6FAF5A', '#C0392B', '#FFCE3A'], props: ['hay-bales', 'string-lights'], sign: '' },
    mountains:   { time: 'dusk',  pal: ['#3E5C8A', '#FFB020', '#FFF7E6'], props: ['campfire'], sign: '', weather: 'snow' },
    desert:      { time: 'day',   pal: ['#E08A4A', '#2EC4B6', '#FFCE3A'], props: ['speakers'], sign: '', weather: 'haze' },
    cosmic:      { time: 'night', pal: ['#1B1340', '#B8A6FF', '#4FE3FF'], props: ['crystals', 'lasers'], sign: '', weather: 'stars' },
    artspace:    { time: 'day',   pal: ['#F4F1EA', '#E5484D', '#1E1B2E'], props: ['sculpture'], sign: '' },
  };
  const OVERHEAD = ['disco-ball', 'chandelier', 'pennants', 'string-lights', 'lasers', 'pyro'];
  const INK = '#1E1B2E', INK2 = '#12101E';

  /* ---------- validation: anything from Claude or storage ---------- */
  const hexOk = h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h.trim());
  function validate(o){
    o = o && typeof o === 'object' ? o : {};
    const setting = SETTINGS.includes(o.setting) ? o.setting : 'street';
    const d = DEF[setting];
    const time = TIMES.includes(o.time) ? o.time : d.time;
    const weather = WEATHER.includes(o.weather) ? o.weather : (d.weather || 'none');
    const pin = Array.isArray(o.palette) ? o.palette : [];
    const pal = [0, 1, 2].map(i => hexOk(pin[i]) ? pin[i].trim().toUpperCase() : d.pal[i]);
    let props = (Array.isArray(o.props) ? o.props : []).filter(p => PROPS.includes(p));
    props = [...new Set(props)].slice(0, 3);
    if (!props.length) props = d.props.slice();
    const sign = String(o.sign == null ? d.sign : o.sign).replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 16).toUpperCase();
    const sc = { setting, time, weather, palette: pal, props, sign };
    sc.key = [setting, time, weather, pal.join(''), props.join(','), sign].join('|');
    return sc;
  }

  /* ---------- small helpers ---------- */
  const f = n => Math.round(n * 10) / 10;
  const R = (x, y, w, h, fill, a) => `<rect x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}" fill="${fill}" ${a || ''}/>`;
  const C = (x, y, r, fill, a) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(0, r))}" fill="${fill}" ${a || ''}/>`;
  const E = (x, y, rx, ry, fill, a) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(Math.max(0, rx))}" ry="${f(Math.max(0, ry))}" fill="${fill}" ${a || ''}/>`;
  const P = (d, fill, a) => `<path d="${d}" fill="${fill}" ${a || ''}/>`;
  const L = (x1, y1, x2, y2, col, w, a) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col}" stroke-width="${w}" ${a || ''}/>`;
  const ink = (w, c) => `stroke="${c || INK2}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const T = (x, y, size, fill, str, a) => `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" fill="${fill}" text-anchor="middle" font-family="Arial Black, Impact, Haettenschweiler, sans-serif" font-weight="900" ${a || ''}>${str}</text>`;
  function mix(a, b, t){
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  const lum = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  function rng(seed){ let s = (seed % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  /* ---------- skies ---------- */
  function sky(ctx){
    const { W, H, F, time, pal } = ctx;
    const tint = pal[0];
    const stops = time === 'day' ? [['#5CC0FF', 0], ['#BDEBFF', 1]] : time === 'dusk' ? [['#2B2156', 0], ['#B8467C', 0.58], ['#FFB36B', 1]] : [['#100D26', 0], ['#2E2556', 1]];
    ctx.defs += `<linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${f(F)}">${stops.map(([c, o]) => `<stop offset="${o}" stop-color="${mix(c, tint, 0.14)}"/>`).join('')}</linearGradient>`;
    return R(0, 0, W, H, 'url(#sky)');
  }
  function celestial(ctx, o){
    const { W, T: top, bh, time, rnd } = ctx; o = o || {};
    let s = '';
    const sx = W * (o.x || 0.8);
    if (time === 'night') {
      for (let i = 0; i < Math.round(W / 9); i++) { const y = rnd() * (top + bh * 0.6); s += C(rnd() * W, y, rnd() < 0.15 ? 1.8 : 1, '#FFF7E6', `opacity="${f(0.35 + rnd() * 0.6)}"`); }
      if (!o.noMoon) { const r = bh * 0.075, y = top + bh * 0.16; s += C(sx, y, r * 1.9, '#FFF7E6', 'opacity=".08"') + C(sx, y, r, '#FFF3C4') + C(sx + r * 0.45, y - r * 0.2, r * 0.85, mix('#2E2556', ctx.pal[0], 0.14)); }
    } else if (time === 'day') {
      if (!o.noSun) { const r = bh * 0.08, y = top + bh * 0.14; s += C(sx, y, r * 1.8, '#FFF3C4', 'opacity=".35"') + C(sx, y, r, '#FFE066', ink(3, '#F2A71B')); }
      s += cloud(W * 0.18, top + bh * 0.12, bh * 0.05, '#FFFFFF') + cloud(W * 0.55, top + bh * 0.2, bh * 0.04, '#FFFFFF');
    } else {
      if (!o.noSun) { const r = bh * 0.14, y = ctx.hz || (top + bh * 0.62); s += C(sx, y, r * 1.6, '#FFD9A0', 'opacity=".25"') + C(sx, y, r, '#FFCF6B'); }
      s += cloud(W * 0.22, top + bh * 0.16, bh * 0.045, '#FFB3B8') + cloud(W * 0.6, top + bh * 0.1, bh * 0.035, '#F9A1C0');
    }
    return s;
  }
  function cloud(x, y, r, col){
    return `<g opacity=".9">${C(x, y, r * 1.2, col)}${C(x + r * 1.3, y + r * 0.2, r, col)}${C(x - r * 1.3, y + r * 0.3, r * 0.9, col)}${R(x - r * 2.1, y + r * 0.3, r * 4.4, r * 0.9, col, `rx="${f(r * 0.45)}"`)}</g>`;
  }
  // a row of buildings with lit windows
  function skyline(ctx, base, hMin, hMax, col, winCol, winP, wide){
    const { W, rnd } = ctx; let s = '', x = -10 - rnd() * 40;
    while (x < W) {
      const bw = (wide || 50) + rnd() * 70, bh = hMin + rnd() * (hMax - hMin), by = base - bh;
      s += R(x, by, bw, bh + 4, col);
      if (rnd() < 0.25) s += R(x + bw * 0.3, by - bh * 0.08, bw * 0.4, bh * 0.08 + 1, col);
      for (let wy = by + 8; wy < base - 10; wy += 15) for (let wx = x + 7; wx < x + bw - 9; wx += 13) if (rnd() < winP) s += R(wx, wy, 7, 9, rnd() < 0.72 ? winCol : '#7FE7FF', `opacity="${f(0.5 + rnd() * 0.4)}"`);
      x += bw + 3;
    }
    return s;
  }
  function hills(ctx, y, amp, col, n, a){
    const { W, rnd } = ctx; let d = `M-10 ${f(y + amp)}`;
    const k = n || 4;
    for (let i = 0; i <= k; i++) { const x = -10 + (W + 20) * i / k, cy = y - amp * (0.4 + rnd() * 0.6); d += ` Q ${f(x - (W + 20) / k / 2)} ${f(cy)} ${f(x)} ${f(y + amp * (rnd() * 0.3))}`; }
    d += ` L ${f(W + 10)} ${f(ctx.H)} L -10 ${f(ctx.H)} Z`;
    return P(d, col, a);
  }
  const tree = (x, y, r, col, trunk) => R(x - r * 0.12, y - r * 0.9, r * 0.24, r * 0.9, trunk || '#6B4A2B') + C(x, y - r * 1.5, r, col) + C(x - r * 0.6, y - r * 1.1, r * 0.7, col) + C(x + r * 0.62, y - r * 1.15, r * 0.72, col) + C(x - r * 0.25, y - r * 1.75, r * 0.45, mix(col, '#FFFFFF', 0.18));
  const pine = (x, y, h, col) => P(`M${f(x)} ${f(y - h)} L${f(x + h * 0.32)} ${f(y - h * 0.1)} L${f(x - h * 0.32)} ${f(y - h * 0.1)} Z`, col) + R(x - h * 0.04, y - h * 0.12, h * 0.08, h * 0.12, '#4A3320');
  function palm(x, y, h, lean, col){
    const tx = x + lean * h * 0.35, ty = y - h;
    let s = P(`M${f(x - h * 0.03)} ${f(y)} Q ${f(x + lean * h * 0.05)} ${f(y - h * 0.5)} ${f(tx - h * 0.02)} ${f(ty)} L ${f(tx + h * 0.03)} ${f(ty)} Q ${f(x + lean * h * 0.12)} ${f(y - h * 0.5)} ${f(x + h * 0.04)} ${f(y)} Z`, '#8A5A34');
    for (const a of [-2.7, -2.2, -1.6, -1.0, -0.45, 0.1]) { const ex = tx + Math.cos(a) * h * 0.42, ey = ty + Math.sin(a) * h * 0.2 + h * 0.12;
      s += P(`M${f(tx)} ${f(ty)} Q ${f((tx + ex) / 2)} ${f(ty - h * 0.14)} ${f(ex)} ${f(ey)} Q ${f((tx + ex) / 2)} ${f(ty - h * 0.02)} ${f(tx)} ${f(ty + h * 0.03)} Z`, col); }
    return s;
  }
  // light cone from a lamp
  const cone = (x, y, w, h, col, op) => P(`M${f(x - w * 0.12)} ${f(y)} L${f(x + w * 0.12)} ${f(y)} L${f(x + w / 2)} ${f(y + h)} L${f(x - w / 2)} ${f(y + h)} Z`, col, `opacity="${op || 0.14}"`);

  /* ---------- floors (the stage deck the band stands on) ---------- */
  function floor(ctx, kind, base){
    const { W, H, F, rnd, pal } = ctx; const dh = H - F; let s = '';
    const n = Math.max(3, Math.round(dh / 16)), ph = dh / n;
    const planks = (c0, seam, grain, lip) => {
      s += R(0, F, W, dh, c0);
      for (let i = 0; i < n; i++) {
        const y = F + i * ph;
        s += R(0, y, W, ph, i % 2 ? '#000' : '#fff', 'opacity=".05"');
        let x = -rnd() * 120;
        while (x < W) { const Lh = 110 + rnd() * 160; s += L(x, y, x, y + ph, seam, 2) + C(x + 6, y + ph * 0.3, 1.3, seam) + C(x + 6, y + ph * 0.7, 1.3, seam);
          s += P(`M${f(x + 12)} ${f(y + ph * (0.35 + rnd() * 0.3))} q ${f(Lh * 0.3)} ${f(-2 + rnd() * 4)} ${f(Lh * 0.6)} 0 t ${f(Lh * 0.35)} 0`, 'none', `stroke="${grain}" stroke-width="1" opacity=".55"`); x += Lh; }
        s += L(0, y + ph, W, y + ph, seam, 2);
      }
      s += R(0, F - 3, W, 7, lip) + R(0, F + 4, W, 3, seam, 'opacity=".6"');
    };
    if (kind === 'wood') planks(base || '#B98A55', '#5C3D1E', '#7A5129', '#E3B981');
    else if (kind === 'barn') planks(base || '#9A6B45', '#4A2E18', '#6B4526', '#C99A62');
    else if (kind === 'boardwalk') planks(base || '#C9A273', '#7A5638', '#8E6A48', '#EFD3A8');
    else if (kind === 'darkwood') planks(base || '#5A3A28', '#2A1A10', '#3E281A', '#8A6040');
    else if (kind === 'pavement') {
      s += R(0, F, W, dh, '#77708A');
      for (let x = -rnd() * 60; x < W; x += 90) s += L(x, F, x - 30, H, '#5A5470', 2);
      s += L(0, F + dh * 0.45, W, F + dh * 0.45, '#5A5470', 2) + R(0, F - 4, W, 8, '#A8A2BC') + R(0, F + 4, W, 3, '#4A4460', 'opacity=".7"');
      for (let i = 0; i < 40; i++) s += C(rnd() * W, F + 6 + rnd() * (dh - 8), 1 + rnd() * 1.5, '#5E5874', 'opacity=".6"');
    } else if (kind === 'stone') {
      s += R(0, F, W, dh, '#CFC6B4');
      for (let i = 0; i < n; i++) { const y = F + i * ph; s += R(0, y, W, 3, '#A89E8A'); for (let x = (i % 2) * 40 - 40; x < W; x += 80) s += L(x, y, x, y + ph, '#B3A992', 2); }
      s += R(0, F - 4, W, 8, '#EDE6D6');
    } else if (kind === 'concrete') {
      s += R(0, F, W, dh, '#8E8C96') + E(W * 0.78, F + dh * 0.55, W * 0.08, dh * 0.2, '#6E6B78', 'opacity=".6"');
      for (let x = 0; x < W; x += 160) s += L(x, F, x, H, '#77747F', 2);
      s += R(0, F - 3, W, 6, '#AAA8B2');
    } else if (kind === 'marble') {
      const a = base || '#F2EBDD', b = mix(a, INK, 0.72);
      s += R(0, F, W, dh, a);
      const sq = Math.max(18, dh / 3.2);
      for (let r = 0; r * sq < dh; r++) for (let x = (r % 2) * sq; x < W; x += sq * 2) s += R(x, F + r * sq, sq, sq, b);
      s += R(0, F - 4, W, 8, pal[1]) + R(0, F + 4, W, 2, INK2, 'opacity=".5"');
    } else if (kind === 'sand') {
      s += R(0, F, W, dh, '#E9C98F');
      for (let i = 0; i < 26; i++) s += P(`M${f(rnd() * W)} ${f(F + 8 + rnd() * (dh - 10))} q 10 -4 20 0`, 'none', 'stroke="#C9A566" stroke-width="2"');
      s += R(0, F - 3, W, 6, '#F6DDA8');
    } else if (kind === 'cracked') {
      s += R(0, F, W, dh, '#D39A62');
      for (let i = 0; i < 18; i++) { const x = rnd() * W, y = F + 6 + rnd() * (dh - 10); s += P(`M${f(x)} ${f(y)} l ${f(10 + rnd() * 16)} ${f(-3 + rnd() * 6)} l ${f(8 + rnd() * 10)} ${f(-4 + rnd() * 8)}`, 'none', 'stroke="#A8703E" stroke-width="2"'); }
      s += R(0, F - 3, W, 6, '#E8B47C');
    } else if (kind === 'tar') {
      s += R(0, F, W, dh, '#4A4658');
      for (let i = 0; i < 60; i++) s += C(rnd() * W, F + 4 + rnd() * (dh - 6), 1.2, '#6E6A80');
      s += R(0, F - 3, W, 6, '#6A6680');
    } else if (kind === 'carpet') {
      s += R(0, F, W, dh, '#BFB3A0') + R(W * 0.28, F, W * 0.44, dh, base || '#A0243F') + R(W * 0.28, F, 4, dh, pal[1]) + R(W * 0.72 - 4, F, 4, dh, pal[1]);
      s += R(0, F - 3, W, 6, '#DDD2BE');
    } else if (kind === 'blackstage') {
      s += R(0, F, W, dh, '#1B1828');
      for (let x = 0; x < W; x += 120) s += L(x, F, x, H, '#262236', 2);
      s += `<g filter="url(#gl)">${R(0, F - 3, W, 5, pal[2])}</g>`;
    } else if (kind === 'grid') {
      s += R(0, F, W, dh, '#120E26');
      const cx = W / 2, g = pal[2];
      for (let i = -12; i <= 12; i++) s += L(cx + i * W * 0.02, F, cx + i * W * 0.12, H, g, 1.5, 'opacity=".6"');
      for (let k = 1; k < 7; k++) { const y = F + dh * Math.pow(k / 7, 1.7); s += L(0, y, W, y, g, 1.5, 'opacity=".55"'); }
      s += `<g filter="url(#gl)">${R(0, F - 2, W, 4, g)}</g>`;
    } else if (kind === 'gloss') {
      const a = mix(pal[0], '#FFFFFF', lum(pal[0]) > 0.6 ? 0.2 : 0.05), b = mix(pal[0], INK, 0.25);
      ctx.defs += `<linearGradient id="gls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
      s += R(0, F, W, dh, 'url(#gls)') + R(0, F - 2, W, 3, mix(pal[0], INK, 0.5));
      for (const k of [0.3, 0.55, 0.8]) s += L(0, F + dh * k, W, F + dh * k, '#FFFFFF', 1, 'opacity=".25"');
    } else if (kind === 'snowdeck') {
      planks('#8E6446', '#4A2E18', '#6B4526', '#FFFFFF');
      for (let i = 0; i < 10; i++) s += E(rnd() * W, F + 2, 20 + rnd() * 40, 4, '#FFFFFF', 'opacity=".9"');
    }
    return s;
  }

  // shared ceiling truss with a row of lamps
  function truss(ctx, y, col, lamp){
    const { W } = ctx; let s = R(0, y, W, 12, col) + R(0, y + 12, W, 3, INK2, 'opacity=".4"');
    for (let x = -6; x < W; x += 22) s += L(x, y + 1, x + 11, y + 11, mix(col, '#FFFFFF', 0.25), 2) + L(x + 11, y + 11, x + 22, y + 1, mix(col, '#FFFFFF', 0.25), 2);
    if (lamp) for (let x = W * 0.06; x < W; x += W / 9) s += R(x - 7, y + 12, 14, 12, INK2, `rx="3"`) + C(x, y + 25, 4.5, lamp, 'filter="url(#gl)"');
    return s;
  }

  /* ---------- a sign in the scene (the era's venue/place name) ---------- */
  function neon(x, y, size, col, str, a){ return str ? `<g filter="url(#gl)" ${a || ''}>${T(x, y, size, col, str)}</g>` : ''; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- the settings ---------- */
  const DRAW = {
    street(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx; const night = time !== 'day';
      let s = sky(ctx) + celestial(ctx, { x: 0.62 });
      s += skyline(ctx, F - bh * 0.3, bh * 0.4, bh * 0.85, mix('#221C45', pal[0], 0.3), '#FFD479', night ? 0.3 : 0.06);
      s += skyline(ctx, F - bh * 0.3, bh * 0.2, bh * 0.55, mix('#2B2456', pal[0], 0.4), '#FFD479', night ? 0.35 : 0.08);
      // tenement with a fire escape
      const brick = mix('#8A4338', pal[0], 0.15), bw = W * 0.16, by = top - 6, bc = night ? mix(brick, INK, 0.35) : brick;
      s += R(-4, by, bw + 4, F - by, bc);
      for (let y = by + bh * 0.08; y < F - bh * 0.2; y += bh * 0.22) {
        for (const wx of [0.22, 0.6]) s += R(bw * wx, y, bw * 0.24, bh * 0.12, night && rnd() < 0.6 ? '#FFD479' : mix(bc, INK, 0.5), ink(2));
        s += R(bw * 0.12, y + bh * 0.13, bw * 0.9, 4, INK2) + L(bw * 0.2, y + bh * 0.13, bw * 0.8, y + bh * 0.13 + bh * 0.22, INK2, 2.5);
        for (let k = 0; k < 6; k++) s += L(bw * (0.12 + k * 0.17), y + bh * 0.13, bw * (0.12 + k * 0.17), y + bh * 0.07, INK2, 1.5);
        s += L(bw * 0.12, y + bh * 0.07, bw * 1.02, y + bh * 0.07, INK2, 1.5);
      }
      // back wall with a painted tag
      const wy = F - bh * 0.42, wc = night ? mix('#6A3F4C', pal[0], 0.35) : mix('#B5654F', pal[0], 0.2);
      s += R(bw, wy, W - bw, F - wy, wc) + R(bw, wy, W - bw, 6, mix(wc, '#FFFFFF', 0.15));
      for (let y = wy + 12, r = 0; y < F; y += 12, r++) { s += L(bw, y, W, y, mix(wc, INK, 0.3), 1.5); for (let x = bw + (r % 2) * 14; x < W; x += 28) s += L(x, y - 12, x, y, mix(wc, INK, 0.3), 1.5); }
      if (sign) {
        const sz = Math.min(bh * 0.2, (W * 0.3) / Math.max(3, sign.length) * 1.5);
        s += `<g transform="rotate(-5 ${f(W * 0.3)} ${f(F - bh * 0.18)})">${T(W * 0.3, F - bh * 0.13, sz, pal[1], esc(sign), ink(sz * 0.14) + ' paint-order="stroke"')}`;
        for (let i = 0; i < 5; i++) { const dx = W * 0.3 + (rnd() - 0.5) * sz * sign.length * 0.5; s += R(dx, F - bh * 0.13, 2.5, 8 + rnd() * 14, pal[1], 'rx="1.2"'); }
        s += '</g>';
      }
      s += T(W * 0.72, F - bh * 0.1, bh * 0.12, pal[2], '★', ink(3) + ' paint-order="stroke" opacity=".85"');
      // a streetlight
      const lx = W * 0.84, ly = top + bh * 0.1;
      if (night) s += cone(lx - bh * 0.1, ly + 10, bh * 0.7, F - ly - 10, '#FFE9A8', 0.16);
      s += R(lx - 3, ly, 6, F - ly, INK2) + P(`M${f(lx)} ${f(ly + 4)} q 0 -14 -${f(bh * 0.1)} -12`, 'none', ink(5)) + R(lx - bh * 0.1 - 16, ly - 12, 32, 12, INK2, 'rx="5"') + E(lx - bh * 0.1, ly + 1, 12, 4, night ? '#FFF1B8' : '#DDD', night ? 'filter="url(#gl)"' : '');
      s += floor(ctx, 'pavement');
      return s;
    },
    campus(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx; const night = time === 'night';
      let s = sky(ctx) + celestial(ctx, { x: 0.86 });
      const hz = F - bh * 0.3;
      for (let x = -20; x < W + 20; x += 28 + rnd() * 20) s += C(x, hz - bh * 0.02, 18 + rnd() * 16, night ? '#1F3A34' : '#4E9A5A');
      // the hall: brick wings with arched windows
      const brick = night ? mix(pal[0], INK, 0.45) : pal[0], hy = F - bh * 0.56;
      s += R(W * 0.05, hy, W * 0.9, F - hy, brick) + R(W * 0.05, hy - 8, W * 0.9, 10, '#F3EBDD') + R(W * 0.05, F - bh * 0.1, W * 0.9, 5, '#F3EBDD', 'opacity=".7"');
      for (let x = W * 0.4; x < W * 0.92; x += W * 0.07) for (const r of [0.1, 0.3]) {
        const wy = hy + bh * r, ww = W * 0.035, wh = bh * 0.13, lit = night ? (rnd() < 0.6 ? '#FFD479' : '#3A3552') : '#A9DDF5';
        s += P(`M${f(x)} ${f(wy + wh)} V ${f(wy + ww / 2)} A ${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(x + ww)} ${f(wy + ww / 2)} V ${f(wy + wh)} Z`, lit, ink(2.5, '#F3EBDD'));
      }
      // portico with columns and a frieze
      const px0 = W * 0.08, pw = W * 0.28, ptop = F - bh * 0.62;
      s += P(`M${f(px0 - 10)} ${f(ptop)} L${f(px0 + pw / 2)} ${f(ptop - bh * 0.14)} L${f(px0 + pw + 10)} ${f(ptop)} Z`, '#F3EBDD', ink(3));
      s += R(px0 - 10, ptop, pw + 20, bh * 0.1, '#F3EBDD', ink(3));
      if (sign) ctx.front += T(px0 + pw / 2, ptop + bh * 0.078, Math.min(bh * 0.075, pw / Math.max(4, sign.length) * 1.6), INK, esc(sign));
      for (let i = 0; i < 5; i++) { const cx = px0 + pw * (0.08 + i * 0.21); s += R(cx - 7, ptop + bh * 0.1, 14, F - bh * 0.1 - ptop - bh * 0.1, '#FBF6EC', ink(2.5)) + L(cx - 2, ptop + bh * 0.12, cx - 2, F - bh * 0.12, '#D8CDB8', 2); }
      s += R(px0 + pw * 0.3, F - bh * 0.34, pw * 0.4, bh * 0.24, mix(brick, INK, 0.5));
      // clock tower on the far wing
      const tx = W * 0.64, tw = W * 0.07, ty = top + bh * 0.02;
      s += R(tx - tw / 2, ty + bh * 0.1, tw, hy - ty - bh * 0.1, brick, ink(3)) + P(`M${f(tx - tw * 0.62)} ${f(ty + bh * 0.1)} L${f(tx)} ${f(ty - bh * 0.06)} L${f(tx + tw * 0.62)} ${f(ty + bh * 0.1)} Z`, mix(pal[2], INK, 0.3), ink(3));
      s += C(tx, ty + bh * 0.22, tw * 0.33, '#FBF6EC', ink(3)) + L(tx, ty + bh * 0.22, tx, ty + bh * 0.22 - tw * 0.22, INK, 2.5) + L(tx, ty + bh * 0.22, tx + tw * 0.16, ty + bh * 0.22, INK, 2.5);
      // big trees at the edges
      s += tree(W * 0.02, F - bh * 0.02, bh * 0.2, night ? '#24483A' : '#3E8E4E') + tree(W * 0.97, F - bh * 0.02, bh * 0.22, night ? '#24483A' : '#3E8E4E');
      s += floor(ctx, 'stone');
      return s;
    },
    club(ctx){
      const { W, T: top, F, bh, pal, rnd, sign } = ctx; ctx.hang = [0.1, 0.9];
      const wc = mix(pal[0], INK, 0.35);
      let s = R(0, 0, W, ctx.H, wc);
      for (let y = top + 16, r = 0; y < F; y += 13, r++) { s += L(0, y, W, y, mix(wc, INK, 0.35), 1.5); for (let x = (r % 2) * 15; x < W; x += 30) s += L(x, y - 13, x, y, mix(wc, INK, 0.35), 1.5); }
      s += truss(ctx, top, '#2A2540', null);
      for (let i = 0; i < 6; i++) { const x = W * (0.1 + i * 0.16), col = i % 2 ? pal[1] : pal[2]; s += cone(x, top + 14, bh * 0.5, F - top - 14, col, 0.08) + R(x - 7, top + 10, 14, 10, INK2, 'rx="3"') + C(x, top + 22, 4, col, 'filter="url(#gl)"'); }
      // neon sign
      if (sign) { const sw = Math.min(W * 0.26, sign.length * bh * 0.08 + 40), sx = W * 0.2, sy = top + bh * 0.3;
        ctx.front += `<g filter="url(#gl)">${R(sx - sw / 2, sy - bh * 0.1, sw, bh * 0.16, 'none', `rx="${f(bh * 0.05)}" stroke="${pal[1]}" stroke-width="4"`)}</g>` + neon(sx, sy + bh * 0.02, Math.min(bh * 0.1, sw / Math.max(3, sign.length) * 1.5), pal[2], esc(sign)); }
      s += `<g filter="url(#gl)">${P(`M${f(W * 0.72)} ${f(top + bh * 0.16)} l ${f(bh * 0.03)} ${f(bh * 0.07)} l ${f(bh * 0.075)} 0 l -${f(bh * 0.06)} ${f(bh * 0.045)} l ${f(bh * 0.025)} ${f(bh * 0.075)} l -${f(bh * 0.07)} -${f(bh * 0.045)} l -${f(bh * 0.07)} ${f(bh * 0.045)} l ${f(bh * 0.025)} -${f(bh * 0.075)} l -${f(bh * 0.06)} -${f(bh * 0.045)} l ${f(bh * 0.075)} 0 Z`, 'none', `stroke="${pal[1]}" stroke-width="3.5" stroke-linejoin="round"`)}</g>`;
      // back bar with glowing bottles
      const bx = W * 0.7, sy = F - bh * 0.55;
      s += R(bx, sy - 4, W * 0.28, 6, '#8A6A4A') + R(bx, sy + bh * 0.16, W * 0.28, 6, '#8A6A4A');
      for (let row = 0; row < 2; row++) for (let x = bx + 8; x < bx + W * 0.27; x += 13) { const h = 16 + rnd() * 12, y0 = sy - 4 + row * bh * 0.2; s += R(x, y0 - h, 8, h, [pal[1], pal[2], '#8FE3A0', '#FFB020'][Math.floor(rnd() * 4)], 'rx="2" opacity=".85"') + R(x + 2.5, y0 - h - 6, 3, 7, INK2); }
      s += R(bx - 10, F - bh * 0.22, W * 0.3 + 10, bh * 0.22, '#3A2A22', ink(3)) + R(bx - 14, F - bh * 0.24, W * 0.3 + 14, 7, '#6A4A32', ink(2.5));
      // velvet drape on the left
      s += P(`M0 ${f(top + 12)} H ${f(W * 0.07)} Q ${f(W * 0.05)} ${f(F - bh * 0.4)} ${f(W * 0.08)} ${f(F)} H 0 Z`, mix(pal[1], INK, 0.45));
      s += floor(ctx, 'wood');
      return s;
    },
    garage(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      const wc = pal[0];
      let s = R(0, 0, W, ctx.H, wc);
      for (let x = 0; x < W; x += 14) s += R(x, 0, 6, F, mix(wc, '#FFFFFF', 0.1));
      // the roll-up door, open onto the neighbourhood
      const dx = W * 0.3, dw = W * 0.4, dy = F - bh * 0.66;
      ctx.defs += `<clipPath id="door"><rect x="${f(dx)}" y="${f(dy)}" width="${f(dw)}" height="${f(F - dy)}"/></clipPath>`;
      s += `<g clip-path="url(#door)">${sky(ctx)}${celestial(ctx, { x: 0.62 })}`;
      for (let i = 0; i < 4; i++) { const hx = dx + dw * (i * 0.28 - 0.05), hw = dw * 0.24, hy = F - bh * 0.22; s += R(hx, hy, hw, bh * 0.22, time === 'day' ? '#C9D3E6' : '#3A3552') + P(`M${f(hx - 6)} ${f(hy)} L${f(hx + hw / 2)} ${f(hy - bh * 0.1)} L${f(hx + hw + 6)} ${f(hy)} Z`, time === 'day' ? '#8E5A4A' : '#2A2440') + R(hx + hw * 0.35, hy + bh * 0.06, hw * 0.3, bh * 0.08, time === 'day' ? '#A9DDF5' : '#FFD479'); }
      s += R(dx, F - bh * 0.05, dw, bh * 0.05, '#6E6B78') + '</g>';
      for (let y = dy; y < dy + bh * 0.2; y += 10) s += R(dx, y, dw, 10, '#C8CCD6', ink(1.5, '#8E93A3'));
      s += R(dx - 8, dy - 6, dw + 16, F - dy + 6, 'none', ink(8, mix(wc, INK, 0.4)));
      // pegboard with tools
      const pgx = W * 0.04, pgy = F - bh * 0.74, pgw = W * 0.2, pgh = bh * 0.34;
      s += R(pgx, pgy, pgw, pgh, '#C9A273', ink(3));
      for (let y = pgy + 8; y < pgy + pgh; y += 12) for (let x = pgx + 8; x < pgx + pgw; x += 12) s += C(x, y, 1.4, '#8E6A48');
      s += R(pgx + pgw * 0.12, pgy + pgh * 0.2, pgw * 0.05, pgh * 0.6, INK2) + R(pgx + pgw * 0.06, pgy + pgh * 0.15, pgw * 0.17, pgh * 0.12, INK2, 'rx="2"');
      s += P(`M${f(pgx + pgw * 0.4)} ${f(pgy + pgh * 0.8)} L${f(pgx + pgw * 0.46)} ${f(pgy + pgh * 0.25)} a 8 8 0 1 1 10 0 L${f(pgx + pgw * 0.52)} ${f(pgy + pgh * 0.8)} Z`, INK2);
      s += P(`M${f(pgx + pgw * 0.62)} ${f(pgy + pgh * 0.2)} H ${f(pgx + pgw * 0.92)} V ${f(pgy + pgh * 0.45)} L ${f(pgx + pgw * 0.62)} ${f(pgy + pgh * 0.75)} Z`, '#9AA0AE', ink(2));
      if (sign) ctx.front += T(pgx + pgw / 2, pgy - bh * 0.06, Math.min(bh * 0.09, pgw / Math.max(4, sign.length) * 1.8), pal[1], esc(sign), ink(3) + ' paint-order="stroke" letter-spacing="2"');
      // shelf with paint cans
      const shx = W * 0.76, shy = F - bh * 0.62;
      for (const k of [0, 1]) { const y = shy + k * bh * 0.2; s += R(shx, y, W * 0.2, 6, '#8A6A4A', ink(2)); for (let x = shx + 6; x < shx + W * 0.19; x += 22) s += R(x, y - 20, 16, 20, [pal[1], pal[2], '#8FE3A0', '#6CC8FF'][Math.floor(rnd() * 4)], ink(2) + ' rx="2"'); }
      // a bare bulb
      const bx = W * 0.27;
      s += L(bx, top, bx, top + bh * 0.2, INK2, 2) + C(bx, top + bh * 0.2 + 7, 8, '#FFF1B8', 'filter="url(#gl)"') + cone(bx, top + bh * 0.2 + 10, bh * 0.8, F - top - bh * 0.2, '#FFF1B8', 0.08);
      s += floor(ctx, 'concrete') + E(W / 2, F + (ctx.H - F) * 0.35, W * 0.26, (ctx.H - F) * 0.28, pal[1], 'opacity=".85"') + E(W / 2, F + (ctx.H - F) * 0.35, W * 0.22, (ctx.H - F) * 0.2, 'none', `stroke="${mix(pal[1], '#FFFFFF', 0.35)}" stroke-width="3" stroke-dasharray="8 6"`);
      return s;
    },
    studio(ctx){
      const { W, T: top, F, bh, pal, rnd, sign } = ctx;
      const fc = mix(pal[0], INK, 0.2);
      let s = R(0, 0, W, ctx.H, fc);
      const q = Math.max(22, bh * 0.12);
      for (let y = top; y < F; y += q) for (let x = 0, i = 0; x < W; x += q, i++) {
        const v = ((x / q + y / q) | 0) % 2;
        s += R(x + 1, y + 1, q - 2, q - 2, mix(fc, v ? '#FFFFFF' : INK, 0.12), 'rx="2"');
        for (let k = 1; k < 4; k++) s += v ? L(x + q * k / 4, y + 3, x + q * k / 4, y + q - 3, mix(fc, INK, 0.35), 1.5) : L(x + 3, y + q * k / 4, x + q - 3, y + q * k / 4, mix(fc, INK, 0.35), 1.5);
      }
      // control-room window
      const wx = W * 0.3, ww = W * 0.4, wy = F - bh * 0.72, wh = bh * 0.42;
      s += R(wx - 8, wy - 8, ww + 16, wh + 16, '#2A2540', ink(3)) + R(wx, wy, ww, wh, '#1A2A48');
      s += R(wx + ww * 0.05, wy + wh * 0.62, ww * 0.9, wh * 0.38, '#3A3552');
      for (let x = wx + ww * 0.08; x < wx + ww * 0.92; x += 9) { s += L(x, wy + wh * 0.68, x, wy + wh * 0.94, '#8C84AE', 1.5) + R(x - 2.5, wy + wh * (0.72 + rnd() * 0.18), 5, 4, rnd() < 0.3 ? pal[1] : '#E9F3FF'); }
      s += R(wx + ww * 0.34, wy + wh * 0.14, ww * 0.32, wh * 0.36, '#0E1628', ink(2, '#8C84AE'));
      let d = `M${f(wx + ww * 0.36)} ${f(wy + wh * 0.32)}`; for (let k = 1; k <= 20; k++) d += ` L${f(wx + ww * (0.36 + k * 0.014))} ${f(wy + wh * (0.32 + (rnd() - 0.5) * 0.2))}`;
      s += `<g filter="url(#gl)">${P(d, 'none', `stroke="${pal[2]}" stroke-width="2"`)}</g>`;
      s += R(wx + ww * 0.1, wy + wh * 0.3, ww * 0.12, wh * 0.26, '#232036', ink(2)) + R(wx + ww * 0.78, wy + wh * 0.3, ww * 0.12, wh * 0.26, '#232036', ink(2));
      s += L(wx, wy, wx + ww * 0.3, wy + wh, '#FFFFFF', 3, 'opacity=".08"') + L(wx + ww * 0.2, wy, wx + ww * 0.5, wy + wh, '#FFFFFF', 6, 'opacity=".06"');
      // the recording light
      if (sign) { const sw = Math.min(W * 0.22, sign.length * bh * 0.065 + 30), sx = W * 0.16, sy = top + bh * 0.2;
        ctx.front += R(sx - sw / 2, sy - bh * 0.07, sw, bh * 0.13, '#E5484D', ink(3) + ` rx="${f(bh * 0.03)}" filter="url(#gl)"`) + T(sx, sy + bh * 0.03, Math.min(bh * 0.075, sw / Math.max(4, sign.length) * 1.5), '#FFF7E6', esc(sign)); }
      // framed records
      for (const [x, y] of [[0.06, 0.52], [0.17, 0.52], [0.84, 0.3], [0.94, 0.3]]) { const r = bh * 0.07, cx = W * x, cy = top + bh * y;
        s += R(cx - r * 1.35, cy - r * 1.35, r * 2.7, r * 2.7, '#2A2540', ink(3, '#D4A537')) + C(cx, cy, r, '#F2C94C', ink(1.5, '#B8862A')) + C(cx, cy, r * 0.3, pal[1]) + C(cx, cy, 2, INK2); }
      s += floor(ctx, 'wood') + E(W / 2, F + (ctx.H - F) * 0.4, W * 0.3, (ctx.H - F) * 0.32, mix(pal[1], INK, 0.2), 'opacity=".9"');
      return s;
    },
    church(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      const wc = time === 'night' ? mix(pal[0], INK, 0.55) : pal[0];
      let s = R(0, 0, W, ctx.H, wc);
      for (let y = top + 18, r = 0; y < F; y += 22, r++) { s += L(0, y, W, y, mix(wc, INK, 0.18), 1.5); for (let x = (r % 2) * 26; x < W; x += 52) s += L(x, y - 22, x, y, mix(wc, INK, 0.18), 1.5); }
      const glass = [pal[1], pal[2], '#2EC4B6', '#FF5E7E', '#6CC8FF', '#8FE3A0'];
      const win = (cx, ww, y0, y1) => {
        let g = `<clipPath id="w${f(cx)}"><path d="M${f(cx - ww / 2)} ${f(y1)} V ${f(y0 + ww / 2)} A ${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(cx + ww / 2)} ${f(y0 + ww / 2)} V ${f(y1)} Z"/></clipPath>`;
        ctx.defs += g; let t = `<g clip-path="url(#w${f(cx)})">`;
        const cell = ww / 3;
        for (let y = y0; y < y1; y += cell) for (let x = cx - ww / 2; x < cx + ww / 2; x += cell) t += R(x, y, cell, cell, glass[Math.floor(rnd() * glass.length)], ink(2));
        t += '</g>' + P(`M${f(cx - ww / 2)} ${f(y1)} V ${f(y0 + ww / 2)} A ${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(cx + ww / 2)} ${f(y0 + ww / 2)} V ${f(y1)} Z`, 'none', ink(5));
        if (time !== 'night') t += P(`M${f(cx - ww / 2)} ${f(y1)} L${f(cx + ww / 2)} ${f(y1)} L${f(cx + ww * 1.6)} ${f(F)} L${f(cx + ww * 0.2)} ${f(F)} Z`, '#FFF7E6', 'opacity=".16"');
        return t;
      };
      s += win(W * 0.1, W * 0.07, top + bh * 0.08, F - bh * 0.3) + win(W * 0.26, W * 0.07, top + bh * 0.08, F - bh * 0.3) + win(W * 0.74, W * 0.07, top + bh * 0.08, F - bh * 0.3) + win(W * 0.9, W * 0.07, top + bh * 0.08, F - bh * 0.3);
      // organ pipes behind the band
      const n = 13;
      for (let i = 0; i < n; i++) { const t2 = i / (n - 1), x = W * (0.36 + t2 * 0.28), h = bh * (0.35 + 0.35 * (1 - Math.abs(t2 - 0.5) * 2)), pw = W * 0.28 / n * 0.7;
        s += R(x - pw / 2, F - bh * 0.12 - h, pw, h, '#E2B84E', ink(2) + ` rx="${f(pw / 2)}"`) + E(x, F - bh * 0.12 - h * 0.2, pw * 0.3, pw * 0.18, INK2); }
      s += R(W * 0.34, F - bh * 0.13, W * 0.32, bh * 0.13, '#6B4526', ink(3));
      if (sign) s += R(W * 0.4, F - bh * 0.105, W * 0.2, bh * 0.08, '#2A1A10', ink(2)) + T(W * 0.5, F - bh * 0.045, Math.min(bh * 0.055, W * 0.2 / Math.max(4, sign.length) * 1.5), '#F2E6CF', esc(sign));
      s += floor(ctx, 'carpet', mix(pal[1], '#A0243F', 0.4));
      return s;
    },
    theater(ctx){
      const { W, T: top, F, bh, pal, sign } = ctx;
      ctx.defs += `<radialGradient id="spot" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="${mix(pal[2], '#FFFFFF', 0.35)}"/><stop offset="1" stop-color="${mix(pal[0], INK, 0.55)}"/></radialGradient>`;
      let s = R(0, 0, W, ctx.H, 'url(#spot)');
      // painted backdrop: a starburst
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; s += P(`M${f(W / 2)} ${f(F - bh * 0.35)} L${f(W / 2 + Math.cos(a) * W)} ${f(F - bh * 0.35 + Math.sin(a) * W)} L${f(W / 2 + Math.cos(a + 0.12) * W)} ${f(F - bh * 0.35 + Math.sin(a + 0.12) * W)} Z`, '#FFFFFF', 'opacity=".05"'); }
      // curtains: pleated sides and a scalloped valance
      const cc = pal[0], cw = W * 0.14;
      for (const side of [0, 1]) {
        const x0 = side ? W - cw : 0; s += R(x0, 0, cw, F, cc);
        for (let x = x0 + 6; x < x0 + cw; x += 14) s += R(x, 0, 5, F, mix(cc, INK, 0.3)) + R(x + 6, 0, 3, F, mix(cc, '#FFFFFF', 0.15));
        s += C(side ? W - cw + 4 : cw - 4, F - bh * 0.42, 7, pal[1], ink(2)) + R(side ? W - cw : cw - 22, F - bh * 0.44, 22, 5, pal[1]);
      }
      const vh = bh * 0.13;
      s += R(0, 0, W, top + vh * 0.6, cc);
      for (let x = 0; x < W; x += W / 10) s += P(`M${f(x)} ${f(top + vh * 0.55)} Q ${f(x + W / 20)} ${f(top + vh * 1.4)} ${f(x + W / 10)} ${f(top + vh * 0.55)} Z`, cc, ink(2)) + C(x, top + vh * 0.62, 4, pal[1]);
      s += R(0, top + vh * 0.5, W, 5, pal[1]);
      // marquee board with bulbs
      if (sign) { const bw = Math.min(W * 0.22, sign.length * bh * 0.07 + 40), bx = W * 0.26, by = top + bh * 0.28, bhh = bh * 0.15;
        let m = R(bx - bw / 2, by - bhh / 2, bw, bhh, INK2, ink(4, pal[1]) + ' rx="8"');
        for (let k = 0; k < bw / 14; k++) m += C(bx - bw / 2 + 7 + k * 14, by - bhh / 2 + 6, 3, '#FFF4B8', 'filter="url(#gl)"') + C(bx - bw / 2 + 7 + k * 14, by + bhh / 2 - 6, 3, '#FFF4B8', 'filter="url(#gl)"');
        ctx.front += m + T(bx, by + bh * 0.03, Math.min(bh * 0.07, bw / Math.max(4, sign.length) * 1.4), pal[1], esc(sign)); }
      s += floor(ctx, 'darkwood');
      for (let x = W * 0.05; x < W; x += W / 12) s += `<g filter="url(#gl)">${E(x, F - 1, 9, 5, '#FFE9A8')}</g>`;
      return s;
    },
    arena(ctx){
      const { W, H, T: top, F, bh, pal, rnd, sign } = ctx;
      let s = R(0, 0, W, H, mix('#0B0A18', pal[0], 0.35));
      // stands: curved tiers dotted with phone lights
      for (let k = 0; k < 5; k++) {
        const y = top + bh * (0.08 + k * 0.13), sag = bh * 0.1;
        s += P(`M-10 ${f(y)} Q ${f(W / 2)} ${f(y + sag)} ${f(W + 10)} ${f(y)} L ${f(W + 10)} ${f(y + bh * 0.12)} Q ${f(W / 2)} ${f(y + sag + bh * 0.12)} -10 ${f(y + bh * 0.12)} Z`, mix('#1B1830', pal[0], 0.2 + k * 0.06));
        for (let i = 0; i < W / 9; i++) { const x = rnd() * W, t2 = x / W, yy = y + sag * 4 * t2 * (1 - t2) * 0.5 + bh * 0.03 + rnd() * bh * 0.07;
          s += C(x, yy, rnd() < 0.2 ? 1.8 : 1.1, rnd() < 0.25 ? pal[2] : '#FFF7E6', `opacity="${f(0.3 + rnd() * 0.6)}"`); }
      }
      // LED wall behind the band and screens at the sides
      ctx.defs += `<linearGradient id="led" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal[1]}"/><stop offset="1" stop-color="${pal[2]}"/></linearGradient>`;
      const lx = W * 0.26, lw = W * 0.48, ly = F - bh * 0.62;
      s += R(lx - 6, ly - 6, lw + 12, F - ly + 6, INK2) + R(lx, ly, lw, F - ly, 'url(#led)', 'opacity=".75"');
      for (let x = lx; x < lx + lw; x += 7) s += L(x, ly, x, F, INK2, 1, 'opacity=".35"');
      for (let y = ly; y < F; y += 7) s += L(lx, y, lx + lw, y, INK2, 1, 'opacity=".35"');
      for (const sx of [0.03, 0.8]) { const x = W * sx, w = W * 0.17, y = top + bh * 0.1, h = Math.min(bh * 0.34, w * 0.62);
        s += R(x - 6, y - 6, w + 12, h + 12, INK2) + R(x, y, w, h, 'url(#led)') + L(x + w * 0.2, y - 6, x + w * 0.2, top - 4, INK2, 4) + L(x + w * 0.8, y - 6, x + w * 0.8, top - 4, INK2, 4);
        if (sign) ctx.front += T(x + w / 2, y + h * 0.62, Math.min(h * 0.4, w / Math.max(4, sign.length) * 1.6), '#FFFFFF', esc(sign), ink(3) + ' paint-order="stroke"'); }
      s += truss(ctx, top, '#3A3552', '#FFF4B8');
      s += floor(ctx, 'blackstage');
      return s;
    },
    festival(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      ctx.hz = F - bh * 0.3;
      let s = sky(ctx) + celestial(ctx, { x: 0.7 });
      s += hills(ctx, F - bh * 0.38, bh * 0.14, mix('#5A3F7A', pal[0], 0.3), 4) + hills(ctx, F - bh * 0.24, bh * 0.1, mix('#3A5A4A', pal[0], 0.3), 5);
      // ferris wheel
      const fx = W * 0.2, fy = F - bh * 0.5, fr = bh * 0.3;
      s += L(fx, fy, fx - fr * 0.6, F - bh * 0.1, INK2, 4) + L(fx, fy, fx + fr * 0.6, F - bh * 0.1, INK2, 4) + C(fx, fy, fr, 'none', ink(3.5, INK2));
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, x = fx + Math.cos(a) * fr, y = fy + Math.sin(a) * fr; s += L(fx, fy, x, y, INK2, 1.5) + R(x - 6, y, 12, 9, [pal[1], pal[2], '#2EC4B6', '#FF5E7E'][i % 4], ink(1.5) + ' rx="2"'); if (time !== 'day') s += C(x, y, 2, '#FFF4B8', 'filter="url(#gl)"'); }
      s += C(fx, fy, 6, pal[1], ink(2));
      // striped tents
      for (const [tx, tw] of [[0.72, 0.1], [0.86, 0.12]]) { const x = W * tx, w = W * tw, y = F - bh * 0.3; s += P(`M${f(x - w / 2)} ${f(F - bh * 0.08)} L${f(x)} ${f(y)} L${f(x + w / 2)} ${f(F - bh * 0.08)} Z`, '#FFF7E6', ink(2.5));
        for (let k = -2; k <= 2; k += 2) s += P(`M${f(x)} ${f(y)} L${f(x + w * (k / 5) - w / 10)} ${f(F - bh * 0.08)} L${f(x + w * (k / 5) + w / 10)} ${f(F - bh * 0.08)} Z`, pal[1]);
        s += L(x, y, x, y - 14, INK2, 2) + P(`M${f(x)} ${f(y - 14)} l 10 4 l -10 4 Z`, pal[2]); }
      // scaffold towers + top beam
      const tw = Math.max(12, W * 0.018);
      for (const x of [2, W - tw - 2]) { s += R(x, top, tw, F - top, '#6E6B80'); for (let y = top; y < F; y += tw) s += L(x, y, x + tw, y + tw, '#9A97AE', 2) + L(x + tw, y, x, y + tw, '#9A97AE', 2); }
      s += truss(ctx, top, '#6E6B80', time === 'day' ? '#FFFFFF' : '#FFF4B8');
      if (sign) { const bw = Math.min(W * 0.24, sign.length * bh * 0.075 + 40), bx = W * 0.3, by = top + 14;
        ctx.front += L(bx - bw / 2 + 6, top + 12, bx - bw / 2 + 6, by + 6, INK2, 2) + L(bx + bw / 2 - 6, top + 12, bx + bw / 2 - 6, by + 6, INK2, 2);
        ctx.front += P(`M${f(bx - bw / 2)} ${f(by + 4)} H ${f(bx + bw / 2)} V ${f(by + bh * 0.16)} L ${f(bx)} ${f(by + bh * 0.2)} L ${f(bx - bw / 2)} ${f(by + bh * 0.16)} Z`, pal[1], ink(3));
        ctx.front += T(bx, by + bh * 0.12, Math.min(bh * 0.08, bw / Math.max(4, sign.length) * 1.5), INK, esc(sign)); }
      s += floor(ctx, 'wood', '#C9A273');
      return s;
    },
    mansion(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      const wc = time === 'night' ? mix(pal[0], INK, 0.2) : pal[0];
      let s = R(0, 0, W, ctx.H, wc) + R(0, F - bh * 0.2, W, bh * 0.2, mix(wc, INK, 0.08));
      for (let x = 10; x < W; x += W / 12) s += R(x, F - bh * 0.17, W / 12 - 20, bh * 0.13, 'none', ink(2, mix(wc, INK, 0.25)));
      s += R(0, top, W, 8, pal[1]) + R(0, top + 8, W, 3, mix(pal[1], INK, 0.3));
      // tall arched windows with drapes
      for (const cx of [0.2, 0.5, 0.8]) {
        const x = W * cx, ww = W * 0.13, y0 = top + bh * 0.12, y1 = F - bh * 0.22, id = 'mw' + Math.round(cx * 10);
        ctx.defs += `<clipPath id="${id}"><path d="M${f(x - ww / 2)} ${f(y1)} V ${f(y0 + ww / 2)} A ${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(x + ww / 2)} ${f(y0 + ww / 2)} V ${f(y1)} Z"/></clipPath>`;
        s += `<g clip-path="url(#${id})">${R(x - ww, y0, ww * 2, y1 - y0, time === 'day' ? '#8FD3FF' : time === 'dusk' ? '#E07A8A' : '#1A1640')}`;
        if (time === 'night') { for (let i = 0; i < 20; i++) s += C(x - ww / 2 + rnd() * ww, y0 + rnd() * (y1 - y0) * 0.5, 1, '#FFF7E6'); for (let i = 0; i < 5; i++) { const bx = x - ww / 2 + i * ww / 5, bhh = (y1 - y0) * (0.2 + rnd() * 0.3); s += R(bx, y1 - bhh, ww / 5 - 2, bhh, '#2E2758'); for (let k = 0; k < 4; k++) s += R(bx + 3, y1 - bhh + 6 + k * 9, 4, 5, '#FFD479', 'opacity=".8"'); } }
        else s += palm(x - ww * 0.2, y1 + 6, (y1 - y0) * 0.7, 0.4, '#2F7A4A') + R(x - ww, y1 - (y1 - y0) * 0.12, ww * 2, (y1 - y0) * 0.12, '#4FB3E8');
        s += '</g>' + P(`M${f(x - ww / 2)} ${f(y1)} V ${f(y0 + ww / 2)} A ${f(ww / 2)} ${f(ww / 2)} 0 0 1 ${f(x + ww / 2)} ${f(y0 + ww / 2)} V ${f(y1)} Z`, 'none', ink(6, pal[1]));
        s += L(x, y0, x, y1, pal[1], 3) + L(x - ww / 2, (y0 + y1) / 2, x + ww / 2, (y0 + y1) / 2, pal[1], 3);
        for (const sd of [-1, 1]) { const xi = x + sd * ww * 0.42, xo = x + sd * ww * 0.78, ty = y0 + (y1 - y0) * 0.55, xt = x + sd * ww * 0.66;
          s += P(`M${f(xi)} ${f(y0 - 6)} L ${f(xo)} ${f(y0 - 6)} L ${f(xo + sd * 4)} ${f(ty)} Q ${f(xo + sd * 10)} ${f(y1)} ${f(xo + sd * 6)} ${f(y1 + 10)} L ${f(xt - sd * 10)} ${f(y1 + 10)} Q ${f(xt - sd * 4)} ${f(ty + 16)} ${f(xt)} ${f(ty)} Q ${f(xi)} ${f(y0 + (y1 - y0) * 0.25)} ${f(xi)} ${f(y0 - 6)} Z`, pal[2], ink(2.5));
          s += L(x + sd * ww * 0.58, y0, xt + sd * 2, ty - 6, mix(pal[2], INK, 0.3), 2) + R(xt - 6, ty - 3, 12 + sd * 0, 7, pal[1], ink(1.5) + ' rx="3"'); }
        s += R(x - ww * 0.85, y0 - 10, ww * 1.7, 7, pal[1], ink(2) + ' rx="3"');
      }
      // marble columns
      for (const cx of [0.05, 0.35, 0.65, 0.95]) { const x = W * cx, cw = W * 0.03; s += R(x - cw / 2, top + 11, cw, F - top - 11, '#FBF6EC', ink(2)) + R(x - cw * 0.8, top + 11, cw * 1.6, 10, pal[1], ink(2)) + R(x - cw * 0.8, F - 12, cw * 1.6, 12, pal[1], ink(2)) + L(x - cw * 0.15, top + 24, x - cw * 0.15, F - 14, '#E3D8C4', 2); }
      if (sign) ctx.front += R(W * 0.2 - W * 0.08, top + bh * 0.02, W * 0.16, bh * 0.07, pal[1], ink(2) + ' rx="3"') + T(W * 0.2, top + bh * 0.075, Math.min(bh * 0.05, W * 0.16 / Math.max(4, sign.length) * 1.5), INK, esc(sign));
      s += floor(ctx, 'marble');
      return s;
    },
    rooftop(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx; const night = time !== 'day';
      let s = sky(ctx) + celestial(ctx, { x: 0.5 });
      s += skyline(ctx, F - bh * 0.12, bh * 0.35, bh * 0.75, mix('#2B2456', pal[0], 0.3), '#FFD479', night ? 0.35 : 0.06, 60);
      s += skyline(ctx, F - bh * 0.12, bh * 0.15, bh * 0.4, mix('#3B3368', pal[0], 0.3), '#FFD479', night ? 0.4 : 0.08, 70);
      // a neon sign on the building across the street
      if (sign) { const sw = Math.min(W * 0.26, sign.length * bh * 0.08 + 30), sx = W * 0.3, sy = top + bh * 0.22;
        ctx.front += L(sx - sw * 0.35, sy + bh * 0.06, sx - sw * 0.35, F - bh * 0.4, INK2, 3) + L(sx + sw * 0.35, sy + bh * 0.06, sx + sw * 0.35, F - bh * 0.4, INK2, 3) + neon(sx, sy + bh * 0.04, Math.min(bh * 0.11, sw / Math.max(3, sign.length) * 1.6), pal[1], esc(sign)); }
      // water tower
      const wx = W * 0.12, ww = Math.max(40, W * 0.07), wy = F - bh * 0.78, wh = bh * 0.3;
      for (const k of [-0.4, 0.4]) s += L(wx + ww * k, wy + wh, wx + ww * k * 1.3, F - bh * 0.14, INK2, 4);
      s += L(wx - ww * 0.5, wy + wh + bh * 0.1, wx + ww * 0.5, wy + wh + bh * 0.2, INK2, 2) + L(wx + ww * 0.5, wy + wh + bh * 0.1, wx - ww * 0.5, wy + wh + bh * 0.2, INK2, 2);
      s += R(wx - ww / 2, wy, ww, wh, '#8E6446', ink(3)) + R(wx - ww / 2, wy + wh * 0.3, ww, 3, INK2) + R(wx - ww / 2, wy + wh * 0.7, ww, 3, INK2) + P(`M${f(wx - ww * 0.58)} ${f(wy)} L${f(wx)} ${f(wy - wh * 0.4)} L${f(wx + ww * 0.58)} ${f(wy)} Z`, '#5A3A28', ink(3));
      // parapet and AC units
      s += R(0, F - bh * 0.14, W, bh * 0.14, mix('#6A5F8A', pal[0], 0.2)) + R(0, F - bh * 0.15, W, 7, '#9A92B8');
      for (const ax of [0.74, 0.86]) s += R(W * ax, F - bh * 0.3, W * 0.09, bh * 0.16, '#B8B3C8', ink(2.5)) + C(W * ax + W * 0.045, F - bh * 0.22, bh * 0.05, '#8E88A6', ink(2));
      s += floor(ctx, 'tar');
      return s;
    },
    beach(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      const hz = ctx.hz = F - bh * 0.36;
      let s = sky(ctx) + celestial(ctx, { x: 0.62 });
      ctx.defs += `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(pal[0], INK, 0.2)}"/><stop offset="1" stop-color="${mix(pal[0], '#FFFFFF', 0.25)}"/></linearGradient>`;
      s += R(0, hz, W, F - hz, 'url(#sea)');
      s += P(`M${f(W * 0.02)} ${f(hz)} q ${f(W * 0.06)} -${f(bh * 0.08)} ${f(W * 0.12)} -${f(bh * 0.02)} q ${f(W * 0.05)} -${f(bh * 0.04)} ${f(W * 0.1)} ${f(bh * 0.02)} Z`, mix(pal[0], INK, 0.45));
      for (let k = 0; k < 7; k++) { const y = hz + 6 + k * (F - hz) / 7, w = W * (0.04 + k * 0.012); s += R(W * 0.62 - w / 2, y, w, 3, time === 'day' ? '#FFFFFF' : '#FFD08A', 'opacity=".7" rx="1.5"'); }
      for (let k = 0; k < 4; k++) { const y = hz + (F - hz) * (0.3 + k * 0.2); let d = `M-10 ${f(y)}`; for (let x = -10; x < W + 20; x += 40) d += ` q 10 -5 20 0 t 20 0`; s += P(d, 'none', 'stroke="#FFFFFF" stroke-width="2" opacity=".45"'); }
      s += R(0, F - bh * 0.07, W, bh * 0.07, '#E9C98F');
      // lifeguard hut with the sign
      const lx = W * 0.26, ly = F - bh * 0.5;
      for (const k of [-1, 1]) s += L(lx + k * bh * 0.07, ly + bh * 0.14, lx + k * bh * 0.1, F - bh * 0.02, INK2, 3.5);
      s += R(lx - bh * 0.1, ly, bh * 0.2, bh * 0.14, '#FFF7E6', ink(3)) + P(`M${f(lx - bh * 0.13)} ${f(ly)} L${f(lx)} ${f(ly - bh * 0.07)} L${f(lx + bh * 0.13)} ${f(ly)} Z`, pal[1], ink(3)) + R(lx - bh * 0.1, ly + bh * 0.12, bh * 0.2, bh * 0.02, pal[1]);
      if (sign) s += T(lx, ly + bh * 0.09, Math.min(bh * 0.05, bh * 0.2 / Math.max(3, sign.length) * 1.5), INK, esc(sign));
      s += palm(W * 0.05, F, bh * 0.85, 0.5, time === 'day' ? '#2F8A4A' : '#1E4A36') + palm(W * 0.95, F, bh * 0.8, -0.55, time === 'day' ? '#2F8A4A' : '#1E4A36');
      s += floor(ctx, 'boardwalk');
      return s;
    },
    countryside(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      let s = sky(ctx) + celestial(ctx, { x: 0.8 });
      s += hills(ctx, F - bh * 0.42, bh * 0.1, mix('#7FA8C8', pal[0], 0.2), 3) + hills(ctx, F - bh * 0.3, bh * 0.1, pal[0], 4);
      for (let k = 0; k < 5; k++) { const y = F - bh * (0.26 - k * 0.05); s += P(`M-10 ${f(y)} Q ${f(W / 2)} ${f(y - bh * 0.04)} ${f(W + 10)} ${f(y)}`, 'none', `stroke="${mix(pal[0], k % 2 ? '#FFCE3A' : INK, 0.25)}" stroke-width="5"`); }
      // barn
      const bx = W * 0.2, bw = W * 0.2, by = F - bh * 0.44;
      s += P(`M${f(bx - bw / 2)} ${f(by + bh * 0.08)} L${f(bx - bw * 0.3)} ${f(by - bh * 0.08)} L${f(bx + bw * 0.3)} ${f(by - bh * 0.08)} L${f(bx + bw / 2)} ${f(by + bh * 0.08)} Z`, mix(pal[1], INK, 0.35), ink(3));
      s += R(bx - bw / 2, by + bh * 0.08, bw, F - by - bh * 0.1, pal[1], ink(3));
      s += R(bx - bw * 0.18, F - bh * 0.24, bw * 0.36, bh * 0.22, '#FFF7E6', ink(2.5)) + L(bx - bw * 0.18, F - bh * 0.24, bx + bw * 0.18, F - bh * 0.02, '#FFF7E6', 4) + L(bx + bw * 0.18, F - bh * 0.24, bx - bw * 0.18, F - bh * 0.02, '#FFF7E6', 4);
      s += R(bx - bw * 0.18, F - bh * 0.24, bw * 0.36, bh * 0.22, 'none', ink(2.5)) + R(bx - bw * 0.08, by + bh * 0.1, bw * 0.16, bh * 0.08, '#FFF7E6', ink(2));
      if (sign) s += T(bx, by + bh * 0.04, Math.min(bh * 0.06, bw * 0.55 / Math.max(3, sign.length) * 1.6), '#FFF7E6', esc(sign));
      // windmill
      const mx = W * 0.84, my = F - bh * 0.62;
      s += L(mx, my, mx - bh * 0.07, F - bh * 0.1, INK2, 3) + L(mx, my, mx + bh * 0.07, F - bh * 0.1, INK2, 3) + L(mx - bh * 0.04, my + bh * 0.2, mx + bh * 0.05, my + bh * 0.3, INK2, 1.5);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; s += P(`M${f(mx)} ${f(my)} L${f(mx + Math.cos(a) * bh * 0.12)} ${f(my + Math.sin(a) * bh * 0.12)} L${f(mx + Math.cos(a + 0.2) * bh * 0.12)} ${f(my + Math.sin(a + 0.2) * bh * 0.12)} Z`, '#E9E4D6', ink(1)); }
      s += P(`M${f(mx + 4)} ${f(my)} l ${f(bh * 0.1)} -6 l 0 12 Z`, '#E9E4D6', ink(1.5));
      // fence
      const fy = F - bh * 0.08;
      s += L(0, fy, W, fy, '#8A6A4A', 4) + L(0, fy + bh * 0.04, W, fy + bh * 0.04, '#8A6A4A', 4);
      for (let x = 10; x < W; x += 40) s += R(x, fy - bh * 0.04, 6, bh * 0.12, '#8A6A4A');
      s += tree(W * 0.06, F - bh * 0.06, bh * 0.15, '#3E8E4E') + tree(W * 0.66, F - bh * 0.2, bh * 0.1, '#4E9A5A');
      s += floor(ctx, 'barn');
      return s;
    },
    mountains(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      let s = sky(ctx) + celestial(ctx, { x: 0.7 });
      const peaks = (y, h, col, n, snow) => { let d = `M-10 ${f(y)}`, t = ''; const k = n;
        for (let i = 0; i < k; i++) { const x0 = -10 + (W + 20) * i / k, x1 = x0 + (W + 20) / k, px = (x0 + x1) / 2 + (rnd() - 0.5) * 30, ph = h * (0.6 + rnd() * 0.4);
          d += ` L ${f(px)} ${f(y - ph)} L ${f(x1)} ${f(y)}`;
          if (snow) t += P(`M${f(px)} ${f(y - ph)} L${f(px + ph * 0.28)} ${f(y - ph * 0.7)} L${f(px + ph * 0.1)} ${f(y - ph * 0.74)} L${f(px)} ${f(y - ph * 0.64)} L${f(px - ph * 0.12)} ${f(y - ph * 0.72)} L${f(px - ph * 0.28)} ${f(y - ph * 0.7)} Z`, '#FFFFFF'); }
        return P(d + ` L ${f(W + 10)} ${f(ctx.H)} L -10 ${f(ctx.H)} Z`, col) + t; };
      s += peaks(F - bh * 0.3, bh * 0.6, mix('#6E7FAE', pal[0], 0.3), 4, true) + peaks(F - bh * 0.2, bh * 0.35, mix('#4A5A86', pal[0], 0.4), 6, true);
      for (let x = -10; x < W + 10; x += 16 + rnd() * 10) s += pine(x, F - bh * 0.06 - rnd() * bh * 0.05, bh * (0.14 + rnd() * 0.1), time === 'day' ? '#2E6A4A' : '#1E3A34');
      // cabin
      const cx = W * 0.22, cw = W * 0.16, cy = F - bh * 0.3;
      s += R(cx - cw / 2, cy, cw, F - cy - bh * 0.02, '#8A5A34', ink(3));
      for (let y = cy + 6; y < F - bh * 0.03; y += 8) s += L(cx - cw / 2, y, cx + cw / 2, y, '#5A3A20', 2);
      s += R(cx + cw * 0.2, cy - bh * 0.2, cw * 0.12, bh * 0.14, '#6E6B80', ink(2)) + P(`M${f(cx - cw * 0.62)} ${f(cy + 4)} L${f(cx)} ${f(cy - bh * 0.14)} L${f(cx + cw * 0.62)} ${f(cy + 4)} Z`, '#FFFFFF', ink(3));
      for (let i = 0; i < 4; i++) s += C(cx + cw * 0.26 + i * 6, cy - bh * 0.24 - i * bh * 0.05, 5 + i * 2.5, '#E9E4F0', `opacity="${f(0.7 - i * 0.14)}"`);
      s += R(cx - cw * 0.3, cy + bh * 0.06, cw * 0.2, bh * 0.08, time === 'day' ? '#A9DDF5' : '#FFD479', ink(2)) + R(cx + cw * 0.05, cy + bh * 0.07, cw * 0.18, F - cy - bh * 0.09, '#5A3A20', ink(2));
      if (sign) s += R(cx - cw * 0.35, cy - bh * 0.02, cw * 0.7, bh * 0.07, '#C99A62', ink(2)) + T(cx, cy + bh * 0.035, Math.min(bh * 0.045, cw * 0.7 / Math.max(3, sign.length) * 1.5), INK, esc(sign));
      s += floor(ctx, 'snowdeck');
      return s;
    },
    desert(ctx){
      const { W, T: top, F, bh, pal, time, rnd, sign } = ctx;
      let s = sky(ctx);
      const sr = bh * 0.2; s += C(W * 0.76, top + bh * 0.3, sr * 1.5, pal[2], 'opacity=".25"') + C(W * 0.76, top + bh * 0.3, sr, pal[2]);
      for (let k = 0; k < 4; k++) s += R(W * 0.76 - sr, top + bh * 0.3 + sr * (0.2 + k * 0.2), sr * 2, 2 + k, mix(pal[0], '#FFFFFF', 0.3), 'opacity=".5"');
      // mesas
      const mesa = (x, w, h, col) => P(`M${f(x - w / 2 - h * 0.4)} ${f(F - bh * 0.18)} L${f(x - w / 2)} ${f(F - bh * 0.18 - h)} L${f(x + w / 2)} ${f(F - bh * 0.18 - h)} L${f(x + w / 2 + h * 0.4)} ${f(F - bh * 0.18)} Z`, col) + P(`M${f(x + w * 0.1)} ${f(F - bh * 0.18 - h)} L${f(x + w / 2)} ${f(F - bh * 0.18 - h)} L${f(x + w / 2 + h * 0.4)} ${f(F - bh * 0.18)} L${f(x + w * 0.2)} ${f(F - bh * 0.18)} Z`, mix(col, INK, 0.25)) + R(x - w / 2, F - bh * 0.18 - h, w, 4, mix(col, '#FFFFFF', 0.25)) + L(x - w * 0.3, F - bh * 0.18 - h * 0.55, x + w * 0.1, F - bh * 0.18 - h * 0.55, mix(col, INK, 0.2), 3);
      s += mesa(W * 0.18, W * 0.14, bh * 0.3, mix(pal[0], '#8E2E2E', 0.45)) + mesa(W * 0.55, W * 0.2, bh * 0.22, mix(pal[0], '#B04A2E', 0.35)) + mesa(W * 0.92, W * 0.1, bh * 0.36, mix(pal[0], '#8E2E2E', 0.45));
      s += hills(ctx, F - bh * 0.16, bh * 0.08, mix(pal[0], '#E0702E', 0.3), 3) + hills(ctx, F - bh * 0.06, bh * 0.06, mix(pal[0], '#F2B066', 0.45), 5);
      const cactus = (x, h) => { const w = h * 0.16; return R(x - w / 2, F - h, w, h, '#3E8E4E', ink(2.5) + ` rx="${f(w / 2)}"`) + P(`M${f(x - w / 2)} ${f(F - h * 0.5)} h -${f(w * 0.9)} v -${f(h * 0.25)}`, 'none', `stroke="${INK2}" stroke-width="${f(w + 5)}" stroke-linecap="round" stroke-linejoin="round"`) + P(`M${f(x - w / 2)} ${f(F - h * 0.5)} h -${f(w * 0.9)} v -${f(h * 0.25)}`, 'none', `stroke="#3E8E4E" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"`) + P(`M${f(x + w / 2)} ${f(F - h * 0.65)} h ${f(w * 0.8)} v -${f(h * 0.18)}`, 'none', `stroke="${INK2}" stroke-width="${f(w + 5)}" stroke-linecap="round" stroke-linejoin="round"`) + P(`M${f(x + w / 2)} ${f(F - h * 0.65)} h ${f(w * 0.8)} v -${f(h * 0.18)}`, 'none', `stroke="#3E8E4E" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"`); };
      s += cactus(W * 0.06, bh * 0.5) + cactus(W * 0.97, bh * 0.42) + cactus(W * 0.7, bh * 0.2);
      if (sign) { const sx = W * 0.28, sw = Math.min(W * 0.18, sign.length * bh * 0.05 + 24); s += R(sx - 3, F - bh * 0.34, 6, bh * 0.34, '#8A5A34', ink(2)) + P(`M${f(sx - sw / 2)} ${f(F - bh * 0.36)} H ${f(sx + sw / 2)} L ${f(sx + sw / 2 + 10)} ${f(F - bh * 0.3)} L ${f(sx + sw / 2)} ${f(F - bh * 0.24)} H ${f(sx - sw / 2)} Z`, '#C99A62', ink(2.5)) + T(sx + 3, F - bh * 0.28, Math.min(bh * 0.05, sw / Math.max(3, sign.length) * 1.5), INK, esc(sign)); }
      s += floor(ctx, 'cracked');
      return s;
    },
    cosmic(ctx){
      const { W, H, T: top, F, bh, pal, rnd, sign } = ctx;
      ctx.defs += `<linearGradient id="spc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05040F"/><stop offset="1" stop-color="${mix(pal[0], '#05040F', 0.3)}"/></linearGradient><filter id="neb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f(bh * 0.08)}"/></filter>`;
      let s = R(0, 0, W, H, 'url(#spc)');
      s += `<g filter="url(#neb)" opacity=".55">${E(W * 0.25, top + bh * 0.35, W * 0.2, bh * 0.2, pal[1])}${E(W * 0.7, top + bh * 0.25, W * 0.18, bh * 0.16, pal[2])}${E(W * 0.5, F - bh * 0.25, W * 0.3, bh * 0.14, mix(pal[1], pal[2], 0.5))}</g>`;
      for (let i = 0; i < W / 4; i++) s += C(rnd() * W, rnd() * F, rnd() < 0.1 ? 1.8 : 0.9, '#FFFFFF', `opacity="${f(0.3 + rnd() * 0.7)}"`);
      const px = W * 0.82, py = top + bh * 0.32, pr = bh * 0.15;
      s += E(px, py, pr * 2, pr * 0.45, 'none', `stroke="${mix(pal[1], '#FFFFFF', 0.3)}" stroke-width="5" transform="rotate(-14 ${f(px)} ${f(py)})"`);
      s += C(px, py, pr, pal[1], ink(3)) + P(`M${f(px - pr)} ${f(py)} A ${f(pr)} ${f(pr)} 0 0 0 ${f(px + pr)} ${f(py)} Z`, mix(pal[1], INK, 0.25)) + R(px - pr * 0.8, py - pr * 0.35, pr * 1.6, pr * 0.12, mix(pal[1], '#FFFFFF', 0.25), 'rx="3"');
      s += `<path d="M${f(px - pr * 2)} ${f(py)} A ${f(pr * 2)} ${f(pr * 0.45)} 0 0 0 ${f(px + pr * 2)} ${f(py)}" fill="none" stroke="${mix(pal[1], '#FFFFFF', 0.3)}" stroke-width="5" transform="rotate(-14 ${f(px)} ${f(py)})"/>`;
      s += C(W * 0.12, top + bh * 0.2, bh * 0.05, '#E9E4F0', ink(2)) + C(W * 0.12 + 4, top + bh * 0.2 - 3, bh * 0.012, '#C9C3D8') + C(W * 0.12 - 6, top + bh * 0.2 + 5, bh * 0.018, '#C9C3D8');
      s += `<g filter="url(#gl)">${L(W * 0.4, top + bh * 0.08, W * 0.52, top + bh * 0.16, '#FFFFFF', 2)}</g>`;
      if (sign) ctx.front += neon(W * 0.26, top + bh * 0.5, Math.min(bh * 0.1, W * 0.26 / Math.max(3, sign.length) * 1.6), pal[2], esc(sign));
      s += floor(ctx, 'grid');
      return s;
    },
    artspace(ctx){
      const { W, H, T: top, F, bh, pal, sign } = ctx;
      const bg = pal[0], dark = lum(bg) < 0.45, lineC = dark ? '#FFFFFF' : INK;
      ctx.defs += `<linearGradient id="gal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(bg, dark ? '#FFFFFF' : INK, 0.06)}"/><stop offset="1" stop-color="${bg}"/></linearGradient>`;
      let s = R(0, 0, W, H, 'url(#gal)');
      s += L(0, F - bh * 0.3, W, F - bh * 0.3, lineC, 1.5, 'opacity=".25"');
      s += C(W * 0.74, F - bh * 0.5, bh * 0.3, pal[1]) + R(W * 0.15, F - bh * 0.86, W * 0.06, bh * 0.86, pal[2]) + R(W * 0.15 + W * 0.06, F - bh * 0.86, W * 0.012, bh * 0.86, mix(pal[2], lineC, 0.2));
      s += P(`M${f(W * 0.3)} ${f(top + bh * 0.1)} L${f(W * 0.36)} ${f(top + bh * 0.28)} L${f(W * 0.24)} ${f(top + bh * 0.28)} Z`, 'none', `stroke="${lineC}" stroke-width="3" opacity=".7"`);
      s += R(W * 0.88, top + bh * 0.12, bh * 0.1, bh * 0.1, 'none', `stroke="${pal[1]}" stroke-width="3" transform="rotate(20 ${f(W * 0.88)} ${f(top + bh * 0.12)})"`);
      if (sign) s += T(W * 0.3, F - bh * 0.36, Math.min(bh * 0.05, W * 0.18 / Math.max(3, sign.length) * 1.6), lineC, esc(sign), 'letter-spacing="4" font-family="Helvetica, Arial, sans-serif" font-weight="400" opacity=".7"');
      s += floor(ctx, 'gloss');
      s += E(W * 0.74, F + (H - F) * 0.35, bh * 0.28, (H - F) * 0.22, pal[1], 'opacity=".22"') + R(W * 0.15, F + 2, W * 0.06, (H - F) * 0.6, pal[2], 'opacity=".18"');
      return s;
    },
  };

  /* ---------- props: things on the floor at the sides, or hung from above ---------- */
  // each floor prop is drawn standing on y = F, centred on x, u = pixels per unit (about 1 at desktop size)
  const PROP = {
    'cd-table'(x, F, u, pal){
      let s = L(x - 50 * u, F - 42 * u, x + 44 * u, F, INK2, 4 * u) + L(x + 50 * u, F - 42 * u, x - 44 * u, F, INK2, 4 * u);
      s += R(x - 60 * u, F - 48 * u, 120 * u, 9 * u, '#D8D2C4', ink(3 * u));
      const cols = [pal[1], pal[2], '#2EC4B6', '#FF5E7E', '#7B5CF0', '#FFB020'];
      for (let k = 0; k < 4; k++) for (let j = 0; j < 3 + (k % 2); j++) s += R(x - 54 * u + k * 22 * u, F - 55 * u - j * 6 * u, 19 * u, 6 * u, cols[(k + j) % cols.length], ink(1.5 * u));
      s += R(x + 34 * u, F - 80 * u, 26 * u, 30 * u, '#C9A273', ink(2 * u) + ' transform="rotate(6 ' + f(x + 47 * u) + ' ' + f(F - 65 * u) + ')"') + T(x + 47 * u, F - 60 * u, 11 * u, INK, 'CDs', `transform="rotate(6 ${f(x + 47 * u)} ${f(F - 65 * u)})"`);
      return s;
    },
    boombox(x, F, u, pal){
      let s = R(x - 34 * u, F - 38 * u, 68 * u, 38 * u, '#4A4460', ink(3 * u));
      for (let i = 1; i < 4; i++) s += L(x - 34 * u + i * 17 * u, F - 38 * u, x - 34 * u + i * 17 * u, F, '#2A2540', 3 * u);
      for (let i = 1; i < 3; i++) s += L(x - 34 * u, F - 38 * u + i * 12.6 * u, x + 34 * u, F - 38 * u + i * 12.6 * u, '#2A2540', 3 * u);
      const by = F - 38 * u - 36 * u;
      s += P(`M${f(x - 30 * u)} ${f(by)} q 0 -14 14 -14 h ${f(32 * u)} q 14 0 14 14`, 'none', ink(4 * u)) + L(x + 26 * u, by - 12 * u, x + 44 * u, by - 40 * u, INK2, 2 * u);
      s += R(x - 44 * u, by, 88 * u, 36 * u, pal[1], ink(3 * u) + ` rx="${f(6 * u)}"`);
      for (const k of [-1, 1]) s += C(x + k * 28 * u, by + 18 * u, 13 * u, '#2A2540', ink(2 * u)) + C(x + k * 28 * u, by + 18 * u, 5 * u, '#8C84AE');
      s += R(x - 11 * u, by + 7 * u, 22 * u, 14 * u, '#2A2540', ink(1.5 * u)) + C(x - 5 * u, by + 14 * u, 2.5 * u, '#FFF7E6') + C(x + 5 * u, by + 14 * u, 2.5 * u, '#FFF7E6');
      for (let i = 0; i < 4; i++) s += R(x - 11 * u + i * 6 * u, by + 25 * u, 4 * u, 5 * u, pal[2]);
      return s;
    },
    books(x, F, u, pal){
      let s = '', y = F; const cols = [pal[1], '#2EC4B6', pal[2], '#FF5E7E', '#7B5CF0'];
      for (let k = 0; k < 5; k++) { const w = (70 - (k % 3) * 8) * u, h = (11 + (k % 2) * 4) * u, dx = ((k * 7) % 11 - 5) * u; y -= h; s += R(x - w / 2 + dx, y, w, h, cols[k], ink(2.5 * u) + ` rx="${f(2 * u)}"`) + L(x - w / 2 + dx + 6 * u, y + h / 2, x + w / 2 + dx - 6 * u, y + h / 2, '#FFF7E6', 1.5 * u, 'opacity=".6"'); }
      s += C(x + 6 * u, y - 10 * u, 10 * u, '#E5484D', ink(2.5 * u)) + P(`M${f(x + 6 * u)} ${f(y - 20 * u)} q 4 -6 10 -6`, 'none', ink(2.5 * u, '#3E8E4E'));
      return s;
    },
    speakers(x, F, u){
      const w = 56 * u, h = 110 * u; let s = R(x - w / 2, F - h, w, h, '#231F36', ink(3 * u) + ` rx="${f(5 * u)}"`);
      s += C(x, F - h * 0.3, w * 0.34, '#3A3552', ink(3 * u)) + C(x, F - h * 0.3, w * 0.12, '#1A1726') + C(x, F - h * 0.72, w * 0.22, '#3A3552', ink(3 * u)) + C(x, F - h * 0.72, w * 0.07, '#1A1726') + C(x, F - h * 0.91, w * 0.07, '#8C84AE');
      return s;
    },
    amps(x, F, u, pal){
      const w = 78 * u; let s = R(x - w / 2, F - 70 * u, w, 70 * u, '#2A2540', ink(3 * u) + ` rx="${f(5 * u)}"`) + R(x - w / 2 + 7 * u, F - 63 * u, w - 14 * u, 56 * u, '#4A4460');
      for (let i = 0; i < 7; i++) s += L(x - w / 2 + 9 * u, F - 60 * u + i * 8 * u, x + w / 2 - 9 * u, F - 60 * u + i * 8 * u, '#3A3552', 2 * u);
      s += R(x - w / 2, F - 96 * u, w, 26 * u, '#2A2540', ink(3 * u) + ` rx="${f(4 * u)}"`) + R(x - w / 2 + 6 * u, F - 90 * u, w - 12 * u, 6 * u, pal[1]);
      for (let i = 0; i < 5; i++) s += C(x - w / 2 + 14 * u + i * 12.5 * u, F - 78 * u, 3.4 * u, '#E9E4D6');
      return s;
    },
    turntables(x, F, u, pal){
      let s = L(x - 40 * u, F, x - 34 * u, F - 50 * u, INK2, 4 * u) + L(x + 40 * u, F, x + 34 * u, F - 50 * u, INK2, 4 * u) + R(x - 62 * u, F - 62 * u, 124 * u, 14 * u, '#3A3552', ink(3 * u));
      for (const k of [-1, 1]) s += E(x + k * 36 * u, F - 66 * u, 22 * u, 6 * u, '#1A1726', ink(2 * u)) + E(x + k * 36 * u, F - 66 * u, 7 * u, 2 * u, k < 0 ? pal[1] : pal[2]);
      s += R(x - 10 * u, F - 72 * u, 20 * u, 10 * u, '#4A4460', ink(2 * u)) + R(x - 5 * u, F - 70 * u, 3 * u, 5 * u, pal[2]);
      return s;
    },
    piano(x, F, u){
      let s = L(x - 50 * u, F - 40 * u, x - 50 * u, F, INK2, 5 * u) + L(x + 40 * u, F - 40 * u, x + 40 * u, F, INK2, 5 * u) + L(x - 5 * u, F - 40 * u, x - 5 * u, F, INK2, 5 * u);
      s += P(`M${f(x - 62 * u)} ${f(F - 40 * u)} V ${f(F - 58 * u)} H ${f(x + 20 * u)} Q ${f(x + 60 * u)} ${f(F - 62 * u)} ${f(x + 62 * u)} ${f(F - 40 * u)} Z`, '#15131F', ink(3 * u));
      s += P(`M${f(x - 58 * u)} ${f(F - 58 * u)} L${f(x + 30 * u)} ${f(F - 104 * u)} L${f(x + 34 * u)} ${f(F - 98 * u)} L${f(x - 40 * u)} ${f(F - 58 * u)} Z`, '#2A2640', ink(3 * u)) + L(x - 10 * u, F - 58 * u, x + 8 * u, F - 92 * u, INK2, 2.5 * u);
      s += R(x - 62 * u, F - 46 * u, 36 * u, 6 * u, '#FFFFFF', ink(1.5 * u));
      for (let i = 0; i < 6; i++) s += R(x - 59 * u + i * 6 * u, F - 46 * u, 2.5 * u, 3.5 * u, INK2);
      return s;
    },
    trophies(x, F, u, pal){
      let s = R(x - 34 * u, F - 44 * u, 68 * u, 44 * u, '#8A5A34', ink(3 * u));
      for (const [dx, h] of [[-15, 1], [16, 0.8]]) { const cx = x + dx * u, top = F - 44 * u - 58 * u * h;
        s += R(cx - 10 * u, F - 52 * u, 20 * u, 8 * u, pal[1], ink(2 * u)) + R(cx - 3 * u, F - 44 * u - 26 * u * h, 6 * u, 20 * u * h, pal[1], ink(2 * u));
        s += P(`M${f(cx - 16 * u * h)} ${f(top)} H ${f(cx + 16 * u * h)} Q ${f(cx + 14 * u * h)} ${f(top + 26 * u * h)} ${f(cx)} ${f(top + 30 * u * h)} Q ${f(cx - 14 * u * h)} ${f(top + 26 * u * h)} ${f(cx - 16 * u * h)} ${f(top)} Z`, '#F2C94C', ink(2.5 * u)); }
      return s;
    },
    plants(x, F, u){
      let s = '';
      for (const [a, l] of [[-2.3, 60], [-1.9, 74], [-1.55, 80], [-1.2, 70], [-0.8, 58]]) { const ex = x + Math.cos(a) * l * u, ey = F - 34 * u + Math.sin(a) * l * u;
        s += P(`M${f(x)} ${f(F - 34 * u)} Q ${f((x + ex) / 2 - 10 * u)} ${f((F - 34 * u + ey) / 2)} ${f(ex)} ${f(ey)} Q ${f((x + ex) / 2 + 12 * u)} ${f((F - 34 * u + ey) / 2 + 6 * u)} ${f(x)} ${f(F - 34 * u)} Z`, '#3E8E4E', ink(2 * u)); }
      return s + P(`M${f(x - 24 * u)} ${f(F - 36 * u)} H ${f(x + 24 * u)} L ${f(x + 18 * u)} ${f(F)} H ${f(x - 18 * u)} Z`, '#E07A4A', ink(3 * u));
    },
    flowers(x, F, u, pal){
      let s = R(x - 14 * u, F - 60 * u, 28 * u, 60 * u, '#E9E4F0', ink(3 * u) + ` rx="${f(8 * u)}"`);
      const cols = [pal[1], pal[2], '#FF5E7E', '#FFF7E6', '#FFB020'];
      for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.3, r = (i % 2 ? 34 : 26) * u, cx = x + Math.cos(a) * r, cy = F - 64 * u + Math.sin(a) * r;
        s += L(x, F - 58 * u, cx, cy, '#3E8E4E', 2.5 * u) + C(cx, cy, 9 * u, cols[i % cols.length], ink(2 * u)) + C(cx, cy, 3 * u, INK2, 'opacity=".5"'); }
      return s;
    },
    candles(x, F, u){
      let s = L(x, F, x, F - 70 * u, '#D4A537', 5 * u) + P(`M${f(x - 22 * u)} ${f(F)} L${f(x)} ${f(F - 12 * u)} L${f(x + 22 * u)} ${f(F)} Z`, '#D4A537', ink(2 * u));
      s += P(`M${f(x - 40 * u)} ${f(F - 90 * u)} Q ${f(x - 40 * u)} ${f(F - 70 * u)} ${f(x)} ${f(F - 70 * u)} Q ${f(x + 40 * u)} ${f(F - 70 * u)} ${f(x + 40 * u)} ${f(F - 90 * u)}`, 'none', ink(5 * u, '#D4A537'));
      for (const dx of [-40, -20, 0, 20, 40]) { const cy = F - (dx === 0 ? 100 : Math.abs(dx) === 20 ? 84 : 92) * u; s += R(x + dx * u - 4 * u, cy, 8 * u, 18 * u, '#FFF7E6', ink(1.5 * u)) + `<g filter="url(#gl)">${E(x + dx * u, cy - 6 * u, 3.5 * u, 6 * u, '#FFB020')}</g>`; }
      return s;
    },
    surfboards(x, F, u, pal){
      let s = '';
      for (const [dx, a, col] of [[-22, -8, pal[1]], [0, 2, pal[2]], [22, 10, '#2EC4B6']]) { const cx = x + dx * u;
        s += `<g transform="rotate(${a} ${f(cx)} ${f(F)})">${E(cx, F - 55 * u, 13 * u, 58 * u, col, ink(3 * u))}${L(cx, F - 108 * u, cx, F - 4 * u, '#FFF7E6', 3 * u)}</g>`; }
      return s;
    },
    'hay-bales'(x, F, u){
      const b = (bx, by, w, h) => R(bx, by, w, h, '#E6B84E', ink(3 * u) + ` rx="${f(4 * u)}"`) + L(bx + w * 0.3, by, bx + w * 0.3, by + h, '#B8862A', 3 * u) + L(bx + w * 0.7, by, bx + w * 0.7, by + h, '#B8862A', 3 * u);
      return b(x - 58 * u, F - 30 * u, 56 * u, 30 * u) + b(x + 2 * u, F - 30 * u, 56 * u, 30 * u) + b(x - 28 * u, F - 60 * u, 56 * u, 30 * u);
    },
    campfire(x, F, u){
      let s = `<g filter="url(#gl)">${P(`M${f(x - 20 * u)} ${f(F - 10 * u)} Q ${f(x - 22 * u)} ${f(F - 40 * u)} ${f(x - 4 * u)} ${f(F - 62 * u)} Q ${f(x - 2 * u)} ${f(F - 40 * u)} ${f(x + 6 * u)} ${f(F - 44 * u)} Q ${f(x + 24 * u)} ${f(F - 30 * u)} ${f(x + 20 * u)} ${f(F - 10 * u)} Z`, '#FF8A3A')}${P(`M${f(x - 10 * u)} ${f(F - 10 * u)} Q ${f(x - 10 * u)} ${f(F - 30 * u)} ${f(x)} ${f(F - 40 * u)} Q ${f(x + 12 * u)} ${f(F - 26 * u)} ${f(x + 10 * u)} ${f(F - 10 * u)} Z`, '#FFE066')}</g>`;
      s += `<g transform="rotate(-12 ${f(x)} ${f(F - 6 * u)})">${R(x - 34 * u, F - 12 * u, 68 * u, 10 * u, '#6B4526', ink(2.5 * u) + ` rx="${f(5 * u)}"`)}</g><g transform="rotate(12 ${f(x)} ${f(F - 6 * u)})">${R(x - 34 * u, F - 12 * u, 68 * u, 10 * u, '#8A5A34', ink(2.5 * u) + ` rx="${f(5 * u)}"`)}</g>`;
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI; s += C(x + Math.cos(a) * 38 * u, F - 2 * u, 6 * u, '#8E8C96', ink(2 * u)); }
      return s;
    },
    crystals(x, F, u, pal){
      let s = '';
      for (const [dx, h, w, col] of [[-22, 60, 16, pal[1]], [0, 92, 22, pal[2]], [22, 70, 18, pal[1]], [10, 44, 14, mix(pal[1], pal[2], 0.5)]]) { const cx = x + dx * u;
        s += `<g filter="url(#gl)" opacity=".92">${P(`M${f(cx - w * u / 2)} ${f(F)} V ${f(F - h * u * 0.75)} L ${f(cx)} ${f(F - h * u)} L ${f(cx + w * u / 2)} ${f(F - h * u * 0.75)} V ${f(F)} Z`, col)}</g>` + P(`M${f(cx - w * u / 2)} ${f(F)} V ${f(F - h * u * 0.75)} L ${f(cx)} ${f(F - h * u)} L ${f(cx + w * u / 2)} ${f(F - h * u * 0.75)} V ${f(F)} Z`, 'none', ink(2.5 * u)) + L(cx, F - h * u, cx, F, '#FFFFFF', 2 * u, 'opacity=".5"'); }
      return s;
    },
    sculpture(x, F, u, pal){
      return R(x - 24 * u, F - 60 * u, 48 * u, 60 * u, '#FBF6EC', ink(3 * u)) + R(x - 18 * u, F - 98 * u, 36 * u, 36 * u, pal[2], ink(3 * u) + ` transform="rotate(12 ${f(x)} ${f(F - 80 * u)})"`) + C(x + 4 * u, F - 124 * u, 18 * u, pal[1], ink(3 * u));
    },
    balloons(x, F, u, pal){
      let s = R(x - 10 * u, F - 12 * u, 20 * u, 12 * u, '#8E8C96', ink(2 * u));
      const cols = [pal[1], pal[2], '#FF5E7E', '#2EC4B6', '#7B5CF0'];
      [[-26, 130], [0, 150], [24, 124], [-10, 108], [14, 100]].forEach(([dx, h], i) => { const bx = x + dx * u, by = F - h * u;
        s += P(`M${f(x)} ${f(F - 12 * u)} Q ${f(x + dx * u * 0.3)} ${f((F + by) / 2)} ${f(bx)} ${f(by + 20 * u)}`, 'none', 'stroke="#FFF7E6" stroke-width="1.5"') + E(bx, by, 16 * u, 20 * u, cols[i], ink(2.5 * u)) + E(bx - 5 * u, by - 7 * u, 4 * u, 6 * u, '#FFFFFF', 'opacity=".5"'); });
      return s;
    },
  };
  // hung from above, at the sides (the drummer's afro fills the middle top)
  function overhead(ctx, p){
    const { W, T: top, F, bh, pal, rnd } = ctx, u = ctx.u; let s = '';
    if (p === 'disco-ball' || p === 'chandelier') for (const cx of (ctx.hang || [0.2, 0.8])) {
      const x = W * cx, y = top + bh * 0.2;
      s += L(x, top, x, y - 20 * u, INK2, 2);
      if (p === 'disco-ball') { s += C(x, y, 20 * u, '#C9C3D8', ink(2.5 * u)); for (let i = -2; i <= 2; i++) s += L(x - 20 * u, y + i * 7 * u, x + 20 * u, y + i * 7 * u, '#8C84AE', 1.2) + L(x + i * 7 * u, y - 20 * u, x + i * 7 * u, y + 20 * u, '#8C84AE', 1.2); s += C(x - 7 * u, y - 7 * u, 4 * u, '#FFFFFF', 'filter="url(#gl)"'); }
      else { s += P(`M${f(x - 36 * u)} ${f(y - 4 * u)} Q ${f(x)} ${f(y + 18 * u)} ${f(x + 36 * u)} ${f(y - 4 * u)}`, 'none', ink(4 * u, pal[1])) + L(x, y - 20 * u, x, y + 12 * u, pal[1], 4 * u);
        for (const dx of [-36, -18, 0, 18, 36]) { const cy = y - 4 * u + (Math.abs(dx) === 36 ? 0 : Math.abs(dx) === 18 ? 9 : 12) * u; s += R(x + dx * u - 3 * u, cy - 12 * u, 6 * u, 12 * u, '#FFF7E6') + `<g filter="url(#gl)">${E(x + dx * u, cy - 16 * u, 3 * u, 5 * u, '#FFD479')}</g>` + P(`M${f(x + dx * u)} ${f(cy + 2 * u)} l -3 6 l 3 6 l 3 -6 Z`, '#E9F3FF', 'opacity=".9"'); } }
    }
    if (p === 'pennants' || p === 'string-lights') {
      const y0 = top + 6, sag = bh * 0.12, n = Math.max(8, Math.round(W / 38));
      s += P(`M-5 ${f(y0)} Q ${f(W / 2)} ${f(y0 + sag * 2)} ${f(W + 5)} ${f(y0)}`, 'none', 'stroke="#12101E" stroke-width="2"');
      const cols = [pal[1], pal[2], '#2EC4B6', '#FF5E7E', '#FFF7E6'];
      for (let i = 0; i <= n; i++) { const t = i / n, x = W * t, y = y0 + sag * 4 * t * (1 - t);
        if (p === 'pennants') s += P(`M${f(x - 9)} ${f(y)} L${f(x + 9)} ${f(y)} L${f(x)} ${f(y + 22)} Z`, cols[i % cols.length], ink(1.5));
        else s += R(x - 2.5, y, 5, 5, INK2) + `<g filter="url(#gl)">${E(x, y + 9, 4.5, 6, i % 2 ? '#FFE9A8' : pal[2])}</g>`; }
    }
    if (p === 'lasers') for (const cx of [0.18, 0.82]) s += R(W * cx - 12, top + 2, 24, 14, INK2, 'rx="3"') + C(W * cx, top + 18, 4, pal[2], 'filter="url(#gl)"');
    if (p === 'pyro') for (const cx of [0.03, 0.97]) s += R(W * cx - 14, F - 18, 28, 18, INK2, ink(2, '#3A3552') + ' rx="3"') + R(W * cx - 6, F - 22, 12, 5, '#3A3552');
    return s;
  }

  /* ---------- build the whole backdrop ---------- */
  function svg(scene, W, H, lay){
    lay = lay || {};
    const railY = lay.railY || 0, railH = lay.railH || 0, F = lay.floorY || H * 0.8, top = railY + railH, bh = F - top;
    const ctx = { W, H, T: top, F, bh, pal: scene.palette, time: scene.time, sign: scene.sign, rnd: rng(hashStr(scene.key) + W), defs: '', front: '', u: Math.max(0.42, Math.min(1.25, bh / 250, W / 820)) };
    let body = (DRAW[scene.setting] || DRAW.street)(ctx);
    // props: floor ones stand at the edges, overhead ones hang from the top
    const floorProps = scene.props.filter(p => !OVERHEAD.includes(p) && PROP[p]);
    const slots = [0.09, 0.91, 0.2, 0.8];
    floorProps.forEach((p, i) => { body += PROP[p](W * slots[i % slots.length], F + 2, ctx.u * (i >= 2 ? 0.85 : 1), scene.palette); });
    scene.props.filter(p => OVERHEAD.includes(p)).forEach(p => { body += overhead(ctx, p); });
    body += ctx.front;
    if (scene.weather === 'haze') body += R(0, top, W, F - top, mix(scene.palette[2], '#FFFFFF', 0.5), 'opacity=".07"');
    const defs = `<defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>${ctx.defs}</defs>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}">${defs}${body}</svg>`;
  }
  const urlCache = new Map();
  function dataUrl(scene, W, H, lay){
    const k = scene.key + '@' + W + 'x' + H + JSON.stringify(lay || {});
    if (!urlCache.has(k)) { if (urlCache.size > 40) urlCache.clear(); urlCache.set(k, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(scene, W, H, lay))); }
    return urlCache.get(k);
  }

  /* ---------- live effects drawn every frame over the backdrop ---------- */
  const live = { parts: [], key: '' };
  function drawLive(c, scene, o){
    const { W, H, top, F, now, dt, phase, hype, level } = o;
    if (reduceMotion) return;
    const pal = scene.palette, wx = scene.weather;
    if (live.key !== scene.key + W) { live.key = scene.key + W; live.parts = []; }
    // weather particles
    const want = wx === 'rain' ? Math.round(W / 9) : wx === 'snow' ? Math.round(W / 16) : wx === 'confetti' ? Math.round(W / 22) : wx === 'embers' ? Math.round(W / 30) : 0;
    while (live.parts.length < want) live.parts.push({ x: Math.random() * W, y: top + Math.random() * (F - top), v: Math.random(), r: Math.random() });
    if (live.parts.length > want) live.parts.length = want;
    c.save();
    for (const p of live.parts) {
      if (wx === 'rain') { p.y += dt * (520 + p.v * 260); p.x -= dt * 60; if (p.y > F) { p.y = top - 10; p.x = Math.random() * (W + 60); }
        c.strokeStyle = 'rgba(200,220,255,.45)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - 3, p.y + 12); c.stroke(); }
      else if (wx === 'snow') { p.y += dt * (26 + p.v * 30); p.x += Math.sin(now * 1.3 + p.r * 9) * dt * 14; if (p.y > F) { p.y = top - 6; p.x = Math.random() * W; }
        c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(p.x, p.y, 1.5 + p.r * 2, 0, 7); c.fill(); }
      else if (wx === 'confetti') { p.y += dt * (40 + p.v * 50); p.x += Math.sin(now * 2 + p.r * 9) * dt * 20; if (p.y > F) { p.y = top - 6; p.x = Math.random() * W; }
        c.save(); c.translate(p.x, p.y); c.rotate(now * 3 + p.r * 9); c.fillStyle = [pal[1], pal[2], '#2EC4B6', '#FF5E7E'][Math.floor(p.r * 4)]; c.fillRect(-4, -2, 8, 4); c.restore(); }
      else if (wx === 'embers') { p.y -= dt * (22 + p.v * 30); p.x += Math.sin(now + p.r * 9) * dt * 10; if (p.y < top) { p.y = F; p.x = Math.random() * W; }
        c.fillStyle = `rgba(255,${150 + Math.round(p.r * 80)},60,${0.4 + 0.5 * Math.sin(now * 4 + p.r * 9) ** 2})`; c.beginPath(); c.arc(p.x, p.y, 1.5 + p.r * 1.5, 0, 7); c.fill(); }
    }
    if (wx === 'stars') { c.fillStyle = '#FFFFFF'; for (let i = 0; i < 14; i++) { const x = ((i * 97.13) % 1) * W + ((i * 211) % W), y = top + ((i * 53.7) % (F - top)), a = Math.max(0, Math.sin(now * 2 + i * 1.7)); c.globalAlpha = a * 0.9; c.beginPath(); c.arc(x % W, y, 1.8, 0, 7); c.fill(); } c.globalAlpha = 1; }
    // lasers sweep once the crowd warms up
    if (scene.props.includes('lasers') && level >= 1) {
      c.globalCompositeOperation = 'lighter';
      for (const [i, cx] of [[0, 0.18], [1, 0.82]]) for (let k = 0; k < 3; k++) {
        const a = Math.PI / 2 + Math.sin(now * (0.8 + k * 0.3) + i * 2 + k) * 0.7;
        c.strokeStyle = rgba(k % 2 ? pal[1] : pal[2], 0.28 + 0.2 * Math.pow(1 - phase, 2)); c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(W * cx, top + 18); c.lineTo(W * cx + Math.cos(a) * H * 1.4, top + 18 + Math.sin(a) * H * 1.4); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }
    // flame jets on the big moments
    if (scene.props.includes('pyro') && level >= 3) {
      const h = (F - top) * 0.55 * Math.pow(1 - phase, 1.5);
      for (const cx of [0.03, 0.97]) { const x = W * cx, g = c.createLinearGradient(0, F - 20 - h, 0, F - 20);
        g.addColorStop(0, 'rgba(255,230,120,0)'); g.addColorStop(0.4, 'rgba(255,170,60,.85)'); g.addColorStop(1, 'rgba(255,90,40,.95)');
        c.fillStyle = g; c.beginPath(); c.moveTo(x - 10, F - 20); c.quadraticCurveTo(x - 16, F - 20 - h * 0.5, x, F - 20 - h); c.quadraticCurveTo(x + 16, F - 20 - h * 0.5, x + 10, F - 20); c.fill(); }
    }
    // neon and LED screens breathe on the beat
    if (['club', 'arena', 'cosmic', 'rooftop'].includes(scene.setting)) { c.globalAlpha = 0.06 * Math.pow(1 - phase, 2) * (1 + hype); c.fillStyle = pal[2]; c.fillRect(0, top, W, F - top); c.globalAlpha = 1; }
    c.restore();
  }

  return { SETTINGS, PROPS, WEATHER, TIMES, validate, svg, dataUrl, drawLive };
})();
