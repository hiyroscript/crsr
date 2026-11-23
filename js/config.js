/* js/config.js */
/* ---- config.js ---- */
/* ============================================================================
   CONFIG — every tuning value in one place.
   Units: world units (the road is road.width wide), seconds, radians.
   Speeds are world units per second; curvatures are 1 / radius.
   Loaded first; the simulation files (util, road, obstacles, courser, guard,
   world, camera) read it in the browser and in the Node tools alike.
   ========================================================================== */
const CONFIG = {
  /* a number makes every run reproducible (also ?seed=123 in the URL); null picks a new seed per run */
  seed: null,
  hz: 60,            /* fixed simulation rate */
  maxSteps: 6,       /* most simulation steps per frame; past that the game slows down instead of spiralling */

  /* ---------------- road and generator ---------------- */
  road: {
    width: 10, sidewalk: 2.4, curb: .3,
    step: 1,              /* centerline sample spacing used for drawing */
    ahead: 700,           /* road is generated this far ahead of the Courser (arc length) */
    sceneryLag: 320,      /* a piece gets its scenery once the road is known this far past it */
    dropBehind: 420,      /* a piece is freed once it is this far behind the Courser (arc length) ... */
    dropRadius: 120,      /* ... and at least this far from the Courser in space, so nothing on screen pops */
    clearNear: 24,        /* parts of the road more than arcNear apart along it keep their centerlines this far apart */
    arcNear: 46,
    clearFar: 50,         /* parts more than arcFar apart keep this distance: room for two rows of buildings */
    arcFar: 320,
    headingWindow: 3.35,  /* the road's total turn from its start stays within ± this, so it can't coil up */
    startStraight: 150,   /* the opening straight, with no obstacles */
    leadIn: 10,           /* a short straight before every hard corner */
    breather: 1.0,        /* seconds of straight after a hard section, at the speed it will be driven */
    tries: 16,            /* candidates tried per piece before the fallbacks */
    rebase: 3000          /* recentre the world when the Courser is this far from the origin (keeps floats exact) */
  },
  /* road pieces: weight w0 at difficulty 0 and w1 at difficulty 1, from = the difficulty where it starts.
     r = radius range, a = turn range in degrees, len = straight length range */
  pieces: [
    { k: "straight", w0: 3,   w1: 1.1, len: [26, 70] },
    { k: "gentle",   w0: 3,   w1: 1.1, r: [55, 95], a: [20, 45] },
    { k: "scurve",   w0: 1.4, w1: 1.3, r: [42, 70], a: [25, 45] },
    { k: "sweeper",  w0: .7,  w1: 1.3, r: [30, 46], a: [60, 110] },
    { k: "corner",   w0: .35, w1: 1.6, r: [14, 17], a: [90, 90], hard: true },
    { k: "hairpin",  w0: 0,   w1: 1.1, r: [13.5, 15], a: [180, 180], hard: true, from: .08 },
    { k: "chicane",  w0: 0,   w1: 1.2, r: [15, 19], a: [38, 44], hard: true, from: .15 }
  ],
  /* difficulty 0..1 grows with the score and reaches 1 here */
  difficultyFull: 3000,

  /* ---------------- speed and score ---------------- */
  speed: {
    base: 24,          /* cruise speed at score 0 */
    stepPct: .06,      /* +6 % ... */
    stepPts: 200,      /* ... every 200 points, applied smoothly (a "tier" in the HUD is one step) */
    maxMult: 2.1,      /* cruise never goes past base × maxMult */
    accel: 14,         /* re-acceleration after a slowdown at base speed; scales with (cruise / base)^1.5 */
    decel: 30,         /* how fast the car sheds speed above cruise */
    startMult: .5      /* the run starts at this share of cruise */
  },
  score: {
    perUnit: .1,       /* points per unit driven */
    perSec: 1,         /* points per second survived */
    nearMiss: 15,      /* passing a puddle closer than nearMissDist without touching it */
    nearMissDist: .8,
    cleanDrift: 30,    /* a drift at least cleanDriftTime long with no hit and no scrape */
    cleanDriftTime: .9
  },

  /* ---------------- the Courser ---------------- */
  car: {
    width: 4,               /* sprite width: 40 % of the road */
    hitW: 3.2, hitL: 7.3,   /* capsule hitbox, a little smaller than the sprite */
    kTap: 1 / 22,           /* curvature of a tap: a gentle turn */
    kDrift: 1 / 9.5,        /* curvature of a held drift: tighter than the tightest corner (r 13.5) at every speed */
    speedScale: -.1,        /* curvature × (cruise / base)^speedScale: the turn rate rises a little less than speed */
    driftAfter: .25,        /* hold longer than this to drift */
    driftRamp: .2,          /* tap curvature -> drift curvature over this long */
    steerLag: .045,         /* curvature eases to its target with this time constant: smooth, never twitchy */
    minTap: .12,            /* a tap steers for at least this long */
    assist: .3,             /* road assist: heading eases toward the road's direction with this time constant ... */
    assistWindow: .45,      /* ... only while it is off by less than this (so it never takes a corner for you) */
    assistDelay: .12,       /* ... and only this long after you let go */
    slip: .36, slipLag: .12, /* drift body angle (rear slides out) */
    /* corner assist: while you hold toward a tight bend (tighter than minK) that you are in or will reach within
       `ahead` seconds, the turn follows the bend and pulls toward its middle (k1 per unit off, k2 per radian off),
       held between minShare × kTap and kDrift. So one hold through any corner works at any speed: press near the
       start, let go near the end (up to exitGrace seconds late is fine). On straights and gentle bends a hold is
       a plain drift. */
    corner: { minK: 1 / 30, ahead: .45, exitGrace: .22, k1: .018, k2: .22, minShare: .5 },
    edge: {                 /* soft edges: never deadly, the car can't leave the road */
      base: .04,            /* speed lost on any new contact ... */
      impact: .26,          /* ... plus this × sin(angle into the edge) */
      scrape: .55,          /* speed lost per second while scraping */
      deflect: .45          /* share of the angle into the edge turned back toward the road each contact step */
    }
  },

  /* ---------------- the Guard ---------------- */
  guard: {
    gapMax: 10,          /* bumper-to-bumper gap at most (× camera zoom-out), so the Guard never leaves the screen */
    gapStart: 10,
    ratioNear: .955,     /* Guard speed = cruise × ratio; the ratio rises from ratioNear (gap 0) to ratioFar (max gap): */
    ratioFar: .985,      /* the gap recovers quickly when it is small and slowly near the max */
    ratioHard: .012,     /* + this × difficulty: the catch-up bonus grows over a run */
    grace: 2,            /* seconds at the start with a fixed gap */
    avoidAhead: 30,      /* it looks this far ahead for puddles to steer around */
    avoidMargin: .45,
    latLag: .22,         /* lateral steering time constant */
    ramDist: 7,          /* closer than this it lines up with the Courser to ram */
    slipMax: .32, slipK: 1 / 24   /* drift look on corners tighter than this curvature */
  },

  /* ---------------- obstacles (data-driven: add a type here, an effect in obstacles.js, a look in render.js) ---------------- */
  obstacles: {
    types: [
      { k: "water", name: "Water", col: "#3D8BFF", from: 0, w0: 1, w1: 1, ra: 2.7, rc: 1.9, hit: .82,
        slow: .42, shake: .7, effect: "splash", dur: 2.5, sfx: "splash", buzz: 40 },
      { k: "oil", name: "Oil", col: "#8B3DFF", from: 120, w0: .45, w1: 1, ra: 2.6, rc: 1.85, hit: .82,
        slow: .45, shake: .5, effect: "reverse", dur: 3, sfx: "slick", buzz: 70 }
    ],
    firstAt: 240,           /* nothing before this arc length */
    spacing: [105, 44],     /* arc gap between groups at difficulty 0 and 1, × sqrt(speed mult) */
    react: .8,              /* seconds between staggered puddles at the speed they will be met */
    minGap: 20,
    rowGap: 10,
    maxK: 1 / 30,           /* never on a bend tighter than this */
    cornerClear: 26,        /* keep this many units + cornerSecs × speed clear before a hard corner */
    cornerSecs: .9,
    afterCorner: 14,        /* ... and this many after it */
    patterns: [
      { k: "single",  w0: 3,  w1: 1 },
      { k: "row",     w0: .4, w1: .6 },
      { k: "slalom2", w0: .5, w1: 1.6, from: .1 },
      { k: "slalom3", w0: 0,  w1: 1.2, from: .3 }
    ]
  },

  /* ---------------- camera ---------------- */
  camera: {
    anchor: .58,         /* the Courser sits this far down the screen: more road ahead than behind, and room for the Guard */
    homeAnchor: .8, homeZoom: 1.15,   /* the home demo: the car below the menu, a little further out */
    roadFracW: .45,      /* road width as a share of the screen width (portrait) ... */
    roadFracH: .23,      /* ... or of the height, whichever is smaller */
    zoomOut: .35,        /* extra view at top speed */
    turnLag: .14,        /* rotation smoothing */
    zoomLag: .6,
    bustZoom: .62        /* zoom on the busted cinematic (< 1 = closer) */
  },

  /* ---------------- feel ---------------- */
  juice: {
    shakeHit: 1, shakeScrape: .25, shakeBust: 1.2,
    speedLines: 1.25,    /* speed lines from this speed multiplier */
    danger: .45,         /* the danger look (vignette, siren, glow) starts below this share of the max gap */
    bustTime: 1.5        /* seconds of busted cinematic before the card */
  },
  demo: { scoreStart: 260, restartAfter: 110 },
  save: { key: "coursersevade.v1" }
};
