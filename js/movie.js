(function () {
  var A = WOG.attr, num = WOG.num;
  var MOVIE_W = 1095, VIEW_W = 800, VIEW_H = 600;
  var cache = {}, active = [], defsSync = {};

  function parse(doc) {
    var root = doc.documentElement;
    var m = { length: num(A(root, 'length')), actors: [], sounds: [] };
    WOG.children(root).forEach(function (el) {
      if (el.tagName !== 'actor') return;
      var a = { type: A(el, 'type'), id: A(el, 'id'), font: A(el, 'font'), text: A(el, 'text'),
                depth: num(A(el, 'depth')), align: A(el, 'align') || 'center', wrap: num(A(el, 'wrapWidth')), maxW: num(A(el, 'maxWidth')), kf: [] };
      var anim = el.getElementsByTagName('animation')[0];
      if (anim) WOG.children(anim).forEach(function (k) {
        var t = num(A(k, 'time'));
        if (A(k, 'sound')) m.sounds.push({ time: t, id: A(k, 'sound') });
        if (A(k, 'x') == null) return;
        var sc = WOG.vec(A(k, 'scale'), [1, 1]);
        a.kf.push({ t: t, x: num(A(k, 'x')), y: num(A(k, 'y')), sx: sc[0], sy: sc.length > 1 ? sc[1] : sc[0],
                    ang: num(A(k, 'angle')), alpha: num(A(k, 'alpha'), 255), linear: A(k, 'interpolation') === 'linear' });
      });
      m.actors.push(a);
    });
    m.actors.sort(function (p, q) { return p.depth - q.depth; });
    m.sounds.sort(function (p, q) { return p.time - q.time; });
    return m;
  }

  function pose(a, t) {
    var k = a.kf, i = -1;
    for (var n = 0; n < k.length; n++) if (k[n].t <= t) i = n; else break;
    if (i < 0) return null;
    var p = k[i], q = k[i + 1];
    if (p.linear && q && q.t > p.t) {
      var u = (t - p.t) / (q.t - p.t), L = function (a1, b1) { return a1 + (b1 - a1) * u; };
      var a0 = p.ang, a1 = q.ang;
      if (Math.abs(a0 - a1) > 180) { if (a0 <= a1) a0 += 360; else a1 += 360; }
      return { x: L(p.x, q.x), y: L(p.y, q.y), sx: L(p.sx, q.sx), sy: L(p.sy, q.sy), ang: L(a0, a1), alpha: L(p.alpha, q.alpha) };
    }
    return p;
  }

  async function load(res, name) {
    if (cache[name]) return cache[name];
    cache[name] = (async function () {
      var base = 'res/movie/' + name + '/' + name;
      var docs = await Promise.all([WOG.fetchXML(base + '.movie.xml'), res.addManifest(base + '.resrc.xml')]);
      var m = parse(docs[0]);
      defsSync[name] = m;
      var imgs = {};
      m.actors.forEach(function (a) { if (a.type === 'image' && a.id) imgs[a.id] = 1; });
      var snd = {}; m.sounds.forEach(function (s) { snd[s.id] = 1; });
      await Promise.all([res.loadImages(Object.keys(imgs)), res.loadSounds(Object.keys(snd))]);
      return m;
    })();
    return cache[name];
  }

  function imageId(a, p) {
    if (!a.id || a.id.charAt(0) !== '$') return a.id;
    var v = p.vars[a.id.slice(1)]; if (v == null) v = MOVIE.vars[a.id.slice(1)];
    return v;
  }
  function fontName(res, id) { var d = res.defs[id]; return d && d.type === 'font' ? d.path.split('/').pop() : null; }
  async function prepare(res, def, vars) {
    var jobs = [], seen = {};
    def.actors.forEach(function (a) {
      if (a.type === 'image' && a.id && a.id.charAt(0) === '$') {
        var v = vars[a.id.slice(1)]; if (v == null) v = MOVIE.vars[a.id.slice(1)];
        if (v && !seen[v]) { seen[v] = 1; jobs.push(res.loadImage(v)); }
      } else if (a.type === 'text' && a.font && WOG.font) {
        var fn = fontName(res, a.font); if (fn && !seen[fn]) { seen[fn] = 1; jobs.push(WOG.font.load(fn)); }
      }
    });
    await Promise.all(jobs);
  }

  var MOVIE = WOG.movie = {
    angleSign: -1,
    vars: {},
    get busy() { return active.some(function (p) { return !p.finished; }); },
    get covering() { return active.length > 0; },

    preload: async function (res, name, opts) {
      try { var def = await load(res, name); await prepare(res, def, (opts && opts.vars) || {}); } catch (e) { console.warn('movie ' + name + ' not preloaded:', e.message); }
    },

    play: async function (res, name, opts) {
      opts = opts || {};
      var def;
      try { def = await load(res, name); } catch (e) { console.warn('movie ' + name + ' not loaded:', e.message); return; }
      await prepare(res, def, opts.vars || {});
      MOVIE.clearHeld();
      return new Promise(function (resolve) {
        var p = { name: name, def: def, res: res, t: 0, total: 0, next: 0, vars: opts.vars || {}, hold: !!opts.hold, finished: false, resolve: resolve, loops: [],
                  loopFor: opts.loopFor || 0, loopReady: !opts.loopUntil, skipped: false };
        if (opts.loopUntil) Promise.resolve(opts.loopUntil).then(function () { p.loopReady = true; }, function () { p.loopReady = true; });
        active.push(p);
        if (opts.onStart) { try { opts.onStart(); } catch (e) { console.warn('movie onStart:', e.message); } }
      });
    },
    actorPose: function (name, suffix, t) {
      var d = defsSync[name]; if (!d) return null;
      var a = d.actors.filter(function (q) { return q.type === 'image' && q.id && q.id.slice(-suffix.length) === suffix; })[0];
      if (!a) return null;
      var s = pose(a, t); if (!s) return null;
      return { x: s.x - (MOVIE_W - VIEW_W) / 2, y: s.y, sx: s.sx, sy: s.sy, ang: s.ang, alpha: s.alpha, imageId: a.id };
    },
    timeOf: function (name) {
      var p = active.filter(function (q) { return q.name === name && !q.finished; })[0] || active.filter(function (q) { return q.name === name; })[0];
      return p ? p.t : 0;
    },
    clearHeld: function () { active = active.filter(function (p) { return !p.finished; }); },
    skip: function () { active.forEach(function (p) { if (!p.finished) { p.t = p.def.length; p.skipped = true; } }); },

    update: function (dt) {
      active.forEach(function (p) {
        if (p.finished) return;
        p.t += dt; p.total += dt;
        while (p.next < p.def.sounds.length && p.def.sounds[p.next].time <= p.t) {
          var s = p.def.sounds[p.next++];
          p.res.playSound([s.id]);
        }
        var looping = false;
        if (p.t >= p.def.length && !p.skipped && p.loopFor && (p.total < p.loopFor || !p.loopReady)) {
          p.t = p.def.length > 0 ? p.t % p.def.length : 0; p.next = 0; looping = true;
        }
        if (!looping && p.t >= p.def.length) {
          p.t = p.def.length; p.finished = true;
          if (!p.hold) active = active.filter(function (q) { return q !== p; });
          p.resolve();
        }
      });
    },

    draw: function (ctx, pixelScale) {
      active.forEach(function (p) {
        p.def.actors.forEach(function (a) {
          var s = pose(a, p.t);
          if (!s || s.alpha <= 0) return;
          ctx.save();
          ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
          ctx.translate(s.x - (MOVIE_W - VIEW_W) / 2, s.y);
          ctx.rotate(s.ang * Math.PI / 180 * MOVIE.angleSign);
          ctx.scale(s.sx, s.sy);
          ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha / 255));
          if (a.type === 'image') {
            var img = p.res.image(imageId(a, p));
            if (img) ctx.drawImage(img, a.align === 'left' ? 0 : -img.width / 2, -img.height / 2);
          } else if (a.type === 'text') {
            drawText(ctx, a, p);
          }
          ctx.restore();
        });
      });
    }
  };

  var FONT_PX = { FONT_CONSOLE: 12, FONT_SIGNPOST: 24, FONT_STAT: 18, FONT_TITLE: 40 };
  function resolveText(raw, p) {
    if (!raw) return '';
    if (raw.charAt(0) !== '$') return raw;
    var key = raw.slice(1);
    if (p.vars[key] != null) return String(p.vars[key]);
    if (MOVIE.vars[key] != null) return String(MOVIE.vars[key]);
    return WOG.text.get(key);
  }
  function drawBitmapText(ctx, a, p, name) {
    var F = WOG.font, f = F.get(name), raw = resolveText(a.text, p), lines = F.lines(raw), sc = 1;
    if (a.maxW) { var w = 0; lines.forEach(function (l) { w = Math.max(w, F.width(name, l, 1)); }); if (w > a.maxW) sc = a.maxW / w; }
    if (a.wrap) lines = lines.reduce(function (o, l) { return o.concat(F.wrap(name, l, a.wrap, sc)); }, []);
    var h = lines.length * F.lineHeight(name, sc);
    F.draw(ctx, name, lines, 0, -h / 2, { scale: sc, align: a.align === 'left' ? 'left' : 'center' });
  }
  function drawText(ctx, a, p) {
    var bn = WOG.font && fontName(p.res, a.font);
    if (bn && WOG.font.get(bn)) { drawBitmapText(ctx, a, p, bn); return; }
    var px = FONT_PX[a.font] || (/_(\d+)$/.test(a.font || '') ? +RegExp.$1 : 20);
    ctx.font = px + 'px sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.textAlign = a.align === 'left' ? 'left' : 'center';
    var words = resolveText(a.text, p).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && a.wrap && ctx.measureText(t).width > a.wrap) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    var lh = px * 1.15, y0 = -(lines.length - 1) * lh / 2;
    lines.forEach(function (l, n) { ctx.fillText(l, 0, y0 + n * lh); });
  }
})();
