// game.js needs the game to run but balls.js is needed for the game to be the game
(function () {
  var A = WOG.attr, num = WOG.num;

  function parseDef(doc) {
    var root = doc.documentElement;
    var shape = (A(root, 'shape') || 'circle,18,0').split(',').map(function (s) { return s.trim(); });
    var def = {
      name: A(root, 'name'),
      shape: shape[0] === 'rectangle'
        ? { kind: 'rectangle', width: num(shape[1]), height: num(shape[2]), variation: num(shape[3]) }
        : { kind: 'circle', radius: parseInt(shape[1], 10) || 0, variation: num(shape[2]) },
      mass: num(A(root, 'mass'), 1),
      strands: num(A(root, 'strands')),
      towermass: num(A(root, 'towermass')),
      walkspeed: num(A(root, 'walkspeed')), climbspeed: num(A(root, 'climbspeed')),
      parts: [], variances: [], strand: null, detachStrand: null, shadow: null, marker: null, sounds: {}, attrs: {}
    };
    for (var i = 0; i < root.attributes.length; i++) def.attrs[root.attributes[i].name] = root.attributes[i].value;
    def.dragmass = def.attrs.dragmass != null ? num(def.attrs.dragmass) : def.mass;
    def.dragdamp = def.attrs.dragdampeningfactor != null ? num(def.attrs.dragdampeningfactor) : 0.6;
    def.maxdragforce = def.attrs.maxdragforce != null ? num(def.attrs.maxdragforce) : Infinity;
    def.draggable = def.attrs.draggable !== 'false';
    def.detachable = String(def.attrs.detachable == null ? '' : def.attrs.detachable).trim().toLowerCase() !== 'false';
    def.stateScales = {};
    if (def.attrs.statescales) {
      var ss = def.attrs.statescales.split(',').map(function (x) { return x.trim(); });
      for (var q = 0; q + 1 < ss.length; q += 2) def.stateScales[ss[q]] = parseFloat(ss[q + 1]);
    }

    WOG.children(root).forEach(function (el) {
      if (el.tagName === 'part') {
        var st = A(el, 'stretch');
        def.parts.push({
          name: A(el, 'name'), layer: num(A(el, 'layer')),
          x: WOG.range(A(el, 'x')), y: WOG.range(A(el, 'y')),
          images: WOG.list(A(el, 'image')),
          scale: num(A(el, 'scale'), 1),
          rotate: WOG.bool(A(el, 'rotate')),
          states: WOG.list(A(el, 'state')),
          eye: WOG.bool(A(el, 'eye')), pupil: A(el, 'pupil'), pupilinset: num(A(el, 'pupilinset')),
          xrange: A(el, 'xrange') ? WOG.range(A(el, 'xrange')) : null,
          yrange: A(el, 'yrange') ? WOG.range(A(el, 'yrange')) : null,
          stretch: st ? WOG.vec(st) : null
        });
      } else if (el.tagName === 'sinvariance') {
        def.variances.push({
          freq: num(A(el, 'freq')), amp: num(A(el, 'amp')), shift: num(A(el, 'shift')),
          anims: WOG.children(el).filter(function (a) { return a.tagName === 'sinanim'; }).map(function (a) {
            return { parts: WOG.list(A(a, 'part')), states: WOG.list(A(a, 'state')),
                     type: A(a, 'type'), axis: A(a, 'axis'),
                     freq: num(A(a, 'freq')), amp: num(A(a, 'amp')), shift: num(A(a, 'shift')) };
          })
        });
      } else if (el.tagName === 'strand') {
        def.strand = { type: A(el, 'type'), image: A(el, 'image'), inactiveimage: A(el, 'inactiveimage'),
          springconstmin: num(A(el, 'springconstmin')), springconstmax: num(A(el, 'springconstmax')),
          dampfac: num(A(el, 'dampfac')), maxlen1: num(A(el, 'maxlen1')), maxlen2: num(A(el, 'maxlen2')),
          minlen: num(A(el, 'minlen')), maxforce: num(A(el, 'maxforce')),
          thickness: A(el, 'thickness') != null ? num(A(el, 'thickness')) : null };
      } else if (el.tagName === 'detachstrand') {
        def.detachStrand = { image: A(el, 'image'), maxlen: num(A(el, 'maxlen')) };
      } else if (el.tagName === 'marker') {
        def.marker = { drag: A(el, 'drag'), detach: A(el, 'detach'), rotspeed: num(A(el, 'rotspeed')) };
      } else if (el.tagName === 'sound') {
        def.sounds[A(el, 'event')] = WOG.list(A(el, 'id'));
      } else if (el.tagName === 'shadow') {
        def.shadow = A(el, 'image');
      }
    });
    def.parts.sort(function (a, b) { return a.layer - b.layer; });
    return def;
  }

  var cache = {};
  WOG.loadBallDef = function (type, res) {
    if (cache[type]) return cache[type];
    cache[type] = (async function () {
      var dir = 'res/balls/' + type + '/';
      var docs = await Promise.all([WOG.fetchXML(dir + 'balls.xml.xml'), res.addManifest(dir + 'resources.xml.xml')]);
      var def = parseDef(docs[0]);
      var ids = {};
      def.parts.forEach(function (p) {
        p.images.forEach(function (i) { ids[i] = 1; });
        if (p.pupil) ids[p.pupil] = 1;
      });
      if (def.strand && def.strand.image) ids[def.strand.image] = 1;
      if (def.strand && def.strand.inactiveimage) ids[def.strand.inactiveimage] = 1;
      if (def.marker && def.marker.drag) ids[def.marker.drag] = 1;
      if (def.marker && def.marker.detach) ids[def.marker.detach] = 1;
      if (def.detachStrand && def.detachStrand.image) ids[def.detachStrand.image] = 1;
      await res.loadImages(Object.keys(ids));
      var snd = {};
      ['pickup', 'drop', 'throw', 'attach', 'detaching', 'detached', 'marker', 'bounce', 'land'].forEach(function (e) { (def.sounds[e] || []).forEach(function (i) { snd[i] = 1; }); });
      res.loadSounds(Object.keys(snd));
      return def;
    })();
    return cache[type];
  };

  function Ball(def, inst) {
    this.def = def;
    this.id = inst.id;
    this.x = inst.x; this.y = inst.y;
    this.angle = inst.angle;
    this.state = 'standing';
    this.strandCount = 0;
    this.sleeping = inst.discovered === false;

    var sr = WOG.rng(inst.id + 991);
    var sh = def.shape;
    this.sizeFactor = sh.variation > 0 ? 1 + (sr() * 2 - 1) * sh.variation : 1;
    this.radius = sh.kind === 'circle' ? sh.radius * 0.5 * this.sizeFactor : 0;
    this.width = sh.kind === 'rectangle' ? sh.width * this.sizeFactor : 0;
    this.height = sh.kind === 'rectangle' ? sh.height * this.sizeFactor : 0;

    var r = WOG.rng(inst.id + 17);
    this.look = def.parts.map(function (p) {
      return {
        x: p.x[0] + (p.x[1] - p.x[0]) * r(),
        y: p.y[0] + (p.y[1] - p.y[0]) * r(),
        image: p.images.length ? p.images[Math.floor(r() * p.images.length)] : null
      };
    });
    this.wobble = def.variances.map(function (v) {
      return { freq: (r() * 2 - 1) * v.freq, amp: (r() * 2 - 1) * v.amp, shift: (r() * 2 - 1) * v.shift };
    });
  }

  WOG.SINANIM = { enabled: true, ampScale: 1 };

  Ball.prototype.partAnim = function (part, t) {
    var m = { sx: 1, sy: 1, tx: 0, ty: 0 };
    if (!WOG.SINANIM.enabled) return m;
    for (var vi = 0; vi < this.def.variances.length; vi++) {
      var v = this.def.variances[vi], w = this.wobble[vi];
      for (var ai = 0; ai < v.anims.length; ai++) {
        var a = v.anims[ai];
        if (a.parts.indexOf(part.name) < 0) continue;
        if (a.states.length && a.states.indexOf(this.state) < 0) continue;
        var s = Math.sin(2 * Math.PI * ((a.freq + w.freq) * t + a.shift + w.shift)) * (a.amp + w.amp) * WOG.SINANIM.ampScale;
        if (a.type === 'scale') { if (a.axis === 'x') m.sx *= 1 + s; else m.sy *= 1 + s; }
        else if (a.type === 'translate') { if (a.axis === 'x') m.tx += s; else m.ty += s; }
      }
    }
    return m;
  };

  Ball.prototype.draw = function (ctx, res, t, look) {
    var def = this.def, ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    var goal = this.detaching && def.stateScales.detaching ? def.stateScales.detaching : 1;
    var dts = this._ds == null ? t : Math.min(0.1, Math.max(0, t - this._ds)); this._ds = t;
    this.dscale = this.dscale == null ? goal : this.dscale + (goal - this.dscale) * Math.min(1, dts * 12);
    var swell = Math.abs(this.dscale - 1) > 0.002;
    if (swell) { ctx.save(); ctx.translate(this.x, this.y); ctx.scale(this.dscale, this.dscale); ctx.translate(-this.x, -this.y); }
    for (var i = 0; i < def.parts.length; i++) {
      var p = def.parts[i];
      if (p.states.length && p.states.indexOf(this.state) < 0) continue;
      var L = this.look[i], img = res.image(L.image);
      if (!img) continue;
      var m = this.partAnim(p, t);
      var lx = L.x + m.tx, ly = L.y + m.ty;

      var pdx = 0, pdy = 0;
      if (p.eye && look) {
        var dx = look.x - this.x, dy = look.y - this.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= d; dy /= d;
        if (p.xrange) lx = Math.max(p.xrange[0], Math.min(p.xrange[1], lx + dx * 3));
        if (p.yrange) ly = Math.max(p.yrange[0], Math.min(p.yrange[1], ly + dy * 3));
        var travel = Math.max(0, img.width * p.scale * 0.5 - 4);
        pdx = dx * travel; pdy = dy * travel;
      }

      ctx.save();
      if (p.rotate) {
        ctx.translate(this.x + lx * ca - ly * sa, this.y + lx * sa + ly * ca);
        ctx.rotate(this.angle);
      } else {
        ctx.translate(this.x + lx, this.y + ly);
      }
      ctx.scale(p.scale * m.sx, -p.scale * m.sy);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      if (p.eye && p.pupil) {
        var pu = res.image(p.pupil);
        if (pu) ctx.drawImage(pu, pdx / p.scale - pu.width / 2, -pdy / p.scale - pu.height / 2);
      }
      ctx.restore();
    }
    if (swell) ctx.restore();
  };

  WOG.strandWidthScale = 1;
  function shapeMax(def) {
    var s = def.shape;
    return s.kind === 'circle' ? s.radius : Math.max(s.width, s.height);
  }
  WOG.strandWidth = function (a, b, strandDef, len) {
    var w = strandDef && strandDef.thickness != null ? strandDef.thickness : shapeMax(a.def);
    w = Math.min(w, shapeMax(a.def) * a.sizeFactor, shapeMax(b.def) * b.sizeFactor);
    var span = (strandDef.maxlen2 - strandDef.minlen) || 1;
    var t = Math.max(0, Math.min(1, (len - strandDef.minlen) / span));
    return w * ((0.5 - t) * 0.4 + 1) * WOG.strandWidthScale;
  };

  WOG.drawStrand = function (ctx, res, a, b, strandDef) {
    var img = strandDef && res.image(strandDef.image);
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    var thickness = strandDef ? WOG.strandWidth(a, b, strandDef, len) : 9;
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    if (img) {
      ctx.scale(1, -1);
      ctx.drawImage(img, -thickness / 2, -len / 2, thickness, len);
    } else {
      ctx.fillStyle = '#222'; ctx.fillRect(-thickness / 2, -len / 2, thickness, len);
    }
    ctx.restore();
  };

  WOG.drawPullMarker = function (ctx, res, b) {
    var dp = b.detachPhase, ds = b.def.detachStrand;
    if (!dp || !ds || dp.pull < 1) return;
    var img = res.image(ds.image), len = dp.pull, ang = Math.atan2(dp.py, dp.px), thickness = Math.min(shapeMax(b.def) * (b.sizeFactor || 1), 14);
    ctx.save();
    ctx.translate(b.x + dp.px / 2, b.y + dp.py / 2);
    ctx.rotate(ang + Math.PI / 2);
    if (img) { ctx.scale(1, -1); ctx.drawImage(img, -thickness / 2, -len / 2, thickness, len); }
    else { ctx.fillStyle = '#fff'; ctx.fillRect(-thickness / 4, -len / 2, thickness / 2, len); }
    ctx.restore();
  };

  Ball.prototype.drawMarker = function (ctx, res, t) {
    var m = this.def.marker, detach = this.detaching || this.strandCount > 0;
    var img = m && res.image(detach && m.detach ? m.detach : m.drag);
    if (!img) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(m.rotspeed * t);
    ctx.scale(1, -1);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  };

  WOG.drawPreviewStrand = function (ctx, res, a, b, strandDef) {
    var img = strandDef && res.image(strandDef.inactiveimage);
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    var thickness = WOG.strandWidth(a, b, strandDef, len);
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    if (img) { ctx.scale(1, -1); ctx.drawImage(img, -thickness / 2, -len / 2, thickness, len); }
    else { ctx.globalAlpha = 0.5; ctx.fillStyle = '#222'; ctx.fillRect(-thickness / 2, -len / 2, thickness, len); }
    ctx.restore();
  };

  WOG.Ball = Ball;
})();
