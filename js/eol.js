(function () {
  var A = WOG.attr, num = WOG.num;
  var E = WOG.eol = {
    delay: 1.0,
    view: { x: -360, y: -17, zoom: 0.95 },
    camTravel: 1.2,
    firstDrop: 0.35,
    dropGap: 0.2,
    dropMaxTime: 7,
    settleTime: 0.9,
    spawnY: 255,
    spawnSpread: 16,
    waterDamp: 0.6,
    fillRate: 60,
    areaPerBall: 1.35,
    flushBoost: 3,
    drainMax: 3.5,
    glassPad: 15,
    dim: 0.45,
    handleSlackX: 14, handleSlackY: 16,
    returnTo: null,
    auto: false,
    pendingMax: 2.5,
    preloadAfter: 3,
    loaded: false
  };
  var MOVIES = ['eol_1_in', 'eol_2_fillwait', 'eol_2.5_statsin', 'eol_3_handleup', 'eol_4_waitclick', 'eol_5_handlepull', 'eol_6_travel', 'eol_7_islandin'];
  var HANDLE = 'COLLECTIONTANKHANDLE', TANK = 'COLLECTIONTANK_FG';

  function parseScene(doc) {
    var root = doc.documentElement;
    var s = { geometry: [], forcefields: [], particles: [] };
    WOG.children(root).forEach(function (el) {
      var id = A(el, 'id');
      switch (el.tagName) {
        case 'linearforcefield':
          s.forcefields.push({ kind: 'linear', id: id, type: A(el, 'type'), force: WOG.vec(A(el, 'force')),
            center: A(el, 'center') != null ? WOG.vec(A(el, 'center')) : null,
            width: A(el, 'width') != null ? num(A(el, 'width')) : null, height: A(el, 'height') != null ? num(A(el, 'height')) : null,
            dampeningfactor: num(A(el, 'dampeningfactor')), antigrav: WOG.bool(A(el, 'antigrav')), geomonly: WOG.bool(A(el, 'geomonly')),
            enabled: A(el, 'enabled') == null ? true : WOG.bool(A(el, 'enabled')), water: WOG.bool(A(el, 'water')) });
          break;
        case 'radialforcefield':
          s.forcefields.push({ kind: 'radial', id: id, type: A(el, 'type'), center: WOG.vec(A(el, 'center')), radius: num(A(el, 'radius')),
            forceatcenter: num(A(el, 'forceatcenter')), forceatedge: num(A(el, 'forceatedge')),
            dampeningfactor: num(A(el, 'dampeningfactor')), antigrav: WOG.bool(A(el, 'antigrav')), geomonly: WOG.bool(A(el, 'geomonly')),
            enabled: A(el, 'enabled') == null ? true : WOG.bool(A(el, 'enabled')) });
          break;
        case 'rectangle':
          if (WOG.bool(A(el, 'static'))) s.geometry.push({ kind: 'rectangle', id: id, static: true, material: A(el, 'material'), tag: A(el, 'tag'),
            x: num(A(el, 'x')), y: num(A(el, 'y')), width: num(A(el, 'width')), height: num(A(el, 'height')), rotation: num(A(el, 'rotation')) });
          break;
        case 'particles':
          var pp = WOG.vec(A(el, 'pos'), [0, 0]);
          s.particles.push({ id: id, effect: A(el, 'effect'), depth: num(A(el, 'depth')), x: pp[0], y: pp[1], pretick: num(A(el, 'pretick')),
            enabled: A(el, 'enabled') == null ? true : WOG.bool(A(el, 'enabled')) });
          break;
      }
    });
    return s;
  }

  E.load = async function (res) {
    if (E.loaded) return E.scene;
    var doc = await WOG.fetchXML('res/scenes/EOL.scene');
    try { await res.addManifest('res/scenes/EOL.resrc'); } catch (e) { console.warn('EOL.resrc not loaded:', e.message); }
    E.scene = parseScene(doc);
    var jobs = [res.loadSounds(['SOUND_GLOBAL_SPLASH', 'SOUND_GLOBAL_SUCK_BEGIN', 'SOUND_GLOBAL_SUCK_END'].filter(function (s) { return res.has(s); }))];
    if (WOG.fx) jobs.push(WOG.fx.load());
    MOVIES.forEach(function (m) { jobs.push(WOG.movie.preload(res, m, { vars: E.statVars({ stats: {} }) })); });
    await Promise.all(jobs);
    if (WOG.fx && E.scene.particles.length) {
      var pids = {};
      E.scene.particles.forEach(function (p) { var d = WOG.fx.effects[p.effect]; if (d) d.particles.forEach(function (t) { t.images.forEach(function (i) { pids[i] = 1; }); }); });
      await res.loadImages(Object.keys(pids));
    }
    E.loaded = true;
    return E.scene;
  };

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  E.statVars = function (s) {
    var st = s.stats || {};
    return { STAT_TIME: st.time != null ? st.time : '', STAT_MOVES: st.moves != null ? st.moves : '', STAT_EXTRACREDIT: st.extra != null ? st.extra : '',
             STAT_COLLECTED: st.collected != null ? st.collected : '', STAT_GOAL: st.goal != null ? st.goal : '', OCD_CRITERIA_EOL_TEXT: st.ocd != null ? st.ocd : '' };
  };

  E.update = function (game, res, dt, mx, my) {
    if (game.eol) { updateScreen(game, res, dt, mx, my); return; }
    if (game.isMap || game.eolStarting) return;
    var st = game.pipeState, lv = game.data.level;
    if (!st || !lv.exit) return;
    var h = game.eolHandle || (game.eolHandle = { drop: 0, hov: 0, pending: false, wait: 0, started: false, over: false, chain: null, acc: 0, mx: mx, my: my });
    E.loadChain(WOG.res);
    var reached = st.collected > 0 && st.collected >= lv.ballsrequired;
    if (!E.loaded && !game.eolLoading && (reached || (game.playTime || 0) > E.preloadAfter)) {
      game.eolLoading = true;
      E.load(WOG.res).catch(function (e) { console.warn('EOL preload failed:', e); }).then(function () { game.eolLoading = false; });
    }
    if (reached && !h.chain && chainReady(WOG.res)) makeChain(h, WOG.res);
    if (h.chain) {
      h.t = (h.t || 0) + dt;
      var tEnd = Math.sqrt(2 * -h.chain.y0 / CH.dropAccel), ay = Math.min(0, h.chain.y0 + 0.5 * CH.dropAccel * h.t * h.t);
      h.drop = Math.min(1, h.t / tEnd);
      h.acc = Math.min(h.acc + Math.min(dt, 0.05), 0.05);
      while (h.acc >= CH.sub) { stepChain(h.chain, ay); h.acc -= CH.sub; }
      var over = h.drop > 0.9 && !h.pending && E.hitHandleLevel(mx, my);
      h.over = over;
      h.hov = Math.max(0, Math.min(1, h.hov + (over ? 1 : -1) * dt / 0.1));
    }
    if (h.pending && !h.started) {
      h.wait += dt;
      if (!game.balls.some(function (b) { return b.sucked; }) || h.wait >= E.pendingMax) { h.started = true; Promise.resolve(E.start(game)).then(function () { if (!game.eol) h.pending = h.started = false; }); }
    }
    if (E.auto && reached && !st.active && !game.balls.some(function (b) { return b.sucked; })) {
      game.eolWait = (game.eolWait || 0) + dt;
      if (game.eolWait >= E.delay) E.start(game);
    } else if (E.auto) game.eolWait = 0;
  };

  function until(fn, maxMs) {
    return new Promise(function (resolve) {
      var t0 = performance.now();
      (function tick() { if (fn() || (maxMs && performance.now() - t0 > maxMs)) resolve(); else setTimeout(tick, 30); })();
    });
  }

  E.start = async function (game, n) {
    game = game || WOG.getGame();
    if (!game || game.eol || game.eolStarting || game.isMap) return;
    var res = WOG.res;
    game.eolStarting = true;
    try {
      await E.load(res);
      var st = game.pipeState || {}, defs = (st.defs || []).slice();
      if (n != null) {
        var pool = game.balls.map(function (b) { return b.def; });
        if (!pool.length) pool = defs;
        defs = []; for (var i = 0; i < n && pool.length; i++) defs.push(pool[i % pool.length]);
      }
      if (game.world) { if (game.world.setHover) game.world.setHover(null); game.world.release(); }
      WOG.pipe && WOG.pipe.stop();
      var count = n != null ? n : (st.collected || defs.length), goal = game.data.level.ballsrequired || 0;
      var s = build(game, res, defs, count);
      s.stats = { time: fmtTime(game.playTime || 0), moves: game.moves || 0, collected: count, goal: goal, extra: Math.max(0, count - goal), ocd: '' };
      s.vars = E.statVars(s);
      if (n == null && count >= goal && WOG.save) WOG.save.complete(game.name, Math.max(0, count - goal));
      game.eol = s;
      runSequence(game, res, s).catch(function (e) { console.error('end-of-level sequence failed:', e); });
    } catch (e) { console.error('end-of-level screen failed:', e); }
    game.eolStarting = false;
  };

  async function runSequence(game, res, s) {
    var M = WOG.movie, v = { vars: s.vars, hold: true };
    s.phase = 'fly';
    if (WOG.camera && WOG.camera.flyToEnd) { WOG.camera.flyToEnd(E.camTravel); await until(function () { return !WOG.camera.playing; }, (E.camTravel + 1) * 1000); }
    s.phase = 'in';
    await M.play(res, 'eol_1_in', v);
    s.phase = 'fill'; s.dropping = true; s.dropT = -E.firstDrop;
    var filled = until(function () { return s.settled; });
    await M.play(res, 'eol_2_fillwait', { vars: s.vars, hold: true, loopFor: 0.05, loopUntil: filled });
    s.phase = 'stats';
    await M.play(res, 'eol_2.5_statsin', v);
    s.phase = 'handleup';
    await M.play(res, 'eol_3_handleup', v);
    s.phase = 'wait'; s.waiting = true;
    var clicked = new Promise(function (r) { s.onClick = r; });
    await M.play(res, 'eol_4_waitclick', { vars: s.vars, hold: true, loopFor: 0.05, loopUntil: clicked });
    s.waiting = false;
    s.phase = 'pull';
    flush(game, res, s);
    await M.play(res, 'eol_5_handlepull', v);
    await until(function () { return s.flushed; }, 1500);
    s.phase = 'travel';
    await M.play(res, 'eol_6_travel', v);
    s.phase = 'leave';
    var to = E.returnTo || WOG.returnTo || 'MapWorldView';
    if (WOG.go) await WOG.go(to, { covered: true, outMovie: 'eol_7_islandin' });
  }

  function initBall(b) {
    b.vx = 0; b.vy = 0; b.onGround = false; b.groundN = [0, 1];
    b.climb = null; b.jumping = null; b.jumpCool = 0; b.wakeJump = false;
    b.held = false; b.pendingTorque = 0; b.angVel = 0;
    b.fast = false; b.fastGround = 0; b.released = false; b.peakFall = 0; b.soundT = -99;
    b.ai = { mode: 'walk', until: 0, dir: 1, speedMul: 1, rand: WOG.rng(b.id * 7 + 555) };
    b.mass = b.def.mass || 1;
    b.state = 'tank'; b.sleeping = true;
  }

  function build(game, res, defs, count) {
    var sc = E.scene, W = WOG.World;
    var geom = sc.geometry.map(function (g) { return Object.assign({}, g); });
    var fields = sc.forcefields.map(function (f) { return Object.assign({}, f, f.center ? { center: f.center.slice() } : {}); });
    var scn = { geometry: geom, forcefields: fields };
    var eg = { balls: [], strands: [], data: { scene: scn, level: game.data.level } };
    var world = new W(eg, {});
    world.playSound = function (b, ev) { res.playSound(b.def.sounds[ev]); };
    var s = { scene: sc, world: world, balls: eg.balls, fields: fields, geom: geom, time: 0, defs: defs, count: count,
              needed: game.data.level.ballsrequired, spawned: 0, dropT: 0, dropping: false, settled: false, settleT: 0,
              flushing: false, flushed: false, drained: 0, flushT: 0, phase: 'fly', waiting: false, dimA: 0,
              plug: geom.filter(function (g) { return /^bigTankBottom/.test(g.id || ''); }), pointer: { sx: -999, sy: -999 }, stats: {}, vars: {} };
    s.goo = fields.filter(function (f) { return f.id === 'tankGoo'; })[0] || null;
    s.flush = fields.filter(function (f) { return f.id === 'flushForce'; })[0] || null;
    if (s.flush) { s.flush.enabled = false; s.flush._f0 = [s.flush.forceatcenter, s.flush.forceatedge]; }
    if (s.goo) { s.goo.enabled = false; s.goo.dampeningfactor = Math.max(s.goo.dampeningfactor, E.waterDamp); s.floorY = s.goo.center[1]; s.goo.height = 0; }
    s.level = 0;
    var L = geom.filter(function (g) { return g.id === 'bigTankLeftWall'; })[0], R = geom.filter(function (g) { return g.id === 'bigTankRightWall'; })[0], B = geom.filter(function (g) { return g.id === 'bigTankBottom'; })[0];
    s.tank = L && R && B ? { x0: L.x + L.width / 2, x1: R.x - R.width / 2, y0: B.y + B.height / 2, y1: L.y + L.height / 2, wallL: L, wallR: R, floor: B } : null;
    if (s.tank && s.goo) { s.floorY = s.tank.y0; s.goo.width = s.tank.x1 - s.tank.x0 + 22; s.goo.center[0] = (s.tank.x0 + s.tank.x1) / 2; s.maxLevel = (s.tank.y1 - s.tank.y0) * 0.94; }
    else s.maxLevel = 330;
    s.gush = null;
    var gp = sc.particles.filter(function (p) { return p.id === 'gooGush'; })[0] || sc.particles[0];
    if (gp && WOG.fx) {
      s.gush = WOG.fx.make(gp.effect, { x: gp.x, y: gp.y, depth: gp.depth, pretick: 0 }); s.gushOn = 0;
      if (s.gush) { s.gushDef = s.gush.def; s.gushStop = Object.assign({}, s.gush.def, { max: 0 }); }
    }
    s.cam = new WOG.Camera();
    return s;
  }

  function gooTarget(s) {
    if (!s.tank || s.flushing || s.flushed) return 0;
    var area = 0; s.balls.forEach(function (b) { area += Math.PI * b.radius * b.radius; });
    var lvl = area * E.areaPerBall / (s.tank.x1 - s.tank.x0);
    return Math.min(s.maxLevel, lvl + (s.balls.length ? 6 : 0));
  }

  function flush(game, res, s) {
    console.log('level stats:', { level: game.name, collected: s.count, needed: s.needed, moves: s.stats.moves, time: s.stats.time });
    s.flushing = true; s.flushT = 0; s.spawned = s.defs.length; s.dropping = false;
    s.plug.forEach(function (g) { var i = s.world.statics.indexOf(g); if (i >= 0) s.world.statics.splice(i, 1); s.plugOut = s.plugOut || []; s.plugOut.push(g); });
    if (s.flush) { s.flush.forceatcenter = s.flush._f0[0] * E.flushBoost; s.flush.forceatedge = s.flush._f0[1] * E.flushBoost; s.flush.enabled = true; }
    s.balls.forEach(function (b) { b.vy -= 4; });
    if (!s.balls.length) finishFlush(s, res);
  }
  function finishFlush(s, res) {
    s.flushing = false; s.flushed = true;
    if (s.flush) s.flush.enabled = false;
    (s.plugOut || []).forEach(function (g) { s.world.statics.push(g); });
  }

  function updateScreen(game, res, dt, mx, my) {
    var s = game.eol, world = s.world;
    s.time += dt; s.pointer.sx = mx; s.pointer.sy = my;
    var dimGoal = (s.phase === 'fly' || s.phase === 'leave') ? 0 : E.dim;
    s.dimA += (dimGoal - s.dimA) * Math.min(1, dt * 5);
    if (s.dropping && s.spawned < s.defs.length) {
      var gap = Math.min(E.dropGap, E.dropMaxTime / Math.max(1, s.defs.length));
      s.dropT += dt;
      while (s.dropT >= gap && s.spawned < s.defs.length) {
        s.dropT -= gap;
        var def = s.defs[s.spawned], rr = WOG.rng(s.spawned * 31 + 7), tk = s.tank, cx = tk ? (tk.x0 + tk.x1) / 2 : -360;
        var b = new WOG.Ball(def, { type: def.name, x: cx + (rr() * 2 - 1) * E.spawnSpread, y: E.spawnY + rr() * 20, id: 5000 + s.spawned, angle: rr() * 6.28, discovered: true });
        initBall(b); b.vx = (rr() * 2 - 1) * 6; b.vy = -80;
        s.balls.push(b); s.spawned++;
        world.refreshMasses();
        s.gushOn = 0.5;
      }
    }
    if (s.dropping && s.spawned >= s.defs.length && !s.settled) { s.settleT += dt; if (s.settleT >= E.settleTime) s.settled = true; }
    if (s.gush) {
      s.gushOn = Math.max(0, s.gushOn - dt);
      s.gush.def = s.gushOn > 0 ? s.gushDef : s.gushStop;
      if (s.gushOn > 0 || s.gush.parts.length) WOG.fx.update(s.gush, dt, s.cam, 800, 600);
    }
    if (s.goo) {
      var goal = gooTarget(s), cur = s.level, stp = E.fillRate * dt;
      s.level = goal > cur ? Math.min(goal, cur + stp) : Math.max(goal, cur - stp);
      s.goo.enabled = !s.flushed && s.level > 1 && !s.flushing;
      s.goo.height = s.level; s.goo.center[1] = s.floorY + s.level / 2;
    }
    var P = WOG.PHYS, simDt = dt * P.timeScale, n = Math.max(1, Math.ceil(simDt / P.subStep)), h = simDt / n, i, b2;
    for (i = 0; i < s.balls.length; i++) s.balls[i].state = 'tank';
    for (i = 0; i < n; i++) world.step(h);
    world.simTime += simDt;
    for (i = s.balls.length - 1; i >= 0; i--) {
      b2 = s.balls[i];
      if (s.goo && s.level > 1 && !b2.inGoo && Math.abs(b2.x - s.goo.center[0]) < s.goo.width / 2 && b2.y < s.floorY + s.level) {
        b2.inGoo = true; if (s.time - (s.lastSplash || -9) > 0.07) { res.playSound(['SOUND_GLOBAL_SPLASH'], 0.6); s.lastSplash = s.time; }
      }
      if (s.flushing && (b2.y < (s.tank ? s.tank.y0 : -175) - 260 || (s.flush && Math.hypot(b2.x - s.flush.center[0], b2.y - s.flush.center[1]) < 30))) { s.balls.splice(i, 1); s.drained++; }
    }
    if (s.flushing) {
      s.flushT += dt;
      if ((s.spawned >= s.defs.length && !s.balls.length) || s.flushT > E.drainMax) { s.balls.length = 0; finishFlush(s, res); }
    }
  }

  function handleBox(t) {
    var M = WOG.movie, p = M.actorPose('eol_4_waitclick', HANDLE, t != null ? t : M.timeOf('eol_4_waitclick')), img = p && WOG.res.image(p.imageId);
    if (!p || !img) return null;
    return { x: p.x, y: p.y, th: p.ang * Math.PI / 180 * M.angleSign, w: img.width * p.sx, h: img.height * p.sy, img: img };
  }
  function hitBox(b, sx, sy) {
    var dx = sx - b.x, dy = sy - b.y, c = Math.cos(b.th), sn = Math.sin(b.th);
    var lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
    return Math.abs(lx) <= b.w / 2 + E.handleSlackX && Math.abs(ly) <= b.h / 2 + E.handleSlackY;
  }
  var CH = E.chain = {
    flip: true,
    startAngle: 0.45,
    x: 600,
    links: 6, seg: 30,
    dropAccel: 900,
    gravity: 1100, drag: 0.7, iters: 12, sub: 1 / 120,
    handleMass: 5,
    slackX: 8, slackY: 8
  };
  var IMG = { up: 'IMAGE_EOL_CONTINUE_UP', over: 'IMAGE_EOL_CONTINUE_OVER', link: 'IMAGE_EOL_CHAINLINK' };
  var CHEER = 'SOUND_EOL_CHEER2';
  var FILES = { up: 'res/images/continue_up', over: 'res/images/continue_over', link: 'res/images/chainlink' };
  E.loadChain = function (res) {
    if (E._chainP) return E._chainP;
    Object.keys(IMG).forEach(function (k) { if (!res.defs[IMG[k]]) res.defs[IMG[k]] = { type: 'image', path: FILES[k] }; });
    if (!res.defs[CHEER]) res.defs[CHEER] = { type: 'sound', path: 'res/sounds/cheer2' };
    return (E._chainP = Promise.all([res.loadImages(Object.keys(IMG).map(function (k) { return IMG[k]; })), res.loadSound(CHEER)]));
  };
  function chainReady(res) { return !!(res.image(IMG.up) && res.image(IMG.over) && res.image(IMG.link)); }
  function makeChain(h, res) {
    var up = res.image(IMG.up), n = CH.links, seg = CH.seg, hh = up.width / 2, total = n * seg + hh, y0 = -(total + 40), P = [], i;
    var th = CH.startAngle * (Math.random() < 0.5 ? -1 : 1), sx = Math.sin(th), cy = Math.cos(th), d, x, y;
    for (i = 0; i <= n + 1; i++) {
      d = i <= n ? i * seg : n * seg + hh; x = CH.x + sx * d; y = y0 + cy * d;
      P.push({ x: x, y: y, px: x, py: y, im: i === 0 ? 0 : (i <= n ? 1 : 1 / CH.handleMass) });
    }
    h.chain = { P: P, n: n, hh: hh, y0: y0 };
    res.loadSound(CHEER).then(function () { res.playSound([CHEER]); });
  }
  function link(a, b, len) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6, w = a.im + b.im; if (!w) return;
    var k = (d - len) / d / w;
    a.x += dx * k * a.im; a.y += dy * k * a.im; b.x -= dx * k * b.im; b.y -= dy * k * b.im;
  }
  function stepChain(c, ay) {
    var P = c.P, n = c.n, i, it, q, damp = 1 - CH.drag * CH.sub, g = CH.gravity * CH.sub * CH.sub;
    P[0].x = CH.x; P[0].y = ay; P[0].px = CH.x; P[0].py = ay;
    for (i = 1; i < P.length; i++) {
      q = P[i]; var vx = (q.x - q.px) * damp, vy = (q.y - q.py) * damp;
      q.px = q.x; q.py = q.y; q.x += vx; q.y += vy + g;
    }
    for (it = 0; it < CH.iters; it++) {
      P[0].x = CH.x; P[0].y = ay;
      for (i = 0; i < n; i++) link(P[i], P[i + 1], CH.seg);
      link(P[n], P[n + 1], c.hh);
    }
  }
  function signPose(c) {
    var E1 = c.P[c.n], C = c.P[c.n + 1];
    return { x: C.x, y: C.y, a: Math.atan2(C.y - E1.y, C.x - E1.x) };
  }
  E.hitHandleLevel = function (sx, sy) {
    var game = WOG.getGame && WOG.getGame(), h = game && game.eolHandle; if (!h || !h.chain || !chainReady(WOG.res)) return false;
    var up = WOG.res.image(IMG.up), p = signPose(h.chain), dx = sx - p.x, dy = sy - p.y, c = Math.cos(p.a), sn = Math.sin(p.a);
    var lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
    return Math.abs(lx) <= up.width / 2 + CH.slackX && Math.abs(ly) <= up.height / 2 + CH.slackY;
  };
  E.overHandle = function (game) { return !!(game && game.eolHandle && game.eolHandle.over); };
  E.clickLevel = function (game, sx, sy) {
    var h = game && game.eolHandle; if (!h || !h.chain || game.eol || h.drop < 0.9 || h.pending) return false;
    if (!E.hitHandleLevel(sx, sy)) return false;
    h.pending = true; h.wait = 0; h.started = false;
    if (game.world) { if (game.world.setHover) game.world.setHover(null); game.world.release(); }
    return true;
  };
  E.drawHandle = function (ctx, res, pixelScale, game) {
    var h = game && game.eolHandle; if (!h || !h.chain || game.eol || !chainReady(res)) return;
    var c = h.chain, P = c.P, i, a, b, link = res.image(IMG.link), sign = (h.over || h.pending) ? res.image(IMG.over) : res.image(IMG.up), p = signPose(c);
    ctx.save();
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.a + (CH.flip ? Math.PI : 0));
    ctx.drawImage(sign, -sign.width / 2, -sign.height / 2);
    ctx.restore();
    for (i = 0; i < c.n; i++) {
      a = P[i]; b = P[i + 1];
      ctx.save();
      ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
      if (i % 2) ctx.scale(1, 0.6);
      ctx.drawImage(link, -link.width / 2, -link.height / 2);
      ctx.restore();
    }
    ctx.restore();
  };
  E.hitHandle = function (sx, sy) { var b = handleBox(); return !!b && hitBox(b, sx, sy); };
  E.click = function (game, sx, sy) {
    var s = game.eol; if (!s) return false;
    s.pointer.sx = sx; s.pointer.sy = sy;
    if (s.waiting && E.hitHandle(sx, sy)) {
      s.waiting = false;
      if (s.onClick) s.onClick();
      WOG.movie.skip();
      return true;
    }
    return false;
  };

  E.draw = function (ctx, res, W, H, pixelScale, game) {
    var s = game.eol; if (!s) return;
    var v = E.view, cam = s.cam, t = s.tank, M = WOG.movie, i;
    if (s.dimA > 0.004) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,' + s.dimA.toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    if (s.phase === 'fly' || s.phase === 'in' || s.phase === 'leave' || !t) return;
    var dy = 0;
    if (s.phase === 'travel') {
      var tp = M.actorPose('eol_6_travel', TANK, M.timeOf('eol_6_travel'));
      if (!tp || tp.alpha <= 0) return;
      dy = tp.y - 300;
    }
    cam.x = v.x; cam.y = v.y + dy / v.zoom; cam.zoom = v.zoom;
    var look = { x: 0, y: 0 };
    if (s.gush) WOG.fx.draw(s.gush, ctx, res, cam, W, H, pixelScale);
    cam.apply(ctx, W, H, pixelScale);
    ctx.save();
    ctx.beginPath(); ctx.rect(t.x0 - E.glassPad, t.y0 - 14, (t.x1 - t.x0) + 2 * E.glassPad, 900); ctx.clip();
    for (i = 0; i < s.balls.length; i++) s.balls[i].draw(ctx, res, s.time, look);
    if (s.level > 0.5) {
      var top = t.y0 + s.level, wob = Math.sin(s.time * 3) * 1.2;
      ctx.fillStyle = 'rgba(8,8,8,0.62)'; ctx.fillRect(t.x0 - E.glassPad, t.y0, t.x1 - t.x0 + 2 * E.glassPad, s.level + wob);
      ctx.fillStyle = 'rgba(70,70,70,0.7)'; ctx.fillRect(t.x0 - E.glassPad, top + wob - 1.5, t.x1 - t.x0 + 2 * E.glassPad, 3);
    }
    ctx.restore();
    if (WOG.debug && WOG.debug.geometry) {
      ctx.save(); ctx.lineWidth = 2 / (cam.zoom * pixelScale);
      ctx.strokeStyle = '#ff4d4d'; s.geom.forEach(function (gm) { ctx.save(); ctx.translate(gm.x, gm.y); ctx.rotate(gm.rotation || 0); ctx.strokeRect(-gm.width / 2, -gm.height / 2, gm.width, gm.height); ctx.restore(); });
      ctx.strokeStyle = '#6aa6ff'; if (s.goo) ctx.strokeRect(s.goo.center[0] - s.goo.width / 2, s.goo.center[1] - s.goo.height / 2, s.goo.width, s.goo.height);
      ctx.restore();
    }
  };
})();
