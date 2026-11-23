/* js/game.js */
/* ---- game.js ---- */
/* ============================================================================
   GAME — ties it together: saved state, the modes (home demo, launch, play,
   paused, busted, over), the fixed-timestep loop with interpolated rendering,
   input, audio, haptics, the HUD, pause / game over cards, keyboard
   shortcuts and the debug view.
   - Fixed 60 Hz simulation (WORLD.step), at most CONFIG.maxSteps per frame;
     the renderer draws between the last two steps (alpha), so motion is smooth
     at any refresh rate. Input is read at every step.
   - The game pauses itself when the tab is hidden or the window loses focus.
   - Saves go to localStorage (CONFIG.save.key), validated on load, like shkr.
   URL options: ?seed=123 (reproducible runs), ?debug (start with the debug view), ?score=1500 (start runs at a
   higher speed tier, for tuning).
   Debug view: Shift+D or the ` key (D alone steers right).
   ========================================================================== */
(function () {
  "use strict";
  const $ = function (s) { return document.querySelector(s); };
  const DT = WORLD.DT, J = CONFIG.juice, pad = UI.pad;

  /* ---------------- saved state (shkr's pattern: defaults, validation, one key) ---------------- */
  const KEY = CONFIG.save.key, DEFAULTS = { best: 0, bestTier: 1, runs: 0, sfx: true, music: true, vib: true, shake: true, tips: true };
  let S = loadState();
  function loadState() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { raw = {}; }
    return checkState(raw);
  }
  function checkState(raw) {
    const o = {};
    for (const k in DEFAULTS) o[k] = raw[k] !== undefined && raw[k] !== null ? raw[k] : DEFAULTS[k];
    o.best = Math.max(0, Math.floor(+o.best) || 0); o.runs = Math.max(0, Math.floor(+o.runs) || 0);
    o.bestTier = Math.max(1, Math.min(WORLD.MAX_TIER, Math.floor(+o.bestTier) || 1));
    for (const k of ["sfx", "music", "vib", "shake", "tips"]) o[k] = o[k] !== false;
    return o;
  }
  function saveState() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  const qs = new URLSearchParams(location.search);
  const urlSeed = qs.get("seed") ? (parseInt(qs.get("seed"), 10) >>> 0) || null : null;
  const urlScore = Math.max(0, parseInt(qs.get("score"), 10) || 0);   /* testing: start runs at this score (speed tier, difficulty) */
  let debug = qs.has("debug");

  const G = { mode: "home", paused: false, w: null, cam: null, acc: 0, bot: {}, bestAtStart: 0, fading: false, auto: false, god: false };
  const cv = $("#cv");
  RENDER.init(cv); INPUT.attach(cv);
  AUDIO.setSfx(S.sfx); AUDIO.setMusic(S.music);

  function newWorld(opt) { const w = WORLD.create(opt); G.w = w; G.cam = CAMERA.create(w); G.acc = 0; G.bot = {}; RENDER.clearFx(); return w; }

  /* ---------------- home ---------------- */
  function startHome() {
    G.mode = "home"; G.paused = false; INPUT.enable(false); UI.hudShow(false); UI.hideTutorial();
    newWorld({ seed: U.newSeed(), demo: true, scoreStart: CONFIG.demo.scoreStart });
    UI.paintHome(S, WORLD.MAX_TIER, true); UI.paintSettings(S); UI.show("home");
  }
  function launch() {
    if (G.mode !== "home" || !$("#home").classList.contains("on")) return;
    audioGesture(); AUDIO.sfx.go();
    G.mode = "launch";
    UI.wipe($("#startOrb"), function () { UI.show(""); startRun(); });
  }
  $("#startOrb").addEventListener("click", launch);
  /* the demo restarts behind a quick fade when the Guard catches the bot, or after a while */
  function restartDemo() {
    if (G.fading) return; G.fading = true; UI.fade(true);
    setTimeout(function () { if (G.mode === "home" || G.mode === "launch") newWorld({ seed: U.newSeed(), demo: true, scoreStart: CONFIG.demo.scoreStart }); UI.fade(false); G.fading = false; }, 380);
  }

  /* ---------------- a run ---------------- */
  function startRun() {
    newWorld({ seed: CONFIG.seed || urlSeed || U.newSeed(), god: G.god, scoreStart: urlScore });
    G.mode = "play"; G.paused = false; G.bestAtStart = S.best;
    INPUT.enable(true); UI.hudShow(true); UI.hideCard();
    if (S.tips) UI.showTutorial();
  }
  function pauseGame() {
    if (G.mode !== "play" || G.paused) return;
    G.paused = true; INPUT.enable(false); AUDIO.suspend(); UI.hideTutorial();
    UI.showCard({ eyebrow: "score " + Math.floor(G.w.score).toLocaleString("en-US") + "  ·  tier " + pad(G.w.tier), title: "Paused",
      acts: [{ t: "resume", solid: true, fn: resumeGame },
        { t: "restart", fn: function () { UI.hideCard(); AUDIO.resume(); startRun(); } },
        { t: "home", fn: function () { UI.hideCard(); AUDIO.resume(); startHome(); } }] });
  }
  function resumeGame() {
    if (!G.paused) return;
    UI.hideCard(); const p = AUDIO.resume();
    const go = function () { G.paused = false; G.acc = 0; INPUT.enable(true); };
    if (p && p.then) p.then(go, go); else go();
  }
  UI.on.pause = pauseGame;
  function busted() {
    G.mode = "busted"; INPUT.enable(false); UI.hideTutorial();
    AUDIO.sfx.busted(); buzz([70, 40, 160]);
    const w = G.w, score = Math.floor(w.score);
    S.runs++; if (score > S.best) S.best = score; if (w.tier > S.bestTier) S.bestTier = w.tier;
    if (S.tips && w.t > 20) S.tips = false;   /* the tutorial is for the first runs; Settings brings it back */
    saveState();
  }
  function gameOver() {
    G.mode = "over";
    const w = G.w, score = Math.floor(w.score), nb = score > G.bestAtStart && score > 0, m = Math.floor(w.t / 60), sec = Math.floor(w.t % 60);
    UI.showCard({ eyebrow: nb ? "new high score!" : "caught by the Guard", title: "Busted!", stars: nb ? 4 : undefined,
      stats: [[score.toLocaleString("en-US"), "score"], [S.best.toLocaleString("en-US"), "best"], [pad(w.tier), "tier"], [m + ":" + pad(sec), "time"]],
      acts: [{ t: "retry", solid: true, fn: function () { UI.hideCard(); startRun(); } }, { t: "home", fn: function () { UI.hideCard(); startHome(); } }] });
  }

  /* ---------------- events from the simulation ---------------- */
  function buzz(p) { if (S.vib && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
  function events(w) {
    const play = G.mode === "play" || G.mode === "busted";
    for (const e of w.events) {
      RENDER.onEvent(e);
      if (e.e === "rebase") { CAMERA.shift(G.cam, e.dx, e.dy); continue; }
      if (!play) continue;
      switch (e.e) {
        case "hit": AUDIO.sfx[e.sfx](); buzz(e.buzz); break;
        case "scrape": AUDIO.sfx.scrape(e.power); break;
        case "bonus": UI.pop((e.k === "nearMiss" ? "near miss" : "clean drift") + " <b>+" + e.pts + "</b>"); UI.bump(); (e.k === "nearMiss" ? AUDIO.sfx.nearMiss : AUDIO.sfx.bonus)(); break;
        case "tier": UI.pop("tier <b>" + pad(e.tier) + "</b>  ·  faster", "tier"); AUDIO.sfx.tier(); break;
        case "busted": busted(); break;
      }
    }
    w.events.length = 0;
  }

  /* ---------------- settings ---------------- */
  UI.on.toggle = function (k) {
    S[k] = !S[k]; saveState(); UI.paintSettings(S);
    if (k === "sfx") AUDIO.setSfx(S.sfx); else if (k === "music") AUDIO.setMusic(S.music); else if (k === "vib" && S.vib) buzz(30);
  };
  UI.on.tipsOff = function (off) { S.tips = !off; saveState(); UI.paintSettings(S); };
  UI.on.reset = function () {
    UI.showCard({ eyebrow: "settings", title: "Reset high score?", body: "Your high score and top speed tier will be cleared. Your settings stay.",
      acts: [{ t: "reset", danger: true, fn: function () { S.best = 0; S.bestTier = 1; S.runs = 0; saveState(); UI.hideCard(); UI.paintHome(S, WORLD.MAX_TIER, false); } }, { t: "cancel", fn: UI.hideCard }] });
  };
  UI.on.click = function () { AUDIO.sfx.click(); };

  /* ---------------- input: audio unlock, keys, pause rules ---------------- */
  function audioGesture() {
    if (!AUDIO.ctx) { if (!AUDIO.init()) return; AUDIO.setSfx(S.sfx); AUDIO.setMusic(S.music); }
    if (!G.paused) AUDIO.resume();
  }
  document.addEventListener("pointerdown", audioGesture, { capture: true });
  document.addEventListener("keydown", audioGesture, { capture: true });
  window.addEventListener("keydown", function (e) {
    const c = e.code;
    if ((c === "KeyD" && e.shiftKey) || c === "Backquote") { debug = !debug; return; }
    if (c === "Escape") {
      if (G.mode === "play" && !G.paused) pauseGame(); else if (G.paused) resumeGame(); else if (!UI.cardUp && UI.panelOn()) UI.show("home");
      return;
    }
    if (UI.cardUp) { if (c === "Enter") { e.preventDefault(); UI.firstAct(); } return; }
    if (G.mode === "home" && $("#home").classList.contains("on") && (c === "Enter" || c === "Space")) { e.preventDefault(); launch(); }
    else if (UI.panelOn() === "howto") { if (c === "ArrowLeft") UI.Demo.prev(); else if (c === "ArrowRight") UI.Demo.next(); }
    else if (G.mode === "play" && (c === "Space" || c.indexOf("Arrow") === 0)) e.preventDefault();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (G.mode === "play") pauseGame(); else AUDIO.suspend(); }
    else if (!G.paused) AUDIO.resume();
  });
  window.addEventListener("blur", pauseGame);
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("dblclick", function (e) { e.preventDefault(); });

  /* ---------------- main loop ---------------- */
  let last = 0, slow = 0, lowQ = false;
  function loop(ts) {
    requestAnimationFrame(loop);
    const t = ts / 1000, dt = last ? Math.min(.1, Math.max(0, t - last)) : 0; last = t;
    const w = G.w; if (!w) return;
    const home = G.mode === "home" || G.mode === "launch", running = !G.paused && G.mode !== "over";
    let alpha = 1;
    if (running) {
      G.acc += dt; let n = 0;
      while (G.acc >= DT && n < CONFIG.maxSteps) {
        const dir = G.mode === "play" ? (G.auto ? WORLD.bot(w, G.bot) : INPUT.dir()) : home ? WORLD.bot(w, G.bot) : 0;
        WORLD.step(w, dir); INPUT.consume(); events(w); CAMERA.step(G.cam, w, DT);
        G.acc -= DT; n++;
      }
      if (n >= CONFIG.maxSteps) G.acc = 0;
      alpha = U.clamp(G.acc / DT, 0, 1);
    }
    if (G.mode === "busted" && w.over) gameOver();
    if (home && (w.mode === "busted" || w.t > CONFIG.demo.restartAfter)) restartDemo();   /* caught: fade straight away, no bust scene */

    const gm = GUARD.gapMax(w), gap = w.guard.gap, inRun = G.mode === "play" || G.mode === "busted" || G.mode === "over";
    const prox = U.clamp(1 - gap / gm, 0, 1), danger = w.mode === "busted" ? 1 : U.clamp((J.danger * gm - gap) / (J.danger * gm), 0, 1);
    RENDER.frame(w, G.cam, alpha, running ? dt : 0, { shake: S.shake, debug: debug, home: home, danger: inRun ? danger : 0 });
    if (inRun) UI.hudUpdate({ score: w.score, best: Math.max(S.best, w.score), tier: w.tier, prox: prox, danger: G.mode === "over" ? 0 : danger,
      rev: w.fx.reverse, revDur: w.fx.reverseDur, wet: w.fx.splash, wetDur: w.fx.splashDur });
    AUDIO.update({ on: G.mode === "play" && !G.paused, home: home, speed: (w.mult() - 1) / (CONFIG.speed.maxMult - 1), drift: w.car.drift,
      danger: danger, busted: G.mode === "busted" });
    /* drop the resolution once if this device can't hold 60 fps */
    if (G.mode === "play" && !G.paused && !lowQ && dt > 0) { slow = dt > .024 ? slow + 1 : Math.max(0, slow - .25); if (slow > 90) { lowQ = true; RENDER.setQuality(.72); } }
  }

  /* ---------------- boot ---------------- */
  let rz = 0;
  const onResize = function () { clearTimeout(rz); rz = setTimeout(function () { RENDER.resize(); UI.refreshScrollCue(); }, 100); };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", function () { setTimeout(onResize, 160); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(UI.refreshScrollCue);
  startHome();
  requestAnimationFrame(loop);

  /* debug handle (like shkr's window.__SHADOWSKIRR) */
  window.__COURSER = { G: G, S: function () { return S; }, setS: function (o) { S = checkState(o || {}); saveState(); return S; }, saveState: saveState,
    startRun: startRun, startHome: startHome, pause: pauseGame, resume: resumeGame, launch: launch, CONFIG: CONFIG,
    debug: function (v) { debug = v === undefined ? !debug : !!v; return debug; },
    /* testing: let the demo bot drive the run (god: the Guard can't bust) */
    autopilot: function (v, god) { G.auto = !!v; G.god = !!god; if (G.w) G.w.god = G.god; return G.auto; } };
})();
