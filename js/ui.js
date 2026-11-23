/* js/ui.js */
/* ---- ui.js ---- */
/* ============================================================================
   UI — the DOM side, in shkr's UI: screens and panels, cards on the blurred
   overlay, the letter-by-letter title, the circular wipe into a run, the
   objective box (here the first-run tutorial), the HUD (meta pills, rail,
   pause button) and the How to play carousel, whose scenes are drawn by the
   game's own renderer (RENDER.vignette). It knows nothing about saving or the
   simulation: game.js tells it what to show.
   ========================================================================== */
const UI = (function () {
  "use strict";
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  const pad = function (n, k) { n = String(Math.max(0, Math.floor(n))); while (n.length < (k || 2)) n = "0" + n; return n; };
  const TOUCH = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const on = {};   /* callbacks set by game.js: click */

  /* ---------------- screens ---------------- */
  const SCREENS = ["home", "howto", "settings"], PANELS = ["howto", "settings"];
  function show(id) {
    SCREENS.forEach(function (s) { const el = document.getElementById(s); el.classList.toggle("on", s === id); el.classList.remove("enter"); });
    const el = document.getElementById(id);
    if (el) { void el.offsetWidth; el.classList.add("enter"); }
    if (id === "howto") Demo.start(); else Demo.stop();
    refreshScrollCue();
    if (on.screen) on.screen(id);
  }
  function panelOn() { for (const id of PANELS) if (document.getElementById(id).classList.contains("on")) return id; return ""; }
  $$("[data-go]").forEach(function (b) { b.addEventListener("click", function () { if (on.click) on.click(); show(b.dataset.go); }); });
  function refreshScrollCue() {
    $$(".screen .col").forEach(function (col) {
      const body = col.querySelector(".panel-body"); if (!body) return;
      col.classList.toggle("more", body.scrollHeight - body.scrollTop - body.clientHeight > 6);
    });
  }
  $$(".panel-body").forEach(function (el) { el.addEventListener("scroll", refreshScrollCue, { passive: true }); });

  /* ---------------- cards (shkr) ---------------- */
  const overlay = $("#overlay"), cardEl = $("#card");
  let cardActs = [], cardFade = 0, cardUp = false;
  function starsHTML(v, cls) {
    let h = '<div class="stars' + (cls ? " " + cls : "") + '">';
    for (let i = 0; i < 3; i++) h += '<i class="star' + (v === 4 ? " rb" : i < v ? " on" : "") + '"></i>';
    return h + "</div>";
  }
  /* o: eyebrow, title, accent, stars, body, stats [[value, label]], acts [{ t, solid, danger, fn }] */
  function showCard(o) {
    clearTimeout(cardFade);
    if (overlay.classList.contains("out")) clearCard();
    let html = "";
    if (o.eyebrow) html += '<div class="eyebrow">' + o.eyebrow + "</div>";
    if (o.title) html += "<h2" + (o.accent ? ' class="accent" style="--hz:' + o.accent + '"' : "") + ">" + o.title + "</h2>";
    if (o.stars !== undefined) html += starsHTML(o.stars, "big");
    if (o.body) html += "<p>" + o.body + "</p>";
    if (o.stats) { html += '<div class="stat-row">'; o.stats.forEach(function (s) { html += "<div><b>" + s[0] + "</b><span>" + s[1] + "</span></div>"; }); html += "</div>"; }
    html += '<div class="acts">';
    (o.acts || []).forEach(function (a, i) { html += '<button class="chip' + (a.solid ? " solid" : "") + (a.danger ? " danger" : "") + '" data-act="' + i + '">' + a.t + "</button>"; });
    html += "</div>";
    cardEl.innerHTML = html; cardEl.className = "card"; cardActs = o.acts || []; overlay.classList.add("on"); cardUp = true;
    cardEl.style.animation = "none"; void cardEl.offsetWidth; cardEl.style.animation = "";
    if (o.stars !== undefined) $$(".stars.big .star", cardEl).forEach(function (el, i) { setTimeout(function () { el.classList.add("pop"); }, 260 + i * 280); });
  }
  function hideCard(fade) {
    cardActs = []; cardUp = false; clearTimeout(cardFade);
    if (fade === true && overlay.classList.contains("on")) { overlay.classList.add("out"); cardFade = setTimeout(clearCard, 200); } else clearCard();
  }
  function clearCard() { overlay.classList.remove("on", "out"); cardEl.innerHTML = ""; }
  overlay.addEventListener("click", function (e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = cardActs[+b.dataset.act]; if (on.click) on.click(); if (a && a.fn) a.fn();
  });
  function firstAct() { if (cardActs[0] && cardActs[0].fn) { if (on.click) on.click(); cardActs[0].fn(); } }

  /* ---------------- home ---------------- */
  function setLetters(el, text) {
    el.innerHTML = "";
    text.split(" ").forEach(function (word, wi, arr) {
      const w = document.createElement("span"); w.style.whiteSpace = "nowrap"; w.style.animation = "none";
      word.split("").forEach(function (ch, i) { const s = document.createElement("span"); s.textContent = ch; s.style.animationDelay = (wi * .12 + i * .03) + "s"; w.appendChild(s); });
      el.appendChild(w); if (wi < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }
  function paintHome(S, maxTier, retitle) {
    if (retitle) setLetters($("#title"), "Courser's Evade!");
    $("#homeBestN").textContent = S.best.toLocaleString("en-US");
    $("#startLbl").textContent = S.runs ? "play  ·  run " + (S.runs + 1) : "play";
    $("#railFill").style.width = ((Math.min(S.bestTier, maxTier) - 1) / (maxTier - 1) * 100).toFixed(1) + "%";
    $("#tierTag").textContent = "tier " + pad(S.bestTier) + " / " + maxTier;
  }
  /* shkr's launch: a black disc grows from the play orb to cover the screen, then fades off the run */
  function wipe(from, mid) {
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, w = $("#wipe"), W = window.innerWidth, H = window.innerHeight;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    w.style.left = (cx - 5) + "px"; w.style.top = (cy - 5) + "px"; w.style.setProperty("--sc", Math.ceil(far / 5) + "");
    w.classList.remove("go", "fade"); void w.offsetWidth; w.classList.add("go");
    setTimeout(function () { mid(); w.classList.add("fade"); setTimeout(function () { w.classList.remove("go", "fade"); }, 340); }, 500);
  }
  function fade(v) { $("#fade").classList.toggle("on", v); }

  /* ---------------- settings ---------------- */
  const SW = { sfx: $("#sfxSw"), music: $("#musicSw"), vib: $("#vibSw"), shake: $("#shakeSw"), tips: $("#tipsSw") };
  function paintSettings(S) { for (const k in SW) SW[k].setAttribute("aria-pressed", S[k] ? "true" : "false"); }
  for (const k in SW) SW[k].addEventListener("click", function () { if (on.click) on.click(); if (on.toggle) on.toggle(k); });
  $("#resetBtn").addEventListener("click", function () { if (on.click) on.click(); if (on.reset) on.reset(); });
  if (!("vibrate" in navigator)) SW.vib.closest(".set-row").querySelector(".lbl span").textContent = "A buzz on hits and when you're busted. This device can't vibrate.";

  /* ---------------- tutorial (shkr's objective box) ---------------- */
  const ob = $("#msBanner"), obChk = $("#obHide"), th = $("#touchHint");
  let obT = 0, obMouse = false;
  $("#obTurn").textContent = TOUCH ? "tap left / right" : "← / →  or  A / D";
  $("#obDrift").textContent = TOUCH ? "hold" : "hold the key";
  function kbFocus(el) { try { return el.matches(":focus-visible"); } catch (e) { return document.activeElement === el; } }
  function showTutorial() {
    hideTutorial(); obChk.checked = false;
    void ob.offsetWidth; ob.classList.add("show"); if (TOUCH) th.classList.add("show");
    obT = setTimeout(fadeTutorial, 6500);
  }
  function fadeTutorial() { if (obMouse || kbFocus(obChk)) obT = setTimeout(fadeTutorial, 400); else hideTutorial(); }
  function hideTutorial() { clearTimeout(obT); if (ob.contains(document.activeElement)) document.activeElement.blur(); ob.classList.remove("show"); th.classList.remove("show"); }
  ob.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  ob.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") obMouse = true; });
  ob.addEventListener("pointerleave", function () { obMouse = false; });
  obChk.addEventListener("change", function () { if (on.tipsOff) on.tipsOff(obChk.checked); if (!kbFocus(obChk)) obChk.blur(); });

  /* ---------------- HUD ---------------- */
  const hud = $("#hud"), scoreEl = $("#hudScore"), bestEl = $("#hudBest"), tierEl = $("#hudTier"), rail = $("#dangerRail"), fill = $("#hudFill");
  const rev = $("#fxRev"), revArc = $("#fxRevArc"), revN = $("#fxRevN"), wet = $("#fxWet"), wetArc = $("#fxWetArc");
  const dangerEl = $("#fxDanger"), oilEl = $("#fxOil"), pops = $("#hudPops");
  const last = {};
  const setOnce = function (k, v, f) { if (last[k] !== v) { last[k] = v; f(v); } };
  function hudShow(v) { hud.classList.toggle("on", v); if (!v) { dangerEl.style.opacity = 0; oilEl.classList.remove("on"); rev.classList.remove("on"); wet.classList.remove("on"); pops.innerHTML = ""; for (const k in last) delete last[k]; } }
  /* st: score, best, tier, prox (0..1), danger (0..1), rev / revDur, wet / wetDur */
  function hudUpdate(st) {
    setOnce("score", Math.floor(st.score), function (v) { scoreEl.textContent = v.toLocaleString("en-US"); });
    setOnce("best", Math.floor(st.best), function (v) { bestEl.innerHTML = "best <b>" + v.toLocaleString("en-US") + "</b>"; });
    setOnce("tier", st.tier, function (v) { tierEl.innerHTML = "tier <b>" + pad(v) + "</b>"; });
    setOnce("prox", Math.round(st.prox * 200) / 200, function (v) { fill.style.transform = "scaleX(" + v + ")"; rail.setAttribute("aria-valuenow", Math.round(v * 100)); });
    setOnce("hot", st.danger > .35, function (v) { rail.classList.toggle("hot", v); });
    setOnce("danger", Math.round(st.danger * 50) / 50, function (v) { dangerEl.style.opacity = (v * .95).toFixed(2); });
    setOnce("rev", st.rev > 0, function (v) { rev.classList.toggle("on", v); oilEl.classList.toggle("on", v); });
    if (st.rev > 0) { setOnce("revN", Math.ceil(st.rev), function (v) { revN.textContent = v; }); revArc.style.strokeDashoffset = (100 * (1 - st.rev / st.revDur)).toFixed(1); }
    setOnce("wet", st.wet > 0, function (v) { wet.classList.toggle("on", v); });
    if (st.wet > 0) wetArc.style.strokeDashoffset = (100 * (1 - st.wet / st.wetDur)).toFixed(1);
  }
  function pop(html, cls) {
    const el = document.createElement("div"); el.className = "hud-pop" + (cls ? " " + cls : ""); el.innerHTML = html;
    pops.appendChild(el); setTimeout(function () { el.remove(); }, 1200);
    while (pops.children.length > 3) pops.firstChild.remove();
  }
  function bump() { scoreEl.classList.remove("bump"); void scoreEl.offsetWidth; scoreEl.classList.add("bump"); }
  $("#pauseBtn").addEventListener("click", function (e) { e.stopPropagation(); if (on.pause) on.pause(); });

  /* ---------------- How to play: a carousel of small scenes drawn by the game's renderer ---------------- */
  const DEG = Math.PI / 180;
  function scene(prims) {
    const road = ROAD.create(5);
    for (const p of prims) ROAD.append(road, p, "x", false);
    for (const seg of road.segs) SCENERY.place(road, seg, -10);
    return road;
  }
  const smooth = function (a, b, t) { t = U.clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function carAt(road, s, d, ds) {
    const p = ROAD.pose(road, s), q = ROAD.pose(road, s + 1);
    return { x: p.x + p.nx * d, y: p.y + p.ny * d, a: p.h + Math.atan(ds || 0), roadA: q.h };
  }
  function puddle(road, k, s, d, seed) {
    const p = ROAD.pose(road, s), ty = OBST.TYPES[k];
    return { k: k, ty: ty, x: p.x + p.nx * d, y: p.y + p.ny * d, h: p.h + .1, ra: ty.ra, rc: ty.rc, seed: seed, hit: false, hitAt: 0 };
  }
  /* each page: kind, name, body, and a scene function of time t (looping every `to` seconds) */
  const PAGES = [
    { kind: "controls", name: "Steer", to: 4.2, still: 1.4,
      body: "The car drives itself. You only steer: tap the left half of the screen to turn left, the right half to turn right. A tap is a smooth, gentle turn.",
      make: function () { return { road: scene([[{ k: 0, len: 260 }]]) }; },
      at: function (S, t) {
        const s = 80 + 17 * t, d = -2.3 * smooth(.6, 1.5, t) + 4.4 * smooth(2.2, 3.1, t), dd = (d - (-2.3 * smooth(.6, 1.5, t - .05) + 4.4 * smooth(2.2, 3.1, t - .05))) / (17 * .05);
        return { cars: [Object.assign({ key: "courser" }, carAt(S.road, s, d, dd))], label: t > .5 && t < 1.1 ? "tap right" : t > 2.1 && t < 2.7 ? "tap left" : "" };
      } },
    { kind: "controls", name: "Drift", to: 4.6, still: 2.7,
      body: "Hold a side for a moment to drift: a tighter turn with the rear sliding out. One hold takes any corner, even a U-turn. Press near the start of the corner and let go near the end.",
      make: function () { return { road: scene([[{ k: 0, len: 12 }, { k: 1 / 14, len: 180 * DEG * 14 }, { k: 0, len: 120 }]]) }; },
      at: function (S, t) {
        const s = 120 + 18 * t, inArc = smooth(160, 166, s) * (1 - smooth(200, 206, s)), c = carAt(S.road, s, 0);
        c.key = "courser"; c.a = c.roadA + .36 * inArc;
        const smoke = [];
        for (let i = 1; i < 8; i++) { const ps = s - i * 1.6, k = smooth(160, 166, ps) * (1 - smooth(200, 206, ps)); if (k > .1) { const q = carAt(S.road, ps - 3, 0); smoke.push({ x: q.x, y: q.y, s: .8 + i * .25, a: k * (1 - i / 8) }); } }
        return { cars: [c], smoke: smoke, label: s > 155 && s < 204 ? "hold" : "" };
      } },
    { kind: "puddles", name: "Water", to: 4.8, still: 1.9,
      body: "Driving through water slows you down hard, like hitting a rock, and splashes your screen for a couple of seconds. Steer round it.",
      make: function () { const road = scene([[{ k: 0, len: 260 }]]); return { road: road, obs: [puddle(road, "water", 112, 2.4, 7)] }; },
      at: function (S, t) {
        const hitT = 1.45, s = t < hitT ? 85 + 18 * t : 85 + 18 * hitT + 7 * (t - hitT) + 5 * Math.pow(Math.max(0, t - hitT), 2);
        S.obs[0].hit = t > hitT; S.obs[0].hitAt = 99 + hitT;
        const c = carAt(S.road, s, 2.3); c.key = "courser";
        return { cars: [c], splash: t > hitT ? Math.max(0, 1 - (t - hitT) / 2.5) : 0, label: t > hitT && t < hitT + 1 ? "slowed down" : "" };
      } },
    { kind: "puddles", name: "Oil", to: 5, still: 2.2,
      body: "An oil slick slows you down hard and swaps left and right for 3 seconds. The edges of the screen turn purple and a timer counts down until your controls are back.",
      make: function () { const road = scene([[{ k: 0, len: 260 }]]); return { road: road, obs: [puddle(road, "oil", 110, -2.4, 11)] }; },
      at: function (S, t) {
        const hitT = 1.4, s = t < hitT ? 85 + 18 * t : 85 + 18 * hitT + 7 * (t - hitT) + 5 * Math.pow(Math.max(0, t - hitT), 2);
        const c = carAt(S.road, s, -2.3); c.key = "courser";
        return { cars: [c], oil: t > hitT && t < hitT + 3 ? 1 : 0, label: t > hitT && t < hitT + 3 ? "left ⇄ right  " + Math.ceil(hitT + 3 - t) : "" };
      } },
    { kind: "the chase", name: "The Guard", to: 5.2, still: 2.6, look: -3,
      body: "The police car is always right behind you. Every slowdown lets it close in; clean driving slowly wins the gap back. If it touches you, you're busted.",
      make: function () { return { road: scene([[{ k: 0, len: 260 }]]) }; },
      at: function (S, t) {
        const s = 90 + 16 * t, gap = 9.5 - 7 * smooth(.8, 2.4, t) + 7 * smooth(3, 4.6, t);
        const c = carAt(S.road, s, .6); c.key = "courser";
        const g = carAt(S.road, s - gap - 8, .3); g.key = "guard";
        return { cars: [g, c], label: gap < 4 ? "too close!" : "" };
      } }
  ];
  const KEY_FONT = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
  function label(x, cv, text) {
    if (!text) return;
    const W = cv.clientWidth, H = cv.clientHeight; x.save(); x.font = "700 11px " + KEY_FONT; x.textAlign = "center"; x.textBaseline = "middle";
    const sp = "letterSpacing" in x; if (sp) x.letterSpacing = "2px";
    const w = x.measureText(text.toUpperCase()).width + 22, h = 22, X = W / 2, Y = H - 10 - h / 2;
    x.fillStyle = "rgba(10,10,16,.62)"; x.beginPath(); if (x.roundRect) x.roundRect(X - w / 2, Y - h / 2, w, h, h / 2); else x.rect(X - w / 2, Y - h / 2, w, h); x.fill();
    x.fillStyle = "rgba(237,239,242,.92)"; x.fillText(text.toUpperCase(), X + (sp ? 1 : 0), Y); x.restore();
  }
  const Demo = (function () {
    const cv = $("#demoCv"), prevB = $("#demoPrev"), nextB = $("#demoNext"), dots = $("#demoDots");
    let i = 0, raf = 0, t0 = 0, live = false;
    dots.innerHTML = PAGES.map(function () { return "<i></i>"; }).join("");
    $("#legend").innerHTML = CONFIG.obstacles.types.map(function (t) { return '<div><s style="background:' + t.col + '"></s><span>' + t.name + " puddle</span></div>"; }).join("") +
      '<div><s class="guard"></s><span>the Guard</span></div><div><s style="background:#FF2A2A"></s><span>the Courser (you)</span></div>';
    $("#howtoFoot").textContent = "Survive as long as you can and beat your high score. The score rises with distance and time, and the higher it gets the faster you go, with sharper corners and more puddles. Near misses and clean drifts give bonus points. Touching the edge of the road never ends a run, it only slows you a little. Keyboard: ← / → or A / D to steer, Esc to pause.";
    function paint() {
      const p = PAGES[i];
      $("#demoKind").textContent = p.kind; $("#demoName").textContent = p.name; $("#demoDesc").textContent = p.body;
      $("#demoMeta").innerHTML = "";
      cv.setAttribute("aria-label", p.name + " in the game");
      prevB.style.display = i === 0 ? "none" : "";
      nextB.textContent = i === PAGES.length - 1 ? "start over" : "next";
      $$("i", dots).forEach(function (d, k) { d.classList.toggle("on", k === i); });
    }
    function draw(t) {
      const p = PAGES[i]; if (!p.S) { p.S = p.make(); p.S.obs = p.S.obs || []; }
      const st = p.at(p.S, t), me = st.cars[st.cars.length - 1], look = p.look !== undefined ? p.look : 5;
      const sc = { segs: p.S.road.segs, obs: p.S.obs, cars: st.cars, smoke: st.smoke, splash: st.splash || 0,
        cam: { x: me.x + Math.cos(me.roadA) * look, y: me.y + Math.sin(me.roadA) * look, a: me.roadA } };
      const x = RENDER.vignette(cv, sc, t);
      if (st.oil) { const W = cv.clientWidth, H = cv.clientHeight; x.save(); x.shadowColor = "rgba(139,61,255,.9)"; x.shadowBlur = 26; x.strokeStyle = "rgba(139,61,255,.85)"; x.lineWidth = 6; x.strokeRect(0, 0, W, H); x.restore(); }
      label(x, cv, st.label);
    }
    function tick(ts) { raf = requestAnimationFrame(tick); const p = PAGES[i], t = ((ts / 1000 - t0) % p.to + p.to) % p.to; draw(t); }
    function play() { cancelAnimationFrame(raf); if (RM) { draw(PAGES[i].still); return; } t0 = performance.now() / 1000; raf = requestAnimationFrame(tick); }
    function go(n) { i = (n + PAGES.length) % PAGES.length; paint(); if (live) play(); refreshScrollCue(); }
    prevB.addEventListener("click", function () { if (on.click) on.click(); if (i > 0) go(i - 1); });
    nextB.addEventListener("click", function () { if (on.click) on.click(); go(i + 1); });
    cv.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    paint();
    return { start: function () { live = true; paint(); play(); }, stop: function () { live = false; cancelAnimationFrame(raf); },
      prev: function () { if (i > 0) go(i - 1); }, next: function () { go(i + 1); } };
  })();

  return { on: on, show: show, panelOn: panelOn, showCard: showCard, hideCard: hideCard, firstAct: firstAct, get cardUp() { return cardUp; },
    paintHome: paintHome, paintSettings: paintSettings, wipe: wipe, fade: fade, showTutorial: showTutorial, hideTutorial: hideTutorial,
    hudShow: hudShow, hudUpdate: hudUpdate, pop: pop, bump: bump, Demo: Demo, refreshScrollCue: refreshScrollCue, pad: pad, TOUCH: TOUCH, RM: RM };
})();
