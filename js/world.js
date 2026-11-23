/* js/world.js */
/* ---- world.js ---- */
/* ============================================================================
   WORLD — one run of the game as a deterministic fixed-timestep simulation:
   the road, its scenery and puddles, the Courser, the Guard, score, speed,
   difficulty, effects and events. The browser (game.js) and the Node tools
   (tools/soak.js) both drive it with WORLD.step(w, dir) at CONFIG.hz.
   Also the bot (WORLD.bot) that plays the home screen's demo and the soak test.
   Events (w.events, drained by the caller after each step):
     hit {k, x, y, shake, buzz, sfx}  scrape {x, y, power}  bonus {k, pts, x, y}
     tier {tier}  busted {x, y}  rebase {dx, dy}
   No DOM.
   ========================================================================== */
const WORLD = (function () {
  "use strict";
  const SP = CONFIG.speed, SC = CONFIG.score, DT = 1 / CONFIG.hz, MAX_TIER = Math.floor((SP.maxMult - 1) / SP.stepPct) + 1;
  const multAt = function (score) { return Math.min(SP.maxMult, 1 + SP.stepPct * Math.max(0, score) / SP.stepPts); };
  const cruiseAt = function (score) { return SP.base * multAt(score); };
  const diffAt = function (score) { return U.clamp(score / CONFIG.difficultyFull, 0, 1); };
  const zoomAt = function (score) { return 1 + CONFIG.camera.zoomOut * U.clamp((multAt(score) - 1) / (SP.maxMult - 1), 0, 1); };

  function create(opt) {
    opt = opt || {};
    const seed = (opt.seed >>> 0) || U.newSeed();
    const w = { seed: seed, demo: !!opt.demo, god: !!opt.god, t: 0, tick: 0, score: opt.scoreStart || 0, dist: 0, mode: "run", bustT: 0, over: false,
      fx: { splash: 0, splashDur: 1, splashSeed: 0, reverse: 0, reverseDur: 1 }, events: [],
      obs: [], obsPool: [], oid: 0, obsS: CONFIG.obstacles.firstAt, orng: U.rng(seed ^ 0x27d4eb2d),
      bonuses: { nearMiss: 0, cleanDrift: 0 }, hits: 0, scrapes: 0, tier: 1, scenId: 0, ox: 0, oy: 0, rebases: 0 };
    w.cruise = function () { return cruiseAt(w.score); };
    w.mult = function () { return multAt(w.score); };
    w.D = function () { return diffAt(w.score); };
    w.zoom = function () { return zoomAt(w.score); };
    /* predicted score / difficulty / speed when the Courser reaches arc length s (the road is built well ahead) */
    w.predScore = function (s) { return w.score + Math.max(0, s - w.car.s) * (SC.perUnit + SC.perSec / Math.max(1, w.cruise())); };
    w.predD = function (s) { return diffAt(w.predScore(s)); };
    w.predV = function (s) { return cruiseAt(w.predScore(s)); };
    w.emit = function (e) { if (e.e === "hit") w.hits++; else if (e.e === "scrape") w.scrapes++; w.events.push(e); };
    w.bonus = function (k, x, y) { const pts = SC[k]; w.score += pts; w.bonuses[k]++; w.emit({ e: "bonus", k: k, pts: pts, x: x, y: y }); };
    w.tier = Math.min(MAX_TIER, Math.floor(w.score / SP.stepPts) + 1);
    w.road = ROAD.create(seed);
    w.car = COURSER.create(w, 34);
    w.car.v = w.cruise() * SP.startMult;
    content(w, 400);
    w.guard = GUARD.create(w);
    return w;
  }

  function step(w, dir) {
    const c = w.car, g = w.guard;
    w.t += DT; w.tick++;
    if (w.fx.reverse > 0 && dir) dir = -dir;
    w.fx.splash = Math.max(0, w.fx.splash - DT); w.fx.reverse = Math.max(0, w.fx.reverse - DT);
    COURSER.step(c, w, dir, DT);
    if (w.mode === "run") OBST.update(w);
    GUARD.step(g, w, DT);
    if (w.mode === "run") {
      const ds = Math.max(0, c.dsdt * DT);
      w.dist += ds; w.score += ds * SC.perUnit + DT * SC.perSec;
      const tier = Math.min(MAX_TIER, Math.floor(w.score / SP.stepPts) + 1);
      if (tier > w.tier) { w.tier = tier; w.emit({ e: "tier", tier: tier }); }
      if (!w.god && g.gap <= 0 && (Math.abs(c.d - g.d) < CONFIG.car.hitW * .95 || g.gap < -2.5)) bust(w);
    } else {
      w.bustT += DT; c.spin *= Math.exp(-2.4 * DT);
      if (w.bustT >= CONFIG.juice.bustTime) w.over = true;
    }
    content(w);
    if (c.x * c.x + c.y * c.y > CONFIG.road.rebase * CONFIG.road.rebase) rebase(w);
  }
  function bust(w) {
    const c = w.car, g = w.guard;
    w.mode = "busted"; w.bustT = 0;
    c.spin = (c.d >= g.d ? 1 : -1) * 2.6;
    w.emit({ e: "busted", x: (c.x + g.x) / 2, y: (c.y + g.y) / 2 });
  }
  /* keep the road built ahead, scenery placed, puddles placed, and free what is far behind */
  function content(w, budget) {
    const c = w.car, road = w.road;
    ROAD.extend(road, c.s + CONFIG.road.ahead, { D: w.predD, v: w.predV, minS: Math.max(c.s + 300, w.obsS + 20) }, budget);
    const segs = road.segs;
    if (w.scenId < segs[0].id) w.scenId = segs[0].id;
    for (let i = w.scenId - segs[0].id; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.s1 > road.s - CONFIG.road.sceneryLag) break;
      SCENERY.place(road, seg, w.t); w.scenId = seg.id + 1;
    }
    OBST.place(w);
    ROAD.dropOld(road, c.s, c.x, c.y, function (seg) { SCENERY.drop(road, seg); });
  }
  /* recentre the world on the Courser (very long runs): s values stay, coordinates shift */
  function rebase(w) {
    const dx = Math.round(w.car.x), dy = Math.round(w.car.y);
    ROAD.shift(w.road, dx, dy); SCENERY.shift(w.road, dx, dy); OBST.shift(w, dx, dy);
    COURSER.shift(w.car, dx, dy); GUARD.shift(w.guard, dx, dy);
    w.ox += dx; w.oy += dy; w.rebases++;
    w.emit({ e: "rebase", dx: dx, dy: dy });
  }

  /* ---------------- the bot: plays with the same left / right input as a player ----------------
     Pure pursuit on a point ahead on the road, on the free side of the next puddle (or a little inside on
     bends), turned into left / right holds with some hysteresis. It knows about the oil swap. */
  const BP = {};
  function bot(w, b) {
    const c = w.car;
    if (w.mode !== "run") return 0;
    const v = c.v, look = U.clamp(v * .42, 9, 26);
    let dT = null;
    for (let i = 0; i < w.obs.length; i++) {
      const o = w.obs[i];
      if (o.hit || o.s < c.s - o.ra - 1) continue;
      if (o.s > c.s + v * 1.3 + 16) break;
      dT = -Math.sign(o.d) * (b.side || 1.9); break;
    }
    ROAD.pose(w.road, c.s + look, BP);
    if (dT === null) dT = U.clamp(BP.k * 22, -1.6, 1.6);
    const tx = BP.x + BP.nx * dT, ty = BP.y + BP.ny * dT, dx = tx - c.x, dy = ty - c.y;
    const kNeed = 2 * Math.sin(U.wrap(Math.atan2(dy, dx) - c.h)) / Math.max(Math.hypot(dx, dy), 1), kt = CONFIG.car.kTap;
    let dir;
    if (b.dir === -1) dir = kNeed > kt * .12 ? -1 : kNeed < -kt * .4 ? 1 : 0;
    else if (b.dir === 1) dir = kNeed < -kt * .12 ? 1 : kNeed > kt * .4 ? -1 : 0;
    else dir = kNeed > kt * .4 ? -1 : kNeed < -kt * .4 ? 1 : 0;
    b.dir = dir;
    return w.fx.reverse > 0 ? -dir : dir;
  }

  return { create: create, step: step, bot: bot, DT: DT, MAX_TIER: MAX_TIER, multAt: multAt, cruiseAt: cruiseAt };
})();
