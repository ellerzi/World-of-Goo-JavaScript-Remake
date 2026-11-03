// i havent got the gravity right
(function () {
  var P = WOG.pipe = {
    suckSpeed: 520,
    suckStart: 120,
    suckAccel: 1400,
    popTime: 1.2,
    loopVolume: 0.6,
    bendAngle: 0,
    pull: 3,
    structPull: 5,
    capScale: 0.9,
    pullRange: 2
  };
  var FONT = 'TwCenMTCondensedExtraBold18';

  function ids(type) {
    var t = '_' + type;
    return ['IMAGE_GLOBAL_PIPE' + t, 'IMAGE_GLOBAL_PIPE_BEND_TL' + t, 'IMAGE_GLOBAL_PIPE_BEND_TR' + t, 'IMAGE_GLOBAL_PIPE_BEND_BL' + t,
            'IMAGE_GLOBAL_PIPE_BEND_BR' + t, 'IMAGE_GLOBAL_PIPE_CAP_OPEN' + t, 'IMAGE_GLOBAL_PIPE_CAP_CLOSED' + t];
  }
  var SOUNDS = ['SOUND_GLOBAL_PIPE_ACTIVATED', 'SOUND_GLOBAL_SUCK_BEGIN', 'SOUND_GLOBAL_SUCK_LOOP', 'SOUND_GLOBAL_SUCK_END'];
  for (var i = 1; i <= 11; i++) SOUNDS.push('SOUND_GLOBAL_PIPEHIT' + i);

  P.load = async function (res, lvl) {
    var pipe = lvl.pipe, type = (pipe && pipe.type) || 'NORMAL';
    var jobs = [res.loadSounds(SOUNDS.filter(function (s) { return res.has(s); }))];
    if (pipe && pipe.vertices.length > 1) jobs.push(res.loadImages(ids(type).filter(function (s) { return res.has(s); })));
    if (WOG.font) jobs.push(WOG.font.load(FONT));
    await Promise.all(jobs);
    if (!pipe || pipe.vertices.length < 2) return null;
    return { pipeObj: true, depth: pipe.depth || 0, type: type, vertices: pipe.vertices, sprites: null };
  };

  function build(res, d) {
    var v = d.vertices, t = '_' + d.type, straight = res.image('IMAGE_GLOBAL_PIPE' + t), n = v.length, out = [];
    var sw = straight ? straight.width : 1;
    var dx0 = v[1][0] - v[0][0], dy0 = v[1][1] - v[0][1], capAng;
    if (dx0 > 0) capAng = -Math.PI / 2; else if (dx0 < 0) capAng = Math.PI / 2; else capAng = dy0 > 0 ? 0 : Math.PI;
    out.push({ kind: 'cap', x: v[0][0], y: v[0][1], ang: capAng, sx: P.capScale, sy: P.capScale, second: true });
    for (var i = 1; i < n; i++) {
      var a = v[i - 1], b = v[i], vertical = a[0] === b[0];
      var len = vertical ? Math.abs(b[1] - a[1]) : Math.abs(b[0] - a[0]);
      out.push({ kind: 'straight', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, ang: vertical ? Math.PI / 2 : 0, sx: len / sw, sy: 1, second: false });
      if (i < n - 1) {
        var c = v[i + 1];
        var armH = (a[0] !== b[0]) ? (a[0] < b[0] ? 'L' : 'R') : (c[0] < b[0] ? 'L' : 'R');
        var armV = (a[1] !== b[1]) ? (a[1] < b[1] ? 'B' : 'T') : (c[1] < b[1] ? 'B' : 'T');
        var name = (armV === 'T' ? 'B' : 'T') + (armH === 'L' ? 'R' : 'L');
        out.push({ kind: 'bend', img: 'IMAGE_GLOBAL_PIPE_BEND_' + name + t, x: b[0], y: b[1], ang: P.bendAngle, sx: 1, sy: 1, second: true });   
      }
    }
    d.sprites = out;
  }

  P.draw = function (ctx, res, camera, W, H, pixelScale, game, d) {
    if (!d.sprites) { if (!res.image('IMAGE_GLOBAL_PIPE_' + d.type)) return; build(res, d); }
    var st = game.pipeState, open = !!(st && st.active), t = '_' + d.type;
    [false, true].forEach(function (second) {
      d.sprites.forEach(function (s) {
        if (s.second !== second) return;
        var id = s.kind === 'straight' ? 'IMAGE_GLOBAL_PIPE' + t : s.kind === 'cap' ? 'IMAGE_GLOBAL_PIPE_CAP_' + (open ? 'OPEN' : 'CLOSED') + t : s.img;
        var img = res.image(id);
        if (!img || !camera.depthFactor(d.depth)) return;
        ctx.save();
        camera.applyDepth(ctx, W, H, pixelScale, d.depth, s.x, s.y);
        ctx.rotate(s.ang);
        ctx.scale(s.sx, -s.sy);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
      });
    });
  };

  P.drawPops = function (ctx, res, camera, W, H, pixelScale, game, d) {
    var st = game.pipeState, F = WOG.font;
    if (!st || !st.pops.length || !F || !F.get(FONT)) return;
    st.pops.forEach(function (p) {
      var k = p.age / P.popTime;
      ctx.save();
      camera.applyDepth(ctx, W, H, pixelScale, 0, p.x, p.y + 20 + k * 50);
      ctx.scale(1, -1);
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      F.draw(ctx, FONT, String(p.n), 0, -F.lineHeight(FONT, 1) / 2, { align: 'center', scale: 1.2 });
      ctx.restore();
    });
  };

  function startLoop(res) {
    stopLoop(res, true);
    var id = 'SOUND_GLOBAL_SUCK_LOOP', buf = res.sounds[id], ctx = res.audioContext();
    if (!buf || !ctx) return;
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.loop = true; g.gain.value = P.loopVolume * (WOG.sfxVolume == null ? 1 : WOG.sfxVolume);
    src.connect(g); g.connect(ctx.destination); src.start();
    P._loop = { src: src, gain: g };
  }
  function stopLoop(res, quiet) {
    var l = P._loop; P._loop = null;
    if (!l) return;
    try { l.src.stop(); } catch (e) {}
  }
  P.stop = function () { stopLoop(); };

  function suckable(b, ex) {
    if (b.def.attrs && b.def.attrs.suckable === 'false') return false;
    if (ex.filter && ex.filter.length && ex.filter.indexOf(b.def.name) < 0) return false;
    return true;
  }
  function loose(b) { return !b.held && !b.sleeping && b.strandCount <= 0 && !b.detaching && !b.detachPhase; }
  P.update = function (game, res, dt) {
    var ex = game.data.level.exit, world = game.world;
    if (!ex || !world) return;
    var st = game.pipeState || (game.pipeState = { active: false, collected: 0, hit: 0, pops: [] });
    var ex0 = ex.pos[0], ex1 = ex.pos[1], structureNear = false, inFlight = false, i;
    st.pops.forEach(function (p) { p.age += dt; });
    st.pops = st.pops.filter(function (p) { return p.age < P.popTime; });

    var balls = game.balls.slice();
    for (i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.removed || b.radius <= 0) continue;
      var dx = ex0 - b.x, dy = ex1 - b.y, d = Math.sqrt(dx * dx + dy * dy);
      if (b.sucked) {
        inFlight = true;
        b.suckSpeed = Math.min(P.suckSpeed, (b.suckSpeed || P.suckStart) + P.suckAccel * dt);
        var step = b.suckSpeed * dt;
        if (d - step <= b.radius + 2) { enter(game, res, st, b, ex); continue; }
        b.x += dx / d * step; b.y += dy / d * step; b.vx = 0; b.vy = 0; b.state = 'falling';
        continue;
      }
      if (!suckable(b, ex)) continue;
      if (b.held) continue;
      if (b.strandCount > 0) {
        if (d < ex.radius) structureNear = true;
        if (P.structPull > 0 && !b.climb && d > 1e-6 && d < ex.radius * P.pullRange) {
          var as = P.structPull * (1 - d / (ex.radius * P.pullRange)) * dt * (WOG.PHYS && WOG.PHYS.timeScale || 1);
          b.vx += dx / d * as; b.vy += dy / d * as;
        }
        continue;
      }
      if (P.pull > 0 && loose(b) && !b.onGround && !b.climb && d > 1e-6 && d < ex.radius * P.pullRange) {
        var a = P.pull * (1 - d / (ex.radius * P.pullRange)) * dt * (WOG.PHYS && WOG.PHYS.timeScale || 1);
        b.vx += dx / d * a; b.vy += dy / d * a;
      }
    }
    if (structureNear && !st.finished) {
      if (!st.active) {
        st.active = true; st.hit = 0;
        res.playSound(['SOUND_GLOBAL_PIPE_ACTIVATED']); res.playSound(['SOUND_GLOBAL_SUCK_BEGIN']); startLoop(res);
      }
    }
    if (st.active) {
      for (i = 0; i < balls.length; i++) {
        var o = balls[i];
        if (o.removed || o.sucked || o.radius <= 0 || !loose(o) || !suckable(o, ex)) continue;
        if (Math.hypot(ex0 - o.x, ex1 - o.y) < ex.radius) { o.sucked = true; o.held = true; o.climb = null; o.jumping = null; o.suckSpeed = P.suckStart; o.vx = 0; o.vy = 0; o.state = 'falling'; inFlight = true; }
      }
      if (!structureNear && !inFlight) {
        st.active = false; st.hit = 0; stopLoop(res); res.playSound(['SOUND_GLOBAL_SUCK_END']);
      }
    }
  };

  function enter(game, res, st, b, ex) {
    game.world.removeBall(b);
    st.collected++; game.collected = st.collected;
    (st.defs = st.defs || []).push(b.def);
    st.hit = Math.min(st.hit + 1, 11);
    st.pops.push({ x: ex.pos[0], y: ex.pos[1], n: st.collected, age: 0 });
    res.playSound(['SOUND_GLOBAL_PIPEHIT' + st.hit]);
  }
})();
