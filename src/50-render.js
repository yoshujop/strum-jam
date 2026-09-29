/* =====================================================================
   Rendering: stage canvas (original cast: Pip the pick, Boom the drum-can,
   Bo the bassist, the bean crowd), chord track, fretboard SVG with live
   note feedback, plain-language chord steps, mini chord boxes.
   ===================================================================== */
const COL = { ink:'#1E1B2E', ink2:'#3A3552', paper:'#FFF7E6', sun:'#FFCE3A', coral:'#FF5E7E', teal:'#2EC4B6', grape:'#7B5CF0',
  amber:'#FFB020', mint:'#8FE3A0', sky:'#6CC8FF', pink:'#FF8FC7', good:'#2BB673', bad:'#E5484D', wood:'#5A3825', fret:'#D9D4C7',
  bg2:'#EFE3C8', dim:'#8C8474', mute:'#9A917E' };
const FINGER_COL = ['#FFFFFF', '#2EC4B6', '#FFB020', '#FF5E7E', '#7B5CF0', '#1E1B2E'];
const CARD_COL = [COL.coral, COL.amber, COL.mint, COL.teal, COL.sky, COL.grape, COL.pink];
const BG_COL = ['#FFCE3A', '#2EC4B6', '#FF8FA3', '#B8A6FF', '#8FE3A0', '#6CC8FF'];
const DISPLAY_FONT = '"Bagel Fat One","Arial Rounded MT Bold","Trebuchet MS",sans-serif';
const UI_FONT = '"Baloo 2","Nunito","Segoe UI",sans-serif';
const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();


/* ---------- the venue: a night-time back street under a railway bridge, pre-drawn as an SVG and cached per size ---------- */
function streetSVG(W, H, railY, railH, floorY){
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const top = railY + railH;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15112E"/><stop offset="1" stop-color="#3B2A63"/></linearGradient>
<filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="ln" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FFB199"/><stop offset=".5" stop-color="#F0483A"/><stop offset="1" stop-color="#A51F1F"/></radialGradient>
<linearGradient id="dk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C99A62"/><stop offset="1" stop-color="#8E6337"/></linearGradient>
<linearGradient id="wl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E2848"/><stop offset="1" stop-color="#241F3B"/></linearGradient>
</defs><rect width="${W}" height="${H}" fill="url(#sk)"/>`;
  // city behind: two rows of buildings with lit windows
  for (const [row, col, dy] of [[0, '#221C45', 0], [1, '#2B2456', 28]]) {
    let x = -10 - row * 30;
    while (x < W) {
      const bw = 50 + rnd() * 70, bh = (floorY - top) * (0.55 + rnd() * 0.5) - dy, by = floorY - 40 - bh;
      s += `<rect x="${x}" y="${by}" width="${bw}" height="${bh + 40}" fill="${col}"/>`;
      for (let wy = by + 8; wy < floorY - 60; wy += 15) for (let wx = x + 7; wx < x + bw - 9; wx += 13) if (rnd() < 0.32) s += `<rect x="${wx}" y="${wy}" width="7" height="9" fill="${rnd() < 0.7 ? '#FFD479' : '#7FE7FF'}" opacity="${0.45 + row * 0.35}"/>`;
      x += bw + 3;
    }
  }
  // railway bridge: girder band behind the chord rail, truss showing underneath, two pillars
  const gb = top + 16;
  s += `<rect x="0" y="0" width="${W}" height="${gb}" fill="#3F3960"/><rect x="0" y="${gb - 9}" width="${W}" height="9" fill="#2A2544"/>`;
  for (let gx = -20; gx < W; gx += 56) s += `<path d="M${gx} ${gb - 9} L${gx + 28} ${top - 4} L${gx + 56} ${gb - 9}" fill="none" stroke="#56507C" stroke-width="5"/><circle cx="${gx + 28}" cy="${gb - 5}" r="2.4" fill="#8C84AE"/>`;
  for (const px of [W * 0.07, W * 0.93 - 26]) s += `<rect x="${px}" y="${gb}" width="26" height="${floorY - gb}" fill="#35305A"/><rect x="${px}" y="${gb}" width="6" height="${floorY - gb}" fill="#48427A"/>`;
  // vertical neon signs
  const room = floorY - gb - 30, cs = Math.max(14, Math.min(26, room / 5.2));
  const signs = [[0.015, 'ライブ', '#FF4FA0'], [0.155, 'ラーメン', '#4FE3FF'], [0.83, 'カラオケ', '#FFB020'], [0.955, '酒場', '#8FE3A0']];
  for (const [fx, t, c] of signs) {
    const ch = [...t], hgt = Math.min(room, ch.length * cs * 1.25 + cs * 0.7), n = Math.max(1, Math.floor((hgt - cs * 0.5) / (cs * 1.25))), x = W * fx, y = gb + 14, w = cs * 1.55;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="6" fill="#15122B" stroke="${c}" stroke-width="3" filter="url(#gl)"/>`;
    ch.slice(0, n).forEach((k, i) => s += `<text x="${x + w / 2}" y="${y + cs * 1.1 + i * cs * 1.25}" text-anchor="middle" font-size="${cs}" font-weight="900" fill="${c}" filter="url(#gl)" font-family="Hiragino Sans, Noto Sans JP, Yu Gothic, Meiryo, sans-serif">${k}</text>`);
  }
  // paper lanterns on a rope
  const ly = gb + 6, lr = Math.max(8, Math.min(15, (floorY - gb) * 0.07));
  s += `<path d="M${W * 0.26} ${ly} Q ${W * 0.5} ${ly + lr * 2.4} ${W * 0.74} ${ly}" fill="none" stroke="#12101E" stroke-width="2.5"/>`;
  for (let i = 0; i <= 6; i++) { const t = i / 6, x = W * (0.26 + 0.48 * t), y = ly + lr * 2.4 * 2 * t * (1 - t) + 2;
    s += `<g filter="url(#gl)"><rect x="${x - lr * 0.7}" y="${y}" width="${lr * 1.4}" height="${lr * 0.45}" rx="2" fill="#12101E"/><ellipse cx="${x}" cy="${y + lr * 1.35}" rx="${lr}" ry="${lr * 1.15}" fill="url(#ln)" stroke="#12101E" stroke-width="2"/><rect x="${x - lr * 0.55}" y="${y + lr * 2.35}" width="${lr * 1.1}" height="${lr * 0.4}" rx="2" fill="#12101E"/></g>`; }
  // back wall with graffiti, a glowing vending machine, speaker stacks
  const wallH = Math.max(26, (floorY - gb) * 0.28);
  s += `<rect x="0" y="${floorY - wallH}" width="${W}" height="${wallH}" fill="url(#wl)"/>`;
  for (let bx = 0; bx < W; bx += 38) s += `<line x1="${bx}" x2="${bx}" y1="${floorY - wallH}" y2="${floorY}" stroke="#1E1B2E" stroke-width="1.5" opacity=".5"/>`;
  s += `<text x="${W * 0.3}" y="${floorY - wallH * 0.28}" font-family="Arial Black, Impact, sans-serif" font-size="${wallH * 0.62}" fill="#7B5CF0" stroke="#12101E" stroke-width="2.5" paint-order="stroke" transform="rotate(-6 ${W * 0.3} ${floorY})">SJ!</text>`;
  s += `<text x="${W * 0.6}" y="${floorY - wallH * 0.25}" font-family="Arial Black, Impact, sans-serif" font-size="${wallH * 0.5}" fill="#2EC4B6" stroke="#12101E" stroke-width="2.5" paint-order="stroke" transform="rotate(4 ${W * 0.6} ${floorY})">JAM</text>`;
  const vh = Math.min(floorY - gb - 10, 120), vw = vh * 0.62, vx = W * 0.72, vy = floorY - vh;
  s += `<g filter="url(#gl)"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" rx="5" fill="#E9F3FF" stroke="#12101E" stroke-width="3"/></g><rect x="${vx + vw * 0.1}" y="${vy + vh * 0.07}" width="${vw * 0.8}" height="${vh * 0.45}" fill="#4FA8FF"/>`;
  const cols = ['#FF5E7E', '#FFCE3A', '#8FE3A0', '#FFB020'];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) s += `<rect x="${vx + vw * (0.14 + k * 0.19)}" y="${vy + vh * (0.1 + r * 0.2)}" width="${vw * 0.12}" height="${vh * 0.15}" rx="2" fill="${cols[(k + r) % 4]}"/>`;
  s += `<rect x="${vx + vw * 0.15}" y="${vy + vh * 0.7}" width="${vw * 0.7}" height="${vh * 0.1}" rx="2" fill="#12101E"/>`;
  const sh = Math.min(floorY - gb - 20, 100), sw = sh * 0.6;
  for (const sx of [W * 0.09, W * 0.9 - sw]) s += `<rect x="${sx}" y="${floorY - sh}" width="${sw}" height="${sh}" rx="5" fill="#231F36" stroke="#0F0D1A" stroke-width="3"/><circle cx="${sx + sw / 2}" cy="${floorY - sh * 0.7}" r="${sw * 0.3}" fill="#3A3552" stroke="#0F0D1A" stroke-width="3"/><circle cx="${sx + sw / 2}" cy="${floorY - sh * 0.26}" r="${sw * 0.2}" fill="#3A3552" stroke="#0F0D1A" stroke-width="3"/>`;
  // the stage deck: warm planks with seams, grain, nails and a bright front lip
  const dh = H - floorY, n = Math.max(3, Math.round(dh / 16)), ph = dh / n;
  s += `<rect x="0" y="${floorY}" width="${W}" height="${dh}" fill="url(#dk)"/>`;
  for (let i = 0; i < n; i++) {
    const y = floorY + i * ph;
    s += `<rect x="0" y="${y}" width="${W}" height="${ph}" fill="${i % 2 ? '#000' : '#fff'}" opacity=".05"/>`;
    let x = -rnd() * 120;
    while (x < W) { const L = 110 + rnd() * 160;
      s += `<line x1="${x}" x2="${x}" y1="${y}" y2="${y + ph}" stroke="#5C3D1E" stroke-width="2"/><circle cx="${x + 6}" cy="${y + ph * 0.3}" r="1.3" fill="#4A3017"/><circle cx="${x + 6}" cy="${y + ph * 0.7}" r="1.3" fill="#4A3017"/>`;
      for (let g = 0; g < 2; g++) { const gy = y + ph * (0.3 + g * 0.35 + rnd() * 0.1); s += `<path d="M${x + 12} ${gy} q ${L * 0.3} ${-2 + rnd() * 4} ${L * 0.6} 0 t ${L * 0.35} 0" fill="none" stroke="#7A5129" stroke-width="1" opacity=".55"/>`; }
      x += L; }
    s += `<line x1="0" x2="${W}" y1="${y + ph}" y2="${y + ph}" stroke="#5C3D1E" stroke-width="2"/>`;
  }
  s += `<rect x="0" y="${floorY - 3}" width="${W}" height="7" fill="#E3B981"/><rect x="0" y="${floorY + 4}" width="${W}" height="3" fill="#5C3D1E" opacity=".6"/>`;
  return s + '</svg>';
}

function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(Math.min(255, Math.max(0, r + amt))); g = Math.round(Math.min(255, Math.max(0, g + amt))); b = Math.round(Math.min(255, Math.max(0, b + amt)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function rgba(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function rr(c, x, y, w, h, r){ r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function cardColor(label){ const ch = parseChord(label); return CARD_COL[ch ? ch.root % 7 : 0]; }
function textOn(bg){ return bg === COL.grape ? COL.paper : COL.ink; }
function hashStr(s){ let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/* a vinyl record, seen at a slight tilt (rx x ry), spinning by angle `rot` */
const VINYL = { disc: '#1d1a2b', groove: '#2c2842', shine: 'rgba(255,255,255,.13)' };
/* The Strum Jam mark: an S whose tail runs into a J drawn as an eighth note (the J's hook is the note head, a flag
   on top of its stem), so it reads SJ and ♪ at once. Centred on 0,0, about `h` tall. */
function drawSJ(c, h, col){
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const sx = -h * 0.2, u = h / 2;
  // the S: two joined arcs, a fat pink stroke over a thin ink one
  const S = () => { c.beginPath(); c.moveTo(sx + u * 0.32, -u * 0.6);
    c.bezierCurveTo(sx + u * 0.12, -u * 0.86, sx - u * 0.44, -u * 0.8, sx - u * 0.38, -u * 0.4);
    c.bezierCurveTo(sx - u * 0.32, -u * 0.06, sx + u * 0.38, -u * 0.08, sx + u * 0.36, u * 0.3);
    c.bezierCurveTo(sx + u * 0.34, u * 0.74, sx - u * 0.22, u * 0.82, sx - u * 0.4, u * 0.48); };
  // the J: a stem down to a round head at bottom-left, a flag off the top
  const jx = h * 0.26, J = () => { c.beginPath(); c.moveTo(jx, -u * 0.8); c.lineTo(jx, u * 0.42); };
  c.strokeStyle = COL.ink; c.lineWidth = h * 0.2; S(); c.stroke(); J(); c.stroke();
  c.strokeStyle = col; c.lineWidth = h * 0.12; S(); c.stroke(); J(); c.stroke();
  c.save(); c.translate(jx - h * 0.1, u * 0.5); c.rotate(-0.4); c.beginPath(); c.ellipse(0, 0, h * 0.14, h * 0.1, 0, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = h * 0.04; c.strokeStyle = COL.ink; c.stroke(); c.restore();
  c.beginPath(); c.moveTo(jx, -u * 0.8); c.quadraticCurveTo(jx + h * 0.24, -u * 0.62, jx + h * 0.2, -u * 0.22); c.quadraticCurveTo(jx + h * 0.14, -u * 0.46, jx, -u * 0.46); c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = h * 0.04; c.strokeStyle = COL.ink; c.stroke();
  c.restore();
}
function drawVinyl(c, cx, cy, rx, ry, rot){
  const R = rx, k = ry / rx;
  c.save(); c.translate(cx, cy); c.scale(1, k);
  c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = VINYL.disc; c.fill();
  // grooves, with a few wider gaps between tracks
  c.lineWidth = 1.4; c.strokeStyle = VINYL.groove;
  for (let r = R * 0.36; r < R * 0.97; r += R * 0.028) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
  c.lineWidth = 4; c.strokeStyle = '#141220'; for (const f of [0.5, 0.66, 0.8, 0.9]) { c.beginPath(); c.arc(0, 0, R * f, 0, Math.PI * 2); c.stroke(); }
  // light catching the grooves: fixed wedges, as on a real record
  c.save(); c.beginPath(); c.arc(0, 0, R * 0.97, 0, Math.PI * 2); c.arc(0, 0, R * 0.34, 0, Math.PI * 2, true); c.clip();
  c.fillStyle = VINYL.shine;
  for (const a of [-2.3, 0.84]) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a - 0.28, a + 0.28); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a - 0.1, a + 0.1); c.closePath(); c.fill(); }
  c.restore();
  // the spinning part: little glints on the grooves and the label
  c.save(); c.rotate(rot);
  c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2.5; c.lineCap = 'round';
  for (const [f, a] of [[0.58, 0.3], [0.74, 2.2], [0.86, 4.1], [0.46, 5.2]]) { c.beginPath(); c.arc(0, 0, R * f, a, a + 0.35); c.stroke(); }
  const LR = R * 0.3;
  // the label: white with a black ring, and the SJ mark in the title's pink
  c.beginPath(); c.arc(0, 0, LR, 0, Math.PI * 2); c.fillStyle = '#FFFFFF'; c.fill(); c.lineWidth = 3; c.strokeStyle = COL.ink; c.stroke();
  c.beginPath(); c.arc(0, 0, LR * 0.84, 0, Math.PI * 2); c.lineWidth = 1.6; c.stroke();
  drawSJ(c, LR * 0.95, COL.coral);
  c.restore();
  c.beginPath(); c.arc(0, 0, R * 0.018, 0, Math.PI * 2); c.fillStyle = COL.paper; c.fill(); c.lineWidth = 2; c.strokeStyle = COL.ink; c.stroke();
  c.restore();
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.lineWidth = 4; c.strokeStyle = COL.ink; c.stroke();
}
/* ---------- characters ---------- */
function drawPip(c, x, footY, s, o){
  // o: {bounce 0..1, strum 0..1 (arm swing), mood:'idle'|'great'|'miss'|'focus', lookX, jump, lefty}
  const b = reduceMotion ? 0 : (o.bounce || 0);
  const lift = b * s * 0.12, sq = (reduceMotion ? 0 : (o.squash || 0)) * 0.08;
  c.save();
  c.translate(x, footY);
  if (o.lefty) c.scale(-1, 1);
  c.fillStyle = 'rgba(30,27,46,.18)'; c.beginPath(); c.ellipse(0, 0, s * 0.34 * (1 - b * 0.2), s * 0.07, 0, 0, Math.PI * 2); c.fill();
  c.translate(0, -lift - (reduceMotion ? 0 : (o.jump || 0)) * s * 0.35);
  if (o.jump && !reduceMotion) c.rotate(Math.sin(o.jump * Math.PI) * 0.12);
  c.scale(1 + sq, 1 - sq);
  const lw = Math.max(2.5, s * 0.035);
  c.lineWidth = lw; c.strokeStyle = COL.ink; c.lineCap = 'round'; c.lineJoin = 'round';
  // legs + shoes
  c.beginPath(); c.moveTo(-s * 0.1, -s * 0.2); c.lineTo(-s * 0.13, -s * 0.03); c.moveTo(s * 0.1, -s * 0.2); c.lineTo(s * 0.13, -s * 0.03); c.stroke();
  c.fillStyle = COL.ink;
  c.beginPath(); c.ellipse(-s * 0.16, -s * 0.03, s * 0.09, s * 0.045, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(s * 0.16, -s * 0.03, s * 0.09, s * 0.045, 0, 0, Math.PI * 2); c.fill();
  // body: a guitar pick, point down
  const cy = -s * 0.62;
  c.beginPath();
  c.moveTo(-s * 0.3, cy - s * 0.5);
  c.quadraticCurveTo(0, cy - s * 0.62, s * 0.3, cy - s * 0.5);
  c.quadraticCurveTo(s * 0.62, cy - s * 0.4, s * 0.43, cy - s * 0.02);
  c.quadraticCurveTo(s * 0.22, cy + s * 0.38, s * 0.05, cy + s * 0.5);
  c.quadraticCurveTo(0, cy + s * 0.56, -s * 0.05, cy + s * 0.5);
  c.quadraticCurveTo(-s * 0.22, cy + s * 0.38, -s * 0.43, cy - s * 0.02);
  c.quadraticCurveTo(-s * 0.62, cy - s * 0.4, -s * 0.3, cy - s * 0.5);
  c.closePath();
  c.fillStyle = COL.coral; c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = lw * 1.1;
  c.beginPath(); c.arc(-s * 0.18, cy - s * 0.28, s * 0.13, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
  c.strokeStyle = COL.ink; c.lineWidth = lw;
  // face
  const ey = cy - s * 0.2, ex = s * 0.15, look = (o.lookX || 0) * s * 0.025;
  if (o.mood === 'great') {
    c.beginPath(); c.arc(-ex, ey + s * 0.02, s * 0.06, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.beginPath(); c.arc(ex, ey + s * 0.02, s * 0.06, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  } else {
    for (const sx of [-ex, ex]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(sx, ey, s * 0.065, s * 0.085, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = COL.ink; c.beginPath(); c.arc(sx + look, ey + (o.mood === 'focus' ? -s * 0.02 : s * 0.01), s * 0.035, 0, Math.PI * 2); c.fill();
    }
  }
  c.fillStyle = 'rgba(255,255,255,.45)';
  c.beginPath(); c.ellipse(-s * 0.26, ey + s * 0.12, s * 0.06, s * 0.035, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(s * 0.26, ey + s * 0.12, s * 0.06, s * 0.035, 0, 0, Math.PI * 2); c.fill();
  const my = ey + s * 0.15;
  c.fillStyle = COL.ink;
  if (o.mood === 'great') { c.beginPath(); c.moveTo(-s * 0.08, my - s * 0.02); c.quadraticCurveTo(0, my + s * 0.13, s * 0.08, my - s * 0.02); c.closePath(); c.fill(); }
  else if (o.mood === 'miss') { c.beginPath(); c.ellipse(0, my + s * 0.02, s * 0.035, s * 0.045, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = COL.sky; c.beginPath(); c.moveTo(s * 0.3, cy - s * 0.42); c.quadraticCurveTo(s * 0.38, cy - s * 0.3, s * 0.3, cy - s * 0.26); c.quadraticCurveTo(s * 0.22, cy - s * 0.3, s * 0.3, cy - s * 0.42); c.fill(); c.stroke(); }
  else { c.beginPath(); c.arc(0, my - s * 0.03, s * 0.07, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); }
  // guitar (held across the body)
  c.save();
  c.translate(s * 0.02, cy + s * 0.2);
  c.rotate(-0.42);
  c.fillStyle = '#8A5A3B';
  rr(c, -s * 0.78, -s * 0.045, s * 0.62, s * 0.09, s * 0.02); c.fill(); c.stroke();
  c.fillStyle = COL.ink; rr(c, -s * 0.92, -s * 0.065, s * 0.17, s * 0.13, s * 0.03); c.fill();
  c.fillStyle = COL.amber;
  c.beginPath(); c.arc(-s * 0.05, 0, s * 0.17, 0, Math.PI * 2); c.arc(s * 0.16, 0, s * 0.21, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(-s * 0.05, 0, s * 0.17, Math.PI * 0.35, Math.PI * 1.65); c.stroke();
  c.beginPath(); c.arc(s * 0.16, 0, s * 0.21, -Math.PI * 0.72, Math.PI * 0.72); c.stroke();
  c.fillStyle = COL.ink; c.beginPath(); c.arc(s * 0.04, 0, s * 0.055, 0, Math.PI * 2); c.fill();
  c.fillStyle = COL.paper; c.beginPath(); c.arc(-s * 0.55, s * 0.02, s * 0.055, 0, Math.PI * 2); c.fill(); c.stroke();
  const sw = (o.strum || 0);
  c.beginPath(); c.arc(s * 0.06 + sw * s * 0.03, -s * 0.16 + sw * s * 0.3, s * 0.06, 0, Math.PI * 2); c.fillStyle = COL.paper; c.fill(); c.stroke();
  c.restore();
  c.restore();
}

function drawBoom(c, x, floorY, s, now, hits, o){
  o = o || {};
  const recent = kind => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (h.t <= now) { if (h.kind === kind || (kind === 'snare' && (h.kind === 'tom' || h.kind === 'crash' || h.kind === 'stick'))) return now - h.t; } } return 9; };
  const dk = recent('kick'), ds = recent('snare'), dh = recent('hat'), dc = recent('crash');
  const lw = Math.max(2.5, s * 0.035);
  c.save(); c.translate(x, floorY);
  if (o.lefty) c.scale(-1, 1);
  c.lineWidth = lw; c.strokeStyle = COL.ink; c.lineJoin = 'round'; c.lineCap = 'round';
  c.fillStyle = 'rgba(30,27,46,.18)'; c.beginPath(); c.ellipse(0, 0, s * 0.62, s * 0.08, 0, 0, Math.PI * 2); c.fill();
  // a crash cymbal appears once the band is really going
  if ((o.level || 0) >= 3) {
    const cyY = -s * 1.12;
    c.beginPath(); c.moveTo(-s * 0.95, -s * 0.02); c.lineTo(-s * 0.95, cyY); c.stroke();
    c.save(); c.translate(-s * 0.95, cyY); c.rotate(0.22 + (dc < 0.3 && !reduceMotion ? Math.sin(dc * 40) * 0.12 * (1 - dc / 0.3) : 0));
    c.fillStyle = COL.sun; c.beginPath(); c.ellipse(0, 0, s * 0.24, s * 0.05, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
  }
  // body (a tin can with a headband) behind the kit
  const bob = reduceMotion ? 0 : Math.min(1, dk * 8) < 1 ? (1 - dk * 8) * s * 0.03 : 0;
  const by = -s * 1.05 + bob;
  c.fillStyle = COL.teal; rr(c, -s * 0.3, by - s * 0.42, s * 0.6, s * 0.8, s * 0.12); c.fill(); c.stroke();
  c.fillStyle = COL.amber; c.fillRect(-s * 0.3 + lw / 2, by - s * 0.3, s * 0.6 - lw, s * 0.09); c.strokeRect(-s * 0.3 + lw / 2, by - s * 0.3, s * 0.6 - lw, s * 0.09);
  for (const sx of [-0.11, 0.11]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(sx * s, by - s * 0.07, s * 0.06, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = COL.ink; c.beginPath(); c.arc(sx * s, by - s * 0.06, s * 0.028, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.arc(0, by + s * 0.06, s * 0.07, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
  // arms + sticks
  const armL = ds < 0.09 ? 0.55 : -0.35, armR = dh < 0.07 ? -0.5 : 0.3;
  c.lineWidth = lw * 1.3;
  c.beginPath(); c.moveTo(-s * 0.28, by + s * 0.1); c.lineTo(-s * 0.46, by + s * 0.28); c.stroke();
  c.beginPath(); c.moveTo(s * 0.28, by + s * 0.1); c.lineTo(s * 0.46, by + s * 0.28); c.stroke();
  c.lineWidth = lw;
  c.save(); c.translate(-s * 0.46, by + s * 0.28); c.rotate(Math.PI * 0.75 + armL); c.strokeStyle = '#B07A4A'; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 0.34, 0); c.stroke(); c.restore();
  c.save(); c.translate(s * 0.46, by + s * 0.28); c.rotate(Math.PI * 0.25 + armR); c.strokeStyle = '#B07A4A'; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 0.34, 0); c.stroke(); c.restore();
  // hi-hat (right)
  const hy = -s * 0.78 + (dh < 0.06 ? s * 0.02 : 0);
  c.strokeStyle = COL.ink; c.beginPath(); c.moveTo(s * 0.72, -s * 0.02); c.lineTo(s * 0.72, hy); c.stroke();
  c.fillStyle = COL.sun; c.beginPath(); c.ellipse(s * 0.72, hy, s * 0.2, s * 0.045, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  // snare (left)
  const sy = -s * 0.52 + (ds < 0.06 ? s * 0.015 : 0);
  c.fillStyle = COL.paper; rr(c, -s * 0.82, sy, s * 0.36, s * 0.14, s * 0.03); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(-s * 0.64, sy, s * 0.18, s * 0.045, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-s * 0.64, sy + s * 0.14); c.lineTo(-s * 0.64, -s * 0.02); c.stroke();
  // bass drum (front)
  const kr = s * 0.36 * (dk < 0.08 ? 1.04 : 1);
  c.fillStyle = COL.paper; c.beginPath(); c.arc(0, -kr, kr, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = COL.coral; c.lineWidth = lw * 2; c.beginPath(); c.arc(0, -kr, kr * 0.72, 0, Math.PI * 2); c.stroke();
  if (o.lefty) c.scale(-1, 1);
  c.fillStyle = COL.coral; c.font = `${Math.round(s * 0.24)}px ${DISPLAY_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SJ', 0, -kr + s * 0.01);
  c.restore();
}
const drawBoomBot = drawBoom;

/* Bo: a grape-coloured bean with a bass, who joins when the bass line kicks in */
function drawThrum(c, x, floorY, s, beat, o){
  o = o || {};
  const lw = Math.max(2.5, s * 0.035);
  const ph = ((beat % 1) + 1) % 1, nod = reduceMotion ? 0 : Math.pow(1 - ph, 3) * s * 0.03;
  const pluck = reduceMotion ? 0 : Math.max(0, 1 - ((((beat * 2) % 1) + 1) % 1) * 4);
  c.save(); c.translate(x, floorY); c.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.lefty) c.scale(-1, 1);
  c.lineWidth = lw; c.strokeStyle = COL.ink; c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = 'rgba(30,27,46,.18)'; c.beginPath(); c.ellipse(0, 0, s * 0.3, s * 0.06, 0, 0, Math.PI * 2); c.fill();
  // legs + shoes
  c.beginPath(); c.moveTo(-s * 0.08, -s * 0.2); c.lineTo(-s * 0.1, -s * 0.03); c.moveTo(s * 0.08, -s * 0.2); c.lineTo(s * 0.1, -s * 0.03); c.stroke();
  c.fillStyle = COL.ink; c.beginPath(); c.ellipse(-s * 0.13, -s * 0.03, s * 0.08, s * 0.04, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(s * 0.13, -s * 0.03, s * 0.08, s * 0.04, 0, 0, Math.PI * 2); c.fill();
  // tall bean body
  c.translate(0, nod);
  c.fillStyle = COL.grape; c.beginPath(); c.ellipse(0, -s * 0.66, s * 0.28, s * 0.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = lw * 1.1; c.beginPath(); c.arc(-s * 0.12, -s * 0.9, s * 0.1, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
  c.strokeStyle = COL.ink; c.lineWidth = lw;
  // cap
  c.fillStyle = COL.sun; c.beginPath(); c.ellipse(0, -s * 1.1, s * 0.2, s * 0.07, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(s * 0.04, -s * 1.1); c.lineTo(s * 0.3, -s * 1.08); c.stroke();
  // sleepy-cool eyes + grin
  for (const sx of [-0.1, 0.1]) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(sx * s, -s * 0.9, s * 0.055, s * 0.06, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = COL.ink; c.beginPath(); c.arc(sx * s + s * 0.012, -s * 0.89, s * 0.026, 0, Math.PI * 2); c.fill();
    c.fillStyle = COL.grape; c.fillRect(sx * s - s * 0.06, -s * 0.97, s * 0.12, s * 0.05); c.beginPath(); c.moveTo(sx * s - s * 0.06, -s * 0.92); c.lineTo(sx * s + s * 0.06, -s * 0.92); c.stroke(); }
  c.beginPath(); c.arc(0, -s * 0.8, s * 0.06, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
  // the bass, slung low
  c.save(); c.translate(0, -s * 0.5); c.rotate(-0.5);
  c.fillStyle = '#8A5A3B'; rr(c, -s * 0.95, -s * 0.035, s * 0.8, s * 0.07, s * 0.02); c.fill(); c.stroke();
  c.fillStyle = COL.ink; rr(c, -s * 1.08, -s * 0.06, s * 0.15, s * 0.12, s * 0.03); c.fill();
  c.fillStyle = COL.sky; c.beginPath(); c.ellipse(-s * 0.05, 0, s * 0.2, s * 0.15, 0, 0, Math.PI * 2); c.ellipse(s * 0.14, 0, s * 0.18, s * 0.17, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(-s * 0.05, 0, s * 0.2, s * 0.15, 0, Math.PI * 0.4, Math.PI * 1.6); c.stroke();
  c.beginPath(); c.ellipse(s * 0.14, 0, s * 0.18, s * 0.17, 0, -Math.PI * 0.75, Math.PI * 0.75); c.stroke();
  c.fillStyle = COL.ink; rr(c, s * 0.05, -s * 0.06, s * 0.05, s * 0.12, s * 0.01); c.fill();
  c.fillStyle = COL.paper; c.beginPath(); c.arc(-s * 0.72, s * 0.02, s * 0.05, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.arc(s * 0.02 + pluck * s * 0.02, -s * 0.12 + pluck * s * 0.1, s * 0.05, 0, Math.PI * 2); c.fill(); c.stroke();
  c.restore();
  c.restore();
}

/* Lulu: a teal speech bubble with a sun-yellow quiff, the band's singer (the player, in Vocals).
   Her mouth opens with the player's voice; eyes squeeze shut on a long, in-tune note. */
function drawSinger(c, x, footY, s, o){
  o = o || {};
  const lw = Math.max(2.5, s * 0.035), ph = (((o.beat || 0) % 1) + 1) % 1;
  const bob = reduceMotion ? 0 : Math.pow(1 - ph, 3) * s * 0.04, open = Math.max(0, Math.min(1, o.open || 0)), lean = reduceMotion ? 0 : open * 0.1 + (o.jump || 0) * 0.08;
  c.save(); c.translate(x, footY);
  c.lineWidth = lw; c.strokeStyle = COL.ink; c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = 'rgba(30,27,46,.18)'; c.beginPath(); c.ellipse(0, 0, s * 0.3, s * 0.06, 0, 0, Math.PI * 2); c.fill();
  c.translate(0, -(reduceMotion ? 0 : (o.jump || 0)) * s * 0.3);     // a jump lifts all of her; the shadow stays
  // legs + shoes (the legs reach up into the body, so she never floats)
  c.beginPath(); c.moveTo(-s * 0.09, -s * 0.34); c.lineTo(-s * 0.12, -s * 0.03); c.moveTo(s * 0.09, -s * 0.34); c.lineTo(s * 0.12, -s * 0.03); c.stroke();
  c.fillStyle = COL.coral; c.beginPath(); c.ellipse(-s * 0.15, -s * 0.035, s * 0.085, s * 0.045, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(s * 0.15, -s * 0.035, s * 0.085, s * 0.045, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  c.translate(0, -bob); c.rotate(-lean);
  const cy = -s * 0.66, W = s * 0.36, H = s * 0.42;
  // body: a speech bubble (tail at the bottom left) and the quiff, one ink outline
  const bubble = () => { c.beginPath(); c.moveTo(-W, cy);
    c.bezierCurveTo(-W, cy - H * 1.1, W, cy - H * 1.1, W, cy); c.bezierCurveTo(W, cy + H * 0.95, -W * 0.2, cy + H * 1.02, -W * 0.45, cy + H * 0.8);
    c.lineTo(-W * 0.78, cy + H * 1.1); c.lineTo(-W * 0.72, cy + H * 0.62); c.bezierCurveTo(-W * 0.95, cy + H * 0.45, -W, cy + H * 0.2, -W, cy); c.closePath(); };
  // quiff
  c.fillStyle = COL.sun; c.beginPath(); c.moveTo(-W * 0.3, cy - H * 0.8); c.bezierCurveTo(-W * 0.5, cy - H * 1.5, W * 0.4, cy - H * 1.6, W * 0.62, cy - H * 1.22);
  c.bezierCurveTo(W * 0.3, cy - H * 1.28, W * 0.18, cy - H * 1.05, W * 0.2, cy - H * 0.82); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = COL.teal; bubble(); c.fill();
  // one shadow tone down the right side
  c.save(); bubble(); c.clip(); c.fillStyle = 'rgba(30,27,46,.16)'; c.beginPath(); c.ellipse(W * 1.05, cy + H * 0.2, W * 0.55, H * 1.3, 0, 0, Math.PI * 2); c.fill(); c.restore();
  bubble(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = lw * 1.1; c.beginPath(); c.arc(-W * 0.45, cy - H * 0.35, s * 0.1, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
  c.strokeStyle = COL.ink; c.lineWidth = lw;
  // eyes: open, happy arcs, or squeezed shut on a big note
  const ey = cy - H * 0.3, ex = W * 0.38;
  if (o.mood === 'great' || open > 0.75) { for (const sx of [-ex, ex]) { c.beginPath(); c.moveTo(sx - s * 0.05, ey); c.quadraticCurveTo(sx, ey - s * 0.05, sx + s * 0.05, ey); c.stroke(); } }
  else for (const sx of [-ex, ex]) { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(sx, ey, s * 0.055, s * 0.07, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = COL.ink; c.beginPath(); c.arc(sx + s * 0.01, ey + (o.mood === 'miss' ? s * 0.02 : 0), s * 0.03, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(255,94,126,.5)'; for (const sx of [-W * 0.62, W * 0.62]) { c.beginPath(); c.ellipse(sx, ey + s * 0.1, s * 0.055, s * 0.03, 0, 0, Math.PI * 2); c.fill(); }
  // mouth: opens with the voice
  const my = cy + H * 0.12, mh = s * (0.02 + open * 0.11), mw = s * (0.07 + open * 0.035);
  c.fillStyle = COL.ink; c.beginPath(); c.ellipse(0, my + mh * 0.4, mw, mh, 0, 0, Math.PI * 2); c.fill();
  if (open > 0.25) { c.fillStyle = COL.coral; c.beginPath(); c.ellipse(0, my + mh * 0.9, mw * 0.6, mh * 0.4, 0, 0, Math.PI * 2); c.fill(); }
  // arm up with the mic, close to the mouth when singing
  const reach = 0.45 + open * 0.55, hx = W * (1.05 - reach * 0.55), hy = cy + H * (0.55 - reach * 0.35);
  c.lineWidth = lw * 1.2; c.beginPath(); c.moveTo(W * 0.85, cy + H * 0.45); c.quadraticCurveTo(W * 1.25, cy + H * 0.7, hx + s * 0.06, hy + s * 0.08); c.stroke();
  c.save(); c.translate(hx, hy); c.rotate(-0.9 + reach * 0.35);
  c.lineWidth = lw; c.fillStyle = COL.ink2; rr(c, -s * 0.025, 0, s * 0.05, s * 0.2, s * 0.02); c.fill(); c.stroke();
  c.fillStyle = '#C9C4D8'; c.beginPath(); c.arc(0, -s * 0.02, s * 0.065, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(30,27,46,.45)'; c.lineWidth = lw * 0.5; for (const d of [-0.03, 0, 0.03]) { c.beginPath(); c.moveTo(-s * 0.055, -s * 0.02 + d * s); c.lineTo(s * 0.055, -s * 0.02 + d * s); c.stroke(); }
  c.fillStyle = COL.teal; c.lineWidth = lw; c.beginPath(); c.arc(0, s * 0.1, s * 0.05, 0, Math.PI * 2); c.fill(); c.stroke();   // her hand round the handle
  c.restore();
  // the other hand on the hip
  c.strokeStyle = COL.ink; c.lineWidth = lw * 1.2; c.beginPath(); c.moveTo(-W * 0.9, cy + H * 0.35); c.quadraticCurveTo(-W * 1.3, cy + H * 0.55, -W * 0.95, cy + H * 0.75); c.stroke();
  // notes floating out while she sings
  if (open > 0.3 && !reduceMotion) { const t = o.now || 0; for (let i = 0; i < 2; i++) { const cyc = (t * 0.8 + i * 0.5) % 1; c.globalAlpha = Math.sin(cyc * Math.PI) * open;
    const nx = W * 0.4 + cyc * s * 0.5 + i * s * 0.1, ny = cy - H * 0.2 - cyc * s * 0.5; c.fillStyle = i ? COL.sun : COL.paper; c.lineWidth = lw * 0.7;
    c.beginPath(); c.ellipse(nx, ny, s * 0.04, s * 0.03, -0.4, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(nx + s * 0.035, ny); c.lineTo(nx + s * 0.035, ny - s * 0.11); c.stroke(); }
    c.globalAlpha = 1; }
  c.restore();
}

/* Tofu: a soft lilac block with a keyboard on an X stand, the band's keys player (the player, in Piano).
   Both hands come down on each chord; the keys light where they land. */
function drawKeys(c, x, footY, s, o){
  o = o || {};
  const lw = Math.max(2.5, s * 0.035), ph = (((o.beat || 0) % 1) + 1) % 1, press = reduceMotion ? 0 : Math.max(0, Math.min(1, o.press || 0));
  const bob = reduceMotion ? 0 : Math.pow(1 - ph, 3) * s * 0.035, hop = reduceMotion ? 0 : (o.jump || 0) * s * 0.25;
  c.save(); c.translate(x, footY); c.lineWidth = lw; c.strokeStyle = COL.ink; c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = 'rgba(30,27,46,.18)'; c.beginPath(); c.ellipse(0, 0, s * 0.5, s * 0.07, 0, 0, Math.PI * 2); c.fill();
  // body (behind the keyboard): a rounded block with a little antenna-sprout
  c.save(); c.translate(0, -bob - hop);
  const bx = -s * 0.28, by = -s * 1.12, bw = s * 0.56, bh = s * 0.62;
  c.beginPath(); c.moveTo(s * 0.02, by); c.quadraticCurveTo(s * 0.05, by - s * 0.14, s * 0.14, by - s * 0.16); c.stroke();
  c.fillStyle = COL.mint; c.beginPath(); c.ellipse(s * 0.17, by - s * 0.17, s * 0.06, s * 0.035, -0.5, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = '#C9B8FF'; rr(c, bx, by, bw, bh, s * 0.16); c.fill();
  c.save(); rr(c, bx, by, bw, bh, s * 0.16); c.clip(); c.fillStyle = 'rgba(30,27,46,.14)'; c.fillRect(bx + bw * 0.72, by, bw, bh); c.restore();
  rr(c, bx, by, bw, bh, s * 0.16); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = lw * 1.1; c.beginPath(); c.arc(bx + s * 0.13, by + s * 0.13, s * 0.07, Math.PI * 1.05, Math.PI * 1.5); c.stroke(); c.strokeStyle = COL.ink; c.lineWidth = lw;
  // face: round glasses, a small smile (big grin on a good chord)
  const ey = by + s * 0.24;
  for (const sx of [-0.1, 0.1]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(sx * s, ey, s * 0.07, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = COL.ink; c.beginPath(); c.arc(sx * s, ey + (o.mood === 'miss' ? s * 0.02 : s * 0.005) + (press ? s * 0.015 : 0), s * 0.028, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(-s * 0.03, ey); c.lineTo(s * 0.03, ey); c.stroke();
  c.fillStyle = 'rgba(255,94,126,.45)'; for (const sx of [-0.2, 0.2]) { c.beginPath(); c.ellipse(sx * s, ey + s * 0.1, s * 0.045, s * 0.025, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = COL.ink;
  if (o.mood === 'great' || press > 0.5) { c.beginPath(); c.moveTo(-s * 0.07, ey + s * 0.12); c.quadraticCurveTo(0, ey + s * 0.24, s * 0.07, ey + s * 0.12); c.closePath(); c.fill(); }
  else { c.beginPath(); c.arc(0, ey + s * 0.11, s * 0.05, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); }
  // arms down to the keys; hands drop on a chord
  const ky = -s * 0.52, hand = press * s * 0.05;
  c.lineWidth = lw * 1.2;
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * s * 0.25, by + bh * 0.7); c.quadraticCurveTo(sx * s * 0.36, ky - s * 0.12, sx * s * 0.22, ky - s * 0.03 + hand); c.stroke(); }
  c.restore();
  // X stand + keyboard (in front)
  c.lineWidth = lw * 1.1; c.beginPath(); c.moveTo(-s * 0.36, -s * 0.02); c.lineTo(s * 0.36, ky + s * 0.04); c.moveTo(s * 0.36, -s * 0.02); c.lineTo(-s * 0.36, ky + s * 0.04); c.stroke();
  c.lineWidth = lw;
  const kx = -s * 0.52, kw = s * 1.04, kh = s * 0.14;
  c.fillStyle = COL.ink2; rr(c, kx, ky - kh * 0.35, kw, kh * 1.35, s * 0.04); c.fill(); c.stroke();
  c.fillStyle = '#fff'; c.fillRect(kx + s * 0.05, ky, kw - s * 0.1, kh * 0.8); c.strokeRect(kx + s * 0.05, ky, kw - s * 0.1, kh * 0.8);
  const n = 8, kwid = (kw - s * 0.1) / n, lit = press > 0.2 ? [0, 2, 4] : [];
  for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(kx + s * 0.05 + i * kwid, ky); c.lineTo(kx + s * 0.05 + i * kwid, ky + kh * 0.8); c.lineWidth = lw * 0.5; c.stroke(); }
  lit.forEach(i => { c.fillStyle = COL.sun; c.fillRect(kx + s * 0.05 + i * kwid + 1, ky + 1, kwid - 2, kh * 0.8 - 2); });
  c.fillStyle = COL.ink; [0, 1, 3, 4, 5].forEach(i => rr(c, kx + s * 0.05 + (i + 0.66) * kwid, ky, kwid * 0.68, kh * 0.5, s * 0.008) || c.fill());
  c.fillStyle = COL.coral; c.beginPath(); c.arc(kx + kw - s * 0.09, ky - kh * 0.12, s * 0.018, 0, Math.PI * 2); c.fill();
  c.restore();
}

/* ---------- the bean crowd: stable slots, members pop up smoothly as the hype grows ---------- */
function makeCrowd(W){
  const n = Math.max(6, Math.round(W / 58)), out = [];
  for (let i = 0; i < n; i++) {
    const seed = Math.sin((i + 1) * 12.9898) * 43758.5453, r = seed - Math.floor(seed);
    const seed2 = Math.sin((i + 1) * 78.233) * 12543.123, r2 = seed2 - Math.floor(seed2);
    out.push({ x: (i + 0.5) / n + (r - 0.5) * 0.015, h: 38 + (i * 13 % 3) * 7, thr: i % 2 ? r2 * 0.9 : r2 * 0.4, army: r2 > 0.5, pres: 0, arm: 0, ph: (i % 2) * 0.5, dark: i % 3 === 0,
      lthr: 0.22 + ((r * 7.31) % 1) * 0.62, leave: 0, dir: (i + 0.5) / n < 0.5 ? -1 : 1 });
  }
  return out;
}
function drawCrowd(c, W, H, beatPhase, hype, now, level, crowd, dt, danger){
  const full = !crowd;
  crowd = crowd || (drawCrowd._c && drawCrowd._c.W === W ? drawCrowd._c.list : (drawCrowd._c = { W, list: makeCrowd(W) }).list);
  dt = dt == null ? 1 / 60 : dt;
  level = level || 0;
  const baseY = H + 6, k = 1 - Math.pow(0.03, dt);
  // phone lights sway when the crowd is at its peak
  if (level >= 4 && !reduceMotion) {
    crowd.forEach((m, i) => {
      if (i % 2 || m.pres < 0.5) return;
      const x = m.x * W + Math.sin(now * 2 + i) * 10, y = baseY - 80 - (i % 3) * 8;
      c.fillStyle = 'rgba(255,244,184,.9)'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,244,184,.25)'; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill();
    });
  }
  danger = danger || 0;
  const cross = danger > 0.35 ? Math.min(1, (danger - 0.35) / 0.35) : 0;
  for (const m of crowd) {
    const wantP = full || hype * 1.2 + 0.35 > m.thr || m.leave > 0.02 ? 1 : 0;
    // playing badly: people turn around and walk out, the least patient first; they drift back as you recover
    m.leave = m.leave == null ? 0 : m.leave;
    if (!full) m.leave += ((danger > m.lthr ? 1 : 0) - m.leave) * (1 - Math.pow(0.25, dt)) * (danger > m.lthr ? 1 : 0.6);
    const wantA = hype > 0.35 && (m.army || hype > 0.75) ? 1 : 0;
    if (full) { m.pres = 1; m.arm = wantA; } else { m.pres += (wantP - m.pres) * k; m.arm += (wantA - m.arm) * k * 0.8; }
    if (m.pres < 0.02) continue;
    const lv = m.leave || 0, walk = lv > 0.02;
    const x = m.x * W + m.dir * Math.pow(lv, 1.6) * W * 0.75, hgt = m.h;
    if (x < -hgt || x > W + hgt) continue;
    const ph = (beatPhase + m.ph) % 1;
    const jump = reduceMotion ? 0 : walk ? Math.abs(Math.sin(now * 9 + m.ph * 6)) * 5 : Math.abs(Math.sin(ph * Math.PI)) * (4 + hype * 10) * m.pres * (1 - cross);
    const y = baseY - hgt * m.pres - jump;
    const body = m.dark ? COL.ink2 : COL.ink;
    if (m.arm > 0.05 && !walk && !cross) {
      c.strokeStyle = body; c.lineWidth = 5; c.lineCap = 'round';
      const ax = x - hgt * 0.3, ay = y + 20, ex = x - hgt * (0.3 + 0.2 * m.arm), ey = y + 20 - (24 + jump * 0.3) * m.arm;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke();
    }
    c.fillStyle = body;
    c.beginPath(); c.ellipse(x, y + hgt * 0.62, hgt * 0.42, hgt * 0.62, 0, 0, Math.PI * 2); c.fill();
    if (walk && lv > 0.25) continue;                       // walking away: we see the back of their heads
    const look = walk ? m.dir * 3 : 0;
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(x - 6 + look, y + 12, 3, 0, Math.PI * 2); c.arc(x + 6 + look, y + 12, 3, 0, Math.PI * 2); c.fill();
    // the ones still here are losing patience: cross brows, then arms folded
    if (cross > 0.05) {
      c.strokeStyle = '#fff'; c.lineWidth = 2.2; c.lineCap = 'round'; c.globalAlpha = cross;
      c.beginPath(); c.moveTo(x - 10, y + 5 - 2 * cross); c.lineTo(x - 3, y + 8); c.moveTo(x + 10, y + 5 - 2 * cross); c.lineTo(x + 3, y + 8); c.stroke();
      if (cross > 0.5) { c.strokeStyle = m.dark ? COL.ink : COL.ink2; c.lineWidth = 5; c.beginPath(); c.moveTo(x - hgt * 0.32, y + hgt * 0.62); c.lineTo(x + hgt * 0.32, y + hgt * 0.7); c.stroke(); }
      c.globalAlpha = 1;
    }
  }
}

/* ---------- stage (canvas) ---------- */
const Stage = {
  cv: null, c: null, W: 0, H: 0, dpr: 1, popups: [], parts: [], shake: 0, flash: 0, hitPt: { x: 100, y: 60 }, lastT: 0, flashes: [],
  crowd: [], banner: null, thrumIn: 0, thrumHold: 0,
  init(cv){
    this.cv = cv; this.c = cv.getContext('2d');
    // a transparent layer on top for popups, banners and confetti, so they show in front of the drummer overlay
    const fx = document.createElement('canvas'); fx.className = 'stage-fx'; fx.setAttribute('aria-hidden', 'true');
    cv.parentNode.appendChild(fx); this.fx = fx; this.fxc = fx.getContext('2d');
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(cv); else window.addEventListener('resize', () => this.resize());
  },
  resize(){
    if (!this.cv) return;
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(10, r.width); this.H = Math.max(10, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    if (this.fx) { this.fx.width = this.cv.width; this.fx.height = this.cv.height; }
    const old = this.crowd; this.crowd = makeCrowd(this.W);
    this.crowd.forEach((m, i) => { if (old[i]) { m.pres = old[i].pres; m.arm = old[i].arm; } });
  },
  reset(){ this.popups = []; this.parts = []; this.banner = null; this.flashes = []; this.shake = 0; this.flash = 0; this.thrumIn = 0; this.thrumHold = 0; this.dangerV = 0; this.failAt = 0; this.cracks = null; this.crowd.forEach(m => { m.pres = 0; m.arm = 0; m.leave = 0; }); },
  burst(x, y, n, cols){
    if (reduceMotion) return;
    x = x == null ? this.hitPt.x : x; y = y == null ? this.hitPt.y : y;
    cols = cols || [COL.sun, COL.coral, COL.teal, COL.grape, COL.mint, COL.paper];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 380;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 180, life: 0.7 + Math.random() * 0.6, age: 0,
        col: cols[i % cols.length], star: i % 3 === 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, size: 5 + Math.random() * 6 });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  },
  // one bubble at a time at the anchor; older ones slide up and fade, never overlap
  popup(text, color, big){
    const t = performance.now();
    const last = this.popups[this.popups.length - 1];
    if (last && last.text === text && t - last.t0 < 200) return;
    this.popups.push({ text, color: color || COL.paper, t0: t, big: !!big, y: 0 });
    while (this.popups.length > 3) this.popups.shift();
  },
  bannerShow(text, color){ this.banner = { text, color: color || COL.sun, t0: performance.now() }; },
  ring(){ this.flash = 1; },
  // the funk drummer is drawn on the stage (see 52-drummer.js), keyed to what the kit plays as it is heard
  placeDrummer(cx, floorY, w, h){ this.drumAt = { cx, floorY, h }; },
  drawDrummer(c, G, beatF){
    const d = this.drumAt; if (!d || typeof FunkDrummer === 'undefined') return;
    const heard = AudioEngine.smoothNow() - AudioEngine.outputLatency(), st = this.drumSt || (this.drumSt = FunkDrummer.create());
    FunkDrummer.draw(c, st, { x: d.cx, floorY: d.floorY, h: d.h, now: heard, beat: Groove.cfg ? Groove.beatAt(heard) : beatF, spb: Groove.cfg ? Groove.cfg.beatDur : 0.5,
      level: G.level || 0, events: Groove.events(heard), playing: !!(G.running && !G.paused), missAgo: AudioEngine.now() - (G.lastMissAt || -9) });
  },
  draw(G, now){
    let c = this.c; if (!c) return;
    const W = this.W, H = this.H;
    const tms = performance.now(), dt = Math.min(0.05, (tms - (this.lastT || tms)) / 1000); this.lastT = tms;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.shake *= Math.pow(0.001, dt); this.flash *= Math.pow(0.02, dt);
    if (this.shake > 0.3 && !reduceMotion) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    const chart = G.chart, secIdx = G.sectionIndex || 0;
    const beatF = G.beatNow;
    const phase = ((beatF % 1) + 1) % 1;
    // background: the street venue (cached image), washed with the section's colour
    const bg = BG_COL[secIdx % BG_COL.length];
    const tall = Parts.railScale(), railY0 = Math.max(18, Math.min(H * 0.08, 60)), railH0 = Math.min(90, Math.max(40, H * 0.16)) * tall, floorY0 = H * 0.86;
    // Story mode paints the era's stage; otherwise the street under the railway bridge
    const scene = this.scene, key = W + 'x' + H + (scene ? scene.key : '') + (tall !== 1 ? 'T' + tall : '');
    if (this.bgKey !== key) {
      this.bgKey = key; const img = new Image(); img.decoding = 'async';
      img.src = scene ? Scenes.dataUrl(scene, Math.round(W), Math.round(H), { railY: railY0, railH: railH0, floorY: floorY0 })
        : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(streetSVG(Math.round(W), Math.round(H), railY0, railH0, floorY0));
      this.bgImg = img;
    }
    if (this.bgImg && this.bgImg.complete && this.bgImg.naturalWidth) c.drawImage(this.bgImg, 0, 0, W, H);
    else { c.fillStyle = '#231C47'; c.fillRect(0, 0, W, H); }
    c.save(); c.globalAlpha = 0.1; c.fillStyle = bg; c.fillRect(0, railY0 + railH0, W, floorY0 - railY0 - railH0); c.restore();
    // the lanterns and neon breathe with the beat
    if (!reduceMotion) { c.save(); c.globalAlpha = 0.07 * Math.pow(1 - phase, 2); c.fillStyle = scene ? scene.palette[2] : '#FFB199'; c.fillRect(0, railY0 + railH0, W, floorY0 - railY0 - railH0); c.restore(); }
    if (scene) Scenes.drawLive(c, scene, { W, H, top: railY0 + railH0, F: floorY0, now, dt, phase, hype: G.hype || 0, level: G.level || 0 });
    // playing badly: the room goes dark and red, the lights start failing
    const dv = this.dangerV = (this.dangerV || 0) + ((G.failed ? 1 : G.danger || 0) - (this.dangerV || 0)) * Math.min(1, dt * 2.5);
    if (dv > 0.02) { c.fillStyle = `rgba(70,0,16,${Math.min(0.6, dv * 0.55)})`; c.fillRect(0, 0, W, H); }
    // spotlights sweep harder as the hype grows
    const hype = G.hype || 0, lvl = G.level || 0;
    if (hype > 0.05 && !reduceMotion && dv < 0.6) {
      const nBeams = 2 + lvl;
      for (let i = 0; i < nBeams; i++) {
        const ox = W * (i + 0.5) / nBeams, ang = Math.sin(now * (0.6 + i * 0.17) + i * 2) * 0.5;
        c.save(); c.translate(ox, -20); c.rotate(ang);
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, `rgba(255,${Math.round(255 - dv * 200)},${Math.round(255 - dv * 220)},${(0.12 + hype * 0.28) * (1 - dv)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(-12, 0); c.lineTo(12, 0); c.lineTo(90, H * 1.1); c.lineTo(-90, H * 1.1); c.closePath(); c.fill();
        c.restore();
      }
    }
    const floorY = H * 0.86;
    // rail
    const railY = railY0, railH = railH0;
    const hitX = Math.max(84, Math.min(W * 0.2, 200));
    const ppb = Math.min(120, Math.max(50, W * 0.09));
    c.fillStyle = COL.paper; rr(c, -10, railY, W + 20, railH, 16); c.fill();
    c.lineWidth = 4; c.strokeStyle = COL.ink; c.stroke();
    const curB = G.trackBeat;
    const b0 = Math.floor(curB - hitX / ppb) - 1, b1 = Math.ceil(curB + (W - hitX) / ppb) + 1;
    const beats = chart.beats;
    c.fillStyle = 'rgba(30,27,46,.25)';
    for (let b = b0; b <= b1; b++) {
      if (G.mode === 'practice') break;
      const x = hitX + (b - curB) * ppb;
      const isBar = ((b % beats) + beats) % beats === 0;
      c.fillRect(x - (isBar ? 2 : 1), railY + railH - (isBar ? 18 : 10), isBar ? 4 : 2, isBar ? 14 : 6);
    }
    // chord cards
    c.save(); rr(c, -10, railY, W + 20, railH, 16); c.clip();
    if (Parts.active) Parts.drawRail(c, { W, railY, railH, hitX, ppb, curB, now });
    for (const ev of G.trackEvents) {
      const x0 = hitX + (ev.tb - curB) * ppb, w = Math.max(34, ev.tl * ppb - 6);
      if (x0 > W + 20 || x0 + w < -20) continue;
      const col = cardColor(ev.label);
      const y = railY + 8, h = railH - 16 - (G.mode === 'stage' ? 10 : 0);
      c.globalAlpha = ev.done ? 0.45 : 1;
      c.fillStyle = col; rr(c, x0, y, w, h, 12); c.fill(); c.lineWidth = 3; c.strokeStyle = COL.ink; c.stroke();
      if (ev.result) { c.fillStyle = ev.result === 'miss' ? 'rgba(229,72,77,.35)' : 'rgba(43,182,115,.35)'; rr(c, x0, y, w, h, 12); c.fill(); }
      c.fillStyle = textOn(col);
      const fs = Math.round(Math.min(h * 0.55, 34));
      c.font = `${fs}px ${DISPLAY_FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
      const tw = c.measureText(ev.label).width;
      let lx = x0 + 10;
      if (x0 < hitX + 18 && x0 + w > hitX) lx = Math.max(x0 + 10, Math.min(hitX + 20, x0 + w - tw - 8));
      c.fillText(ev.label, lx, y + h / 2 + 2);
      if (ev.result && w > tw + 50) { c.font = `800 ${Math.round(fs * 0.55)}px ${UI_FONT}`; c.textAlign = 'right'; c.fillText(ev.result === 'miss' ? '✕' : '✓', x0 + w - 10, y + h / 2 + 2); }
      c.globalAlpha = 1;
    }
    if (G.mode === 'stage' && G.strumSteps && !Parts.active) {
      const L = G.strumSteps.length, per = beats / L;
      for (let b = Math.floor(b0 / beats) * beats; b <= b1; b += beats) {
        for (let i = 0; i < L; i++) {
          const ch = G.strumSteps[i]; if (ch !== 'D' && ch !== 'U') continue;
          const x = hitX + (b + i * per - curB) * ppb, y = railY + railH - 11;
          c.fillStyle = COL.ink;
          c.beginPath(); if (ch === 'D') { c.moveTo(x - 5, y - 4); c.lineTo(x + 5, y - 4); c.lineTo(x, y + 4); } else { c.moveTo(x - 5, y + 4); c.lineTo(x + 5, y + 4); c.lineTo(x, y - 4); } c.fill();
        }
      }
    }
    c.restore();
    this.hitPt = { x: hitX, y: railY + railH / 2 };
    // hit marker
    if (this.flash > 0.02) { c.fillStyle = `rgba(255,244,184,${this.flash * 0.8})`; c.beginPath(); c.arc(hitX, railY + railH / 2, railH * (0.6 + (1 - this.flash) * 0.9), 0, Math.PI * 2); c.fill(); }
    const pulse = reduceMotion ? 0 : Math.pow(1 - phase, 3);
    c.lineWidth = 5 + pulse * 3; c.strokeStyle = COL.ink;
    rr(c, hitX - 10, railY - 6, 20, railH + 12, 10); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill(); c.stroke();
    c.fillStyle = COL.coral; c.beginPath(); c.moveTo(hitX - 11, railY - 16); c.lineTo(hitX + 11, railY - 16); c.lineTo(hitX, railY - 4); c.closePath(); c.fill(); c.lineWidth = 3; c.stroke();
    // section + capo tags
    const sec = chart.sections[secIdx];
    if (sec) {
      c.font = `800 14px ${UI_FONT}`; const t = sec.name.toUpperCase(); const tw = c.measureText(t).width;
      // centred between Pip and Boom so the characters never cover it
      let tw2 = 0; if (G.capoText) { c.font = `800 13px ${UI_FONT}`; tw2 = c.measureText(G.capoText).width + 28; c.font = `800 14px ${UI_FONT}`; }
      const bx = 12, by = railY + railH + 10;            // top-left, clear of the band in the middle
      c.fillStyle = COL.ink; rr(c, bx, by, tw + 22, 26, 13); c.fill();
      c.fillStyle = COL.paper; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(t, bx + 11, by + 14);
      if (G.capoText) { c.font = `800 13px ${UI_FONT}`; const t2 = G.capoText, tw2 = c.measureText(t2).width; c.fillStyle = COL.paper; rr(c, bx + tw + 30, by, tw2 + 20, 26, 13); c.fill(); c.lineWidth = 2.5; c.strokeStyle = COL.ink; c.stroke(); c.fillStyle = COL.ink; c.fillText(t2, bx + tw + 40, by + 14); }
    }
    // characters
    // size the band to the room between the rail and the floor, so nobody pokes into the chord rail
    const s = Math.max(36, Math.min(150, (floorY - railY - railH - 6) / 1.5, W * 0.26));
    const ui = Math.max(0.68, Math.min(1, H / 380, W / 700));   // text scale for small stages
    const bounce = Math.abs(Math.sin(phase * Math.PI));
    const since = now - (G.lastStrumAt || -9);
    const strumAnim = since < 0.25 ? Math.sin(since / 0.25 * Math.PI) : 0;
    const sinceGood = now - (G.lastGoodAt || -9);
    const jump = sinceGood < 0.45 ? Math.sin(sinceGood / 0.45 * Math.PI) : 0;
    // the bassist walks on at level 2 (when the bass plays) and doesn't flicker off on a brief dip
    if (lvl >= 2 && Groove.pitchedOk()) this.thrumHold = 3.5; else this.thrumHold = Math.max(0, this.thrumHold - dt);
    this.thrumIn += ((this.thrumHold > 0 ? 1 : 0) - this.thrumIn) * Math.min(1, dt * 2.5);
    // the band stands together in the middle: Pip on the left, the funk drummer beside him
    const avail = floorY - railY - railH;
    // his drawing starts ~110 units below the top of the 650-unit box: size him so his afro stops just under the chord rail
    let dH = Math.max(90, Math.min((avail - 6) * 650 / 545, s * 3.1)), dW = dH * 500 / 650;
    // on narrow screens shrink the pair so both fit side by side
    const fitF = Math.min(1, (W * 0.94) / (s * 1.5 + dW * 0.9 + (Parts.active && ['vocals', 'bass', 'piano'].includes(Parts.inst) ? s * 1.75 : 0)));
    const sP = s * fitF; dH *= fitF; dW *= fitF;
    // the player's own character stands out front, left of Pip: Lulu (vocals), Bo (bass), Tofu (keys)
    const front = Parts.active && ['vocals', 'bass', 'piano'].includes(Parts.inst) ? Parts.inst : '', singer = !!front, sgW = singer ? sP * (front === 'piano' ? 1.55 : front === 'bass' ? 1.75 : 1.4) : 0;
    const pairL = sP * 0.55 + sP * 0.95 + dW * 0.9 + sgW;              // Pip's width + a comfortable gap + kit width (+ the singer out front)
    let pipX = W / 2 - pairL / 2 + sP * 0.5 + sgW;
    const drumCX = pipX + sP * 0.95 + dW * 0.5;
    if (Settings.lefty) pipX = W - pipX;
    const dcx = Settings.lefty ? W - drumCX : drumCX;
    this.placeDrummer(dcx, floorY, dW, dH, G, beatF);
    this.pipX = pipX;
    if (this.thrumIn > 0.02 && W > 620 && front !== 'bass') drawThrum(c, (Settings.lefty ? dcx - dW * 0.62 - s * 0.5 : dcx + dW * 0.62 + s * 0.5) + (1 - this.thrumIn) * W * 0.15 * (Settings.lefty ? -1 : 1), floorY, s * 0.85, beatF, { alpha: Math.min(1, this.thrumIn * 1.5), lefty: Settings.lefty });
    if (singer) { const sx = Settings.lefty ? pipX + sgW : pipX - sgW;
      if (front === 'vocals') { this.mouth = (this.mouth || 0) + ((Parts.mouthOpen ? Parts.mouthOpen(now) : 0) - (this.mouth || 0)) * Math.min(1, dt * 18);
        drawSinger(c, sx, floorY + sP * 0.04, sP * 1.08, { beat: beatF, open: this.mouth, mood: G.mood(now), jump, now }); }
      else if (front === 'bass') drawThrum(c, sx, floorY, sP * 1.05, beatF, { lefty: Settings.lefty, alpha: 1 });
      else drawKeys(c, sx, floorY, sP * 1.05, { beat: beatF, press: Math.max(0, 1 - (now - (G.lastGoodAt || -9)) * 5), mood: G.mood(now), jump }); }
    drawPip(c, pipX, floorY, sP, { bounce: G.running ? bounce * (1 + lvl * 0.15) : bounce * 0.3, squash: Math.cos(phase * Math.PI * 2) * 0.5, strum: strumAnim, mood: lvl >= 3 && G.mood(now) === 'idle' ? 'great' : G.mood(now), lookX: 1, jump, lefty: Settings.lefty });
    // camera flashes from the crowd when things heat up
    if (lvl >= 3 && !reduceMotion && Math.random() < 0.04 * (lvl - 2)) this.flashes.push({ x: Math.random() * W, y: H - 40 - Math.random() * 30, a: 1 });
    this.flashes = this.flashes.filter(f => (f.a -= dt * 4) > 0);
    this.flashes.forEach(f => { c.fillStyle = `rgba(255,255,255,${f.a})`; c.beginPath(); c.arc(f.x, f.y, 6 + (1 - f.a) * 14, 0, Math.PI * 2); c.fill(); });
    { const cs = Math.max(0.55, Math.min(1, H / 420)); c.save(); c.translate(0, H * (1 - cs)); c.scale(cs, cs); drawCrowd(c, W / cs, H, phase, hype, now, lvl, this.crowd, dt * (G.failed ? 2.5 : 1), dv); c.restore(); }
    this.drawDrummer(c, G, beatF);
    // everything from here on goes on the top layer
    if (this.fxc) { c = this.fxc; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H); }
    // particles
    for (const p of this.parts) { p.age += dt; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.rot += p.vr * dt; }
    this.parts = this.parts.filter(p => p.age < p.life);
    for (const p of this.parts) {
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.min(1, (p.life - p.age) * 3);
      c.fillStyle = p.col; c.strokeStyle = COL.ink; c.lineWidth = 1.5;
      if (p.star) { c.beginPath(); for (let k = 0; k < 10; k++) { const r3 = k % 2 ? p.size * 0.45 : p.size; c.lineTo(Math.cos(k * Math.PI / 5) * r3, Math.sin(k * Math.PI / 5) * r3); } c.closePath(); c.fill(); c.stroke(); }
      else c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      c.restore();
    }
    c.globalAlpha = 1;
    // speech-bubble popups above Pip: newest at the anchor, older ones slide up and fade
    const tNow = performance.now(), LIFE = 900;
    this.popups = this.popups.filter(p => tNow - p.t0 < LIFE);
    const px = Math.max(8, Math.min(W - 150 * ui, (this.pipX || hitX) - s * 0.6 - 150 * ui)), py0 = Math.max(railY + railH + 30 * ui, floorY - s * 1.35);
    const nP = this.popups.length;
    this.popups.forEach((p, i) => {
      const target = (nP - 1 - i) * 44 * ui;
      p.y += (target - p.y) * Math.min(1, dt * 14);
      const age = (tNow - p.t0) / LIFE;
      const top = i === nP - 1;
      c.globalAlpha = Math.max(0, (age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25) * (top ? 1 : 0.8));
      const fs = (p.big ? 30 : 22) * (top ? 1 : 0.82) * ui;
      c.font = `${Math.round(fs)}px ${DISPLAY_FONT}`; const tw = c.measureText(p.text).width;
      const sc = reduceMotion ? 1 : age < 0.12 ? 0.6 + age / 0.12 * 0.5 : age < 0.22 ? 1.1 - (age - 0.12) : 1;
      c.save(); c.translate(px, py0 - p.y - age * 14); c.scale(sc, sc); c.rotate(-0.05);
      c.fillStyle = p.color; rr(c, -8, -fs * 0.7, tw + 16, fs * 1.4, 12); c.fill(); c.lineWidth = 3; c.strokeStyle = COL.ink; c.stroke();
      if (top) { c.beginPath(); c.moveTo(4, fs * 0.7 - 1); c.lineTo(-10, fs * 0.7 + 12); c.lineTo(18, fs * 0.7 - 1); c.closePath(); c.fill(); c.stroke(); c.fillStyle = p.color; c.fillRect(3, fs * 0.7 - 5, 16, 5); }
      c.fillStyle = p.color === COL.coral || p.color === COL.grape || p.color === COL.bad ? '#fff' : COL.ink;
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(p.text, 0, 2);
      c.restore(); c.globalAlpha = 1;
    });
    // level-up banner: a paper strip that swings in and out
    if (this.banner) {
      const age = (tNow - this.banner.t0) / 1500;
      if (age >= 1) this.banner = null;
      else {
        const inT = Math.min(1, age / 0.16), outT = age > 0.82 ? (age - 0.82) / 0.18 : 0;
        const ease = t => 1 - Math.pow(1 - t, 3);
        const bx = reduceMotion ? 0 : (1 - ease(inT)) * -W + ease(outT) * W;
        const fs = Math.round(Math.max(14, Math.min(34, W * 0.05, H * 0.085)));
        c.font = `${fs}px ${DISPLAY_FONT}`;
        const tw = Math.min(W - 40, c.measureText(this.banner.text).width + 44), bh = fs + 24;
        const cy = railY + railH + (floorY - railY - railH) * 0.3;
        c.save(); c.translate(W / 2 + bx, cy); c.rotate(-0.035);
        c.fillStyle = COL.ink; rr(c, -tw / 2 + 5, -bh / 2 + 6, tw, bh, 14); c.fill();
        c.fillStyle = this.banner.color; rr(c, -tw / 2, -bh / 2, tw, bh, 14); c.fill(); c.lineWidth = 4; c.strokeStyle = COL.ink; c.stroke();
        c.fillStyle = this.banner.color === COL.coral || this.banner.color === COL.grape ? '#fff' : COL.ink;
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(this.banner.text, 0, 2, tw - 24);
        c.restore();
      }
    }
    // count-in
    if (G.countText) {
      c.font = `${Math.round(Math.min(H * 0.4, 130))}px ${DISPLAY_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 12; c.strokeStyle = COL.ink; c.strokeText(G.countText, W / 2, H * 0.52); c.fillStyle = COL.paper; c.fillText(G.countText, W / 2, H * 0.52);
    }
    this.drawDanger(c, W, H, dv, now, G);
    if (G.tapMode && G.running) {
      c.font = `800 13px ${UI_FONT}`; c.textAlign = 'right'; c.textBaseline = 'top';
      const t = 'No mic: tap here or press Space to strum'; const tw = c.measureText(t).width;
      c.fillStyle = 'rgba(30,27,46,.8)'; rr(c, W - tw - 24, 8, tw + 16, 22, 11); c.fill(); c.fillStyle = COL.paper; c.fillText(t, W - 16, 11);
    }
  }
};

// the screen turns on you: a red vignette that throbs like a heartbeat, glass cracks spreading in from the corners,
// flickering lights, and when the show fails the glass shatters under a BOOED OFF sign
Stage.drawDanger = function (c, W, H, dv, now, G){
  if (dv < 0.03) return;
  const rm = reduceMotion, beat = rm ? 0 : Math.pow(Math.max(0, Math.sin(now * (4 + dv * 5))), 6) * (dv > 0.55 ? 1 : 0);
  const a = Math.min(0.92, Math.pow(dv, 1.3) * 0.8 + beat * 0.12 * dv);
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.62 - dv * 0.35), W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, 'rgba(160,0,24,0)'); g.addColorStop(0.55, `rgba(150,0,22,${a * 0.55})`); g.addColorStop(1, `rgba(60,0,10,${a})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // lights failing
  if (dv > 0.7 && !rm && Math.random() < (dv - 0.7) * 0.25) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, W, H); }
  // cracks: fixed shapes per stage size, growing with the danger
  if (!this.cracks || this.cracks.W !== W || this.cracks.H !== H) {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list = [];
    for (const [x0, y0, ang] of [[0, 0, 0.7], [W, 0, 2.4], [0, H, -0.7], [W, H, -2.4], [W * 0.5, 0, 1.57], [W * 0.18, H, -1.2]]) {
      const pts = [[x0, y0]]; let x = x0, y = y0, a2 = ang; const len = Math.min(W, H) * (0.5 + rnd() * 0.35);
      for (let d = 0; d < len; ) { const st = 14 + rnd() * 30; a2 += (rnd() - 0.5) * 0.9; x += Math.cos(a2) * st; y += Math.sin(a2) * st; d += st; pts.push([x, y]);
        if (rnd() < 0.25) { const b = [[x, y]]; let bx = x, by = y, ba = a2 + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6); for (let k = 0; k < 4; k++) { bx += Math.cos(ba) * 18; by += Math.sin(ba) * 18; ba += (rnd() - 0.5) * 0.8; b.push([bx, by]); } list.push({ pts: b, at: d / len, branch: true }); } }
      list.push({ pts, at: 0 });
    }
    this.cracks = { W, H, list };
  }
  const grow = G.failed ? 1 : Math.max(0, (dv - 0.5) / 0.45);
  if (grow > 0) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const cr of this.cracks.list) {
      if (cr.branch && grow < cr.at + 0.1) continue;
      const n = Math.max(2, Math.ceil(cr.pts.length * (cr.branch ? Math.min(1, (grow - cr.at) * 3) : grow)));
      c.beginPath(); cr.pts.slice(0, n).forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.strokeStyle = 'rgba(20,0,6,.75)'; c.lineWidth = cr.branch ? 3 : 5; c.stroke();
      c.strokeStyle = 'rgba(255,230,235,.8)'; c.lineWidth = cr.branch ? 1.2 : 2; c.stroke();
    }
  }
  if (G.failed && this.failAt) {
    const t = performance.now() / 1000 - this.failAt;
    c.fillStyle = `rgba(20,0,6,${Math.min(0.55, t * 0.5)})`; c.fillRect(0, 0, W, H);
    const k = Math.min(1, t / 0.35), sc = rm ? 1 : 1 + (1 - k) * 1.6, fs = Math.round(Math.min(H * 0.26, W * 0.13, 110));
    c.save(); c.translate(W / 2, H * 0.48); c.rotate(-0.08); c.scale(sc, sc); c.globalAlpha = k;
    c.font = `${fs}px ${DISPLAY_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = Math.max(8, fs * 0.14); c.strokeStyle = COL.ink; c.strokeText('BOOED OFF!', 0, 0); c.fillStyle = COL.bad; c.fillText('BOOED OFF!', 0, 0);
    c.restore(); c.globalAlpha = 1;
  }
};

/* ---------- fretboard (SVG), made for beginners, with live note feedback ---------- */
const Fretboard = {
  svg: null, lights: [], lightText: [], strings: [], rings: [], cur: null, geo: null, wrongG: null,
  init(svg){ this.svg = svg; },
  render(ev, capo, lefty){
    const svg = this.svg; if (!svg) return;
    this.cur = ev;
    const NS = 'http://www.w3.org/2000/svg';
    const X = x => lefty ? 1000 - x : x;
    const anchor = a => lefty ? (a === 'start' ? 'end' : a === 'end' ? 'start' : a) : a;
    const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
    this.el = el;
    svg.textContent = '';
    this.lights = []; this.lightText = []; this.strings = []; this.rings = []; this.geo = null; this.wrongG = null;
    if (!ev || ev.rest) {
      svg.appendChild(el('text', { x: 500, y: 150, 'text-anchor': 'middle', 'font-family': DISPLAY_FONT, 'font-size': 34, fill: COL.ink }, ev && ev.rest ? 'Rest. No chord here.' : ''));
      return;
    }
    // just the neck: string names (which light up green/red) on one side, frets underneath
    // phones: taller string spacing and bigger dots, since the width is what limits us there
    const narrow = window.innerWidth < 600;
    const K = narrow ? 1.75 : 1;
    this.K = K;
    // how much neck fits: phones show the 4 frets around the shape; wider screens show more, up to the 12th fret
    const NF = this.fretsToShow();
    this.nfShown = NF;
    const v = ev.v, x0 = 150, top = 26 + 32 * K, gap = 36 * K;
    const x1 = NF <= 5 ? 880 : x0 + 730 * (0.45 + 0.11 * NF);
    const vbH = top + gap * 5 + 26 + 22 * K; // wide: equal margins so the neck sits in the middle; narrow: no spare margin, every pixel goes to the neck
    svg.setAttribute("viewBox", narrow ? `${lefty ? 94 : 46} 26 860 ${vbH - 26}` : `${lefty ? 894 - x1 : 54} 26 ${x1 + 52} ${vbH - 26}`);
    const down = Settings.fbView !== 'tab';                       // looking down: thickest string on top
    const yOf = i => top + (down ? i : 5 - i) * gap;
    const absF = v.frets.map(f => f > 0 ? f + capo : f);
    const fretted = absF.filter(f => f > 0);
    const maxA = Math.max(capo, ...fretted, 1), minA = fretted.length ? Math.min(...fretted) : 1;
    let start;
    if (NF >= 12) start = Math.max(1, maxA - NF + 1);
    else { start = capo > 0 ? capo : (maxA <= NF ? 1 : Math.max(1, minA - (NF > 5 ? 1 : 0))); if (maxA > start + NF - 1) start = maxA - NF + 1; }
    start = Math.max(1, start);
    // fret spacing: real proportions (each fret ~6% narrower) when the whole neck shows, even spacing when zoomed in
    const real = NF > 5, pos = f => real ? 1 - Math.pow(2, -f / 12) : f;
    const p0 = pos(start - 1), p1 = pos(start - 1 + NF);
    const lineX = j => x0 + (pos(start - 1 + j) - p0) / (p1 - p0) * (x1 - x0);      // fret line j (0 = left edge of the window)
    const fw = (x1 - x0) / NF;
    const xOfFret = f => (lineX(f - start) + lineX(f - start + 1)) / 2;
    const fwAt = f => lineX(f - start + 1) - lineX(f - start);
    const used = new Set(fretted);
    const nY0 = top - 22, nH = gap * 5 + 44;                       // the neck's box
    // shared paint: rosewood, pearl inlays, taiko drum faces
    const defs = el('defs', {});
    defs.innerHTML = `<linearGradient id="fbRose" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2A1C"/><stop offset=".5" stop-color="#6B3F2A"/><stop offset="1" stop-color="#43261A"/></linearGradient>
      <radialGradient id="fbPearl" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E8E1F0"/><stop offset="1" stop-color="#BFB6CF"/></radialGradient>
      <linearGradient id="fbFret" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8E8A80"/><stop offset=".45" stop-color="#F4F1EA"/><stop offset="1" stop-color="#A8A397"/></linearGradient>
      <linearGradient id="fbNut" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFDF6"/><stop offset="1" stop-color="#E4DAC2"/></linearGradient>
      <pattern id="fbWound" width="4" height="6" patternUnits="userSpaceOnUse"><rect width="4" height="6" fill="#D8CFBC"/><rect width="2" height="6" fill="#9C927D"/></pattern>`;
    svg.appendChild(defs);
    // the frets you need, lit from behind
    for (let f = start; f < start + NF; f++) if (used.has(f)) svg.appendChild(el('rect', { x: Math.min(X(lineX(f - start)), X(lineX(f - start + 1))) + 3, y: nY0 - 10, width: fwAt(f) - 6, height: nH + 20, rx: 10, fill: 'rgba(255,206,58,.5)' }));
    // neck: drop shadow, rosewood, grain streaks, cream binding
    const nx = Math.min(X(x0 - 6), X(x1 + 16)), nw = x1 - x0 + 22;
    svg.appendChild(el('rect', { x: nx + 5, y: nY0 + 7, width: nw, height: nH, rx: 12, fill: 'rgba(30,27,46,.35)' }));
    svg.appendChild(el('rect', { x: nx, y: nY0, width: nw, height: nH, rx: 12, fill: 'url(#fbRose)', stroke: COL.ink, 'stroke-width': 4 }));
    const gr = el('g', { opacity: .5, 'pointer-events': 'none' });
    for (let k = 0; k < 11; k++) { const gy = nY0 + 6 + k * (nH - 12) / 10 + ((k * 37) % 7) - 3, w1 = ((k * 53) % 9) - 4;
      gr.appendChild(el('path', { d: `M${nx + 4} ${gy} C ${nx + nw * 0.3} ${gy + w1}, ${nx + nw * 0.6} ${gy - w1}, ${nx + nw - 4} ${gy + w1 * 0.5}`, fill: 'none', stroke: k % 3 ? '#3A2016' : '#8A5638', 'stroke-width': k % 3 ? 1.6 : 1 })); }
    svg.appendChild(gr);
    svg.appendChild(el('rect', { x: nx + 2, y: nY0 + 2, width: nw - 4, height: 4, fill: '#F1E4C6', opacity: .9 }));
    svg.appendChild(el('rect', { x: nx + 2, y: nY0 + nH - 6, width: nw - 4, height: 4, fill: '#F1E4C6', opacity: .9 }));
    // pearl inlays
    for (let f = start; f < start + NF; f++) {
      const cx = X(xOfFret(f)), cy = top + gap * 2.5, r = 8.5 * Math.min(K, 1.3);
      const dot = (y) => { svg.appendChild(el('circle', { cx, cy: y, r, fill: 'url(#fbPearl)', stroke: '#2A1810', 'stroke-width': 1.5 })); };
      if ([3, 5, 7, 9, 15, 17, 19, 21].includes(f)) dot(cy);
      if (f === 12 || f === 24) { dot(cy - gap); dot(cy + gap); }
    }
    // frets: nickel wire with a shadow; the nut is bone
    for (let j = 0; j <= NF; j++) {
      const x = X(lineX(j)), nut = j === 0 && start === 1;
      if (nut) { svg.appendChild(el('rect', { x: x - 7, y: nY0 - 3, width: 14, height: nH + 6, rx: 3, fill: 'url(#fbNut)', stroke: COL.ink, 'stroke-width': 3 })); continue; }
      svg.appendChild(el('rect', { x: x - 1, y: nY0 + 4, width: 6, height: nH - 8, fill: 'rgba(0,0,0,.35)' }));
      svg.appendChild(el('rect', { x: x - 3, y: nY0 + 3, width: 6, height: nH - 6, rx: 2, fill: 'url(#fbFret)' }));
    }
    for (let f = start; f < start + NF; f++) {
      const on = used.has(f);
      const mark = [3, 5, 7, 9, 12, 15, 17, 19, 21].includes(f);
      if (NF > 7 && !on && !mark) continue;                        // long neck: label the marker frets and the ones in use
      svg.appendChild(el('text', { x: X(xOfFret(f)), y: top + gap * 5 + 24 + 20 * K, 'text-anchor': 'middle', 'font-family': UI_FONT, 'font-weight': 800, 'font-size': (on ? 19 : 15) * K, fill: on ? '#3E2616' : '#8A7657' }, NF > 7 ? String(f) : 'fret ' + f));
    }
    // strings: a shadow line, the string, wound texture on the thick three; name tokens on the left light up
    for (let i = 0; i < 6; i++) {
      const y = yOf(i), muted = v.frets[i] < 0, sw = 1.8 + (5 - i) * 0.7;
      svg.appendChild(el('line', { x1: X(x0 - 6), x2: X(x1 + 14), y1: y + 3, y2: y + 3, stroke: 'rgba(0,0,0,.4)', 'stroke-width': sw }));
      const line = el('line', { class: 'fstring', x1: X(x0 - 6), x2: X(x1 + 14), y1: y, y2: y, stroke: muted ? '#8C8474' : (i < 3 ? '#E2D8C2' : '#F4EEE0'), 'stroke-width': sw + 0.4, 'stroke-dasharray': muted ? '6 6' : undefined });
      svg.appendChild(line); this.strings.push(line);
      if (!muted && i < 3) svg.appendChild(el('line', { x1: X(x0 - 6), x2: X(x1 + 14), y1: y, y2: y, stroke: 'rgba(90,80,60,.45)', 'stroke-width': sw * 0.7, 'stroke-dasharray': '1.5 2.5', 'pointer-events': 'none' }));
      const tr = 16 * Math.min(K, 1.35), tx = X(narrow ? 70 : 76);
      svg.appendChild(el('circle', { cx: tx + 2, cy: y + 3, r: tr, fill: 'rgba(30,27,46,.35)' }));
      const badge = el('circle', { class: muted ? undefined : 'flight', cx: tx, cy: y, r: tr, fill: muted ? '#EDE3CC' : '#FFF7E6', stroke: muted ? '#B9B09C' : COL.ink, 'stroke-width': 3, 'stroke-dasharray': muted ? '4 4' : undefined });
      const bt = el('text', { class: muted ? undefined : 'flt', x: tx, y: y + 6.5 * Math.min(K, 1.35), 'text-anchor': 'middle', 'font-family': DISPLAY_FONT, 'font-size': 18 * Math.min(K, 1.35), fill: muted ? COL.mute : COL.ink, 'pointer-events': 'none' }, STRING_NAMES[i]);
      svg.appendChild(badge); svg.appendChild(bt);
      this.lights.push(muted ? null : badge); this.lightText.push(muted ? null : bt);
    }
    if (capo > 0 && capo >= start && capo < start + NF) {
      const cx = X(xOfFret(capo));
      svg.appendChild(el('rect', { x: cx - 13, y: top - 26, width: 26, height: gap * 5 + 52, rx: 12, fill: COL.ink2, stroke: COL.ink, 'stroke-width': 3 }));
      svg.appendChild(el('text', { x: cx, y: top - 31, 'text-anchor': 'middle', 'font-family': UI_FONT, 'font-weight': 800, 'font-size': 14, fill: COL.ink }, 'CAPO ' + capo));
    }
    if (v.barre) {
      const cx = X(xOfFret(v.barre.fret + capo));
      const ya = Math.min(yOf(v.barre.from), yOf(v.barre.to)) - 22 * K, yb = Math.max(yOf(v.barre.from), yOf(v.barre.to)) + 22 * K;
      const gb = el('g', { class: 'fdot' });
      gb.appendChild(el('rect', { x: cx - 19 * K + 3, y: ya + 4, width: 38 * K, height: yb - ya, rx: 19 * K, fill: 'rgba(30,27,46,.45)' }));
      gb.appendChild(el('rect', { x: cx - 19 * K, y: ya, width: 38 * K, height: yb - ya, rx: 19 * K, fill: '#FFF7E6', stroke: COL.ink, 'stroke-width': 3.5 }));
      gb.appendChild(el('rect', { x: cx - 13 * K, y: ya + 6 * K, width: 26 * K, height: yb - ya - 12 * K, rx: 13 * K, fill: FINGER_COL[v.barre.finger] || FINGER_COL[1], stroke: COL.ink, 'stroke-width': 2.5 }));
      svg.appendChild(gb);
    }
    const flat = ev.shape && ev.shape.flat;
    const order = [0, 1, 2, 3, 4, 5].sort((a, b) => (v.fingers[a] || 9) - (v.fingers[b] || 9));
    const openX = X(narrow ? 118 : 120), KO = Math.min(K, 1.3);
    for (let i = 0; i < 6; i++) {
      const y = yOf(i), f = v.frets[i];
      const midi = f >= 0 ? OPEN_MIDI[i] + capo + f + (typeof UI !== 'undefined' && UI.chart && UI.chart.tuning || 0) : null;
      const nn = midi != null ? noteName(midi, flat) : '';
      let ring = null;
      if (f < 0) {
        // a brush-stroke ✕: don't play this string
        svg.appendChild(el('path', { d: `M${openX - 10 * KO} ${y - 10 * KO} L${openX + 10 * KO} ${y + 10 * KO} M${openX + 10 * KO} ${y - 10 * KO} L${openX - 10 * KO} ${y + 10 * KO}`, stroke: COL.bad, 'stroke-width': 6, 'stroke-linecap': 'round' }));
      } else if (f === 0) {
        ring = el('circle', { class: 'fring', cx: openX, cy: y, r: 21 * KO });
        svg.appendChild(ring);
        svg.appendChild(el('circle', { cx: openX, cy: y, r: 14 * KO, fill: '#FFF7E6', stroke: COL.ink, 'stroke-width': 3.5 }));
        if (Settings.showNotes) svg.appendChild(el('text', { x: openX, y: y + 5 * KO, 'text-anchor': 'middle', 'font-family': UI_FONT, 'font-weight': 800, 'font-size': 13 * KO, fill: COL.ink }, nn));
      } else {
        // a little taiko drum: cream rim with tacks, finger-coloured head
        const cx = X(xOfFret(f + capo)), fin = v.fingers[i], R = Math.min(24 * K, fwAt(f + capo) * 0.44);
        ring = el('circle', { class: 'fring', cx, cy: y, r: R + 6 });
        svg.appendChild(ring);
        const gd = el('g', { class: 'fdot', style: `animation-delay:${order.indexOf(i) * 90}ms` });
        gd.appendChild(el('circle', { cx: cx + 3, cy: y + 5, r: R, fill: 'rgba(30,27,46,.5)' }));
        gd.appendChild(el('circle', { cx, cy: y, r: R, fill: '#FFF7E6', stroke: COL.ink, 'stroke-width': 3.5 }));
        gd.appendChild(el('circle', { cx, cy: y, r: R * 0.74, fill: FINGER_COL[fin] || '#fff', stroke: COL.ink, 'stroke-width': 2.5 }));
        gd.appendChild(el('ellipse', { cx: cx - R * 0.22, cy: y - R * 0.3, rx: R * 0.32, ry: R * 0.14, fill: '#fff', opacity: .35 }));
        for (let a = 0; a < 8; a++) gd.appendChild(el('circle', { cx: cx + R * 0.87 * Math.cos(a * Math.PI / 4 + 0.39), cy: y + R * 0.87 * Math.sin(a * Math.PI / 4 + 0.39), r: 1.9 * K, fill: COL.ink }));
        const dark = fin === 5 || fin === 4, showN = Settings.showNotes;
        gd.appendChild(el('text', { x: cx, y: y + (showN ? 2 : 7) * K, 'text-anchor': 'middle', 'font-family': DISPLAY_FONT, 'font-size': (showN ? 20 : 23) * K, fill: dark ? '#fff' : COL.ink }, fin === 5 ? 'T' : fin ? String(fin) : ''));
        if (showN) gd.appendChild(el('text', { x: cx, y: y + 14 * K, 'text-anchor': 'middle', 'font-family': UI_FONT, 'font-weight': 800, 'font-size': 10 * K, fill: dark ? '#fff' : COL.ink }, nn));
        svg.appendChild(gd);
      }
      this.rings.push(ring);
    }
    this.wrongG = el('g', { class: 'fwrong-layer' }); svg.appendChild(this.wrongG);
    this.geo = { X, yOf, xOfFret, start, NF, capo, openX, x0, x1, fw, flat };
  },
  // frets to show for the space the neck has
  fretsToShow(){
    if (window.innerWidth < 600) return 4;
    const board = this.svg && this.svg.closest('.board');
    const bw = board ? board.clientWidth : window.innerWidth;
    const side = window.matchMedia && matchMedia('(orientation:landscape) and (min-width:761px)').matches ? 2 * 250 : 0;
    const avail = bw - side - 150;
    return Math.max(5, Math.min(12, Math.floor(avail / 78)));
  },
  // states[i]: '' waiting, 'heard' (green), 'miss' (red: this string isn't ringing)
  // wrong: [{string, fret (absolute), midi, open}] notes that shouldn't be there, drawn where they probably come from
  feedback(states, wrong){
    states = states || [];
    for (let i = 0; i < 6; i++) {
      const st = states[i] === 1 || states[i] === true ? 'heard' : (states[i] || '');
      for (const e of [this.lights[i], this.strings[i], this.rings[i], this.lightText[i]]) {
        if (!e) continue;
        if (e.classList.contains('heard') !== (st === 'heard')) e.classList.toggle('heard', st === 'heard');
        if (e.classList.contains('miss') !== (st === 'miss')) e.classList.toggle('miss', st === 'miss');
      }
    }
    const g = this.wrongG, geo = this.geo; if (!g || !geo) return;
    g.textContent = '';
    const el = this.el;
    for (const w of (wrong || [])) {
      const y = geo.yOf(w.string);
      let x, label = noteName(w.midi, geo.flat);
      if (w.open) x = geo.openX;
      else if (w.fret < geo.start) { x = geo.X(geo.x0 + geo.fw * 0.18); label += ' · fret ' + w.fret; }
      else if (w.fret >= geo.start + geo.NF) { x = geo.X(geo.x1 - geo.fw * 0.18); label += ' · fret ' + w.fret; }
      else x = geo.X(geo.xOfFret(w.fret));
      const m = el('g', { class: 'fwrong' });
      const K = this.K || 1;
      m.appendChild(el('circle', { cx: x, cy: y, r: 19 * K, fill: COL.bad, stroke: COL.ink, 'stroke-width': 3.5 }));
      m.appendChild(el('path', { d: `M${x - 7} ${y - 7} L${x + 7} ${y + 7} M${x + 7} ${y - 7} L${x - 7} ${y + 7}`, stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' }));
      const tw = label.length * 8 + 18, ty = y - 30;
      m.appendChild(el('rect', { x: x - tw / 2, y: ty - 13, width: tw, height: 22, rx: 11, fill: COL.bad, stroke: COL.ink, 'stroke-width': 2.5 }));
      m.appendChild(el('text', { x, y: ty + 3, 'text-anchor': 'middle', 'font-family': UI_FONT, 'font-weight': 800, 'font-size': 13, fill: '#fff' }, label));
      g.appendChild(m);
    }
  },
  setHeard(states){ this.feedback(states.map(x => x ? 'heard' : ''), []); },
};

/* ---------- plain-language steps for a chord ---------- */
const FINGER_NAMES = ['', 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
function stringWord(i){ return ['low E', 'A', 'D', 'G', 'B', 'high e'][i]; }
function chordSteps(ev, capo){
  const v = ev.v, steps = [];
  if (v.barre) {
    const lo = Math.min(v.barre.from, v.barre.to), hi = Math.max(v.barre.from, v.barre.to);
    steps.push({ fin: v.barre.finger, strings: [...Array(hi - lo + 1)].map((_, k) => lo + k).filter(i => v.frets[i] === v.barre.fret),
      html: `<b>${FINGER_NAMES[v.barre.finger]}</b> lies flat across <b>fret ${v.barre.fret + capo}</b>, from the ${stringWord(lo)} to the ${stringWord(hi)} string` });
  }
  const byFinger = {};
  v.frets.forEach((f, i) => { if (f > 0 && v.fingers[i] && !(v.barre && v.fingers[i] === v.barre.finger && f === v.barre.fret)) (byFinger[v.fingers[i]] = byFinger[v.fingers[i]] || []).push(i); });
  Object.keys(byFinger).map(Number).sort((a, b) => a - b).forEach(fin => {
    byFinger[fin].forEach(i => steps.push({ fin, strings: [i], html: `<b>${FINGER_NAMES[fin]}</b> on the <b>${stringWord(i)}</b> string, <b>fret ${v.frets[i] + capo}</b>` }));
  });
  const played = v.frets.map((f, i) => f >= 0 ? i : -1).filter(i => i >= 0);
  const first = played[0], n = played.length;
  const gaps = v.frets.map((f, i) => (f < 0 && i > first) ? i : -1).filter(i => i >= 0);
  let strum = n === 6 ? 'Strum all 6 strings' : `Strum ${n} strings, starting from the ${stringWord(first)} string`;
  if (first === 1) strum += ' (skip the low E)';
  else if (first > 1) strum += ` (skip the ${[...Array(first)].map((_, k) => stringWord(k)).join(' and ')})`;
  if (gaps.length) strum += `. Lightly touch the ${gaps.map(stringWord).join(' and ')} string${gaps.length > 1 ? 's' : ''} to mute ${gaps.length > 1 ? 'them' : 'it'}`;
  const opens = v.frets.map((f, i) => f === 0 ? i : -1).filter(i => i >= 0);
  if (opens.length && opens.length < n) strum += `. The ${opens.map(stringWord).join(', ')} string${opens.length > 1 ? 's ring' : ' rings'} open`;
  return { steps, strum: strum + '.' };
}

/* ---------- small vertical chord box ---------- */
function miniDiagram(v, capo, lefty){
  if (lefty === undefined) lefty = Settings.lefty;
  const fretted = v.frets.filter(f => f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0, minF = fretted.length ? Math.min(...fretted) : 0;
  const base = maxF <= 4 ? 1 : minF;
  const x0 = 22, gx = 13, y0 = 26, gy = 17;
  const SX = i => x0 + (lefty ? 5 - i : i) * gx;
  let s = `<svg viewBox="0 0 110 ${capo ? 136 : 124}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  for (let i = 0; i < 6; i++) s += `<line x1="${SX(i)}" y1="${y0}" x2="${SX(i)}" y2="${y0 + gy * 5}" stroke="${COL.ink}" stroke-width="${1.2 + (5 - i) * 0.25}"/>`;
  for (let j = 0; j <= 5; j++) s += `<line x1="${x0}" y1="${y0 + j * gy}" x2="${x0 + gx * 5}" y2="${y0 + j * gy}" stroke="${COL.ink}" stroke-width="${j === 0 && base === 1 ? 5 : 1.6}"/>`;
  if (base > 1) s += `<text x="${x0 + gx * 5 + 5}" y="${y0 + gy * 0.7}" font-family="sans-serif" font-weight="800" font-size="11" fill="${COL.ink}">${base}fr</text>`;
  if (v.barre) { const y = y0 + (v.barre.fret - base + 0.5) * gy; s += `<rect x="${Math.min(SX(v.barre.from), SX(v.barre.to)) - 6}" y="${y - 6}" width="${Math.abs(v.barre.to - v.barre.from) * gx + 12}" height="12" rx="6" fill="${FINGER_COL[v.barre.finger]}" stroke="${COL.ink}" stroke-width="1.6"/>`; }
  v.frets.forEach((f, i) => {
    const x = SX(i);
    if (f < 0) s += `<text x="${x}" y="${y0 - 7}" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="11" fill="${COL.bad}">✕</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${y0 - 11}" r="4.2" fill="none" stroke="${COL.ink}" stroke-width="1.8"/>`;
    else {
      const y = y0 + (f - base + 0.5) * gy, fin = v.fingers[i];
      s += `<circle cx="${x}" cy="${y}" r="6.4" fill="${FINGER_COL[fin] || '#fff'}" stroke="${COL.ink}" stroke-width="1.6"/>`;
      if (fin) s += `<text x="${x}" y="${y + 3.6}" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="9" fill="${fin >= 4 ? '#fff' : COL.ink}">${fin === 5 ? 'T' : fin}</text>`;
    }
  });
  for (let i = 0; i < 6; i++) s += `<text x="${SX(i)}" y="${y0 + gy * 5 + 13}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="8.5" fill="${COL.ink2}">${STRING_NAMES[i]}</text>`;
  if (capo) s += `<text x="${x0 + gx * 2.5}" y="${y0 + gy * 5 + 26}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="10" fill="${COL.ink}">capo ${capo}</text>`;
  return s + '</svg>';
}
