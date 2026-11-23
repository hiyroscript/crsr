/* js/audio.js */
/* ---- audio.js ---- */
/* ============================================================================
   AUDIO — everything synthesised live with Web Audio (no audio files), like
   shkr's music.js: built on the first gesture, one compressor out, separate
   buses for effects and music so each has its own switch.
   - Loops: engine (pitch and brightness rise with speed), drift screech, siren
     (louder as the Guard closes in), driven by AUDIO.update(state) each frame.
   - One-shots (AUDIO.sfx): splash, slick, scrape, busted (shkr's crash recipe
     plus a thud), near miss whoosh, tier chime, bonus, UI click.
   - Music: a small driving loop (A minor, 124 bpm) scheduled ahead on the
     audio clock; quieter on the home screen.
   ========================================================================== */
const AUDIO = (function () {
  "use strict";
  let ctx = null, comp = null, sfxBus = null, musicBus = null, noise = null, loops = null;
  let sfxOn = true, musicOn = true, musicLevel = 0;
  const BPM = 124, STEP = 60 / BPM / 4;
  const mus = { next: 0, step: 0, running: false };

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { try { ctx = new AC(); } catch (e2) { return false; } }
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = .003;
    const out = ctx.createGain(); out.gain.value = .9; comp.connect(out); out.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 1 : 0; sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(comp);
    const len = ctx.sampleRate; noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0), r = U.rng(99); for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    buildLoops();
    return true;
  }
  function buildLoops() {
    const mk = function () { const g = ctx.createGain(); g.gain.value = 0; g.connect(sfxBus); return g; };
    /* engine: a sawtooth and a sub square through a resonant lowpass, roughened by a fast LFO */
    const eg = mk(), lp = ctx.createBiquadFilter(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    lp.type = "lowpass"; lp.frequency.value = 500; lp.Q.value = 3; o1.type = "sawtooth"; o2.type = "square"; o1.frequency.value = 50; o2.frequency.value = 25;
    lfo.frequency.value = 23; lg.gain.value = 4; lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const o2g = ctx.createGain(); o2g.gain.value = .5; o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(eg);
    o1.start(); o2.start(); lfo.start();
    /* drift screech: band-passed noise with a wobble */
    const sg = mk(), bp = ctx.createBiquadFilter(), src = ctx.createBufferSource(), sl = ctx.createOscillator(), slg = ctx.createGain();
    bp.type = "bandpass"; bp.frequency.value = 2300; bp.Q.value = 6; src.buffer = noise; src.loop = true;
    sl.frequency.value = 9; slg.gain.value = 260; sl.connect(slg); slg.connect(bp.frequency);
    src.connect(bp); bp.connect(sg); src.start(); sl.start();
    /* siren: a triangle wailing between two pitches, softened */
    const zg = mk(), so = ctx.createOscillator(), wl = ctx.createOscillator(), wg = ctx.createGain(), sf = ctx.createBiquadFilter();
    so.type = "triangle"; so.frequency.value = 900; wl.type = "sine"; wl.frequency.value = .62; wg.gain.value = 320; wl.connect(wg); wg.connect(so.frequency);
    sf.type = "lowpass"; sf.frequency.value = 2600; so.connect(sf); sf.connect(zg); so.start(); wl.start();
    loops = { eg: eg, lp: lp, o1: o1, o2: o2, sg: sg, zg: zg };
  }
  function set(param, v, tc) { param.setTargetAtTime(v, ctx.currentTime, tc || .05); }

  /* st: { on (a run is being played), home, speed (0..1 of the speed range), v (speed mult), drift, danger (0..1), busted } */
  function update(st) {
    if (!ctx || ctx.state !== "running") return;
    const L = loops, sp = st.speed || 0;
    const run = st.on && !st.busted;
    set(L.o1.frequency, 46 + 74 * sp + (st.drift ? 9 : 0), .08); set(L.o2.frequency, 23 + 37 * sp, .08);
    set(L.lp.frequency, 380 + 1500 * sp + (st.drift ? 400 : 0), .1);
    set(L.eg.gain, run ? .05 + .035 * sp : st.home ? .012 : 0, .12);
    set(L.sg.gain, run && st.drift ? .045 : 0, .05);
    set(L.zg.gain, st.busted ? .11 : run ? .006 + .085 * (st.danger || 0) : st.home ? .004 : 0, .15);
    /* music */
    const want = !musicOn ? 0 : st.home ? .32 : run ? .42 : st.busted ? .12 : .2;
    if (want !== musicLevel) { musicLevel = want; set(musicBus.gain, want, .25); }
    if (musicOn) schedule();
  }

  /* ---------------- one-shots (shkr's vl recipes: tone and noise) ---------------- */
  function tone(t, o, bus) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || "sine"; osc.frequency.setValueAtTime(o.f, t); osc.frequency.exponentialRampToValueAtTime(o.f2 || o.f, t + o.d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.g, t + (o.a || .006)); g.gain.exponentialRampToValueAtTime(.0001, t + o.d);
    if (o.filter) { const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.filter; osc.connect(fl); fl.connect(g); } else osc.connect(g);
    g.connect(bus || sfxBus); osc.start(t); osc.stop(t + o.d + .03);
  }
  function hiss(t, o, bus) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; fl.type = o.type || "lowpass"; fl.Q.value = o.q || 1;
    fl.frequency.setValueAtTime(o.f, t); fl.frequency.exponentialRampToValueAtTime(o.f2 || o.f, t + o.d);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.g, t + (o.a || .004)); g.gain.exponentialRampToValueAtTime(.0001, t + o.d);
    s.connect(fl); fl.connect(g); g.connect(bus || sfxBus); s.start(t, Math.random() * .5); s.stop(t + o.d + .03);
  }
  const ok = function () { return ctx && ctx.state === "running"; };
  const sfx = {
    splash: function () { if (!ok()) return; const t = ctx.currentTime; hiss(t, { f: 3200, f2: 300, d: .55, g: .34 }); for (let i = 0; i < 4; i++) tone(t + .04 + i * .07, { f: 260 + Math.random() * 200, f2: 900 + Math.random() * 500, d: .09, g: .07 }); },
    slick: function () { if (!ok()) return; const t = ctx.currentTime; tone(t, { f: 460, f2: 80, d: .55, g: .2, type: "sine" }); hiss(t, { f: 900, f2: 160, d: .4, g: .14 }); tone(t + .1, { f: 220, f2: 60, d: .4, g: .08, type: "triangle" }); },
    scrape: function (p) { if (!ok()) return; const t = ctx.currentTime; hiss(t, { type: "bandpass", q: 3, f: 3400, f2: 1800, d: .16, g: .05 + .12 * (p || 0) }); },
    busted: function () { if (!ok()) return; const t = ctx.currentTime;
      tone(t, { f: 150, f2: 48, d: .34, type: "sawtooth", g: .24, filter: 700 }); hiss(t, { f: 900, f2: 120, d: .3, g: .18 });
      tone(t, { f: 90, f2: 40, d: .25, g: .3 }); hiss(t + .02, { type: "bandpass", q: 2, f: 5000, f2: 2500, d: .25, g: .06 }); },
    nearMiss: function () { if (!ok()) return; hiss(ctx.currentTime, { type: "bandpass", q: 2, f: 600, f2: 2600, d: .28, g: .09, a: .08 }); },
    bonus: function () { if (!ok()) return; const t = ctx.currentTime; [659, 880, 1175].forEach(function (f, i) { tone(t + i * .06, { f: f, d: .16, g: .07, type: "triangle" }); }); },
    tier: function () { if (!ok()) return; const t = ctx.currentTime; tone(t, { f: 880, d: .18, g: .08, type: "triangle" }); tone(t + .1, { f: 1320, d: .3, g: .08, type: "triangle" }); },
    click: function () { if (!ok()) return; tone(ctx.currentTime, { f: 1300, f2: 900, d: .045, g: .05, type: "square", filter: 3000 }); },
    go: function () { if (!ok()) return; const t = ctx.currentTime; tone(t, { f: 220, f2: 440, d: .25, g: .09, type: "sawtooth", filter: 1400 }); }
  };

  /* ---------------- music: kick, clap, hats, bass, a plucked arp; A minor: Am F C G ---------------- */
  const ROOTS = [45, 41, 48, 43], CHORD = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function playStep(i, t) {
    const s = i % 16, bar = Math.floor(i / 16) % 4, root = ROOTS[bar], B = musicBus;
    if (s % 4 === 0) { tone(t, { f: 140, f2: 42, d: .22, g: .55 }, B); }
    if (s === 4 || s === 12) hiss(t, { type: "bandpass", q: .8, f: 1700, f2: 900, d: .16, g: .22 }, B);
    if (s % 2 === 1) hiss(t, { type: "highpass", f: 7500, d: .045, g: s % 4 === 3 ? .07 : .035 }, B);
    if (s % 2 === 0) { const oct = s % 8 === 6 ? 12 : 0; tone(t, { f: mtof(root - 12 + oct), d: STEP * 1.7, g: .2, type: "sawtooth", filter: 480 }, B); }
    if ((i >> 6) % 2 === 1 || s % 4 !== 0) { const n = root + 12 + CHORD[bar][s % 3] + (s >= 8 ? 12 : 0); if (s % 2 === 0 || s > 11) tone(t, { f: mtof(n), d: .12, g: .035, type: "triangle", filter: 2600 }, B); }
  }
  function schedule() {
    const now = ctx.currentTime;
    if (!mus.running || mus.next < now - .25) { mus.next = now + .06; mus.running = true; }
    while (mus.next < now + .14) { playStep(mus.step, mus.next); mus.step++; mus.next += STEP; }
  }

  return {
    init: init, update: update, sfx: sfx,
    get ctx() { return ctx; },
    setSfx: function (v) { sfxOn = v; if (sfxBus) set(sfxBus.gain, v ? 1 : 0, .03); },
    setMusic: function (v) { musicOn = v; if (!v && musicBus) { musicLevel = 0; set(musicBus.gain, 0, .05); } },
    resume: function () { if (ctx && ctx.state !== "running") return ctx.resume(); },
    suspend: function () { if (ctx && ctx.state === "running") return ctx.suspend(); }
  };
})();
