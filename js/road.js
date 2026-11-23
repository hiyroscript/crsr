/* js/road.js */
/* ---- road.js ---- */
/* ============================================================================
   ROAD — the infinite road: one single road built from pieces (straights and
   arcs) on a constant-width centerline. Generated ahead of the Courser and
   freed far behind, so memory stays flat forever.
   - Coordinates: x right, y up; heading h in radians (direction cos h, sin h);
     lateral offset d > 0 is left of the road's direction; curvature k > 0 turns
     left. Arc length s runs along the centerline from the start of the run.
   - Never self-intersects: every candidate piece is sampled and checked
     against the live road (a spatial hash of samples). Two parts of the road
     that are far apart along it must also be far apart in space (clearNear /
     clearFar), and the total turn stays inside a window, so it can't coil up.
   - Difficulty-weighted: the piece table in CONFIG.pieces; a hard corner gets a
     short lead-in straight and is always followed by a breather straight.
   No DOM: the Node tools load this too.
   ========================================================================== */
const ROAD = (function () {
  "use strict";
  const R = CONFIG.road, HW = R.width / 2, PIECES = CONFIG.pieces, DEG = Math.PI / 180, CHECK = 3;

  function create(seed) {
    const road = { seed: seed, rng: U.rng(seed ^ 0x5bd1e995), segs: [], id: 0, s: 0, x: 0, y: 0, h: Math.PI / 2, H: 0,
      grid: U.grid(R.clearFar), needBreather: false, fails: 0, pieces: 0, kinds: {}, stuck: 0, maxS: 0, backtracks: 0 };
    append(road, [{ k: 0, len: R.startStraight }], "start", false);
    return road;
  }

  /* ---------------- segment maths ---------------- */
  function evalSeg(seg, t, out) {
    out = out || {};
    if (seg.k === 0) { out.x = seg.x0 + Math.cos(seg.h0) * t; out.y = seg.y0 + Math.sin(seg.h0) * t; out.h = seg.h0; }
    else { const h = seg.h0 + seg.k * t, r = 1 / seg.k; out.x = seg.cx + Math.sin(h) * r; out.y = seg.cy - Math.cos(h) * r; out.h = h; }
    out.k = seg.k; return out;
  }
  function setCenter(seg) { if (seg.k !== 0) { const r = 1 / seg.k; seg.cx = seg.x0 - Math.sin(seg.h0) * r; seg.cy = seg.y0 + Math.cos(seg.h0) * r; } }
  /* projection of (x, y) on one segment: t along it (may fall outside [0, len]) and lateral d */
  function projectSeg(seg, x, y, out) {
    if (seg.k === 0) {
      const c = Math.cos(seg.h0), s = Math.sin(seg.h0), dx = x - seg.x0, dy = y - seg.y0;
      out.t = dx * c + dy * s; out.d = c * dy - s * dx;
    } else {
      const vx = x - seg.cx, vy = y - seg.cy, rr = Math.hypot(vx, vy), rad = 1 / Math.abs(seg.k), sg = seg.k > 0 ? 1 : -1;
      const h = Math.atan2(vy, vx) + sg * Math.PI / 2, mid = seg.h0 + seg.k * seg.len / 2;
      out.t = seg.len / 2 + U.wrap(h - mid) / seg.k; out.d = sg * (rad - rr);
    }
    return out;
  }

  /* ---------------- building the road ---------------- */
  function makeSeg(road, k, len, kind, hard, group) {
    const seg = { id: road.id++, kind: kind, hard: hard, group: group, s0: road.s, s1: road.s + len, len: len, k: k,
      x0: road.x, y0: road.y, h0: road.h, cx: 0, cy: 0, x1: 0, y1: 0, h1: 0, pts: null, samples: [],
      minx: 0, miny: 0, maxx: 0, maxy: 0, scen: null, scenAt: 0, cw: null, gfx: null };
    setCenter(seg);
    const e = evalSeg(seg, len); seg.x1 = e.x; seg.y1 = e.y; seg.h1 = e.h;
    const n = Math.max(1, Math.ceil(len / R.step)), pts = new Float64Array((n + 1) * 2), p = {};
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i <= n; i++) {
      evalSeg(seg, len * i / n, p); pts[i * 2] = p.x; pts[i * 2 + 1] = p.y;
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
    }
    const m = HW + R.sidewalk + 1;
    seg.pts = pts; seg.minx = minx - m; seg.miny = miny - m; seg.maxx = maxx + m; seg.maxy = maxy + m;
    return seg;
  }
  function append(road, prims, kind, hard) {
    const group = road.pieces++, p = {};
    road.kinds[kind] = (road.kinds[kind] || 0) + 1;
    for (const pr of prims) {
      const seg = makeSeg(road, pr.k, pr.len, kind, hard && pr.k !== 0, group);
      road.segs.push(seg);
      /* clearance samples every CHECK units */
      for (let t = 0; t < pr.len + 1e-6; t += CHECK) {
        evalSeg(seg, Math.min(t, pr.len), p);
        const q = { x: p.x, y: p.y, s: seg.s0 + Math.min(t, pr.len), seg: seg };
        road.grid.add(q); seg.samples.push(q);
      }
      road.x = seg.x1; road.y = seg.y1; road.h = seg.h1; road.H += pr.k * pr.len; road.s = seg.s1;
    }
    if (road.s > road.maxS + 1) { road.maxS = road.s; road.stuck = 0; }
  }
  /* does this run of primitives fit after the frontier? (heading window + clearance against the live road and itself) */
  function fits(road, prims) {
    const seg = { x0: road.x, y0: road.y, h0: road.h, k: 0, cx: 0, cy: 0 }, p = {}, cand = [];
    let H = road.H, s = road.s;
    const nearSq = R.clearNear * R.clearNear, farSq = R.clearFar * R.clearFar;
    for (const pr of prims) {
      seg.k = pr.k; setCenter(seg);
      /* the heading window, checked at the end of each primitive (arcs are monotonic) */
      H += pr.k * pr.len; if (Math.abs(H) > R.headingWindow) return false;
      for (let t = CHECK; t < pr.len + CHECK - 1e-6; t += CHECK) {
        const tt = Math.min(t, pr.len); evalSeg(seg, tt, p);
        const sp = s + tt, px = p.x, py = p.y;
        const bad = road.grid.query(px, py, R.clearFar, function (q) {
          const sep = sp - q.s, need = sep > R.arcFar ? farSq : sep > R.arcNear ? nearSq : 0;
          if (!need) return false;
          const dx = q.x - px, dy = q.y - py; return dx * dx + dy * dy < need;
        });
        if (bad) return false;
        for (let i = 0; i < cand.length; i += 3) {
          const sep = sp - cand[i + 2], need = sep > R.arcFar ? farSq : sep > R.arcNear ? nearSq : 0;
          if (!need) continue;
          const dx = cand[i] - px, dy = cand[i + 1] - py; if (dx * dx + dy * dy < need) return false;
        }
        cand.push(px, py, sp);
      }
      evalSeg(seg, pr.len, p); seg.x0 = p.x; seg.y0 = p.y; seg.h0 = p.h; s += pr.len;
    }
    return true;
  }
  /* one piece of the given type, turning left (dir 1) or right (dir -1) */
  function build(pc, r, dir) {
    const rad = pc.r ? r.range(pc.r[0], pc.r[1]) : 0, a = pc.a ? r.range(pc.a[0], pc.a[1]) * DEG : 0;
    switch (pc.k) {
      case "straight": return [{ k: 0, len: r.range(pc.len[0], pc.len[1]) }];
      case "scurve": return [{ k: dir / rad, len: a * rad }, { k: 0, len: r.range(0, 8) }, { k: -dir / rad, len: a * rad }];
      case "chicane": return [{ k: dir / rad, len: a * rad }, { k: -dir / rad, len: 2 * a * rad }, { k: dir / rad, len: a * rad }];
      default: return [{ k: dir / rad, len: a * rad }];
    }
  }
  function mirror(prims) { return prims.map(function (p) { return { k: -p.k, len: p.len }; }); }
  /* a piece is only taken if the road can still go on after it (one step of look-ahead), so it never drives into a pocket */
  const ESC = [[{ k: 0, len: 50 }], [{ k: 1 / 60, len: 42 }, { k: 0, len: 24 }], [{ k: -1 / 60, len: 42 }, { k: 0, len: 24 }]];
  function fitsOn(road, prims) {
    for (const e of ESC) if (fits(road, prims.concat(e))) return true;
    return false;
  }
  const HARD = {}; PIECES.forEach(function (p) { if (p.hard) HARD[p.k] = true; });
  /* ctx: { D(s) predicted difficulty, v(s) predicted cruise speed at arc length s, minS: the road before this can't change } */
  function gen(road, ctx) {
    const D = ctx.D(road.s), v = ctx.v(road.s), r = road.rng;
    if (road.needBreather) {
      road.needBreather = false;
      const b = [{ k: 0, len: Math.max(18, v * R.breather) }];
      if (fitsOn(road, b)) { append(road, b, "breather", false); return; }
    }
    for (let i = 0; i < R.tries; i++) {
      const pc = U.weighted(r, PIECES, function (q) { return D < (q.from || 0) ? 0 : U.lerp(q.w0, q.w1, D); });
      /* turn back toward the road's overall direction more often than away from it */
      const dir = r() < 1 / (1 + Math.exp(road.H * 1.4)) ? 1 : -1;
      let prims = build(pc, r, dir);
      if (pc.hard) prims = [{ k: 0, len: R.leadIn }].concat(prims);
      const alt = mirror(prims);
      const ok = fitsOn(road, prims) ? prims : pc.k !== "straight" && fitsOn(road, alt) ? alt : null;
      if (ok) { append(road, ok, pc.k, !!pc.hard); if (pc.hard) road.needBreather = true; return; }
    }
    /* fallbacks: a gentle bend back toward the overall direction, straights, gentle bends either way */
    const back = road.H > 0 ? -1 : 1, fb = [[{ k: back / 60, len: 40 }], [{ k: 0, len: 30 }], [{ k: back / 40, len: 30 }],
      [{ k: -back / 60, len: 30 }], [{ k: back / 25, len: 25 }], [{ k: -back / 25, len: 25 }], [{ k: 0, len: 12 }]];
    for (const f of fb) if (fitsOn(road, f)) { append(road, f, "fallback", false); return; }
    /* stuck: take back the last piece if nobody has seen it yet (no scenery, no puddles, far ahead) and try again */
    road.stuck++;
    const depth = Math.min(6, 1 + Math.floor(road.stuck / 3));   /* the longer it stays stuck, the further back it goes */
    let popped = 0;
    for (let i = 0; i < depth; i++) {
      const last = road.segs[road.segs.length - 1];
      if (road.segs.length > 3 && last.s0 >= (ctx.minS || 0) && !last.scen) { unappend(road); popped++; } else break;
    }
    if (popped) { road.backtracks += popped; return; }
    road.fails++; append(road, [{ k: 0, len: 10 }], "forced", false);
  }
  function unappend(road) {
    const g = road.segs[road.segs.length - 1].group;
    let first = null;
    while (road.segs.length && road.segs[road.segs.length - 1].group === g) {
      const seg = road.segs.pop(); first = seg;
      for (const q of seg.samples) road.grid.remove(q);
      road.H -= seg.k * seg.len;
    }
    road.kinds[first.kind]--;
    road.x = first.x0; road.y = first.y0; road.h = first.h0; road.s = first.s0;
    road.needBreather = !!HARD[road.segs[road.segs.length - 1].kind];
  }
  /* budget: at most `budget` generation attempts per call, so a hard spot is spread over several frames */
  function extend(road, sTarget, ctx, budget) { let n = 0; budget = budget || 6; while (road.s < sTarget && n++ < budget) gen(road, ctx); }

  /* free pieces far behind (in arc length) that are also far from (x, y) in space */
  function dropOld(road, sC, x, y, onDrop) {
    const rr = R.dropRadius * R.dropRadius;
    while (road.segs.length > 2) {
      const seg = road.segs[0];
      if (sC - seg.s1 < R.dropBehind) break;
      const dx = Math.max(seg.minx - x, 0, x - seg.maxx), dy = Math.max(seg.miny - y, 0, y - seg.maxy);
      if (dx * dx + dy * dy < rr) break;
      road.segs.shift();
      for (const q of seg.samples) road.grid.remove(q);
      seg.samples.length = 0;
      if (onDrop) onDrop(seg);
    }
  }

  /* ---------------- queries ---------------- */
  function indexOfS(road, s) {
    const a = road.segs; let lo = 0, hi = a.length - 1;
    if (s <= a[0].s0) return 0; if (s >= a[hi].s0) return hi;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m].s0 <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  function segAt(road, s) { return road.segs[indexOfS(road, s)]; }
  /* the centerline pose at arc length s (clamped to the live road): x, y, h, k, and the left normal nx, ny */
  function pose(road, s, out) {
    const seg = segAt(road, s); out = evalSeg(seg, U.clamp(s - seg.s0, 0, seg.len), out || {});
    out.nx = -Math.sin(out.h); out.ny = Math.cos(out.h); out.seg = seg; return out;
  }
  const tmp = {};
  /* nearest point of the road to (x, y), searched round a hint segment id (the car's last one), so a parallel
     stretch of road after a U-turn is never mistaken for the one you are on. out: s, d, h, k, seg, id */
  function project(road, x, y, hintId, out) {
    out = out || {};
    const a = road.segs, first = a[0].id;
    const i0 = U.clamp((hintId === undefined || hintId === null ? first : hintId) - first, 0, a.length - 1);
    let best = Infinity;
    for (let i = Math.max(0, i0 - 2); i <= Math.min(a.length - 1, i0 + 3); i++) {
      const seg = a[i]; projectSeg(seg, x, y, tmp);
      const over = tmp.t < 0 ? -tmp.t : tmp.t > seg.len ? tmp.t - seg.len : 0, score = Math.abs(tmp.d) + over * 3;
      if (score < best) {
        best = score; out.seg = seg; out.id = seg.id;
        if (!over) { out.s = seg.s0 + tmp.t; out.d = tmp.d; const h = seg.k === 0 ? seg.h0 : seg.h0 + seg.k * tmp.t; out.h = h; out.k = seg.k; }
        else {
          /* past an end: along that end's tangent line */
          const atEnd = tmp.t > seg.len, ex = atEnd ? seg.x1 : seg.x0, ey = atEnd ? seg.y1 : seg.y0, eh = atEnd ? seg.h1 : seg.h0;
          const c = Math.cos(eh), sn = Math.sin(eh), dx = x - ex, dy = y - ey;
          out.s = (atEnd ? seg.s1 : seg.s0) + dx * c + dy * sn; out.d = c * dy - sn * dx; out.h = eh; out.k = seg.k;
        }
      }
    }
    return out;
  }

  /* move everything by (-dx, -dy): keeps coordinates small on very long runs */
  function shift(road, dx, dy) {
    road.x -= dx; road.y -= dy; road.grid.clear();
    for (const seg of road.segs) {
      seg.x0 -= dx; seg.y0 -= dy; seg.x1 -= dx; seg.y1 -= dy; seg.cx -= dx; seg.cy -= dy;
      seg.minx -= dx; seg.maxx -= dx; seg.miny -= dy; seg.maxy -= dy;
      for (let i = 0; i < seg.pts.length; i += 2) { seg.pts[i] -= dx; seg.pts[i + 1] -= dy; }
      for (const q of seg.samples) { q.x -= dx; q.y -= dy; road.grid.add(q); }
      seg.gfx = null;
    }
  }

  return { HW: HW, create: create, extend: extend, dropOld: dropOld, pose: pose, project: project, segAt: segAt, indexOfS: indexOfS,
    evalSeg: evalSeg, projectSeg: projectSeg, shift: shift, fits: fits, append: append };
})();
