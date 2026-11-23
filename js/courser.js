/* js/courser.js */
/* ---- courser.js ---- */
/* ============================================================================
   COURSER — the player's car. It drives forward by itself; the player only
   steers. Turning is set as a curvature (1 / radius), not a turn rate, so a
   corner has the same shape at every speed: a held drift (kDrift) is always
   tighter than the tightest corner the generator makes, at every speed tier.
   - Tap: a gentle turn (kTap), at least minTap long.
   - Hold past driftAfter: the curvature ramps up to kDrift, the rear slides
     out (slip, view-only), tire smoke and skid marks (render.js).
   - Road assist: with no input, the heading eases toward the road's direction
     while it is within assistWindow of it. It removes wobble; it never takes a
     corner for you.
   - Soft edges: the hitbox can't leave the road. Touching an edge pushes the
     car back, turns it along the edge and costs a little speed, with sparks.
   dir: -1 left, 0 none, +1 right (after the oil swap, which world.js applies).
   No DOM: the Node tools load this too.
   ========================================================================== */
const COURSER = (function () {
  "use strict";
  const C = CONFIG.car, E = C.edge, HW = CONFIG.road.width / 2, SP = CONFIG.speed;
  const P = {}, Q = {};

  function create(w, s) {
    const p = ROAD.pose(w.road, s);
    const c = { x: p.x, y: p.y, h: p.h, slip: 0, v: 0, k: 0, s: s, d: 0, seg: p.seg.id, roadH: p.h, roadK: 0, dsdt: 0,
      hold: 0, dirPrev: 0, tapDir: 0, tapLeft: 0, sinceInput: 9, steer: 0, drift: false, driftT: 0, dirty: false,
      touching: false, cx: 0, cy: 0, spin: 0, px: 0, py: 0, ph: 0, pslip: 0 };
    save(c); return c;
  }
  function save(c) { c.px = c.x; c.py = c.y; c.ph = c.h; c.pslip = c.slip; }

  function step(c, w, dir, dt) {
    save(c);
    const cruise = w.cruise(), live = w.mode === "run";
    /* speed: back up to cruise after any slowdown, faster at higher tiers so a hit costs about the same time */
    if (!live) c.v = Math.max(0, c.v - c.v * 2.2 * dt);
    else if (c.v < cruise) c.v = Math.min(cruise, c.v + SP.accel * Math.pow(cruise / SP.base, 1.5) * dt);
    else c.v = Math.max(cruise, c.v - SP.decel * dt);

    /* input -> steering: a new press starts a tap that lasts at least minTap; holding past driftAfter drifts */
    let st = 0;
    if (!live) dir = 0;
    if (dir !== 0) {
      if (dir !== c.dirPrev) { c.hold = 0; c.tapDir = dir; c.tapLeft = C.minTap; }
      c.hold += dt; st = dir;
    } else { c.hold = 0; if (c.tapLeft > 0) st = c.tapDir; }
    c.tapLeft = Math.max(0, c.tapLeft - dt); c.dirPrev = dir; c.steer = st;
    c.sinceInput = st !== 0 ? 0 : c.sinceInput + dt;
    const scale = Math.pow(Math.max(cruise, SP.base) / SP.base, C.speedScale);
    let kt = 0; const drift = st !== 0 && c.hold >= C.driftAfter;
    if (st !== 0) {
      kt = -st * (C.kTap + (C.kDrift - C.kTap) * U.clamp((c.hold - C.driftAfter) / C.driftRamp, 0, 1)) * scale;
      if (live && dir !== 0) kt = cornerAssist(c, w, -st, kt, scale);
    }
    c.k = U.damp(c.k, kt, C.steerLag, dt);
    c.h += c.v * c.k * dt;

    /* road assist: only with no input, only close to the road's direction */
    if (st === 0 && c.sinceInput > C.assistDelay && live) {
      const dh = U.wrap(c.roadH - c.h), wgt = U.clamp(1 - Math.abs(dh) / C.assistWindow, 0, 1);
      c.h += dh * wgt * (1 - Math.exp(-dt / C.assist));
    }
    c.x += Math.cos(c.h) * c.v * dt; c.y += Math.sin(c.h) * c.v * dt;

    /* drift bookkeeping (clean drift bonus) and the rear sliding out */
    if (drift && !c.drift) { c.driftT = 0; c.dirty = false; }
    if (drift) c.driftT += dt;
    if (!drift && c.drift && c.driftT >= CONFIG.score.cleanDriftTime && !c.dirty && live) w.bonus("cleanDrift", c.x, c.y);
    c.drift = drift;
    c.slip = U.damp(c.slip, drift ? Math.sign(kt) * C.slip * Math.min(1, c.v / SP.base) : 0, C.slipLag, dt);
    if (c.spin) c.slip += c.spin * dt;

    /* where on the road, then the soft edges */
    const s0 = c.s;
    ROAD.project(w.road, c.x, c.y, c.seg, P); c.seg = P.id;
    edges(c, w, dt);
    ROAD.project(w.road, c.x, c.y, c.seg, P);
    c.seg = P.id; c.s = P.s; c.d = P.d; c.roadH = P.h; c.roadK = P.k;
    c.dsdt = (c.s - s0) / dt;
  }

  /* corner assist (CONFIG.car.corner): holding toward a tight bend follows it and pulls toward its middle */
  const CA = C.corner;
  function cornerAssist(c, w, sg, kt, scale) {
    const segs = w.road.segs, first = segs[0].id, reach = c.s + c.v * CA.ahead;
    let near = false, kHere = 0, exit = false;
    /* just out of a bend that way (exitGrace seconds): still on the line, so a late release is forgiven */
    const cur = c.seg - first, prev = cur > 0 ? segs[cur - 1] : null;
    if (prev && prev.k * sg >= CA.minK && segs[cur].k * sg < CA.minK && c.s - prev.s1 < c.v * CA.exitGrace) { near = true; exit = true; }
    for (let i = Math.max(0, cur); i < segs.length && segs[i].s0 <= reach; i++) {
      const seg = segs[i];
      if (seg.k * sg >= CA.minK) { near = true; if (c.s >= seg.s0 && c.s <= seg.s1) kHere = seg.k; }
      else if (seg.k * sg < 0 && Math.abs(seg.k) >= CA.minK && seg.s0 > c.s) break;   /* a bend the other way comes first */
    }
    if (!near) return kt;
    const kc = kHere - CA.k1 * c.d - CA.k2 * U.wrap(c.h - c.roadH);
    return sg * U.clamp(sg * kc, exit && !kHere ? 0 : C.kTap * CA.minShare * scale, C.kDrift * scale);
  }

  /* the capsule's two end centres against both road edges; the deepest one decides */
  function edges(c, w, dt) {
    const rad = C.hitW / 2, hl = C.hitL / 2 - rad, bh = c.h + c.slip, bx = Math.cos(bh) * hl, by = Math.sin(bh) * hl;
    let worst = 0, side = 0, nx = 0, ny = 0, rh = 0, ex = 0, ey = 0;
    for (let e = -1; e <= 1; e += 2) {
      const px = c.x + bx * e, py = c.y + by * e;
      ROAD.project(w.road, px, py, c.seg, Q);
      const pen = Math.abs(Q.d) + rad - HW;
      if (pen > worst) { worst = pen; side = Q.d > 0 ? 1 : -1; nx = -Math.sin(Q.h); ny = Math.cos(Q.h); rh = Q.h; ex = px; ey = py; }
    }
    if (worst <= 0) { c.touching = false; return; }
    /* push back onto the road */
    c.x -= nx * side * worst; c.y -= ny * side * worst;
    const a = U.wrap(c.h - rh), into = a * side > 0 ? Math.abs(Math.sin(a)) : 0;
    if (!c.touching) {
      c.v *= 1 - (E.base + E.impact * into);
      c.dirty = true;
      w.emit({ e: "scrape", x: ex + nx * side * rad, y: ey + ny * side * rad, power: into });
    }
    c.v *= 1 - E.scrape * dt;
    /* turn back along the edge */
    if (a * side > 0) c.h -= a * E.deflect;
    c.touching = true; c.cx = ex + nx * side * (rad - worst * .5); c.cy = ey + ny * side * (rad - worst * .5); c.side = side;
  }
  function shift(c, dx, dy) { c.x -= dx; c.y -= dy; c.px -= dx; c.py -= dy; c.cx -= dx; c.cy -= dy; }
  return { create: create, step: step, shift: shift };
})();
