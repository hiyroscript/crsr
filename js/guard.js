/* js/guard.js */
/* ---- guard.js ---- */
/* ============================================================================
   GUARD — the police car. It drives the road perfectly: it follows the
   centerline, steers smoothly round every puddle, never touches an edge, and
   takes every corner cleanly (with a drift look on tight ones).
   It is always behind the Courser. Its place is a gap along the road
   (arc length, bumper to bumper) rather than a free car:
   - its speed is the cruise speed × a ratio that rises from ratioNear (gap 0)
     to ratioFar (max gap), plus a small catch-up bonus that grows with
     difficulty;
   - the gap changes by (Courser's speed along the road − Guard speed), so a
     slowdown (puddle, scrape, a wide line) shrinks it and clean driving slowly
     wins it back, up to gapMax (× the camera's zoom-out, so the Guard never
     leaves the screen);
   - close in, it lines up with the Courser to ram; gap 0 with the hitboxes
     side by side = busted (world.js).
   No DOM: the Node tools load this too.
   ========================================================================== */
const GUARD = (function () {
  "use strict";
  const G = CONFIG.guard, C = CONFIG.car, HW = CONFIG.road.width / 2;
  const LEN_C = C.hitL, LEN_G = C.hitL * 1.07, HALF = (LEN_C + LEN_G) / 2 + .35;
  const P = {};

  function create(w) {
    const g = { gap: G.gapStart, s: 0, d: 0, dPrev: 0, x: 0, y: 0, h: 0, slip: 0, v: 0, k: 0, drift: false, px: 0, py: 0, ph: 0, pslip: 0 };
    g.s = w.car.s - g.gap - HALF; pose(g, w, 1 / CONFIG.hz); save(g);
    return g;
  }
  function save(g) { g.px = g.x; g.py = g.y; g.ph = g.h; g.pslip = g.slip; }
  function gapMax(w) { return G.gapMax * w.zoom(); }

  function step(g, w, dt) {
    save(g);
    const c = w.car, cruise = w.cruise(), gm = gapMax(w);
    if (w.mode === "run") {
      if (w.t < G.grace) { g.v = c.dsdt; g.gap = Math.min(gm, G.gapStart); }
      else {
        g.v = cruise * (U.lerp(G.ratioNear, G.ratioFar, U.clamp(g.gap / gm, 0, 1)) + G.ratioHard * w.D());
        g.gap += (c.dsdt - g.v) * dt;
        if (g.gap > gm) g.gap = gm;
      }
    } else {
      /* busted: it shoves the Courser and both come to a stop */
      g.v = c.v; g.gap = U.damp(g.gap, -.25, .15, dt);
    }
    g.s = c.s - g.gap - HALF;

    /* lateral: centerline, lining up with the Courser when close, and round every puddle ahead */
    let target = g.gap < G.ramDist ? U.lerp(c.d, 0, U.clamp(g.gap / G.ramDist, 0, 1)) : 0;
    const ahead = Math.max(G.avoidAhead, g.v * .9);
    for (let i = 0; i < w.obs.length; i++) {
      const o = w.obs[i];
      if (o.s < g.s - 6) continue;
      if (o.s > g.s + ahead) break;
      const need = o.rc * o.ty.hit + C.hitW / 2 + G.avoidMargin;
      if (Math.abs(target - o.d) < need) target = o.d - Math.sign(o.d) * need;
    }
    const lim = HW - C.hitW / 2 - .3;
    g.dPrev = g.d; g.d = U.damp(g.d, U.clamp(target, -lim, lim), G.latLag, dt);
    pose(g, w, dt);
  }
  function pose(g, w, dt) {
    ROAD.pose(w.road, g.s, P);
    g.x = P.x + P.nx * g.d; g.y = P.y + P.ny * g.d; g.k = P.k;
    g.h = P.h + Math.atan((g.d - g.dPrev) / (Math.max(g.v, 4) * dt));
    g.drift = Math.abs(P.k) > G.slipK && w.mode === "run";
    g.slip = U.damp(g.slip, g.drift ? U.clamp(P.k * 9, -G.slipMax, G.slipMax) : 0, .15, dt);
  }
  function shift(g, dx, dy) { g.x -= dx; g.y -= dy; g.px -= dx; g.py -= dy; }
  return { create: create, step: step, gapMax: gapMax, shift: shift, HALF: HALF, LEN: LEN_G };
})();
