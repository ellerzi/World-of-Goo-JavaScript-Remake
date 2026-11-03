(function () {
  var A = WOG.attr, num = WOG.num;
  var FX = WOG.fx = {
    effects: {},
    SPEED: 60,
    ROT: 1,
    ACC: 1,
    DEFAULT_LIFE: [2, 2],
    DEFAULT_MARGIN: 200
  };

  function range(s, d) {
    if (s === null || s === undefined || s === '') return d || [0, 0];
    var p = String(s).split(',').map(parseFloat);
    if (isNaN(p[0])) return d || [0, 0];
    return [p[0], p.length > 1 && !isNaN(p[1]) ? p[1] : p[0]];
  }
  function rnd(r) { return r[0] + (r[1] - r[0]) * Math.random(); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function parseParticle(el) {
    var t = {
      images: (A(el, 'image') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      rotspeed: range(A(el, 'rotspeed')), rotation: range(A(el, 'rotation')),
      scale: range(A(el, 'scale'), [1, 1]),
      finalscale: A(el, 'finalscale') === null ? null : num(A(el, 'finalscale')),
      directed: WOG.bool(A(el, 'directed'), false), additive: WOG.bool(A(el, 'additive'), false), fade: WOG.bool(A(el, 'fade'), false),
      lifespan: A(el, 'lifespan') === null ? null : range(A(el, 'lifespan')),
      dampening: A(el, 'dampening') === null ? 1 : num(A(el, 'dampening')),
      speed: range(A(el, 'speed')), movedir: num(A(el, 'movedir')), movedirvar: num(A(el, 'movedirvar')),
      acc: WOG.vec(A(el, 'acceleration'), [0, 0]), sins: []
    };
    WOG.children(el).forEach(function (c) {
      if (c.tagName !== 'axialsinoffset') return;
      t.sins.push({ amp: range(A(c, 'amp')), freq: range(A(c, 'freq')), phase: range(A(c, 'phaseshift')), axis: A(c, 'axis') === 'y' ? 'y' : 'x' });
    });
    return t;
  }

  FX.load = async function (url) {
    if (FX.loaded) return FX.effects;
    try {
      var doc = await WOG.fetchXML(url || 'properties/fx.xml.xml');
      WOG.children(doc.documentElement).forEach(function (el) {
        var ambient = el.tagName === 'ambientparticleeffect';
        if (!ambient && el.tagName !== 'particleeffect') return;
        FX.effects[A(el, 'name')] = {
          name: A(el, 'name'), ambient: ambient, max: num(A(el, 'maxparticles'), 10), rate: A(el, 'rate') === null ? 0 : num(A(el, 'rate')),
          margin: A(el, 'margin') === null ? FX.DEFAULT_MARGIN : num(A(el, 'margin')),
          particles: WOG.children(el).filter(function (c) { return c.tagName === 'particle'; }).map(parseParticle)
        };
      });
      FX.loaded = true;
    } catch (e) { console.warn('fx.xml.xml not read:', e.message); }
    return FX.effects;
  };

  FX.make = function (name, o) {
    var def = FX.effects[name];
    if (!def) { console.warn('particle effect not found:', name); return null; }
    return { fx: true, def: def, depth: o.depth || 0, x: o.x || 0, y: o.y || 0, pretick: o.pretick || 0,
             parts: [], acc: 0, started: false, burstDone: false, done: false, pos: null,
             clock: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 };
  };

  FX.fromScene = async function (list, res) {
    await FX.load();
    var out = [], ids = {};
    (list || []).forEach(function (p) {
      var e = FX.make(p.effect, { x: p.x, y: p.y, depth: p.depth, pretick: p.pretick });
      if (!e) return;
      e.def.particles.forEach(function (t) { t.images.forEach(function (i) { ids[i] = 1; }); });
      out.push(e);
    });
    await res.loadImages(Object.keys(ids));
    return out;
  };
  FX.burst = async function (game, res, name, x, y, depth) {
    await FX.load();
    var e = FX.make(name, { x: x, y: y, depth: depth || 0 });
    if (!e) return null;
    var ids = {}; e.def.particles.forEach(function (t) { t.images.forEach(function (i) { ids[i] = 1; }); });
    await res.loadImages(Object.keys(ids));
    e.transient = true;
    (game.emitters = game.emitters || []).push(e);
    if (game.drawables) { game.drawables.push(e); game.drawables.sort(function (a, b) { return a.depth - b.depth; }); }
    return e;
  };

  function region(e, cam, vw, vh) {
    var f = cam.depthFactor(e.depth) || 1, hw = vw / (2 * cam.zoom * f) + e.def.margin, hh = vh / (2 * cam.zoom * f) + e.def.margin;
    return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
  }

  function spawn(e, reg, inside) {
    var d = e.def, t = pick(d.particles);
    if (!t || !t.images.length) return;
    var ang = (t.movedir + (Math.random() * 2 - 1) * t.movedirvar) * Math.PI / 180, sp = rnd(t.speed);
    var p = { t: t, img: pick(t.images), x: e.x, y: e.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0,
              life: t.lifespan ? rnd(t.lifespan) : (d.ambient ? Infinity : rnd(FX.DEFAULT_LIFE)),
              rot: 0, rs: rnd(t.rotspeed) * FX.ROT, s0: rnd(t.scale), sins: [] };
    p.rot0 = rnd(t.rotation);
    p.rot = p.rs !== 0 ? p.rs * e.clock + p.rot0 : 0;
    p.s1 = t.finalscale === null ? p.s0 : t.finalscale;
    t.sins.forEach(function (s) { p.sins.push({ amp: rnd(s.amp), freq: rnd(s.freq), phase: rnd(s.phase) * 2 * Math.PI, axis: s.axis }); });
    if (d.ambient && reg) {
      var W = reg.x1 - reg.x0, H = reg.y1 - reg.y0;
      if (inside) { p.x = reg.x0 + Math.random() * W; p.y = reg.y0 + Math.random() * H; }
      else {
        var wx = Math.abs(p.vx) * H, wy = Math.abs(p.vy) * W, side = Math.random() * (wx + wy || 1) < wx;
        if (side) { p.x = p.vx >= 0 ? reg.x0 : reg.x1; p.y = reg.y0 + Math.random() * H; }
        else { p.y = p.vy >= 0 ? reg.y0 : reg.y1; p.x = reg.x0 + Math.random() * W; }
      }
    }
    e.parts.push(p);
  }

  function step(e, dt, reg) {
    var d = e.def, i, p;
    e.clock += dt;
    for (i = e.parts.length - 1; i >= 0; i--) {
      p = e.parts[i];
      p.age += dt;
      var k = Math.pow(p.t.dampening, dt * 60);
      p.vx = p.vx * k + p.t.acc[0] * FX.ACC * dt; p.vy = p.vy * k + p.t.acc[1] * FX.ACC * dt;
      p.x += p.vx * FX.SPEED * dt; p.y += p.vy * FX.SPEED * dt; if (p.rs !== 0) p.rot = p.rs * e.clock + p.rot0;
      var gone = p.age >= p.life;
      if (!gone && d.ambient && reg) gone = p.x < reg.x0 - 50 || p.x > reg.x1 + 50 || p.y < reg.y0 - 50 || p.y > reg.y1 + 50;
      if (gone) e.parts.splice(i, 1);
    }
    if (d.ambient) { var guard = 0; while (e.parts.length < d.max && guard++ < 50) spawn(e, reg, false); }
    else if (d.rate > 0) {
      e.acc += dt;
      var n = 0;
      while (e.acc >= d.rate && n++ < 20) { e.acc -= d.rate; if (e.parts.length < d.max) spawn(e); }
      if (e.acc > d.rate) e.acc = 0;
    } else if (!e.burstDone) { e.burstDone = true; for (i = 0; i < d.max; i++) spawn(e); }
    else if (!e.parts.length) e.done = true;
  }

  FX.update = function (e, dt, cam, vw, vh) {
    var reg = e.def.ambient ? region(e, cam, vw, vh) : null;
    if (!e.started) {
      e.started = true;
      if (reg) { for (var n = 0; n < e.def.max; n++) spawn(e, reg, true); }
      var left = e.pretick;
      while (left > 0) { var s = Math.min(left, 1 / 30); step(e, s, reg); left -= s; }
    }
    step(e, Math.min(dt, 0.1), reg);
  };

  FX.directedAngle = function (vx, vy) {
    var a = Math.atan(vy / vx);
    if (isNaN(a)) return 0;
    return vx > 0 ? a - Math.PI / 2 : a + Math.PI / 2;
  };

  FX.draw = function (e, ctx, res, cam, W, H, pixelScale) {
    if (!cam.depthFactor(e.depth)) return;
    for (var i = 0; i < e.parts.length; i++) {
      var p = e.parts[i], img = res.image(p.img);
      if (!img) continue;
      var u = p.life === Infinity ? 0 : p.age / p.life, sc = p.s0 + (p.s1 - p.s0) * u;
      if (sc <= 0) continue;
      var x = p.x, y = p.y;
      for (var q = 0; q < p.sins.length; q++) {
        var o = p.sins[q].amp * Math.sin(p.sins[q].freq * p.age + p.sins[q].phase);
        if (p.sins[q].axis === 'y') y += o; else x += o;
      }
      ctx.save();
      cam.applyDepth(ctx, W, H, pixelScale, e.depth, x, y);
      ctx.globalAlpha = p.t.fade ? Math.max(0, 1 - u) : 1;
      if (p.t.additive) ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(p.t.directed ? FX.directedAngle(p.vx, p.vy) : p.rot);
      ctx.scale(sc, -sc);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    }
  };
})();
