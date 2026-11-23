/* js/scenery.js */
/* ---- scenery.js ---- */
/* ============================================================================
   SCENERY — the city round the road, decoration only (nothing collides).
   Placed per road piece from a seed (road seed × piece id), so it never repeats
   in an obvious way and the same seed gives the same city. Each piece gets its
   scenery once the road is known CONFIG.road.sceneryLag past it; every item is
   checked against the live road (it may not touch any asphalt or sidewalk) and
   against the other items. Items also stay within MAXOUT of their own piece,
   and any road generated later keeps clearFar from that piece, so later road
   can never run through a building.
   Items: b building, p park, l parking lot, z plaza, t tree, c parked car, m streetlight.
   No DOM: the renderer turns these into cached paths the first time a piece is on screen.
   ========================================================================== */
const SCENERY = (function () {
  "use strict";
  const R = CONFIG.road, HW = R.width / 2, EDGE = HW + R.sidewalk, MAXOUT = R.clearFar - EDGE - 2.5, MAXR = 16;
  const ROOFS = 12, CARS = 6;
  const KINDS = [{ k: "b", w: 64 }, { k: "p", w: 9 }, { k: "l", w: 8 }, { k: "z", w: 6 }, { k: "gap", w: 4 }];

  function corners(it) {
    const c = Math.cos(it.a), s = Math.sin(it.a), hw = it.w / 2, hl = it.l / 2;
    return [it.x + c * hw - s * hl, it.y + s * hw + c * hl, it.x - c * hw - s * hl, it.y - s * hw + c * hl,
      it.x - c * hw + s * hl, it.y - s * hw - c * hl, it.x + c * hw + s * hl, it.y + s * hw - c * hl];
  }
  /* distance from a point to an oriented box (0 inside) */
  function distBox(it, px, py) {
    const c = Math.cos(it.a), s = Math.sin(it.a), dx = px - it.x, dy = py - it.y;
    const u = Math.abs(dx * c + dy * s) - it.w / 2, v = Math.abs(-dx * s + dy * c) - it.l / 2;
    const ou = Math.max(u, 0), ov = Math.max(v, 0);
    return Math.hypot(ou, ov) + Math.min(Math.max(u, v), 0);
  }
  /* separating axis test between two oriented boxes, with a little air */
  function boxesHit(a, b, air) {
    const ca = corners(a), cb = corners(b), axes = [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2];
    for (const ang of axes) {
      const ax = Math.cos(ang), ay = Math.sin(ang);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let i = 0; i < 8; i += 2) { const p = ca[i] * ax + ca[i + 1] * ay; if (p < a0) a0 = p; if (p > a1) a1 = p; const q = cb[i] * ax + cb[i + 1] * ay; if (q < b0) b0 = q; if (q > b1) b1 = q; }
      if (a1 + air < b0 || b1 + air < a0) return false;
    }
    return true;
  }
  function hits(it, other, air) {
    const box1 = it.w !== undefined, box2 = other.w !== undefined;
    if (box1 && box2) return boxesHit(it, other, air);
    if (box1) return distBox(it, other.x, other.y) < other.r + air;
    if (box2) return distBox(other, it.x, it.y) < it.r + air;
    return Math.hypot(it.x - other.x, it.y - other.y) < it.r + other.r + air;
  }
  /* is the item clear of every live road by at least `clear` from its centerline, and of other items? */
  function free(road, it, clear, air) {
    const reach = it.r + clear + 2;
    const blocked = road.grid.query(it.x, it.y, reach, function (q) {
      const d = it.w !== undefined ? distBox(it, q.x, q.y) : Math.hypot(q.x - it.x, q.y - it.y) - it.r;
      return d < clear;
    });
    if (blocked) return false;
    return !road.sgrid.query(it.x, it.y, it.r + MAXR, function (o) { return o !== it && hits(it, o, air); });
  }
  /* every corner within MAXOUT of the piece's own centerline samples */
  function nearOwn(seg, it) {
    const pts = it.w !== undefined ? corners(it) : [it.x, it.y];
    const sm = seg.samples, lim = (MAXOUT - (it.w !== undefined ? 0 : it.r)) * (MAXOUT - (it.w !== undefined ? 0 : it.r));
    for (let i = 0; i < pts.length; i += 2) {
      let best = Infinity;
      for (const q of sm) { const dx = q.x - pts[i], dy = q.y - pts[i + 1], d = dx * dx + dy * dy; if (d < best) best = d; }
      if (best > lim) return false;
    }
    return true;
  }
  function box(t, x, y, a, w, l) { return { t: t, x: x, y: y, a: a, w: w, l: l, r: Math.hypot(w, l) / 2 }; }
  function add(road, seg, list, it) { list.push(it); road.sgrid.add(it); it.seg = seg.id; return it; }

  function place(road, seg, now) {
    if (!road.sgrid) road.sgrid = U.grid(16);
    const r = U.rng((road.seed * 31 + seg.id * 7919) >>> 0), list = [], p = {};
    const at = function (t, off, side) { ROAD.evalSeg(seg, t, p); return { x: p.x - Math.sin(p.h) * off * side, y: p.y + Math.cos(p.h) * off * side, h: p.h }; };
    for (const side of [1, -1]) {
      const inner = seg.k * side > 0, maxOff = inner ? Math.min(MAXOUT, .85 / Math.abs(seg.k)) : MAXOUT;
      /* first row: buildings, parks, lots and plazas facing the road */
      if (maxOff >= EDGE + 3) blocks(road, seg, list, r, side, maxOff, at);
      /* street furniture on the sidewalk: trees in pits and streetlights by the curb */
      for (let t = r.range(2, 7); t < seg.len - 1; t += r.range(8, 13)) {
        if (r() < .72) { const rr = r.range(.95, 1.12), q = at(t, EDGE - .95, side), it = { t: "t", x: q.x, y: q.y, r: rr, v: Math.floor(r() * 6) };
          if (free(road, it, HW + .25, .05)) add(road, seg, list, it); }
      }
      for (let t = r.range(4, 12); t < seg.len - 1; t += r.range(15, 22)) {
        const q = at(t, HW + .6, side), it = { t: "m", x: q.x, y: q.y, r: .35, a: q.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2) };
        if (free(road, it, HW + .2, .2)) add(road, seg, list, it);
      }
    }
    /* a zebra crossing on some straights */
    if (seg.k === 0 && seg.len >= 26 && r() < .35) seg.cw = [r.range(8, seg.len - 8)];
    seg.scen = list; seg.scenAt = now;
    /* grow the piece's box so culling sees its scenery */
    for (const it of list) { const rr = it.r; seg.minx = Math.min(seg.minx, it.x - rr); seg.maxx = Math.max(seg.maxx, it.x + rr); seg.miny = Math.min(seg.miny, it.y - rr); seg.maxy = Math.max(seg.maxy, it.y + rr); }
  }
  /* the blocks along one side: buildings (with a second row behind where there is room), parks, lots, plazas */
  function blocks(road, seg, list, r, side, maxOff, at) {
    let t = r.range(0, 3);
    while (t < seg.len - 3) {
      const kind = U.weighted(r, KINDS, function (k) { return k.w; }).k;
      const f = kind === "b" ? r.range(6, 13) : kind === "gap" ? r.range(2, 6) : r.range(12, 22);
      if (t + f > seg.len) break;
      if (kind !== "gap") {
        const sb = kind === "b" ? r.range(.5, 1.5) : .6, off0 = EDGE + sb;
        let l = kind === "b" ? r.range(7, 16) : kind === "l" ? r.range(9, 13) : r.range(10, 18);
        l = Math.min(l, maxOff - off0);
        if (l >= 4) {
          const q = at(t + f / 2, off0 + l / 2, side), it = box(kind, q.x, q.y, q.h, f - .6, l);
          if (free(road, it, EDGE + .45, .6) && nearOwn(seg, it)) {
            add(road, seg, list, it); fill(road, seg, list, it, r, side);
            /* second row behind it, where there is room */
            const off1 = off0 + l + r.range(1.4, 3.2), l2 = Math.min(r.range(7, 17), maxOff - off1);
            if (kind === "b" && l2 >= 5 && r() < .95) {
              const q2 = at(t + f / 2, off1 + l2 / 2, side), it2 = box("b", q2.x, q2.y, q2.h, r.range(f * .7, f * 1.25), l2);
              if (free(road, it2, EDGE + .45, .6) && nearOwn(seg, it2)) { add(road, seg, list, it2); fill(road, seg, list, it2, r, side); }
            }
          }
        }
      }
      t += f + r.range(.4, 1.4);
    }
  }
  /* what goes on or in a block: roof details, park trees, parked cars, a fountain */
  function fill(road, seg, list, it, r, side) {
    if (it.t === "b") {
      it.hgt = r.range(.5, 3.2); it.c = Math.floor(r() * ROOFS); it.det = [];
      const n = Math.floor(r.range(1, 5));
      for (let i = 0; i < n; i++) {
        const kind = U.weighted(r, [{ k: "ac", w: 4 }, { k: "tank", w: 1.4 }, { k: "sky", w: 1.5 }, { k: "vent", w: 2 }], function (k) { return k.w; }).k;
        const sz = kind === "tank" ? r.range(.9, 1.5) : kind === "sky" ? r.range(1.2, 2.2) : r.range(.6, 1.1);
        it.det.push([kind, r.range(-it.w / 2 + 1 + sz, it.w / 2 - 1 - sz), r.range(-it.l / 2 + 1 + sz, it.l / 2 - 1 - sz), sz]);
      }
      if (r() < .35) it.det.push(["stair", r.range(-it.w / 2 + 1.5, it.w / 2 - 1.5), r.range(-it.l / 2 + 1.5, it.l / 2 - 1.5), 1]);
    } else if (it.t === "p") {
      const c = Math.cos(it.a), s = Math.sin(it.a), n = Math.floor(it.w * it.l / 28);
      it.path = r() < .7 ? r.range(-it.w / 4, it.w / 4) : null;
      for (let i = 0; i < n; i++) {
        const u = r.range(-it.w / 2 + 1.6, it.w / 2 - 1.6), v = r.range(-it.l / 2 + 1.6, it.l / 2 - 1.6);
        if (it.path !== null && Math.abs(u - it.path) < 2) continue;
        const tr = { t: "t", x: it.x + c * u - s * v, y: it.y + s * u + c * v, r: r.range(1.1, 1.9), v: Math.floor(r() * 6) };
        if (!road.sgrid.query(tr.x, tr.y, tr.r + 2, function (o) { return o.t === "t" && Math.hypot(o.x - tr.x, o.y - tr.y) < o.r + tr.r - .6; })) add(road, seg, list, tr);
      }
    } else if (it.t === "l") {
      const c = Math.cos(it.a), s = Math.sin(it.a), slots = Math.max(2, Math.floor((it.w - 1) / 3)); it.n = slots;
      const v = -side * (it.l / 2 - 2.6);   /* cars nose-in along the back of the lot */
      for (let i = 0; i < slots; i++) if (r() < .62) {
        const u = -it.w / 2 + 1 + (i + .5) * (it.w - 2) / slots;
        list.push({ t: "c", x: it.x + c * u - s * v, y: it.y + s * u + c * v, a: it.a + Math.PI / 2 * (r() < .5 ? 1 : -1), c: Math.floor(r() * CARS), r: 2, seg: seg.id });
      }
    } else if (it.t === "z") { it.f = r.range(1.6, Math.min(it.w, it.l) / 3.2); it.c = Math.floor(r() * 3); }
  }
  function drop(road, seg) { if (seg.scen) for (const it of seg.scen) if (it._gk !== undefined) road.sgrid.remove(it); seg.scen = null; }
  function shift(road, dx, dy) {
    if (!road.sgrid) return; road.sgrid.clear();
    for (const seg of road.segs) if (seg.scen) for (const it of seg.scen) { it.x -= dx; it.y -= dy; if (it._gk !== undefined) road.sgrid.add(it); }
  }
  return { place: place, drop: drop, shift: shift, ROOFS: ROOFS, CARS: CARS, MAXOUT: MAXOUT, corners: corners };
})();
