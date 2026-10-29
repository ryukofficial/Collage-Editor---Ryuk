// Ryuk Profile engine — builds the "Ryuk profile" MLBB showcase edit in the browser.
// No server, no API. All crop boxes are measured on 2376x1080 screenshots and are
// re-mapped to any screen size (scaled by height, anchored to the left/right edge).

const REF_W = 2376;
const REF_H = 1080;
const YELLOW = '#FFD628';

// ---------- crop boxes (reference 2376x1080) ----------
const BOX = {
  // profile screen (left-anchored)
  likesSrc: [1050, 8, 1430, 68], likesDst: [1050, 64, 380, 75],
  arrowSrc: [1178, 128, 1226, 160], arrowDst: [[1226, 128], [1254, 128]],
  visitSrc: [812, 915, 872, 1020], visitDst: [748, 915],
  rank: [728, 425, 920, 625], rankCenter: [826, 520],
  // collectible / showcase screen (right-anchored)
  panel: [1650, 89, 2100, 897],
  panelBtnSrc: [1655, 60, 1735, 160], panelBtnDst: [2030, 60],
  // effects screen
  tiles: {
    notification: [689, 897, 784, 991],
    spawn: [831, 897, 926, 991],
    recall: [974, 897, 1069, 991],
    elimination: [1114, 897, 1209, 991],
  },
  diamonds: [1960, 22, 2118, 78], // top bar, right-anchored
  // Recharge → Weekly Diamond Pass screen (right-anchored): "Weekly Pass Active" + days/hours
  weekly: [1712, 335, 2075, 572],
  weeklyBtnSrc: [1700, 410, 1735, 500], weeklyBtnDst: [[2050, 410], [2072, 410]],   // hide the "+ ₹price" button
};

export const TILE_KEYS = ['notification', 'spawn', 'recall', 'elimination'];

// ---------- helpers ----------
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const url = src instanceof Blob ? URL.createObjectURL(src) : src;
    const img = new Image();
    const done = () => { if (url !== src) URL.revokeObjectURL(url); };
    img.onload = () => { done(); resolve(img); };
    img.onerror = () => { done(); reject(new Error('Could not open one of the pictures. Use a PNG or JPG screenshot.')); };
    img.src = url;
  });
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// map a reference rect [x1,y1,x2,y2] onto a real screenshot -> {x,y,w,h}
function mapRect(img, [x1, y1, x2, y2], anchor = 'left') {
  const s = img.height / REF_H;
  let x;
  if (anchor === 'right') x = img.width - (REF_W - x1) * s;
  else if (anchor === 'center') x = img.width / 2 + (x1 - REF_W / 2) * s;
  else x = x1 * s;
  return { x, y: y1 * s, w: (x2 - x1) * s, h: (y2 - y1) * s };
}

// copy a region of an image into a new canvas
function cropTo(img, r, outW, outH) {
  const c = canvas(outW ?? r.w, outH ?? r.h);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

// ---------- item pictures (borders, emotes…) ----------
// A square-ish picture (an emote, an icon) becomes a tile in the bottom row.
// A wide picture — the game's item card with the name and how it was obtained —
// is kept whole, text included, and shown as a framed card on the right.
function itemPiece(img) {
  const w = img.width, h = img.height;
  if (w > h * 1.35) return { img: cropTo(img, { x: 0, y: 0, w, h }), wide: true };
  const m = Math.min(w, h);
  return { img: cropTo(img, { x: (w - m) / 2, y: (h - m) / 2, w: m, h: m }), wide: false };
}

// ---------- build the pieces from the screenshots ----------
// sources: { profile, collection, effects, skin, extras: [] } (HTMLImageElements; only profile + skin required)
// extras = any item pictures (avatar borders, emotes…); wide item cards keep their text.
export function extractPieces(src) {
  const pieces = {};
  const P = src.profile;
  if (P.width < P.height) throw new Error('The profile screenshot must be taken in landscape (sideways), like the game.');
  if (src.collection && src.collection.width < src.collection.height) throw new Error('The collection screenshot must be in landscape, like the game.');
  if (src.effects && src.effects.width < src.effects.height) throw new Error('The effects screenshot must be in landscape, like the game.');

  // profile normalised to height 1080
  const W = Math.round(P.width * REF_H / P.height);
  const base = canvas(W, REF_H);
  const g = base.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(P, 0, 0, W, REF_H);
  // erase "Received N new Like(s)" popup + its arrow/dot
  const [lx1, ly1, lx2, ly2] = BOX.likesSrc;
  const [dx, dy, dw, dh] = BOX.likesDst;
  const likes = cropTo(base, { x: lx1, y: ly1, w: lx2 - lx1, h: ly2 - ly1 }, dw, dh);
  g.drawImage(likes, dx, dy);
  const [ax1, ay1, ax2, ay2] = BOX.arrowSrc;
  const arrow = cropTo(base, { x: ax1, y: ay1, w: ax2 - ax1, h: ay2 - ay1 });
  BOX.arrowDst.forEach(([x, y]) => g.drawImage(arrow, x, y));
  // hide the last "recent visits" thumbnail
  const [vx1, vy1, vx2, vy2] = BOX.visitSrc;
  g.drawImage(cropTo(base, { x: vx1, y: vy1, w: vx2 - vx1, h: vy2 - vy1 }), ...BOX.visitDst);
  pieces.base = base;
  pieces.W = W;

  // highest rank (same profile, normalised)
  const [rx1, ry1, rx2, ry2] = BOX.rank;
  pieces.rank = cropTo(base, { x: rx1, y: ry1, w: rx2 - rx1, h: ry2 - ry1 });

  // collector panel
  if (src.collection) {
    const C = src.collection;
    const tmp = canvas(C.width, C.height);
    const tg = tmp.getContext('2d');
    tg.drawImage(C, 0, 0);
    const b = mapRect(C, BOX.panelBtnSrc, 'right');
    const d = mapRect(C, [...BOX.panelBtnDst, BOX.panelBtnDst[0] + 80, BOX.panelBtnDst[1] + 100], 'right');
    tg.drawImage(C, b.x, b.y, b.w, b.h, d.x, d.y, b.w, b.h); // hide Ranking / ? button
    pieces.panel = cropTo(tmp, mapRect(C, BOX.panel, 'right'));
  }

  // effects bar tiles + diamonds
  if (src.effects) {
    const E = src.effects;
    pieces.tiles = {};
    TILE_KEYS.forEach((k) => { pieces.tiles[k] = cropTo(E, mapRect(E, BOX.tiles[k], 'left')); });
    pieces.diamonds = cropTo(E, mapRect(E, BOX.diamonds, 'right'));
  }
  if (src.diamonds) pieces.diamonds = cropTo(src.diamonds, mapRect(src.diamonds, BOX.diamonds, 'right'));

  // weekly pass (days + hours), and the diamonds from its top bar if no effects screenshot
  if (src.weekly) {
    const R = src.weekly;
    if (R.width < R.height) throw new Error('The weekly pass screenshot must be in landscape, like the game.');
    const tmp = canvas(R.width, R.height);
    const tg = tmp.getContext('2d');
    tg.drawImage(R, 0, 0);
    const b = mapRect(R, BOX.weeklyBtnSrc, 'right');
    BOX.weeklyBtnDst.forEach(([x, y]) => {
      const d = mapRect(R, [x, y, x + 35, y + 90], 'right');
      tg.drawImage(R, b.x, b.y, b.w, b.h, d.x, d.y, b.w, b.h);
    });
    pieces.weekly = cropTo(tmp, mapRect(R, BOX.weekly, 'right'));
    if (!pieces.diamonds) pieces.diamonds = cropTo(R, mapRect(R, BOX.diamonds, 'right'));
  }

  pieces.extras = (src.extras || []).map(itemPiece);
  // right side pictures: hero win-rate cards, skin icon grids… used as they are
  pieces.side = (src.side || []).map((im) => cropTo(im, { x: 0, y: 0, w: im.width, h: im.height }));
  pieces.skin = src.skin;
  return pieces;
}

// ---------- default layout ----------
export function defaultLayout(pieces, opts = {}) {
  return {
    skin: { zoom: pieces.skin && pieces.skin.height > pieces.skin.width ? 1.0 : 1.15, focusX: 0.47, offsetY: pieces.skin && pieces.skin.height > pieces.skin.width ? 0.12 : 0.3, centerFromRight: 466 },
    tileSize: 162,                    // largest size; shrinks by itself when many items are added
    gap: 7,
    groupDX: 0, groupDY: 0,           // moves collector panel + square tiles together
    showTiles: { notification: true, spawn: true, recall: true, elimination: true },
    showExtras: (pieces.extras || []).map(() => true),
    diamonds: { show: !!pieces.diamonds, scale: 1.9, dx: 0, dy: 0 },   // the number boxes (diamonds + weekly pass) move together
    weekly: { show: !!pieces.weekly },
    immortal: !!opts.immortal,        // Highest Rank is only highlighted when Immortal
    rank: { dx: 0, dy: 0 },
    cards: { height: 150, dx: 0, dy: 0 },   // wide item cards (with text), bottom-right
    side: { size: 1, dx: 0, dy: 0 },        // right side grid (hero cards, skin grids)
    stats: { matches: '', winRate: '', mvp: '', dx: 0, dy: 0, size: 1 },   // circles over the collector panel
    showSide: (pieces.side || []).map(() => true),
  };
}

// ---------- geometry of every framed box (used for drawing + drag hit-testing) ----------
// Square tiles (recall, spawn, elimination, notification, emotes…) sit in a row
// under the collector panel. With many tiles they shrink to stay left of the
// skin; past one row they wrap onto a second row and the panel gets smaller.
// The number boxes (diamonds, weekly pass days/hours) sit on top of the tiles,
// next to the panel.
const ROW_RIGHT = 1190;     // tiles stay left of the skin art
const MIN_TILE = 96;
export function computeBoxes(pieces, L) {
  const H = REF_H;
  const boxes = [];
  const GAP = L.gap, B = 6;
  const x0 = 30 + L.groupDX;

  const tileList = [];
  if (pieces.tiles) TILE_KEYS.forEach((k) => { if (L.showTiles[k]) tileList.push(pieces.tiles[k]); });
  const cardList = [];
  (pieces.extras || []).forEach((it, i) => {
    if (L.showExtras?.[i] === false) return;
    (it.wide ? cardList : tileList).push(it.img);
  });

  // tile size and rows
  const n = tileList.length;
  const fit = (perRow) => Math.floor((ROW_RIGHT - 30 - (perRow - 1) * (2 * B + GAP)) / perRow) - 2 * B;
  let rows = 1, perRow = Math.max(1, n), S = L.tileSize;
  if (n) {
    S = Math.min(L.tileSize, fit(n));
    if (S < MIN_TILE) {                       // too many for one row
      rows = Math.ceil(n / Math.max(1, Math.floor((ROW_RIGHT - 30 + GAP) / (MIN_TILE + 2 * B + GAP))));
      perRow = Math.ceil(n / rows);
      S = Math.min(L.tileSize, fit(perRow));
    }
  }
  const step = S + 2 * B + GAP;
  const rowsH = n ? rows * step - GAP - 2 * B : 0;          // height of all tile rows (inner)
  const firstRowY = H - 22 - rowsH + L.groupDY;
  tileList.forEach((img, i) => {
    const r = Math.floor(i / perRow), c = i % perRow;
    boxes.push({ id: 'tile' + i, group: 'group', img, x: x0 + c * step, y: firstRowY + r * step, w: S, h: S });
  });
  const aboveTiles = n ? firstRowY - 2 * B - GAP : H - 22 + L.groupDY;   // bottom edge for what sits on top

  let panelRight = x0 - B - GAP;
  if (pieces.panel) {
    let pw = 368;
    let ph = Math.round(pieces.panel.height * pw / pieces.panel.width);
    const room = aboveTiles - 150;                         // keep it under the Profile tab
    if (ph > room && room > 120) { pw = Math.round(pw * room / ph); ph = room; }
    boxes.push({ id: 'panel', group: 'group', img: pieces.panel, x: x0, y: aboveTiles - ph, w: pw, h: ph });
    panelRight = x0 + pw;
  }

  // number boxes: diamonds, then weekly pass, same height, side by side
  const nh = Math.round(56 * L.diamonds.scale);
  let nx = panelRight + 2 * B + GAP + L.diamonds.dx;
  const ny = aboveTiles - nh + L.diamonds.dy;
  if (pieces.diamonds && L.diamonds.show) {
    const w = Math.round(pieces.diamonds.width / pieces.diamonds.height * nh);
    boxes.push({ id: 'diamonds', group: 'diamonds', img: pieces.diamonds, x: nx, y: ny, w, h: nh });
    nx += w + 2 * B + GAP;
  }
  if (pieces.weekly && L.weekly?.show) {
    const w = Math.round(pieces.weekly.width / pieces.weekly.height * nh);
    boxes.push({ id: 'weekly', group: 'diamonds', img: pieces.weekly, x: nx, y: ny, w, h: nh });
  }

  // right side grid: hero cards, skin grids (and wide item cards, when there is a grid)
  const sideList = (pieces.side || []).filter((_, i) => L.showSide?.[i] !== false);
  if (sideList.length) {
    sideList.push(...cardList.splice(0));
    sideGrid(sideList, pieces.W, L, B, GAP).forEach((b, i) => boxes.push({ id: 'side' + i, group: 'side', ...b }));
  }

  // item cards: right-aligned at the bottom right, stacked upwards
  if (cardList.length) {
    const ch = L.cards?.height ?? 150;
    let cy = H - 22 - ch + (L.cards?.dy ?? 0);
    cardList.forEach((img, i) => {
      const cw = Math.round(img.width / img.height * ch);
      boxes.push({ id: 'card' + i, group: 'cards', img, x: pieces.W - 30 - cw + (L.cards?.dx ?? 0), y: cy, w: cw, h: ch });
      cy -= ch + 2 * B + GAP;
    });
  }
  // Matches / Win Rate / MVP circles, along the top of the collector panel
  const st = L.stats || {};
  const statVals = [st.matches, st.winRate, st.mvp].map((v) => String(v ?? '').trim());
  if (statVals.some(Boolean)) {
    const panel = boxes.find((b) => b.id === 'panel');
    const d = Math.round(128 * (st.size || 1));
    const span = d * 3 - Math.round(d * 0.08) * 2;           // circles touch a little
    const left = (panel ? panel.x + panel.w / 2 : 214) - span / 2;
    const top = (panel ? panel.y : 190) - Math.round(d * 0.62);
    [['matches', 'Matches'], ['winRate', 'Win Rate'], ['mvp', 'MVP']].forEach(([k, label], i) => {
      if (!statVals[i]) return;
      boxes.push({ id: 'stat-' + k, group: 'stats', kind: 'circle', label, value: statVals[i],
        x: Math.max(8, left + i * (d - Math.round(d * 0.08))) + (st.dx || 0), y: Math.max(8, top) + (st.dy || 0), w: d, h: d });
    });
  }
  if (L.immortal && pieces.rank) {
    const rw = Math.round(pieces.rank.width * 1.32), rh = Math.round(pieces.rank.height * 1.32);
    boxes.push({ id: 'rank', group: 'rank', img: pieces.rank,
      x: BOX.rankCenter[0] - rw / 2 + L.rank.dx, y: BOX.rankCenter[1] - rh / 2 + L.rank.dy, w: rw, h: rh });
  }
  return boxes;
}

// Packs pictures into rows on the right side (from the skin area to the right
// edge), keeping their order. Every row has the same height, so hero cards all
// come out the same size; the height is the biggest one that still fits.
function sideGrid(list, W, L, B, GAP) {
  const sz = L.side?.size ?? 1;
  const areaW = Math.round(860 * sz), areaH = REF_H - 60 - 22;
  const x0 = W - 22 - areaW + (L.side?.dx ?? 0), y0 = 60 + (L.side?.dy ?? 0);
  const ar = list.map((im) => im.width / im.height);
  const pad = 2 * B + GAP;
  // break into rows for a given height; null if something can't fit
  const layoutFor = (h) => {
    const rows = [[]];
    let x = 0;
    for (let i = 0; i < ar.length; i++) {
      const w = ar[i] * h;
      if (w + 2 * B > areaW) return null;
      const need = (rows[rows.length - 1].length ? pad : 2 * B) + w;
      if (x + need > areaW) { rows.push([i]); x = 2 * B + w; } else { rows[rows.length - 1].push(i); x += need; }
    }
    const usedH = rows.length * h + (rows.length - 1) * pad + 2 * B;
    return usedH <= areaH ? { rows, h, usedH } : null;
  };
  let lo = 20, hi = areaH, best = layoutFor(lo) || { rows: [ar.map((_, i) => i)], h: lo, usedH: lo };
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2, r = layoutFor(mid);
    if (r) { best = r; lo = mid } else hi = mid;
  }
  const out = [];
  let y = y0 + Math.max(0, (areaH - best.usedH) / 2) + B;
  best.rows.forEach((r) => {
    const h = best.h;
    const rowW = r.reduce((a, i) => a + ar[i] * h, 0) + (r.length - 1) * pad;
    let x = x0 + (areaW - B - rowW);   // rows hug the right edge
    r.forEach((i) => {
      const w = ar[i] * h;
      out.push({ img: list[i], x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
      x += w + pad;
    });
    y += h + pad;
  });
  return out;
}

// a stat circle: dark blue disc, yellow ring, big number, coloured label
const STAT_COLORS = { Matches: '#ff9be0', 'Win Rate': '#e9eef7', MVP: '#7ff0b6' };
function drawCircle(g, b) {
  const r = b.w / 2, cx = b.x + r, cy = b.y + r;
  g.save();
  g.shadowColor = 'rgba(255,214,40,0.55)';
  g.shadowBlur = 26;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  const grad = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  grad.addColorStop(0, '#2b4f86'); grad.addColorStop(1, '#173058');
  g.fillStyle = grad; g.fill();
  g.restore();
  g.lineWidth = Math.max(5, r * 0.09);
  g.strokeStyle = YELLOW;
  g.beginPath(); g.arc(cx, cy, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  let fs = r * 0.6;
  g.font = `600 ${fs}px Roboto, Arial, sans-serif`;
  while (g.measureText(b.value).width > r * 1.6 && fs > 10) { fs -= 1; g.font = `600 ${fs}px Roboto, Arial, sans-serif`; }
  g.fillStyle = '#ffffff';
  g.fillText(b.value, cx, cy + fs * 0.18);
  g.font = `500 ${r * 0.3}px Roboto, Arial, sans-serif`;
  g.fillStyle = STAT_COLORS[b.label] || '#fff';
  g.fillText(b.label, cx, cy + r * 0.55);
}

// ---------- draw ----------
function drawSkin(g, pieces, L) {
  const W = pieces.W, H = REF_H;
  const X0 = W - 1146, CW = W - X0;
  const sk = pieces.skin;
  const s = Math.max(H / sk.height, CW / sk.width) * L.skin.zoom; // always fill the right side
  const sw = sk.width * s, sh = sk.height * s;
  const target = W - L.skin.centerFromRight;
  let left = L.skin.focusX * sw - (target - X0);
  left = Math.max(0, Math.min(left, sw - CW));
  const top = Math.max(0, (sh - H) * L.skin.offsetY);

  const layer = canvas(CW, H);
  const lg = layer.getContext('2d');
  lg.imageSmoothingQuality = 'high';
  lg.drawImage(sk, -left, -top, sw, sh);
  // soft left fade (smoothstep over 260px)
  const grad = lg.createLinearGradient(0, 0, 260, 0);
  for (let i = 0; i <= 10; i++) { const t = i / 10; grad.addColorStop(t, `rgba(0,0,0,${t * t * (3 - 2 * t)})`); }
  lg.globalCompositeOperation = 'destination-in';
  lg.fillStyle = grad;
  lg.fillRect(0, 0, CW, H);
  g.drawImage(layer, X0, 0);

  // light top/bottom vignette on the right side only
  const v = canvas(W, H), vg = v.getContext('2d');
  let gr = vg.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  vg.fillStyle = gr; vg.fillRect(0, 0, W, 60);
  gr = vg.createLinearGradient(0, H - 60, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  vg.fillStyle = gr; vg.fillRect(0, H - 60, W, 60);
  vg.globalCompositeOperation = 'destination-in';
  gr = vg.createLinearGradient(1250, 0, 1500, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  vg.fillStyle = gr; vg.fillRect(0, 0, W, H);
  g.drawImage(v, 0, 0);
}

function drawFramed(g, b) {
  const B = 6;
  g.save();
  g.shadowColor = 'rgba(255,214,40,0.55)';
  g.shadowBlur = 28;
  g.fillStyle = YELLOW;
  g.fillRect(b.x - B, b.y - B, b.w + 2 * B, b.h + 2 * B);
  g.restore();
  g.fillStyle = YELLOW;
  g.fillRect(b.x - B, b.y - B, b.w + 2 * B, b.h + 2 * B);
  g.imageSmoothingQuality = 'high';
  g.drawImage(b.img, b.x, b.y, b.w, b.h);
}

function drawWatermark(g, W, H) {
  g.save();
  g.globalAlpha = 0.22;
  g.fillStyle = '#ffffff';
  g.font = 'bold 54px sans-serif';
  g.textAlign = 'center';
  g.rotate(-0.35);
  for (let y = -200; y < H + 600; y += 190) {
    for (let x = -400; x < W + 400; x += 620) g.fillText('RyukCreates.shop', x, y);
  }
  g.restore();
}

// Render to a canvas. scale < 1 for a light preview; watermark for the free preview.
export function render(pieces, L, { scale = 1, watermark = false, highlight = null } = {}) {
  const W = pieces.W, H = REF_H;
  const out = canvas(W * scale, H * scale);
  const g = out.getContext('2d');
  g.scale(scale, scale);
  g.drawImage(pieces.base, 0, 0);
  if (pieces.skin) drawSkin(g, pieces, L);
  const boxes = computeBoxes(pieces, L);
  // clean up profile text that peeks out beside the tile rows
  const tiles = boxes.filter((b) => b.id.startsWith('tile'));
  if (tiles.length && L.groupDX === 0 && L.groupDY === 0) {
    const rows = [...new Set(tiles.map((b) => b.y))].sort((p, q) => p - q);
    const ends = rows.map((ry) => Math.max(...tiles.filter((b) => b.y === ry).map((b) => b.x + b.w)) + 10);
    const lastEnd = ends[ends.length - 1];
    // the "Recent Visits" thumbnails at the bottom
    for (let x = lastEnd; x < 800; x += 40) g.drawImage(pieces.base, 805, 935, 40, 85, x, 935, 40, 85);
    // rows that run into "Heroes / Skins / Matches Played / Likes": clear that
    // whole corner instead of leaving cut-off words between and beside the tiles
    if (Math.max(...ends) > 940) {
      // start at the top of the first text line the tiles touch, so no line is cut in half
      // (lines on the profile: hero/skin numbers, their labels, Matches Played, Likes)
      const LINES = [[815, 862], [862, 905], [928, 972], [972, 1020]];
      const t = rows[0] - 16;
      const hit = LINES.find(([, bot]) => bot > t);
      const py = Math.max(800, Math.min(t, hit ? hit[0] : t) - 20);
      // low down (Matches Played / Likes) the whole line is cleared; higher up only beside the tiles
      const x1 = py >= 900 ? 800 : Math.max(800, Math.min(...ends));
      const pw = 1340 - x1, ph = REF_H - 4 - py;
      const patch = canvas(pw, ph), pg = patch.getContext('2d');
      for (let x = 0; x < pw; x += 40) pg.drawImage(pieces.base, 850, 925, 40, 125, x, 0, 40, ph);
      // feather the top and right edges so the patch melts into the art around it
      pg.globalCompositeOperation = 'destination-in';
      const gx = pg.createLinearGradient(0, 0, pw, 0);
      gx.addColorStop(0, '#000'); gx.addColorStop(Math.max(0, 1 - 90 / pw), '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
      pg.fillStyle = gx; pg.fillRect(0, 0, pw, ph);
      const gy = pg.createLinearGradient(0, 0, 0, ph);
      gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(Math.min(1, 24 / ph), '#000'); gy.addColorStop(1, '#000');
      pg.fillStyle = gy; pg.fillRect(0, 0, pw, ph);
      g.drawImage(patch, x1, py);
    }
  }
  boxes.forEach((b) => (b.kind === 'circle' ? drawCircle(g, b) : drawFramed(g, b)));
  if (highlight) {
    boxes.filter((b) => b.group === highlight).forEach((b) => {
      g.save(); g.strokeStyle = '#00e5c0'; g.lineWidth = 4; g.setLineDash([14, 10]);
      g.strokeRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24); g.restore();
    });
  }
  if (watermark) drawWatermark(g, W, H);
  return out;
}

export function hitTest(pieces, L, x, y) {
  const boxes = computeBoxes(pieces, L).reverse();
  const b = boxes.find((bb) => x >= bb.x - 6 && x <= bb.x + bb.w + 6 && y >= bb.y - 6 && y <= bb.y + bb.h + 6);
  return b ? b.group : null;
}

export function toBlob(c, type = 'image/jpeg', q = 0.95) {
  return new Promise((r) => c.toBlob(r, type, q));
}
