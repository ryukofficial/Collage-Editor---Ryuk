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
  diamonds: [1960, 22, 2118, 78], // top bar, right-anchored
  coa: [1752, 24, 1942, 80],       // the star currency (COA), just left of the diamonds on draw / event pages
  // Effects / Battle Emote screens: the grid on the right, where the item in use has a yellow frame
  effectArea: [1720, 150, 2240, 720],
  effectFirst: [1749, 190, 1884, 325],      // fallback: the first cell of the grid
  // Battlefield → Statistics: centres of the Matches / Win Rate / MVP circles (left-anchored), radius
  statCircles: [[688, 333], [970, 333], [1252, 333]], statR: 118,
  // Recharge → Weekly Diamond Pass screen (right-anchored): "Weekly Pass Active" + days/hours
  weekly: [1736, 398, 2068, 566],           // just the days + hours counters, so the numbers come out big
  weeklyBtnSrc: [1700, 410, 1735, 500], weeklyBtnDst: [[2050, 410], [2072, 410]],   // hide the "+ ₹price" button
};


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

// ---------- the effect / emote in use ----------
// On the Effects and Battle Emote screens the item in use has a yellow frame in
// the grid on the right. Find that frame (long straight yellow lines) and cut
// out what is inside it. If no frame is found, the first item of the grid is used.
function selectedEffect(img) {
  // 1) the usual place: the grid on the right of the Effects screen
  const s = img.height / REF_H;
  const inGrid = findYellowFrame(img, mapRect(img, BOX.effectArea, 'right'));
  // 2) anywhere on the right part of the screen (other screens, other layouts)
  const right = { x: img.width * 0.4, y: 0, w: img.width * 0.6, h: img.height };
  // 3) any yellow outline (rounded or curved frames, emote wheel slots)
  const found = inGrid || findYellowFrame(img, right) || findYellowOutline(img, right);
  if (!found) return null;                     // no yellow frame: don't guess (that gave map pieces before)
  const inset = 7 * s;
  return cropTo(img, { x: found.x + inset, y: found.y + inset, w: found.w - 2 * inset, h: found.h - 2 * inset });
}

// Finds a square yellow frame (the item in use) inside rectangle `area` of `img`.
// Looks for a top and a bottom yellow line of the same length, joined by yellow
// left and right sides, so other yellow marks on the screen are ignored.
function findYellowFrame(img, area) {
  const s = img.height / REF_H;
  const aw = Math.max(1, Math.round(area.w / s)), ah = Math.max(1, Math.round(area.h / s));
  const c = canvas(aw, ah), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, aw, ah);
  const d = g.getImageData(0, 0, aw, ah).data;
  const Y = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    Y[i] = r > 200 && gg > 160 && b < 130 && r - b > 100 ? 1 : 0;
  }
  // horizontal yellow runs of 70 px or more: [y, x1, x2]
  const runs = [];
  for (let y = 0; y < ah; y++) {
    let st = -1;
    for (let x = 0; x <= aw; x++) {
      const on = x < aw && Y[y * aw + x];
      if (on && st < 0) st = x;
      if (!on && st >= 0) { if (x - st >= 70) runs.push([y, st, x - 1]); st = -1; }
    }
  }
  const colCover = (x, y1, y2) => { let n = 0; for (let y = y1; y <= y2; y++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx; if (xx >= 0 && xx < aw && Y[y * aw + xx]) { n++; break; } } return n / (y2 - y1 + 1); };
  let best = null;
  for (const [ya, xa1, xa2] of runs) {
    for (const [yb, xb1, xb2] of runs) {
      const h = yb - ya, w = xa2 - xa1;
      if (h < 70 || h > 320) continue;
      if (Math.abs(xa1 - xb1) > 6 || Math.abs(xa2 - xb2) > 6) continue;       // same left and right ends
      if (w / h < 0.75 || w / h > 1.33) continue;                           // square-ish
      const cover = (colCover(xa1 + 1, ya, yb) + colCover(xa2 - 1, ya, yb)) / 2;
      if (cover < 0.75) continue;
      const score = cover * 1000 + w;                                       // the clearest, then the biggest
      if (!best || score > best.score) best = { score, x: xa1, y: ya, w, h };
    }
  }
  if (!best) return null;
  return { x: area.x + best.x * s, y: area.y + best.y * s, w: best.w * s, h: best.h * s };
}

// A looser search: the biggest yellow outline (a ring of yellow, not a solid
// yellow button) of item size. Catches rounded, curved or thin frames.
function findYellowOutline(img, area) {
  const s = img.height / REF_H;
  const aw = Math.max(1, Math.round(area.w / s)), ah = Math.max(1, Math.round(area.h / s));
  const c = canvas(aw, ah), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, aw, ah);
  const d = g.getImageData(0, 0, aw, ah).data;
  const Y = new Uint8Array(aw * ah);
  for (let i = 0; i < aw * ah; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    Y[i] = r > 185 && gg > 135 && b < 140 && r - b > 80 && r >= gg ? 1 : 0;
  }
  const seen = new Uint8Array(aw * ah), stack = new Int32Array(aw * ah);
  let best = null;
  for (let i0 = 0; i0 < aw * ah; i0++) {
    if (!Y[i0] || seen[i0]) continue;
    let top = 0, n = 0, x1 = aw, x2 = 0, y1 = ah, y2 = 0;
    stack[top++] = i0; seen[i0] = 1;
    while (top) {
      const i = stack[--top], x = i % aw, y = (i / aw) | 0;
      n++; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {   // 8 neighbours: thin diagonal lines stay joined
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= aw || yy >= ah) continue;
        const j = yy * aw + xx;
        if (Y[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
      }
    }
    const w = x2 - x1 + 1, h = y2 - y1 + 1;
    if (w < 60 || h < 60 || w > 420 || h > 420 || w / h < 0.5 || w / h > 2) continue;
    if (n / (w * h) > 0.45 || n < 2 * (w + h) * 0.5) continue;           // an outline, not a filled button
    if (!best || w * h > best.w * best.h) best = { x: x1, y: y1, w, h };
  }
  if (!best) return null;
  return { x: area.x + best.x * s, y: area.y + best.y * s, w: best.w * s, h: best.h * s };
}

// ---------- favourite heroes (Battlefield → Favorite) ----------
// Finds every hero card that is fully on screen: cards have thin straight
// edges, so we look for long horizontal and vertical lines on the right part of
// the screen and pair them into card-shaped boxes. Half-visible cards are skipped.
function heroCards(img) {
  // a hero card that was already cut out (not a whole screenshot): use it as it is
  if (img.width < img.height * 1.6) return [cropTo(img, { x: 0, y: 0, w: img.width, h: img.height })];
  const k = REF_H / img.height, W = Math.round(img.width * k), H = REF_H;
  const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  const xa = Math.round(W * 0.45);
  const edge = (a, b1, b2) => Math.abs(a - b1) > 8 && Math.abs(a - b2) > 3;
  const group = (score, thr) => {
    const out = []; let start = -1, last = -1;
    score.forEach((v, i) => { if (v > thr) { if (start < 0 || i - last > 3) { if (start >= 0) out.push((start + last) >> 1); start = i } last = i } });
    if (start >= 0) out.push((start + last) >> 1);
    return out;
  };
  // horizontal lines
  const hs = new Array(H).fill(0);
  for (let y = 4; y < H - 4; y++) {
    let n = 0;
    for (let x = xa; x < W - 20; x++) { const v = L[y * W + x]; if (edge(v, L[(y - 4) * W + x], L[(y + 4) * W + x])) n++ }
    hs[y] = n / (W - 20 - xa);
  }
  const rowsY = group(hs, 0.35);
  // card rows: a top line with a bottom line about 400–450 px below
  const rows = [];
  rowsY.forEach((y1) => {
    const y2 = rowsY.find((y) => y - y1 >= 395 && y - y1 <= 450);
    if (y2 && !rows.some(([a, b]) => y1 < b && y2 > a)) rows.push([y1, y2]);
  });
  const cards = [];
  rows.forEach(([y1, y2]) => {
    const vs = new Array(W).fill(0);
    for (let x = Math.max(4, xa); x < W - 4; x++) {
      let n = 0;
      for (let y = y1 + 20; y < y2 - 20; y++) { const v = L[y * W + x]; if (edge(v, L[y * W + x - 4], L[y * W + x + 4])) n++ }
      vs[x] = n / (y2 - y1 - 40);
    }
    const cols = group(vs, 0.5);
    const h = y2 - y1;
    for (let i = 0; i < cols.length - 1; i++) {
      const w = cols[i + 1] - cols[i];
      if (w / h > 0.66 && w / h < 0.84) { cards.push([cols[i], y1, cols[i + 1], y2]); i++ }
    }
  });
  return cards.map(([x1, y1, x2, y2]) => cropTo(c, { x: x1 - 2, y: y1 - 2, w: x2 - x1 + 4, h: y2 - y1 + 4 }));
}

// A tiny grey thumbnail of a picture, to tell whether two cards are the same.
function signature(im) {
  const c = canvas(16, 16), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(im, 0, 0, im.width, im.height, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data, out = new Float32Array(768);
  for (let i = 0; i < 256; i++) { out[i * 3] = d[i * 4]; out[i * 3 + 1] = d[i * 4 + 1]; out[i * 3 + 2] = d[i * 4 + 2]; }
  return out;
}
// Only the very same card twice (same picture added again) is dropped.
function dedupeCards(list) {
  const kept = [], sigs = [];
  for (const im of list) {
    const s = signature(im), ar = im.width / im.height;
    const dup = sigs.some(([t, a]) => Math.abs(a - ar) < 0.03 && t.reduce((n, v, i) => n + Math.abs(v - s[i]), 0) / 768 < 3);
    if (!dup) { kept.push(im); sigs.push([s, ar]); }
  }
  return kept;
}

// ---------- build the pieces from the screenshots ----------
// sources: { profile, collection, effects: [], weekly, coa, skin, extras: [], side: [] } (HTMLImageElements; only profile + skin required)
// extras = any item pictures (avatar borders, emotes…); wide item cards keep their text.
export function extractPieces(src) {
  const pieces = {};
  const P = src.profile;
  if (P.width < P.height) throw new Error('The profile screenshot must be taken in landscape (sideways), like the game.');
  if (src.collection && src.collection.width < src.collection.height) throw new Error('The collection screenshot must be in landscape, like the game.');
  if ((src.effects || []).some((e) => e.width < e.height)) throw new Error('Effects screenshots must be in landscape, like the game.');

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
  // one effect per screenshot: the item in use (yellow frame) in the grid on the right
  // or the spot the person picked by hand: { cx, cy, s } as fractions of the screenshot
  pieces.effects = (src.effects || []).map((im, i) => {
    const pk = src.effectPicks?.[i];
    if (!pk) return selectedEffect(im);
    const side = pk.s * im.height;
    return cropTo(im, { x: pk.cx * im.width - side / 2, y: pk.cy * im.height - side / 2, w: side, h: side });
  });
  if (src.effects?.length) pieces.diamonds = cropTo(src.effects[0], mapRect(src.effects[0], BOX.diamonds, 'right'));
  if (src.coa) {
    if (src.coa.width < src.coa.height) throw new Error('The COA screenshot must be in landscape, like the game.');
    pieces.coa = cropTo(src.coa, mapRect(src.coa, BOX.coa, 'right'));
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
    pieces.diamonds = cropTo(R, mapRect(R, BOX.diamonds, 'right'));   // its top bar has the diamonds
  }

  pieces.extras = (src.extras || []).map(itemPiece);
  // right side pictures: hero win-rate cards, skin icon grids… used as they are
  pieces.side = [
    ...(src.side || []).map((im) => cropTo(im, { x: 0, y: 0, w: im.width, h: im.height })),
    ...(src.heroes || []).flatMap(heroCards),
  ];
  // the same hero card twice (overlapping screenshots, or added again): keep one
  pieces.side = dedupeCards(pieces.side);
  // Matches / Win Rate / MVP circles from the Statistics screen
  if (src.stats) {
    const S = src.stats;
    if (S.width < S.height) throw new Error('The statistics screenshot must be in landscape, like the game.');
    const r = BOX.statR;
    pieces.circles = BOX.statCircles.map(([cx, cy]) => cropTo(S, mapRect(S, [cx - r, cy - r, cx + r, cy + r], 'left')));
  }
  pieces.skin = src.skin;
  pieces.skin2 = src.skin2 || null;
  return pieces;
}

// ---------- default layout ----------
const skinDefaults = (sk) => ({
  zoom: sk && sk.height > sk.width ? 1.0 : 1.15, focusX: 0.47,
  offsetY: sk && sk.height > sk.width ? 0.12 : 0.3, centerFromRight: 560,
});

export function defaultLayout(pieces, opts = {}) {
  return {
    skin: skinDefaults(pieces.skin),
    skin2: skinDefaults(pieces.skin2),
    duo: { split: 0.56, soft: 220, swap: false },  // two skins: where they meet and how softly
    artW: ART_W,                                   // how wide the skin art area is (from the right edge)
    tileSize: 162,                    // largest size; shrinks by itself when many items are added
    gap: 7,
    groupDX: 0, groupDY: 0,           // moves collector panel + square tiles together
    tileOff: {},                      // extra move of single effect tiles: { index: { dx, dy } }
    showEffects: (pieces.effects || []).map(() => true),
    showExtras: (pieces.extras || []).map(() => true),
    diamonds: { show: !!pieces.diamonds, scale: 1.9, dx: 0, dy: 0 },   // the number boxes (diamonds + weekly pass) move together
    weekly: { show: !!pieces.weekly },
    coa: { show: !!pieces.coa },
    immortal: !!opts.immortal,        // Highest Rank is only highlighted when Immortal
    rank: { dx: 0, dy: 0 },
    cards: { height: 150, dx: 0, dy: 0 },   // wide item cards (with text), bottom-right
    side: { size: 1, dx: 0, dy: 0 },        // right side grid (hero cards, skin grids)
    stats: { dx: 0, dy: 0, size: 1 },       // Matches / Win Rate / MVP circles over the collector panel
    sizes: { panel: 1, diamonds: 1, coa: 1, weekly: 1.5 },   // each box's own size
    showSide: (pieces.side || []).map(() => true),
  };
}

// ---------- geometry of every framed box (used for drawing + drag hit-testing) ----------
// Square tiles (recall, spawn, elimination, notification, emotes…) sit in a row
// under the collector panel. With many tiles they shrink to stay left of the
// skin; past one row they wrap onto a second row and the panel gets smaller.
// The number boxes (diamonds, COA, weekly pass days/hours) sit on top of the tiles,
// next to the panel.
const ROW_RIGHT = 1190;     // tiles stay left of the skin art
const MIN_TILE = 96;
export function computeBoxes(pieces, L) {
  const H = REF_H;
  const boxes = [];
  const GAP = L.gap, B = 6;
  const x0 = 30 + L.groupDX;

  const tileList = [];
  (pieces.effects || []).forEach((img, i) => { if (img && L.showEffects?.[i] !== false) tileList.push(img); });
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
    const off = L.tileOff?.[i] || { dx: 0, dy: 0 };          // each effect can be moved on its own
    boxes.push({ id: 'tile' + i, group: 'tile:' + i, img, x: x0 + c * step + off.dx, y: firstRowY + r * step + off.dy, w: S, h: S });
  });
  const aboveTiles = n ? firstRowY - 2 * B - GAP : H - 22 + L.groupDY;   // bottom edge for what sits on top

  let panelRight = x0 - B - GAP;
  if (pieces.panel) {
    let pw = Math.round(368 * (L.sizes?.panel ?? 1));
    let ph = Math.round(pieces.panel.height * pw / pieces.panel.width);
    const room = aboveTiles - 150;                         // keep it under the Profile tab
    if (ph > room && room > 120) { pw = Math.round(pw * room / ph); ph = room; }
    boxes.push({ id: 'panel', group: 'group', img: pieces.panel, x: x0, y: aboveTiles - ph, w: pw, h: ph });
    panelRight = x0 + pw;
  }

  // number boxes: diamonds, COA, weekly pass side by side on one bottom line, each its own size
  // (the weekly pass starts 50% bigger than the others)
  const base = 106;
  let nx = panelRight + 2 * B + GAP + L.diamonds.dx;
  const bottom = aboveTiles + L.diamonds.dy;
  [['diamonds', L.diamonds.show], ['coa', L.coa?.show], ['weekly', L.weekly?.show]].forEach(([k, on]) => {
    const img = pieces[k];
    if (!img || !on) return;
    const h = Math.round(base * (L.sizes?.[k] ?? (k === 'weekly' ? 1.5 : 1)));
    const w = Math.round(img.width / img.height * h);
    boxes.push({ id: k, group: 'diamonds', img, x: nx, y: bottom - h, w, h });
    nx += w + 2 * B + GAP;
  });

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
  if (pieces.circles) {
    const st = L.stats || {};
    const panel = boxes.find((b) => b.id === 'panel');
    const d = Math.round(128 * (st.size || 1));
    const step = d - Math.round(d * 0.08);                   // circles touch a little
    const span = d + step * 2;
    const left = (panel ? panel.x + panel.w / 2 : 214) - span / 2;
    const top = (panel ? panel.y : 190) - Math.round(d * 0.62);
    pieces.circles.forEach((img, i) => {
      // the middle one (Win Rate) is a little bigger and sits a little higher
      const dd = i === 1 ? Math.round(d * 1.15) : d;
      const cx = left + i * step + d / 2, cy = Math.max(8, top) + d / 2 - (i === 1 ? Math.round(d * 0.12) : 0);
      boxes.push({ id: 'stat' + i, group: 'stats', kind: 'circle', img,
        x: Math.max(8, Math.round(cx - dd / 2)) + (st.dx || 0), y: Math.max(4, Math.round(cy - dd / 2)) + (st.dy || 0), w: dd, h: dd });
    });
  }
  if (L.immortal && pieces.rank) {
    const rw = Math.round(pieces.rank.width * 1.32), rh = Math.round(pieces.rank.height * 1.32);
    boxes.push({ id: 'rank', group: 'rank', img: pieces.rank,
      x: BOX.rankCenter[0] - rw / 2 + L.rank.dx, y: BOX.rankCenter[1] - rh / 2 + L.rank.dy, w: rw, h: rh });
  }
  // things that were already placed keep their spot and size when more pictures
  // are added (pins: { pictureKey: { x, y, w, h, group, g: group offset then } })
  const pins = L.pins || {}, off = L.boxOff || {};
  const seen = {};
  for (const b of boxes) {
    const base = pictureKey(b.img) + ':' + b.group.split(':')[0];
    seen[base] = (seen[base] || 0) + 1;
    b.key = seen[base] > 1 ? `${base}#${seen[base]}` : base;      // never two boxes with one key
    const p = pins[b.key];
    b.auto = { x: b.x, y: b.y, w: b.w, h: b.h };
    if (p) {
      const go = groupOffset(L, b.group);
      b.x = p.x + go.dx - p.g.dx; b.y = p.y + go.dy - p.g.dy; b.w = p.w; b.h = p.h; b.pinned = true;
    }
  }
  // new pictures next to ones that stay in place: same size, in a new row beside them
  for (const fam of ['side', 'tile', 'cards']) {
    const inFam = boxes.filter((b) => b.group === fam || b.group.startsWith(fam + ':'));
    const fixed = inFam.filter((b) => b.pinned), fresh = inFam.filter((b) => !b.pinned);
    if (!fixed.length || !fresh.length) continue;
    if (fam === 'tile') {
      // new effects carry on the same row, right after the last one already there
      const last = fixed.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a));
      const sp = 2 * B + GAP, need = fresh.length * (last.h + sp);
      if (last.x + last.w + need <= ROW_RIGHT + 40) {
        let x = last.x + last.w + sp;
        for (const b of fresh) { b.x = x; b.y = last.y; b.w = last.h; b.h = last.h; x += last.h + sp; }
      } else {
        // no room left on the row: lay out the whole bottom row again (and what sits on it)
        for (const b of boxes) {
          if (b.group === 'tile' || b.group.startsWith('tile:') || b.group === 'group' || b.group === 'diamonds') {
            if (b.pinned) { Object.assign(b, b.auto); b.pinned = false; b.unpinned = true; }
          }
        }
      }
      continue;
    }
    const hs = fixed.map((b) => b.h).sort((a, b2) => a - b2); let h = hs[hs.length >> 1];
    const left = Math.min(...fixed.map((b) => b.x)), right = Math.max(...fixed.map((b) => b.x + b.w));
    const top = Math.min(...fixed.map((b) => b.y)), bottom = Math.max(...fixed.map((b) => b.y + b.h));
    const gap = 14;
    let rowW = fresh.reduce((n, b) => n + b.w * (h / b.h), 0) + gap * (fresh.length - 1);
    // hero cards / grids stay on the right side: shrink the new row if it would reach the profile
    const minX = fam === 'side' ? pieces.W * 0.52 : 10;
    if (fam === 'side' && right - rowW < minX) { const f = (right - minX) / rowW; h *= f; rowW *= f; }
    let y = bottom + gap;
    if (y + h > H - 10) y = Math.max(10, top - gap - h);            // no room below: above them
    let x = fam === 'side' ? Math.max(10, right - rowW) : left;      // hero cards keep to the right
    for (const b of fresh) {
      const w = b.w * (h / b.h);
      b.x = x; b.y = y; b.w = w; b.h = h;
      x += w + gap;
    }
  }
  for (const b of boxes) {
    // one item can be made bigger or smaller on its own (boxScale: { pictureKey: factor })
    const sc = L.boxScale?.[b.key];
    if (sc && sc !== 1) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; b.w *= sc; b.h *= sc; b.x = cx - b.w / 2; b.y = cy - b.h / 2; }
    // anything can also be moved on its own (boxOff: { pictureKey: { dx, dy } })
    const o = off[b.key];
    if (o) { b.x += o.dx; b.y += o.dy; }
  }
  return boxes;
}

// how far a whole group has been moved (so pinned things still follow their group)
export function groupOffset(L, group) {
  if (group === 'group') return { dx: L.groupDX || 0, dy: L.groupDY || 0 };
  if (group.startsWith('tile:')) return L.tileOff?.[+group.slice(5)] || { dx: 0, dy: 0 };
  return { dx: L[group]?.dx || 0, dy: L[group]?.dy || 0 };
}

// A short name for a picture that stays the same every time it is rebuilt.
const keyCache = new WeakMap();
export function pictureKey(img) {
  if (!img) return 'none';
  let k = keyCache.get(img);
  if (k) return k;
  const c = canvas(6, 6), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 6, 6);
  const d = g.getImageData(0, 0, 6, 6).data;
  let h = `${img.width}x${img.height}`;
  for (let i = 0; i < 36; i++) h += ((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) >> 5).toString(36);
  keyCache.set(img, h);
  return h;
}

// Pin every box of the current picture where it is now.
export function pinAll(pieces, L) {
  const pins = { ...(L.pins || {}) };
  for (const b of computeBoxes(pieces, L)) pins[b.key] = { x: b.x, y: b.y, w: b.w, h: b.h, group: b.group, g: { ...groupOffset(L, b.group) } };
  return pins;
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
  // up to 3 pictures: one row; more: 2 rows (more rows only if 2 can't hold them)
  const n = ar.length;
  const layoutRows = (R) => {
    const per = Math.ceil(n / R), rows = [];
    for (let i = 0; i < n; i += per) rows.push(Array.from({ length: Math.min(per, n - i) }, (_, k) => i + k));
    // biggest height that fits: every row within the width, all rows within the height
    let h = (areaH - 2 * B - (rows.length - 1) * pad) / rows.length;
    for (const r of rows) {
      const arSum = r.reduce((a, i) => a + ar[i], 0);
      h = Math.min(h, (areaW - 2 * B - (r.length - 1) * pad) / arSum);
    }
    h = Math.min(h, 480 * sz);                   // one or two cards don't grow huge
    return { rows, h: Math.max(20, h), usedH: rows.length * Math.max(20, h) + (rows.length - 1) * pad + 2 * B };
  };
  let best = layoutRows(n <= 3 ? 1 : 2);
  for (let R = 3; n > 3 && R <= n && best.h < 150; R++) { const r = layoutRows(R); if (r.h > best.h) best = r; else break; }
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

// a stat circle from the game, with a yellow ring drawn over its coloured ring
function drawCircle(g, b) {
  const r = b.w / 2, cx = b.x + r, cy = b.y + r;
  g.save();
  g.shadowColor = 'rgba(255,214,40,0.55)';
  g.shadowBlur = 26;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = '#1d3a66'; g.fill();
  g.restore();
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  g.imageSmoothingQuality = 'high';
  g.drawImage(b.img, b.x, b.y, b.w, b.h);
  g.restore();
  g.lineWidth = Math.max(5, r * 0.1);
  g.strokeStyle = YELLOW;
  g.beginPath(); g.arc(cx, cy, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
}

// ---------- draw ----------
// The skin art area on the right (starts a little left of the old 1146 px).
export const ART_W = 1240;

// one skin, scaled to cover `boxW` × H, with its focus point on `targetX` (layer coordinates)
function skinLayer(sk, S, CW, H, boxW, targetX, minLeft = -Infinity, maxRight = Infinity) {
  const s = Math.max(H / sk.height, boxW / sk.width) * S.zoom;
  const sw = sk.width * s, sh = sk.height * s;
  let x = targetX - S.focusX * sw;                       // where the picture's left edge goes
  x = Math.min(x, minLeft === -Infinity ? 0 : minLeft);  // the picture must cover its part
  x = Math.max(x, (maxRight === Infinity ? CW : maxRight) - sw);
  const top = Math.max(0, (sh - H) * S.offsetY);
  const layer = canvas(CW, H), lg = layer.getContext('2d');
  lg.imageSmoothingQuality = 'high';
  lg.drawImage(sk, x, -top, sw, sh);
  return layer;
}

const smooth = (g, x0, x1, from, to) => {             // smoothstep gradient between x0 and x1
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 12; i++) { const t = i / 12, k = t * t * (3 - 2 * t); gr.addColorStop(t, `rgba(0,0,0,${from + (to - from) * k})`); }
  return gr;
};

function drawSkin(g, pieces, L) {
  const W = pieces.W, H = REF_H;
  const artW = L.artW || ART_W;
  const X0 = W - artW, CW = W - X0;
  const duo = !!pieces.skin2;
  const FADE = duo ? 170 : 280;                         // soft edge into the profile
  let layer;
  if (duo) {
    // two skins side by side, each fully shown, melting into each other where they meet
    const d = L.duo || {};
    const seam = CW * (d.split ?? 0.56), soft = d.soft ?? 220;
    const first = d.swap ? pieces.skin2 : pieces.skin, second = d.swap ? pieces.skin : pieces.skin2;
    const S1 = d.swap ? L.skin2 : L.skin, S2 = d.swap ? L.skin : L.skin2;
    const leftEnd = seam + soft / 2, rightStart = seam - soft / 2;
    const right = skinLayer(second, S2, CW, H, CW - rightStart, (rightStart + CW) / 2, rightStart, CW);
    const left = skinLayer(first, S1, CW, H, leftEnd, (FADE * 0.6 + leftEnd) / 2, 0, leftEnd);
    const lg = left.getContext('2d');
    lg.globalCompositeOperation = 'destination-in';
    lg.fillStyle = smooth(lg, rightStart, leftEnd, 1, 0);
    lg.fillRect(0, 0, CW, H);
    layer = right;
    const rg = layer.getContext('2d');
    // the right skin fades out where it meets the left one, so neither covers the other
    rg.globalCompositeOperation = 'destination-in';
    rg.fillStyle = smooth(rg, rightStart, leftEnd, 0, 1);
    rg.fillRect(0, 0, CW, H);
    rg.globalCompositeOperation = 'destination-over';
    rg.drawImage(left, 0, 0);
    rg.globalCompositeOperation = 'source-over';
  } else {
    const sk = pieces.skin;
    const target = CW - L.skin.centerFromRight;
    layer = skinLayer(sk, L.skin, CW, H, CW, target, 0, CW);
  }
  // soft left fade into the profile
  const lg = layer.getContext('2d');
  lg.globalCompositeOperation = 'destination-in';
  lg.fillStyle = smooth(lg, 0, FADE, 0, 1);
  lg.fillRect(0, 0, CW, H);
  g.drawImage(layer, X0, 0);

  // light top/bottom vignette on the right side only
  const v = canvas(W, H), vg = v.getContext('2d');
  let gr = vg.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  vg.fillStyle = gr; vg.fillRect(0, 0, W, 60);
  gr = vg.createLinearGradient(0, H - 60, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  vg.fillStyle = gr; vg.fillRect(0, H - 60, W, 60);
  vg.globalCompositeOperation = 'destination-in';
  gr = vg.createLinearGradient(W - (L.artW || ART_W) + 100, 0, W - (L.artW || ART_W) + 350, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
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

// A soft copy of the background under (x, y, w, h): the area is shrunk to a few
// pixels and blown up again, so text and thin lines melt away instead of being
// copied (the old way repeated a strip and could draw long lines across).
function softPatch(base, x, y, w, h) {
  const sw = Math.max(2, Math.round(w / 60)), sh = Math.max(2, Math.round(h / 40));
  const small = canvas(sw, sh), sg = small.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(base, x, y, w, h, 0, 0, sw, sh);
  const p = canvas(w, h), pg = p.getContext('2d');
  pg.imageSmoothingQuality = 'high';
  pg.drawImage(small, 0, 0, w, h);
  return p;
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
  const tilesMoved = Object.values(L.tileOff || {}).some((o) => o && (o.dx || o.dy))
    || Object.values(L.boxOff || {}).some((o) => o && (o.dx || o.dy)) || Object.keys(L.pins || {}).length > 0;
  if (tiles.length && L.groupDX === 0 && L.groupDY === 0 && !tilesMoved) {
    const rows = [...new Set(tiles.map((b) => b.y))].sort((p, q) => p - q);
    const ends = rows.map((ry) => Math.max(...tiles.filter((b) => b.y === ry).map((b) => b.x + b.w)) + 10);
    const lastEnd = ends[ends.length - 1];
    // the "Recent Visits" thumbnails at the bottom
    if (lastEnd < 800) g.drawImage(softPatch(pieces.base, lastEnd, 935, 800 - lastEnd, 85), lastEnd, 935);
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
      const patch = softPatch(pieces.base, x1, py, pw, ph), pg = patch.getContext('2d');
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
  // the number boxes (diamonds, COA, weekly pass) can reach the hero / skin numbers:
  // clear those lines so nothing peeks out half covered
  const nums = boxes.filter((b) => b.group === 'diamonds');
  if (nums.length && Math.max(...nums.map((b) => b.x + b.w)) > 940) {
    const nt = Math.min(...nums.map((b) => b.y)) - 10, nb = Math.max(...nums.map((b) => b.y + b.h)) + 10;
    const hits = [[815, 862], [862, 905], [928, 972], [972, 1020]].filter(([t, b2]) => b2 > nt && t < nb);
    if (hits.length) {
      const px = 900, py = hits[0][0] - 6, pw = 1340 - px, ph = hits[hits.length - 1][1] + 6 - py;
      const patch = softPatch(pieces.base, px, py, pw, ph), pg = patch.getContext('2d');
      pg.globalCompositeOperation = 'destination-in';
      const gx = pg.createLinearGradient(0, 0, pw, 0);
      gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(30 / pw, '#000'); gx.addColorStop(1 - 90 / pw, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
      pg.fillStyle = gx; pg.fillRect(0, 0, pw, ph);
      g.drawImage(patch, px, py);
    }
  }
  [...boxes.filter((b) => b.id !== 'stat1'), ...boxes.filter((b) => b.id === 'stat1')]
    .forEach((b) => (b.kind === 'circle' ? drawCircle(g, b) : drawFramed(g, b)));
  if (highlight) {
    boxes.filter((b) => b.group === highlight || 'box:' + b.key === highlight).forEach((b) => {
      g.save(); g.strokeStyle = '#00e5c0'; g.lineWidth = 4; g.setLineDash([14, 10]);
      g.strokeRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24); g.restore();
    });
  }
  if (watermark) drawWatermark(g, W, H);
  return out;
}

export function hitTest(pieces, L, x, y, one = false) {
  const boxes = computeBoxes(pieces, L).reverse();
  const b = boxes.find((bb) => x >= bb.x - 6 && x <= bb.x + bb.w + 6 && y >= bb.y - 6 && y <= bb.y + bb.h + 6);
  return b ? (one ? 'box:' + b.key : b.group) : null;
}

export function toBlob(c, type = 'image/jpeg', q = 0.95) {
  return new Promise((r) => c.toBlob(r, type, q));
}
