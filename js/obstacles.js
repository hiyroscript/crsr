/* js/obstacles.js */
/* ---- obstacles.js ---- */
/* ============================================================================
   OBST — puddles on the road, data-driven. A type lives in
   CONFIG.obstacles.types (size, slowdown, effect, sound, vibration); its effect
   is one function in EFFECTS below; its look is one function in render.js
   (RENDER.OBSTACLE_LOOKS). New types (cones, barriers, potholes) need only those three.
   Every hit acts like hitting a rock: a strong, sudden speed loss, so the
   Guard closes in. Effects refresh their timer, they never stack.
   Placement is fair: puddles sit against one edge (the other side always has
   room for the car), staggered puddles are spaced by reaction time at the
   speed they will be met, and none sit on or just before a hard corner.
   No DOM: the Node tools load this too.
   ========================================================================== */
const OBST = (function () {
  "use strict";
  const C = CONFIG.obstacles, HW = CONFIG.road.width / 2, CAR = CONFIG.car;
  const TYPES = {}; C.types.forEach(function (t) { TYPES[t.k] = t; });
  const EFFECTS = {
    /* water: the screen gets splashed for dur seconds (render.js draws it) */
    splash: function (w, o, ty) { w.fx.splash = ty.dur; w.fx.splashDur = ty.dur; w.fx.splashSeed = o.id; },
    /* oil: left and right swap for dur seconds; a second slick refreshes the timer, it never swaps back */
    reverse: function (w, o, ty) { w.fx.reverse = ty.dur; w.fx.reverseDur = ty.dur; },
    none: function () {}
  };

  /* ---------------- placement ---------------- */
  function clearOfCorners(w, s, v) {
    const road = w.road, a = road.segs, ahead = C.cornerClear + C.cornerSecs * v;
    if (s > road.s - 12) return false;
    for (let i = ROAD.indexOfS(road, s - C.afterCorner); i < a.length && a[i].s0 < s + ahead; i++) {
      const seg = a[i];
      if (seg.hard) return false;
      if (s >= seg.s0 && s <= seg.s1 && Math.abs(seg.k) > C.maxK) return false;
    }
    return true;
  }
  function place(w) {
    const road = w.road, r = w.orng;
    let n = 0;
    while (w.obsS < road.s - 160 && n++ < 40) {
      const s = w.obsS, D = w.predD(s), v = w.predV(s), sc = w.predScore(s);
      const pat = U.weighted(r, C.patterns, function (p) { return D < (p.from || 0) ? 0 : U.lerp(p.w0, p.w1, D); });
      const gap = Math.max(C.minGap, C.react * v), side = r.sign();
      const spots = pat.k === "single" ? [[0, side]] : pat.k === "row" ? [[0, side], [C.rowGap, side]]
        : pat.k === "slalom2" ? [[0, side], [gap, -side]] : [[0, side], [gap, -side], [gap * 2, side]];
      let ok = true;
      for (const sp of spots) if (!clearOfCorners(w, s + sp[0], v)) { ok = false; break; }
      if (!ok) { w.obsS += 8; continue; }
      for (const sp of spots) {
        const ty = U.weighted(r, C.types, function (t) { return sc < t.from ? 0 : U.lerp(t.w0, t.w1, D); });
        spawn(w, ty, s + sp[0], sp[1], r);
      }
      w.obsS = s + spots[spots.length - 1][0] + U.lerp(C.spacing[0], C.spacing[1], D) * Math.sqrt(v / CONFIG.speed.base) * r.range(.8, 1.25);
    }
  }
  const P = {};
  function spawn(w, ty, s, side, r) {
    const o = w.obsPool.pop() || {};
    const ra = ty.ra * r.range(.9, 1.1), rc = ty.rc * r.range(.92, 1.05);
    const d = side * (HW - rc - .15 - r.range(0, .3));
    ROAD.pose(w.road, s, P);
    o.id = w.oid++; o.k = ty.k; o.ty = ty; o.s = s; o.d = d; o.side = side; o.ra = ra; o.rc = rc;
    o.x = P.x + P.nx * d; o.y = P.y + P.ny * d; o.h = P.h + r.range(-.22, .22);
    o.seed = Math.floor(r() * 1e9); o.hit = false; o.passed = false; o.minC = Infinity; o.hitAt = 0; o.path = null;
    w.obs.push(o);
  }

  /* ---------------- collisions, near misses, culling ---------------- */
  function update(w) {
    const c = w.car, cs = Math.cos(c.h + c.slip), sn = Math.sin(c.h + c.slip), rad = CAR.hitW / 2, hl = CAR.hitL / 2 - rad;
    for (let i = 0; i < w.obs.length; i++) {
      const o = w.obs[i];
      if (o.hit || o.passed) continue;
      const ds = o.s - c.s;
      if (ds > o.ra + 12) break;   /* sorted by s: the rest are further ahead */
      if (ds < -(o.ra + CAR.hitL)) {
        o.passed = true;
        if (o.minC > 0 && o.minC < CONFIG.score.nearMissDist && w.mode === "run") w.bonus("nearMiss", o.x, o.y);
        continue;
      }
      /* closest lateral clearance while alongside, for near misses */
      if (Math.abs(ds) < o.ra + CAR.hitL / 2) o.minC = Math.min(o.minC, Math.abs(c.d - o.d) - (rad + o.rc * o.ty.hit));
      /* capsule (5 points along it) against the puddle's ellipse grown by the capsule radius */
      const oc = Math.cos(-o.h), os = Math.sin(-o.h), ea = o.ra * o.ty.hit + rad, eb = o.rc * o.ty.hit + rad;
      for (let k = -2; k <= 2; k++) {
        const px = c.x + cs * hl * k / 2 - o.x, py = c.y + sn * hl * k / 2 - o.y;
        const u = px * oc - py * os, v = px * os + py * oc;
        if ((u * u) / (ea * ea) + (v * v) / (eb * eb) < 1) { hit(w, o); break; }
      }
    }
    /* free puddles well behind the Guard */
    while (w.obs.length && w.obs[0].s < c.s - 70) w.obsPool.push(w.obs.shift());
  }
  function hit(w, o) {
    const c = w.car, ty = o.ty, cruise = w.cruise();
    o.hit = true; o.hitAt = w.t;
    c.v = Math.max(Math.min(c.v, cruise) * ty.slow, cruise * .28);
    c.dirty = true;
    EFFECTS[ty.effect](w, o, ty);
    w.emit({ e: "hit", k: o.k, x: o.x, y: o.y, shake: ty.shake, buzz: ty.buzz, sfx: ty.sfx, col: ty.col });
  }
  function shift(w, dx, dy) { for (const o of w.obs) { o.x -= dx; o.y -= dy; } }
  return { TYPES: TYPES, EFFECTS: EFFECTS, place: place, update: update, shift: shift };
})();
