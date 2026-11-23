/* js/camera.js */
/* ---- camera.js ---- */
/* ============================================================================
   CAMERA — top-down, following the Courser and turning so its heading points
   up the screen (smoothed), zooming out a little as the speed rises. On a bust
   it swings to the two cars and zooms in. Stepped with the simulation (so it
   is as smooth as the cars) and interpolated by the renderer; the look-ahead
   (the Courser low on the screen) and the shake are applied there.
   No DOM.
   ========================================================================== */
const CAMERA = (function () {
  "use strict";
  const K = CONFIG.camera;
  function create(w) { const c = w.car; const cam = { x: c.x, y: c.y, a: c.h, z: w.zoom(), px: 0, py: 0, pa: 0, pz: 0 }; save(cam); return cam; }
  function save(cam) { cam.px = cam.x; cam.py = cam.y; cam.pa = cam.a; cam.pz = cam.z; }
  function step(cam, w, dt) {
    save(cam);
    const c = w.car;
    if (w.mode === "busted") {
      const g = w.guard;
      cam.x = U.damp(cam.x, (c.x + g.x) / 2, .3, dt); cam.y = U.damp(cam.y, (c.y + g.y) / 2, .3, dt);
      cam.z = U.damp(cam.z, K.bustZoom, .35, dt);
    } else {
      cam.x = c.x; cam.y = c.y;
      cam.a = U.dampAngle(cam.a, c.h, K.turnLag, dt);
      cam.z = U.damp(cam.z, w.zoom(), K.zoomLag, dt);
    }
  }
  function snap(cam, w) { cam.x = w.car.x; cam.y = w.car.y; cam.a = w.car.h; cam.z = w.zoom(); save(cam); }
  function shift(cam, dx, dy) { cam.x -= dx; cam.y -= dy; cam.px -= dx; cam.py -= dy; }
  return { create: create, step: step, snap: snap, shift: shift };
})();
