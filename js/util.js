/* js/util.js */
/* ---- util.js ---- */
/* ============================================================================
   U — small shared helpers: seeded RNG, angles, easing, hashing, a spatial
   hash grid. No DOM: the Node tools load this too.
   ========================================================================== */
const U = (function () {
  "use strict";
  const TAU = Math.PI * 2;
  /* mulberry32: a fast seeded RNG returning [0, 1) */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = function (lo, hi) { return lo + (hi - lo) * f(); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.sign = function () { return f() < .5 ? -1 : 1; };
    return f;
  }
  /* weighted pick: items with a weight function or field */
  function weighted(r, items, wf) {
    let tot = 0; const ws = items.map(function (it) { const w = Math.max(0, wf(it)); tot += w; return w; });
    if (tot <= 0) return null;
    let x = r() * tot;
    for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0 && ws[i] > 0) return items[i]; }
    for (let i = items.length - 1; i >= 0; i--) if (ws[i] > 0) return items[i];
    return null;
  }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* exponential approach with time constant tau (frame-rate independent) */
  function damp(a, b, tau, dt) { return tau <= 0 ? b : a + (b - a) * (1 - Math.exp(-dt / tau)); }
  function dampAngle(a, b, tau, dt) { return a + wrap(b - a) * (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau)); }
  function hash(n) { let x = Math.imul((n | 0) ^ 0x9E3779B9, 0x85EBCA6B); x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
  function newSeed() { return (Math.floor(Math.random() * 0x7fffffff) ^ (Date.now() & 0xffff)) >>> 0 || 1; }

  /* spatial hash grid of items with x, y. Cells are arrays; remove() is O(cell). */
  function grid(cell) {
    const m = new Map(), inv = 1 / cell;
    const key = function (cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); };
    return {
      cell: cell,
      add: function (it) { const k = key(Math.floor(it.x * inv), Math.floor(it.y * inv)); let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(it); it._gk = k; },
      remove: function (it) { const a = m.get(it._gk); if (!a) return; const i = a.indexOf(it); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) m.delete(it._gk); },
      /* calls f(item) for every item in the cells overlapping the square of half-size r round (x, y); f may return true to stop */
      query: function (x, y, r, f) {
        const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv), y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
        for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
          const a = m.get(key(cx, cy)); if (!a) continue;
          for (let i = 0; i < a.length; i++) if (f(a[i])) return true;
        }
        return false;
      },
      clear: function () { m.clear(); },
      get size() { let n = 0; m.forEach(function (a) { n += a.length; }); return n; }
    };
  }
  return { TAU: TAU, rng: rng, weighted: weighted, wrap: wrap, clamp: clamp, lerp: lerp, damp: damp, dampAngle: dampAngle, hash: hash, newSeed: newSeed, grid: grid };
})();
