/* js/input.js */
/* ---- input.js ---- */
/* ============================================================================
   INPUT — steering only: -1 left, 0 none, +1 right.
   Touch or hold the left half of the screen to turn left, the right half to
   turn right (mouse clicks work the same way); keyboard ← / → or A / D. The
   most recent press wins, so holding one side and tapping the other works.
   Read by the game at every simulation step (no frame of delay); a tap shorter than one step is latched until
   a step has seen it.
   Other keys (Esc, Enter, debug) belong to game.js.
   ========================================================================== */
const INPUT = (function () {
  "use strict";
  const active = [];   /* [{ id, dir }], newest last */
  let enabled = false, tap = 0;
  /* a press is latched until the next simulation step has read it, so a tap shorter than a frame still steers */
  function press(id, dir) { release(id); active.push({ id: id, dir: dir }); tap = dir; }
  function release(id) { for (let i = active.length - 1; i >= 0; i--) if (active[i].id === id) active.splice(i, 1); }
  function clear() { active.length = 0; tap = 0; }
  function attach(canvas) {
    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (!enabled) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      press("p" + e.pointerId, e.clientX < window.innerWidth / 2 ? -1 : 1);
    }, { passive: false });
    const up = function (e) { release("p" + e.pointerId); };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up);
    window.addEventListener("keydown", function (e) {
      const c = e.code, dir = c === "ArrowLeft" || c === "KeyA" ? -1 : c === "ArrowRight" || c === "KeyD" ? 1 : 0;
      if (!dir || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (enabled) { e.preventDefault(); if (!e.repeat) press("k" + c, dir); }
    });
    window.addEventListener("keyup", function (e) { release("k" + e.code); });
    window.addEventListener("blur", clear);
  }
  return {
    attach: attach, clear: clear,
    dir: function () { return !enabled ? 0 : active.length ? active[active.length - 1].dir : tap; },
    consume: function () { tap = 0; },
    enable: function (v) { if (enabled !== v) { enabled = v; clear(); } },
    get enabled() { return enabled; }
  };
})();
