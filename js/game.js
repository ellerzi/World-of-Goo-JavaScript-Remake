//game starter
(function () {
  var BASE_W = 800, BASE_H = 600;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  var res = new WOG.Resources();
  var camera = new WOG.Camera();
  var game = null;
  var status = 'Starting...';
  var pixelScale = 1;
  var mouse = { sx: 0, sy: 0, down: false, button: 0 };
  var keys = {};
  var materials = {};
  var debug = { geometry: false, radius: false };
  var time = 0;
  var MAP = 'MapWorldView';
  var hover = null;
  var letterbox = 0;
  var inside = false;
  var onPage = false;
  var cursorCanvas = document.createElement('canvas'), cctx = cursorCanvas.getContext('2d');
  cursorCanvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;transform:none;background:transparent';
  document.body.appendChild(cursorCanvas);
  var BTN = WOG.BTN = { time: 0.18, grow: 0.06 };
  var tip = null;
  var settingsOpen = false;
  function dbg() { return !WOG.settings || WOG.settings.get('debugInputs'); }

  function resize() {
    var k = Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = (BASE_W * k) + 'px';
    canvas.style.height = (BASE_H * k) + 'px';
    var rs = WOG.renderScale || 1;
    canvas.width = Math.round(BASE_W * k * dpr * rs);
    canvas.height = Math.round(BASE_H * k * dpr * rs);
    pixelScale = canvas.width / BASE_W;
    cursorCanvas.width = Math.round(window.innerWidth * dpr); cursorCanvas.height = Math.round(window.innerHeight * dpr);
  }
  window.addEventListener('resize', resize);
  WOG.resize = resize;

  async function startLevel(name) {
    saveWogcStructure();
    game = null;
    res.missing = [];
    try {
      var data = await WOG.loadLevel(name, res, function (s) { status = s; });

      var wb = WOG.WOGC.types[name];
      if (wb && WOG.save) addWogcBalls(data, wb, WOG.save.totalExtras());

      status = 'Loading gooballs...';
      var types = {};
      data.level.balls.forEach(function (b) { types[b.type] = 1; });
      var defs = {};
      await Promise.all(Object.keys(types).map(async function (t) { defs[t] = await WOG.loadBallDef(t, res); }));

      var balls = data.level.balls.map(function (inst) { return new WOG.Ball(defs[inst.type], inst); });
      var byId = {};
      balls.forEach(function (b) { byId[b.id] = b; });

      var strands = [];
      data.level.strands.forEach(function (s) {
        var a = byId[s.gb1], b = byId[s.gb2];
        if (!a || !b) return;
        var sdef = a.def.strand || b.def.strand;
        if (!sdef) { console.warn('strand ' + s.gb1 + ' - ' + s.gb2 + ' skipped: neither ' + a.def.name + ' nor ' + b.def.name + ' defines a <strand>'); return; }
        a.strandCount++; b.strandCount++;
        strands.push({ a: a, b: b, def: sdef });
      });
      balls.forEach(function (b) { b.state = b.strandCount > 0 ? 'attached' : 'standing'; });

      WOG.cursor.color = data.level.cursorColor || [255, 255, 255];
      camera.setLevelCamera(data.level.cameras.normal);
      var buttons = (data.scene.buttons || []).map(function (b) {
        var o = Object.assign({}, b);
        o.hidden = WOG.map.isHidden(b);
        o.enabled = WOG.map.isEnabled(b);
        if (name === MAP) o.island = /^island(\d)$/.exec(b.id || '');
        o.image = b.up;
        return o;
      });
      data.scene.layers.forEach(function (l) {
        l.hidden = /^ocd_/.test(l.id) && !WOG.map.ocdDone(l.id.slice(4));
      });
      if (name === MAP) await Promise.all([1, 2, 3, 4, 5].map(function (n) { return WOG.loadIsland('island' + n).catch(function () { return null; }); }));
      var island = null;
      if (/^island\d$/.test(name)) { try { island = await WOG.loadIsland(name); } catch (e) { console.warn('island data not read:', e.message); } }
      var ui = null;
      if (/^island\d$/.test(name) && WOG.islandUi) { try { ui = await WOG.islandUi.load(res); } catch (e) { console.warn('IslandUi not loaded:', e.message); } }
      var animNames = data.scene.layers.map(function (l) { return l.anim; }).filter(Boolean);
      await loadAnims(animNames);
      if (animNames.length) console.log('layer anims in ' + name + ': ' + animNames.length + ' layers, ' + animNames.filter(function (n) { return ANIMS[n]; }).length + ' with a loaded anim file');
      var emitters = [];
      if (WOG.fx) { try { emitters = await WOG.fx.fromScene(data.scene.particles, res); } catch (e) { console.warn('particles not started:', e.message); } }
      var pipeDraw = [];
      if (WOG.pipe) {
        WOG.pipe.stop();
        try { var pd = await WOG.pipe.load(res, data.level); if (pd) pipeDraw = [pd, { pipePops: true, depth: 1 }]; } catch (e) { console.warn('pipe not loaded:', e.message); }
      }
      var waters = [];
      if (WOG.Water) data.scene.forcefields.forEach(function (f) { if (f.kind === 'linear' && f.water && f.center && f.width != null && f.height != null) waters.push(new WOG.Water(f)); });
      var drawables = data.scene.layers.concat(buttons, emitters, pipeDraw, waters).sort(function (a, b) { return (a.depth - b.depth) || ((a.isWater || a.pipeObj ? 0 : 1) - (b.isWater || b.pipeObj ? 0 : 1)); });
      if (WOG.signpost && data.scene.layers.some(function (l) { return l.sign; })) { try { await WOG.signpost.load(res); } catch (e) { console.warn('signpost movies not loaded:', e.message); } }
      hover = null; resetTips(); letterbox = 0;
      game = { name: name, data: data, balls: balls, strands: strands, buttons: buttons, drawables: drawables, emitters: emitters, isMap: name === MAP, island: island, ui: ui, waters: waters };
      game.world = (WOG.PHYS.useODE && WOG.ODEWorld) ? new WOG.ODEWorld(game, materials) : new WOG.World(game, materials);
      game.world.playSound = function (b, ev) { res.playSound(b.def.sounds[ev]); };
      game.world.waters = waters;
      game.world.onSplash = function (x, y) { if (WOG.fx && (!WOG.settings || WOG.settings.get('particles'))) WOG.fx.burst(game, res, 'splash', x, y, 0).catch(function () {}); };
      if (WOG.favicon) WOG.favicon.set(name);
      WOG.music.play(res, data.level.music);
      status = '';
      history.replaceState(null, '', '#' + name);
    } catch (e) {
      console.error(e);
      status = 'Error: ' + e.message;
    }
  }

  WOG.WOGC = { types: { wogc: 'Drained', wogcd: 'Drained', wogc3d: 'DrainedIsh' }, side: 100, structY: 0, dropY: 250, perRow: 12, gap: 70 };
  function saveWogcStructure() {
    if (!game || !WOG.save || !WOG.WOGC.types[game.name] || !game.balls.length) return;
    var r = function (v) { return Math.round(v * 10) / 10; }, idx = new Map();
    var b = game.balls.map(function (o, i) { idx.set(o, i); return [o.id, r(o.x), r(o.y), r(o.angle || 0)]; });
    var s = game.strands.map(function (t) { return [idx.get(t.a), idx.get(t.b)]; }).filter(function (p) { return p[0] != null && p[1] != null; });
    WOG.save.setStructure({ b: b, s: s });
  }
  window.addEventListener('pagehide', saveWogcStructure);
  function addWogcBalls(data, type, extras) {
    var K = WOG.WOGC, lv = data.level, cam = lv.cameras.normal, pois = cam && cam.pois.length ? cam.pois[cam.pois.length - 1].pos : [0, 0];
    var cx = pois[0], cy = pois[1], id = 1000;
    lv.balls.forEach(function (b) { id = Math.max(id, b.id + 1); });
    var add = function (x, y) { var b = { type: type, x: x, y: y, id: id++, angle: 0, discovered: true }; lv.balls.push(b); return b; };
    var st = WOG.save.structure();
    if (st && st.b.length) {
      var ids = st.b.map(function (p) { id = Math.max(id, p[0] + 1); lv.balls.push({ type: type, x: p[1], y: p[2], id: p[0], angle: p[3], discovered: true }); return p[0]; });
      st.s.forEach(function (p) { if (ids[p[0]] != null && ids[p[1]] != null) lv.strands.push({ gb1: ids[p[0]], gb2: ids[p[1]] }); });
      var more = extras + 3 - st.b.length;
      for (var k = 0; k < more; k++) add(cx + (k % K.perRow - (K.perRow - 1) / 2) * K.gap, cy + K.dropY + Math.floor(k / K.perRow) * K.gap);
      console.log('WoG Corp (' + type + '): saved structure loaded (' + st.b.length + ' balls, ' + st.s.length + ' strands)' + (more > 0 ? ' + ' + more + ' new' : ''));
      return;
    }
    var h = K.side * Math.sqrt(3) / 2;
    var t = [add(cx - K.side / 2, cy + K.structY), add(cx + K.side / 2, cy + K.structY), add(cx, cy + K.structY + h)];
    lv.strands.push({ gb1: t[0].id, gb2: t[1].id }, { gb1: t[1].id, gb2: t[2].id }, { gb1: t[2].id, gb2: t[0].id });
    for (var i = 0; i < extras; i++) {
      var col = i % K.perRow, row = Math.floor(i / K.perRow);
      add(cx + (col - (K.perRow - 1) / 2) * K.gap, cy + K.dropY + row * K.gap);
    }
    console.log('WoG Corp (' + type + '): ' + extras + ' extra gooballs + a 3-ball structure');
  }

  function layerAnimPose(l) {
    var d = l.anim && ANIMS[l.anim];
    if (!d) return null;
    if (l._t0 == null) l._t0 = time;
    var t = (time - l._t0) * l.animspeed + l.animdelay, len = d.length;
    if (len > 0 && (t > len || t < 0)) t = l.animloop ? (((t % len) + len) % len) : (t < 0 ? 0 : len);
    return animPose(d, t);
  }
  WOG.layerPose = function (l) { var p = layerAnimPose(l); return p && { angleDeg: +(p.raw * 180 / Math.PI).toFixed(1), sx: p.sx, sy: p.sy, tx: p.tx, ty: p.ty, t0: l._t0, now: time }; };
  function layerVisible(l) {
    return ANIMS[l.anim] || l.anim !== 'blink' || Math.floor(time * l.animspeed * 2) % 2 === 0;
  }
  function layerSpin(l) { return !ANIMS[l.anim] && l.anim === 'rot_1rps' ? l.animspeed * Math.PI * 2 * time : 0; }

  function drawLayer(l) {
    if (l.isWater) { camera.applyDepth(ctx, canvas.width, canvas.height, pixelScale, l.depth, 0, 0); if (camera.depthFactor(l.depth)) l.draw(ctx); return; }
    if (l.pipeObj) { WOG.pipe.draw(ctx, res, camera, canvas.width, canvas.height, pixelScale, game, l); return; }
    if (l.pipePops) { WOG.pipe.drawPops(ctx, res, camera, canvas.width, canvas.height, pixelScale, game, l); return; }
    if (l.fx) { if (!WOG.settings || WOG.settings.get('particles')) WOG.fx.draw(l, ctx, res, camera, canvas.width, canvas.height, pixelScale); return; }
    if (l.hidden || !layerVisible(l)) return;
    var img = res.tintedImage(l.up ? ((!l.enabled && l.disabled) ? l.disabled : l.up) : l.image, l.colorize);
    if (!img) return;
    if (!l.screen && !camera.depthFactor(l.depth)) return;
    var ap = layerAnimPose(l);
    if (ap && (ap.sx === 0 || ap.sy === 0)) return;
    ctx.save();
    if (l.screen) { ctx.setTransform(pixelScale, 0, 0, pixelScale, l.x * pixelScale, l.y * pixelScale); }
    else camera.applyDepth(ctx, canvas.width, canvas.height, pixelScale, l.depth, l.x, l.y);
    ctx.globalAlpha = l.alpha;
    if (ap) { ctx.translate(ap.tx, -ap.ty); ctx.rotate(ap.raw); ctx.scale(ap.sx, ap.sy); }
    ctx.rotate((l.screen ? -l.rotation : l.rotation) + layerSpin(l));
    var g = l.up ? 1 + BTN.grow * (l.h || 0) : 1;
    ctx.scale(l.scalex * g, (l.screen ? 1 : -1) * l.scaley * g);
    if ((l.tilex || l.tiley) && !l.up) drawTiled(img, l); else
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    if (l.up && l.over && l.enabled && l.h > 0) {
      var ov = res.tintedImage(l.over, l.colorize);
      if (ov) { ctx.globalAlpha = l.alpha * l.h; ctx.drawImage(ov, -ov.width / 2, -ov.height / 2); }
    }
    ctx.restore();
  }

  function drawTiled(img, l) {
    var w = img.width, h = img.height, m = ctx.getTransform(), inv;
    try { inv = m.inverse(); } catch (e) { inv = null; }
    if (!inv || !(w > 0 && h > 0)) { ctx.drawImage(img, -w / 2, -h / 2); return; }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    [[0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]].forEach(function (c) {
      var p = inv.transformPoint(new DOMPoint(c[0], c[1]));
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    var LIM = 80;
    var x0 = l.tilex ? Math.max(-LIM, Math.floor((minX + w / 2) / w)) : 0, x1 = l.tilex ? Math.min(LIM, Math.floor((maxX + w / 2) / w)) : 0;
    var y0 = l.tiley ? Math.max(-LIM, Math.floor((minY + h / 2) / h)) : 0, y1 = l.tiley ? Math.min(LIM, Math.floor((maxY + h / 2) / h)) : 0;
    var ox = l.tilex ? 0.5 : 0, oy = l.tiley ? 0.5 : 0;
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++)
      ctx.drawImage(img, tx * w - w / 2 - ox / 2, ty * h - h / 2 - oy / 2, w + ox, h + oy);
  }

  function drawGeometry(g) {
    ctx.save();
    ctx.lineWidth = 2 / (camera.zoom * pixelScale);
    ctx.strokeStyle = g.static ? '#ff4d4d' : '#4dd2ff';
    ctx.beginPath();
    if (g.kind === 'circle') {
      ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
    } else if (g.kind === 'rectangle') {
      ctx.translate(g.x, g.y); ctx.rotate(g.rotation);
      ctx.rect(-g.width / 2, -g.height / 2, g.width, g.height);
    } else if (g.kind === 'line') {
      var nx = g.normal[0], ny = g.normal[1], tx = -ny, ty = nx, L = 3000;
      ctx.moveTo(g.anchor[0] - tx * L, g.anchor[1] - ty * L);
      ctx.lineTo(g.anchor[0] + tx * L, g.anchor[1] + ty * L);
      ctx.moveTo(g.anchor[0], g.anchor[1]);
      ctx.lineTo(g.anchor[0] + nx * 40, g.anchor[1] + ny * 40);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawScene(dt) {
    var W = canvas.width, H = canvas.height;
    var sc = game.data.scene, lv = game.data.level;
    var bg = sc.background;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgb(' + bg.join(',') + ')';
    ctx.fillRect(0, 0, W, H);

    camera.apply(ctx, W, H, pixelScale);
    var look = camera.screenToWorld(mouse.sx * pixelScale, mouse.sy * pixelScale, W, H, pixelScale);

    var layers = game.drawables;
    var i;
    for (i = 0; i < layers.length; i++) if (layers[i].depth <= 0) drawLayer(layers[i]);
    camera.apply(ctx, W, H, pixelScale);

    for (i = 0; i < game.strands.length; i++) {
      var s = game.strands[i];
      WOG.drawStrand(ctx, res, s.a, s.b, s.def);
    }
    for (i = 0; i < game.balls.length; i++) game.balls[i].draw(ctx, res, time, look);
    var held = game.world && game.world.held;
    if (held) {
      var ds = game.world.dragStrands || [];
      if (ds.bridge && ds.length === 2) WOG.drawPreviewStrand(ctx, res, ds[0], ds[1], held.def.strand);
      else ds.forEach(function (o) { WOG.drawPreviewStrand(ctx, res, held, o, held.def.strand); });
      held.draw(ctx, res, time, look);
      held.drawMarker(ctx, res, time);
      if (held.detachPhase) WOG.drawPullMarker(ctx, res, held);
    }
    var hov = game.world && game.world.hover;
    if (hov && !held) hov.drawMarker(ctx, res, time);

    for (i = 0; i < layers.length; i++) if (layers[i].depth > 0) drawLayer(layers[i]);
    camera.apply(ctx, W, H, pixelScale);

    if (debug.geometry) {
      sc.geometry.forEach(drawGeometry);
      if (game.world && game.world.bodyShapes) game.world.bodyShapes.forEach(drawGeometry);
      if (game.world && game.world.bodySys) game.world.bodySys.jointPoints().forEach(function (p) {
        ctx.save(); ctx.lineWidth = 2 / (camera.zoom * pixelScale); ctx.strokeStyle = '#ffe14d';
        ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      });
      sc.forcefields.forEach(function (f) {
        ctx.save(); ctx.lineWidth = 2 / (camera.zoom * pixelScale); ctx.setLineDash([8, 6]);
        ctx.strokeStyle = f.enabled === false ? '#777' : (f.kind === 'radial' ? '#ffb347' : '#6aa6ff');
        ctx.beginPath();
        if (f.kind === 'radial') ctx.arc(f.center[0], f.center[1], f.radius, 0, Math.PI * 2);
        else if (f.center && f.width != null) ctx.rect(f.center[0] - f.width / 2, f.center[1] - f.height / 2, f.width, f.height);
        ctx.stroke(); ctx.restore();
      });
      if (lv.exit) {
        ctx.save(); ctx.strokeStyle = '#7dff7d'; ctx.lineWidth = 2 / (camera.zoom * pixelScale);
        ctx.beginPath(); ctx.arc(lv.exit.pos[0], lv.exit.pos[1], lv.exit.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (lv.pipe) {
        ctx.save(); ctx.strokeStyle = '#7dff7d'; ctx.lineWidth = 2 / (camera.zoom * pixelScale);
        ctx.beginPath();
        lv.pipe.vertices.forEach(function (v, n) { if (n) ctx.lineTo(v[0], v[1]); else ctx.moveTo(v[0], v[1]); });
        ctx.stroke(); ctx.restore();
      }
    }
    if (debug.radius) {
      ctx.save(); ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 1.5 / (camera.zoom * pixelScale);
      game.balls.forEach(function (b) {
        if (b.def.shape.kind !== 'circle') return;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore();
    }
  }

  var FONT_BIG = 'wogBig', FONT_SMALL = 'TwCenMTCondensedExtraBold18';
  var TIP = { bigX: 580, bigY: 241, subX: 571, subY: 320, bigTurn: 2 * Math.PI / 180, subScale: 0.45, offX: -42, offY: -76, tilt: -10 * Math.PI / 180 };
  function buttonScreen(b) {
    if (b.screen) return { x: b.x, y: b.y };
    var f = camera.depthFactor(b.depth);
    return { x: BASE_W / 2 + (b.x - camera.x) * camera.zoom * f, y: BASE_H / 2 - (b.y - camera.y) * camera.zoom * f };
  }
  function tipText(font, lines, cx, cy, scale, turn, color) {
    var F = WOG.font, h = lines.length * F.lineHeight(font, scale);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(turn);
    F.draw(ctx, font, lines, 0, -h / 2, { scale: scale, align: 'center', color: color });
    ctx.restore();
  }
  WOG.TIP = TIP; TIP.angleSign = -1;
  TIP.corpWrap = 350; TIP.corpX = 400; TIP.corpTitleY = 232; TIP.corpDescY = 397; TIP.corpDescScale = 0.3; TIP.popLocalX = -10; TIP.popLocalY = -27; TIP.tickRate = 60;
  var ANIMS = {};
  function parseAnim(doc) {
    var root = doc.documentElement, A = WOG.attr, N = WOG.num, times = {}, tr = {};
    var ft = root.getElementsByTagName('frameTimes')[0];
    if (ft) WOG.children(ft).forEach(function (e) { times[A(e, 'frameIndex')] = N(A(e, 'start')); });
    Array.prototype.forEach.call(root.getElementsByTagName('transform'), function (t) {
      tr[A(t, 'type')] = Array.prototype.map.call(t.getElementsByTagName('keyframe'), function (k) {
        return { t: times[A(k, 'frameIndex')] || 0, next: A(k, 'nextFrameIndex') == null ? -1 : N(A(k, 'nextFrameIndex')), linear: A(k, 'interpolation') === 'linear',
                 x: N(A(k, 'x'), 0), y: N(A(k, 'y'), 0), angle: N(A(k, 'angle'), 0), alpha: N(A(k, 'alpha'), 255) };
      });
    });
    var len = 0; Object.keys(times).forEach(function (k) { len = Math.max(len, times[k]); });
    return { times: times, tr: tr, length: len };
  }
  function track(def, type, t, field, dflt) {
    var k = def.tr[type]; if (!k || !k.length) return dflt;
    var i = 0; for (var n = 0; n < k.length; n++) if (k[n].t <= t) i = n; else break;
    var p = k[i], q = null;
    if (p.linear && p.next >= 0) for (var m = 0; m < k.length; m++) if (def.times[p.next] === k[m].t && k[m] !== p) q = k[m];
    if (!q || q.t <= p.t) return p[field];
    var u = Math.max(0, Math.min(1, (t - p.t) / (q.t - p.t)));
    return p[field] + (q[field] - p[field]) * u;
  }
  function animPose(def, t) {
    return { raw: track(def, 'rotate', t, 'angle', 0) * Math.PI / 180, sx: track(def, 'scale', t, 'x', 1), sy: track(def, 'scale', t, 'y', 1), ang: track(def, 'rotate', t, 'angle', 0) * Math.PI / 180 * TIP.angleSign,
             tx: track(def, 'translate', t, 'x', 0), ty: track(def, 'translate', t, 'y', 0), alpha: Math.max(0, Math.min(1, track(def, 'alpha', t, 'alpha', 255) / 255)) };
  }
  var animTried = {};
  async function loadAnims(names) {
    names = (names || ['level_name_popup', 'island_name_in', 'island_name_loop', 'island_name_out']).filter(function (n) { return n && !animTried[n]; });
    await Promise.all(names.map(async function (n) {
      animTried[n] = 1;
      try { ANIMS[n] = parseAnim(await WOG.fetchXML('res/anim/' + n + '.anim.xml')); } catch (e) { console.warn('anim ' + n + ' not read (res/anim/' + n + '.anim.xml):', e.message); }
    }));
  }
  var tips = [];
  function resetTips() { tips = []; tip = null; }
  function setTip(t) {
    if (tip && tip !== t) { tip.leaving = true; tip.out = 0; }
    tip = t;
    if (t) { t.leaving = false; t.age = 0; t.h = 0; tips.push(t); }
  }
  function updateTips(dt) {
    tips.forEach(function (t) {
      if (t.button) {
        t.h = Math.max(0, Math.min(ANIMS.level_name_popup ? ANIMS.level_name_popup.length : 0.2, t.h + (t.leaving ? -1 : 1) * 0.01 * TIP.tickRate * dt));
        if (t.leaving && t.h <= 0) t.dead = true;
      } else if (t.leaving) { t.out += dt; if (t.out >= (ANIMS.island_name_out ? ANIMS.island_name_out.length : 0.12)) t.dead = true; }
      else t.age += dt;
    });
    tips = tips.filter(function (t) { return !t.dead; });
  }
  function islandPose(t) {
    var d = ANIMS;
    if (t.leaving) return d.island_name_out ? animPose(d.island_name_out, t.out) : null;
    if (d.island_name_in && t.age < d.island_name_in.length) return animPose(d.island_name_in, t.age);
    if (d.island_name_loop) return animPose(d.island_name_loop, d.island_name_loop.length ? (t.age - (d.island_name_in ? d.island_name_in.length : 0)) % d.island_name_loop.length : 0);
    return d.island_name_in ? animPose(d.island_name_in, d.island_name_in.length) : null;
  }
  function tipText(font, lines, cx, cy, scale, turn, color, alpha, lx, ly) {
    var F = WOG.font, h = lines.length * F.lineHeight(font, scale);
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.translate(cx, cy); ctx.rotate(turn);
    F.draw(ctx, font, lines, lx || 0, (ly || 0) - h / 2, { scale: scale, align: 'center', color: color });
    ctx.restore();
  }
  function drawTip() {
    var F = WOG.font;
    if (!F || !F.get(FONT_SMALL)) return;
    updateTips(frameDt);
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    tips.forEach(function (t) {
      if (t.big) {
        if (!F.get(FONT_BIG)) return;
        var p = islandPose(t); if (!p || p.alpha <= 0 || p.sx <= 0) return;
        if (t.corp) {
          var tl = F.lines(t.title), tw = 0; tl.forEach(function (x) { tw = Math.max(tw, F.width(FONT_BIG, x, 1)); });
          var ts = tw > TIP.corpWrap ? TIP.corpWrap / tw : 1;
          tipText(FONT_BIG, tl, TIP.corpX + p.tx, TIP.corpTitleY + p.ty, ts * p.sx, p.ang, '#000', p.alpha);
          if (t.body) {
            var dl = F.lines(t.body).reduce(function (o, x) { return o.concat(F.wrap(FONT_BIG, x, TIP.corpWrap, TIP.corpDescScale)); }, []);
            tipText(FONT_BIG, dl, TIP.corpX + p.tx, TIP.corpDescY + p.ty, TIP.corpDescScale * p.sx, p.ang, '#000', p.alpha);
          }
          return;
        }
        var bx = TIP.bigX - 175, by = TIP.bigY, sx = TIP.subX - 175, sy = TIP.subY;
        var cx = bx + p.tx, cy = by + p.ty;
        tipText(FONT_BIG, F.lines(t.title), cx, cy, p.sx, p.ang, '#000', p.alpha);
        if (t.body) tipText(FONT_BIG, F.lines(t.body), sx + p.tx, sy + p.ty, p.sx * TIP.subScale, p.ang, '#000', p.alpha);
        return;
      }
      var lines = F.lines(t.title);
      if (t.button) {
        var d = ANIMS.level_name_popup, bs = buttonScreen(t.button), q;
        if (d) { q = animPose(d, t.h); if (q.alpha <= 0 || q.sx <= 0) return; }
        else q = { tx: TIP.offX + 12, ty: TIP.offY + 26, sx: 1, sy: 1, ang: TIP.tilt, alpha: 1 };
        ctx.save(); ctx.translate(bs.x + q.tx, bs.y + q.ty); ctx.rotate(q.ang); ctx.scale(q.sx, q.sy);
        tipText(FONT_SMALL, lines, 0, 0, 1, 0, undefined, q.alpha, TIP.popLocalX, TIP.popLocalY);
        ctx.restore();
        return;
      }
      tipText(FONT_SMALL, lines, BASE_W / 2, BASE_H - 40, 1, 0);
    });
  }

  function drawError() {
    if (!/^Error/.test(status)) return;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.font = '14px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#f66'; ctx.fillText(status, 8, 8);
  }

  var alphaCache = {};
  function opaqueAt(img, id, px, py) {
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return false;
    var m = alphaCache[id];
    if (!m) {
      var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0);
      try { m = alphaCache[id] = x.getImageData(0, 0, c.width, c.height).data; } catch (e) { m = alphaCache[id] = null; }
    }
    return m ? m[((py | 0) * img.width + (px | 0)) * 4 + 3] > 20 : true;
  }
  function buttonAt(sx, sy) {
    if (!game || !game.buttons.length) return null;
    var W = canvas.width, H = canvas.height, s = camera.zoom * pixelScale;
    for (var i = game.drawables.length - 1; i >= 0; i--) {
      var b = game.drawables[i];
      if (!b.up || b.hidden) continue;
      var dx, dy, rr = b.screen ? b.rotation : -b.rotation, c = Math.cos(rr), sn = Math.sin(rr), u, v;
      if (b.screen) {
        dx = sx / pixelScale - b.x; dy = sy / pixelScale - b.y;
        u = (dx * c - dy * sn) / b.scalex; v = (dx * sn + dy * c) / b.scaley;
      } else {
        var f = camera.depthFactor(b.depth); if (!f) continue;
        var lx = (sx - W / 2) / (s * f) + camera.x, ly = -(sy - H / 2) / (s * f) + camera.y;
        dx = lx - b.x; dy = ly - b.y;
        u = (dx * c - dy * sn) / b.scalex; v = -(dx * sn + dy * c) / b.scaley;
      }
      var img = res.image(b.up); if (!img) continue;
      if (opaqueAt(img, b.up, u + img.width / 2, v + img.height / 2)) return b;
    }
    return null;
  }
  var uiHover = null;
  function updateHover() {
    uiHover = game && game.ui && !inputLocked() && !settingsOpen && inside ? WOG.islandUi.buttonAt(game.ui, res, mouse.sx, mouse.sy) : null;
    if (game && game.ui) WOG.islandUi.update(game.ui, uiHover, frameDt);
    if (!game || !game.buttons.length || inputLocked() || settingsOpen) { if (hover && hover.onmouseexit) WOG.map.call(hover.onmouseexit, hover); hover = null; if (game) game.buttons.forEach(function (o) { o.image = (!o.enabled && o.disabled) ? o.disabled : o.up; }); return; }
    var b = uiHover ? null : buttonAt(mouse.sx * pixelScale, mouse.sy * pixelScale);
    if (b !== hover) {
      if (hover && hover.onmouseexit) WOG.map.call(hover.onmouseexit, hover);
      if (b && b.onmouseenter) WOG.map.call(b.onmouseenter, b);
      hover = b;
    }
    game.buttons.forEach(function (o) {
      o.image = (!o.enabled && o.disabled) ? o.disabled : (o === hover && o.enabled && o.over ? o.over : o.up);
      var goal = (o === hover) ? 1 : 0,
           step = frameDt / BTN.time;
      o.h = Math.max(0, Math.min(1, (o.h || 0) + (goal > (o.h || 0) ? step : -step)));
    });
    canvas.style.cursor = hover && hover.enabled ? 'pointer' : 'default';
  }

  function inputLocked() { return WOG.movie.covering || introLocked(); }
  function introLocked() { return !!(game && camera.playing && camera.mode === 'intro' && camera.introLength() > 0); }
  var BAR_H = 75;
  function updateLetterbox(dt) {
    var want = game && !game.eol && (introLocked() || game.data.level.letterboxed) ? 1 : 0;
    var step = 0.04 * 60 * dt;
    letterbox = want > letterbox ? Math.min(want, letterbox + step) : Math.max(want, letterbox - step);
  }
  function drawLetterbox() {
    if (letterbox <= 0) return;
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    var h = BAR_H * (2 * letterbox - letterbox * letterbox);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, BASE_W, h); ctx.fillRect(0, BASE_H - h, BASE_W, h);
  }

  function minZoom() {
    var sc = game.data.scene, w = sc.maxx - sc.minx, h = sc.maxy - sc.miny;
    return Math.max(0.1, w > 0 ? BASE_W / w : 0, h > 0 ? BASE_H / h : 0);
  }
  function clampCamera() {
    if (!game || camera.playing) return;
    var sc = game.data.scene;
    if (!(sc.maxx > sc.minx && sc.maxy > sc.miny)) return;
    camera.zoom = Math.max(minZoom(), Math.min(WOG.CAMERA.maxZoom, camera.zoom));
    var hw = BASE_W / 2 / camera.zoom, hh = BASE_H / 2 / camera.zoom;
    camera.x = sc.maxx - sc.minx <= 2 * hw ? (sc.minx + sc.maxx) / 2 : Math.max(sc.minx + hw, Math.min(sc.maxx - hw, camera.x));
    camera.y = sc.maxy - sc.miny <= 2 * hh ? (sc.miny + sc.maxy) / 2 : Math.max(sc.miny + hh, Math.min(sc.maxy - hh, camera.y));
  }
  function edgeScroll(dt) {
    if (!onPage || (mouse.down && mouse.button === 2)) return false;
    if (WOG.settings && !WOG.settings.get('edgeScroll')) return false;
    var band = WOG.CAMERA.edgeBand, sp = WOG.CAMERA.edgeSpeed * dt / camera.zoom, dx = 0, dy = 0;
    var cl = function (v) { return Math.max(0, Math.min(1, v)); };
    if (mouse.sx < band) dx = -cl(1 - mouse.sx / band);
    else if (mouse.sx > BASE_W - band) dx = cl(1 - (BASE_W - mouse.sx) / band);
    if (mouse.sy < band) dy = cl(1 - mouse.sy / band);
    else if (mouse.sy > BASE_H - band) dy = -cl(1 - (BASE_H - mouse.sy) / band);
    if (!dx && !dy) return false;
    camera.x += dx * sp; camera.y += dy * sp;
    return true;
  }
  WOG.CAMERA = { maxZoom: 2, edgeBand: 90, edgeSpeed: 600 };

  WOG.SEASON_CARD = { fadeIn: 0, hold: 1.6, outMovie: 'gooTransition_out', font: 'TwCenMTCondensedExtraBold18', scale: 1, color: '#ffffff' };
  var seasonCard = null;
  function drawSeasonCard(dt) {
    if (!seasonCard) return;
    var K = WOG.SEASON_CARD, F = WOG.font;
    seasonCard.a = K.fadeIn > 0 ? Math.min(1, seasonCard.a + dt / K.fadeIn) : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = seasonCard.a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    if (F && F.get && F.get(K.font)) {
      var lines = F.lines(seasonCard.text);
      F.draw(ctx, K.font, lines, BASE_W / 2, BASE_H / 2 - lines.length * F.lineHeight(K.font, K.scale) / 2, { align: 'center', scale: K.scale, color: K.color });
    } else { ctx.fillStyle = '#fff'; ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(seasonCard.text.replace(/\|/g, ' '), BASE_W / 2, BASE_H / 2); ctx.textAlign = 'left'; }
    ctx.globalAlpha = 1;
  }
  function wait(sec) { return new Promise(function (r) { setTimeout(r, sec * 1000); }); }

  var fpsSmooth = 0;
  function drawFps(dt, c) {
    if (!(WOG.settings && WOG.settings.get('fpsCounter')) || !(dt > 0)) return;
    fpsSmooth = fpsSmooth ? fpsSmooth + (1 / dt - fpsSmooth) * 0.05 : 1 / dt;
    c.setTransform(1, 0, 0, 1, 0, 0);
    var dpr = window.devicePixelRatio || 1, txt = Math.round(fpsSmooth) + ' FPS';
    c.font = 'bold ' + Math.round(14 * dpr) + 'px monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(6 * dpr, 6 * dpr, c.measureText(txt).width + 12 * dpr, 22 * dpr);
    c.fillStyle = '#8dff8d'; c.fillText(txt, 12 * dpr, 10 * dpr);
  }

  var last = performance.now(), frameDt = 0;
  function frame(now) {
    var dt = (now - last) / 1000; last = now;
    if (!(dt > 0) || dt > 1) dt = 1 / 60;
    var P0 = performance.now();
    time += dt; frameDt = dt;
    updateLevelVisibility();
    WOG.fps = WOG.fps ? WOG.fps + ((dt > 0 ? 1 / dt : 60) - WOG.fps) * 0.05 : 60;

    var pan = 500 * dt / camera.zoom, moved = false;
    var locked = inputLocked();
    var free = !(game && (game.isMap || game.eol || game.sign)) && !locked;
    var kk = dbg() ? keys : {};
    if (free) { if (kk.ArrowLeft || kk.a) { camera.x -= pan; moved = true; }
    if (kk.ArrowRight || kk.d) { camera.x += pan; moved = true; }
    if (kk.ArrowUp || kk.w) { camera.y += pan; moved = true; }
    if (kk.ArrowDown || kk.s) { camera.y -= pan; moved = true; } }
    if (free && edgeScroll(dt)) moved = true;
    if (moved) camera.playing = false;
    camera.update(dt);
    if (!(game && game.isMap)) clampCamera();

    if (game && game.world && !game.eol && !game.sign) {
      var mw = mouseWorld();
      game.world.mouse.x = mw.x; game.world.mouse.y = mw.y;
      if (game.world.setHover) { if (inside && !inputLocked() && !hover && !uiHover && !(WOG.eol && WOG.eol.overHandle && WOG.eol.overHandle(game))) game.world.setHover(mw.x, mw.y); else game.world.setHover(null); }
      game.world.update(dt);
      if (game.waters) game.waters.forEach(function (w) { w.update(dt); });
    }
    if (game && game.emitters && WOG.fx && (!WOG.settings || WOG.settings.get('particles'))) {
      game.emitters.forEach(function (e) { WOG.fx.update(e, dt, camera, BASE_W, BASE_H); });
      if (game.emitters.some(function (e) { return e.done; })) {
        game.emitters = game.emitters.filter(function (e) { return !e.done; });
        game.drawables = game.drawables.filter(function (e) { return !e.done; });
      }
    }
    if (game && !game.isMap && !game.eol && !game.sign && !inputLocked()) game.playTime = (game.playTime || 0) + dt;
    if (game && !game.isMap && !game.eol && !game.sign && WOG.pipe && game.data.level.exit) WOG.pipe.update(game, res, dt);
    if (game && !game.isMap && !game.sign && WOG.eol) WOG.eol.update(game, res, dt, mouse.sx, mouse.sy);
    WOG.movie.update(dt);
    if (started) WOG.cursor.update(dt, mouse.sx, mouse.sy, !!(game && game.world && game.world.held));
    updateLetterbox(dt);
    updateHover();
    var P1 = performance.now();
    if (!started) { drawGate(); requestAnimationFrame(frame); return; }
    if (WOG.settings && WOG.settings.apply) WOG.settings.apply();
    if (settingsOpen && WOG.settingsUI) WOG.settingsUI.drag(mouse.sx, mouse.sy, mouse.down && mouse.button === 0);
    if (settingsOpen) { ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0); WOG.settingsUI.draw(ctx, mouse.sx, mouse.sy); }
    else if (game) { drawScene(dt); if (game.eol) WOG.eol.draw(ctx, res, canvas.width, canvas.height, pixelScale, game); else if (WOG.eol && WOG.eol.drawHandle) WOG.eol.drawHandle(ctx, res, pixelScale, game); }
    else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    var P2 = performance.now();
    if (!settingsOpen) { drawTip(); drawLetterbox(); if (game && game.ui) WOG.islandUi.draw(ctx, res, pixelScale, game.ui); }
    drawSeasonCard(dt);
    var P3 = performance.now();
    WOG.movie.draw(ctx, pixelScale);
    canvas.style.cursor = 'none';
    document.documentElement.style.cursor = 'none';
    WOG.cursor.visible = onPage && !seasonCard && (!WOG.movie.covering || !!(game && ((game.eol && game.eol.waiting) || (game.sign && game.sign.waiting)))) && !(game && game.world && inside && (game.world.held || game.world.hover));
    var cr = canvas.getBoundingClientRect(), cdpr = window.devicePixelRatio || 1;
    cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    WOG.cursor.draw(cctx, res, cr.width * cdpr / BASE_W, cr.left * cdpr, cr.top * cdpr);
    drawFps(dt, cctx);
    drawError();
    if (perfRun) perfSample(P0, P1, P2, P3, performance.now(), now);
    requestAnimationFrame(frame);
  }

  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * BASE_W / r.width, y: (e.clientY - r.top) * BASE_H / r.height };
  }
  window.addEventListener('mousemove', function (e) {
    var p = canvasPos(e);
    if (mouse.down && mouse.button === 2 && !(game && (game.isMap || game.eol)) && !inputLocked() && dbg()) {
      camera.x -= (p.x - mouse.sx) / camera.zoom; camera.y += (p.y - mouse.sy) / camera.zoom;
      camera.playing = false;
    }
    mouse.sx = p.x; mouse.sy = p.y; onPage = true;
    inside = p.x >= 0 && p.x <= BASE_W && p.y >= 0 && p.y <= BASE_H;
  });
  document.documentElement.addEventListener('mouseleave', function () { onPage = false; inside = false; });
  function mouseWorld() {
    var sx = Math.max(0, Math.min(BASE_W, mouse.sx)), sy = Math.max(0, Math.min(BASE_H, mouse.sy));
    return camera.screenToWorld(sx * pixelScale, sy * pixelScale, canvas.width, canvas.height, pixelScale);
  }
  canvas.addEventListener('mousedown', function (e) {
    var p = canvasPos(e); mouse.sx = p.x; mouse.sy = p.y;
    if (e.button === 0 && game && game.eol) { WOG.eol.click(game, mouse.sx, mouse.sy); return; }
    if (e.button === 0 && game && game.sign) { WOG.signpost.click(game); return; }
    if (inputLocked()) return;
    if (e.button === 0 && !settingsOpen && game && !game.isMap && !game.eol && WOG.signpost && WOG.signpost.clickLevel(game, mouse.sx, mouse.sy, camera, res)) return;
    if (e.button === 0 && !settingsOpen && game && !game.isMap && !game.eol && WOG.eol && WOG.eol.clickLevel && WOG.eol.clickLevel(game, mouse.sx, mouse.sy)) return;
    mouse.down = true; mouse.button = e.button;
    if (settingsOpen) { if (e.button === 0 && !going && WOG.settingsUI.click(mouse.sx, mouse.sy) === 'back') WOG.closeSettings(); return; }
    if (e.button === 0 && game && game.ui) { updateHover(); if (uiHover) { WOG.islandUi.click(uiHover); return; } }
    if (e.button === 0 && game && game.buttons.length) { updateHover(); if (hover) { if (hover.enabled && hover.onclick) WOG.map.call(hover.onclick, hover); return; } }
    if (e.button === 0 && game && game.world) { var w = mouseWorld(), held0 = game.world.held; game.world.pickup(w.x, w.y); if (game.world.held && !held0) game.moves = (game.moves || 0) + 1; }
  });
  window.addEventListener('mouseup', function (e) {
    mouse.down = false;
    if (e.button === 0 && game && game.world) game.world.release();
  });
  window.addEventListener('blur', function () { mouse.down = false; if (game && game.world) game.world.release(); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (settingsOpen || !dbg() || (game && (game.isMap || game.eol || inputLocked()))) return;
    camera.zoom = camera.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1);
    camera.playing = false;
  }, { passive: false });
  window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key === 'Escape') {
      if (settingsOpen) { if (!going && !WOG.movie.busy) WOG.closeSettings(); }
      else if (WOG.movie.busy) { if (dbg()) WOG.movie.skip(); }
      else if (game && !game.isMap) WOG.go(MAP);
    }
    if (!dbg() || settingsOpen) return;
    if (e.key === 'g') debug.geometry = !debug.geometry;
    if (e.key === 'b') debug.radius = !debug.radius;
    if (e.key === 'p') WOG.PHYS.enabled = !WOG.PHYS.enabled;
    if (e.key === 'n' && game) startLevel(game.name);
    if (e.key === 'i') camera.replay();
    if (e.key === 'r' && game) camera.skipToEnd();
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  var started = false;
  function drawGate() {
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Click to play', BASE_W / 2, BASE_H / 2);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  function onFirstClick(e) {
    if (started) return;
    started = true;
    window.removeEventListener('pointerdown', onFirstClick, true);
    e.stopPropagation();
    res.audioContext();
    if (WOG.settings && WOG.settings.get('fullscreen')) {
      window.addEventListener('mouseup', function () { WOG.settings.setFullscreen(true); }, { once: true, capture: true });
    }
    boot().catch(function (err) { console.error(err); status = 'Error: ' + err.message; });
  }
  window.addEventListener('pointerdown', onFirstClick, true);

  var going = false;
  WOG.go = async function (name, opts) {
    if (going) return;
    opts = opts || {};
    going = true;
    try {
      if (opts.intro && !opts.covered && /^island\d+$/.test(name)) {
        var K = WOG.SEASON_CARD;
        seasonCard = { text: WOG.text.get('CHAPTER_' + opts.intro + '_SEASON'), a: K.fadeIn > 0 ? 0 : 1 };
        if (K.fadeIn > 0) { await wait(K.fadeIn); seasonCard.a = 1; }
        await Promise.all([startLevel(name), wait(K.hold)]);
        var outP = WOG.movie.play(res, K.outMovie);
        seasonCard = null;
        await outP;
      } else if (name === MAP || /^island\d+$/.test(name)) {
        if (!opts.covered) await WOG.movie.play(res, 'gooTransition_in', { hold: true });
        await startLevel(name);
        await WOG.movie.play(res, opts.outMovie || 'gooTransition_out');
      } else {
        var vars = levelInfoVars(name);
        await WOG.movie.play(res, 'levelinfotransition_in', { hold: true, vars: vars });
        var loading = startLevel(name);
        await WOG.movie.play(res, 'levelinfotransition_main', { hold: true, vars: vars, loopFor: 0.9, loopUntil: loading });
        await loading;
        if (game && !game.isMap) camera.replay();
        await WOG.movie.play(res, 'levelinfotransition_out', { vars: vars });
      }
    } finally { going = false; }
  };
  WOG.transition = async function (mid) {
    if (going) return;
    going = true;
    try {
      await WOG.movie.play(res, 'gooTransition_in', { hold: true });
      await mid();
      await WOG.movie.play(res, 'gooTransition_out');
    } finally { going = false; }
  };
  WOG.openSettings = async function () {
    if (going || settingsOpen) return;
    going = true;
    try {
      setTip(null);
      await WOG.movie.play(res, 'gooTransition_in', { hold: true });
      settingsOpen = true;
      await WOG.movie.play(res, 'gooTransition_out');
    } finally { going = false; }
  };
  WOG.closeSettings = async function () {
    if (going || !settingsOpen) return;
    going = true;
    try {
      await WOG.movie.play(res, 'gooTransition_in', { hold: true });
      settingsOpen = false;
      await WOG.movie.play(res, 'gooTransition_out');
    } finally { going = false; }
  };
    // levels and maps
  function levelInfoVars(name) {
    var isl = game && game.island, lv = isl && WOG.islandLevel(isl.id, name), n = isl && /(\d+)$/.exec(isl.id);
    var iconId = null;
    if (n) { iconId = 'IMAGE_ISLANDICON_' + n[1]; res.defs[iconId] = { type: 'image', path: 'res/images/islandicon_' + n[1] }; }
    var corp = { wogc: 'WOG_CORP_', wogc3d: 'WOG_CORP_3D_', wogcd: 'WOG_CORP_D_' }[name];
    if (corp) return { LEVEL_NAME: WOG.text.get(corp + 'NAME'), LEVEL_TEXT: WOG.text.get(corp + 'DESCRIPTION'), ISLAND_ICON: iconId };
    return {
      LEVEL_NAME: WOG.text.get(lv ? lv.name : 'LEVEL_NAME_' + name.toUpperCase()),
      LEVEL_TEXT: WOG.text.get(lv ? lv.text : 'LEVEL_TEXT_' + name.toUpperCase()),
      ISLAND_ICON: iconId
    };
  }

  function loadScript(name, already) {
    if (already) return Promise.resolve();
    return new Promise(function (ok) {
      var sc = document.createElement('script'); sc.src = 'js/' + name + '.js?t=' + Date.now();
      sc.onload = ok; sc.onerror = function () { console.warn('js/' + name + '.js not found'); ok(); }; document.head.appendChild(sc);
    });
  }

  var waterLoaded = loadScript('water');
  var bodiesLoaded = loadScript('bodies');
  var saveLoaded = loadScript('save');
  loadScript('islandui');
  loadScript('pipe');
  loadScript('signpost');
  loadScript('eol');
  loadScript('tunepanel');
  loadScript('favicon');
  loadScript('settings');
  WOG.BOOT_MUSIC_FADE = 0.05;

  async function boot() {
    await saveLoaded; await bodiesLoaded; await waterLoaded;
    if (WOG.save) WOG.save.onChange(WOG.refreshMap);
    if (WOG.PHYS.useODE) { status = 'Starting ODE...'; await WOG.initODE(); }
    await WOG.text.load();
    await Promise.all([loadScript('font', WOG.font), loadScript('particles', WOG.fx)]);
    if (WOG.fx) await WOG.fx.load();
    await loadAnims();
    if (WOG.font) await Promise.all([WOG.font.load('wogBig'), WOG.font.load('TwCenMTCondensedExtraBold18')]);
    status = 'Reading materials...';
    materials = await WOG.loadMaterials('properties/materials.xml.xml');
    status = 'Reading resources.xml...';
    await res.addManifest('properties/resources.xml.xml');
    await res.loadImage('IMAGE_GLOBAL_CURSOR_CIRCLE');
    status = '';
    var wanted = location.hash.slice(1) || new URLSearchParams(location.search).get('level');
    if (wanted && WOG.LEVELS.indexOf(wanted) >= 0) { startLevel(wanted); return; }
    status = 'Loading...';
    var mapMusicId = null;
    try { mapMusicId = await WOG.peekMusic(MAP, res); } catch (e) { console.warn('map music not found:', e.message); }
    await Promise.all([
      WOG.music.preload(res, mapMusicId),
      WOG.movie.preload(res, '2dboyLogo'),
      WOG.movie.preload(res, 'gooTransition_out')
    ]);
    status = '';
    await WOG.movie.play(res, '2dboyLogo', {
      hold: true,
      onStart: function () { WOG.music.play(res, mapMusicId, { fade: WOG.BOOT_MUSIC_FADE }); }
    });
    await startLevel(MAP);
    await WOG.movie.play(res, 'gooTransition_out');
  }
  resize();
  requestAnimationFrame(frame);

  WOG.debug = debug;
  WOG.camera = camera; WOG.res = res;
  WOG.getGame = function () { return game; };
  WOG.scanFields = async function () {
    var lines = [], P = WOG.PHYS;
    lines.push('PHYS timeScale=' + P.timeScale + ' gravityScale=' + P.gravityScale + ' subStep=' + P.subStep + '  (defaults 8 / 1 / 0.01)');
    for (var i = 0; i < WOG.LEVELS.length; i++) {
      var n = WOG.LEVELS[i];
      try {
        var doc = await WOG.fetchXML('res/levels/' + n + '/' + n + '.scene.xml'), fs = [];
        Array.prototype.forEach.call(doc.documentElement.children, function (el) {
          if (el.tagName !== 'linearforcefield' && el.tagName !== 'radialforcefield') return;
          var at = function (k) { return el.getAttribute(k); }, o = [el.tagName === 'radialforcefield' ? 'radial' : 'linear', at('type') || '?'];
          o.push(el.tagName === 'radialforcefield' ? 'c=' + at('forceatcenter') + ',e=' + at('forceatedge') + ' r=' + at('radius') : 'f=' + at('force'));
          if (at('center')) o.push('box ' + at('center') + ' ' + at('width') + 'x' + at('height'));
          if (at('dampeningfactor')) o.push('damp=' + at('dampeningfactor'));
          if (at('antigrav') === 'true') o.push('ANTIGRAV'); if (at('geomonly') === 'true') o.push('geomonly'); if (at('enabled') === 'false') o.push('disabled'); if (at('water') === 'true') o.push('water');
          fs.push(o.join(' '));
        });
        lines.push(n + ': ' + (fs.length ? fs.join('  |  ') : '(no force fields)'));
      } catch (e) { lines.push(n + ': (not read: ' + e.message + ')'); }
    }
    var txt = lines.join('\n'); console.log(txt); return txt;
  };
  var perfRun = null;
  function perfSample(P0, P1, P2, P3, P4, now) {
    var r = perfRun;
    if (r.lastNow) { r.gap += now - r.lastNow; r.n++; }
    r.lastNow = now; r.upd += P1 - P0; r.scene += P2 - P1; r.over += P3 - P2; r.cur += P4 - P3;
    if (r.n >= r.frames) {
      var f = function (v) { return +(v / r.n).toFixed(2); }, g = game;
      var out = { level: g && g.name, frames: r.n, 'frame gap ms': f(r.gap), fps: +(1000 / (r.gap / r.n)).toFixed(1), 'update+physics ms': f(r.upd), 'scene draw ms': f(r.scene), 'overlays ms': f(r.over), 'cursor+rest ms': f(r.cur),
        canvas: canvas.width + 'x' + canvas.height, dpr: window.devicePixelRatio, page: window.innerWidth + 'x' + window.innerHeight, cursorCanvas: cursorCanvas.width + 'x' + cursorCanvas.height,
        drawables: g ? g.drawables.length : 0, balls: g ? g.balls.length : 0, strands: g ? g.strands.length : 0, emitters: g && g.emitters ? g.emitters.length : 0, renderScale: WOG.renderScale || 1 };
      perfRun = null; console.log('WOG.perf result:\n' + JSON.stringify(out, null, 1)); window.perfResult = out;
    }
  }
  WOG.perf = function (frames) { perfRun = { frames: frames || 180, n: 0, gap: 0, upd: 0, scene: 0, over: 0, cur: 0, lastNow: 0 }; console.log('WOG.perf: measuring ' + perfRun.frames + ' frames, keep playing...'); };
  WOG.diag = function () {
    var g = game, P = WOG.PHYS, out = { level: g && g.name, fps: Math.round(WOG.fps || 0), timeScale: P.timeScale, gravityScale: P.gravityScale, physicsOn: P.enabled, ode: !!P.useODE,
      balls: g ? g.balls.length : 0, fields: g ? g.data.scene.forcefields.map(function (f) { return { kind: f.kind, type: f.type, force: f.force || [f.forceatcenter, f.forceatedge], damp: f.dampeningfactor, enabled: f.enabled, box: f.center ? f.center.join(',') + ' ' + f.width + 'x' + f.height : 'all', geomonly: f.geomonly }; }) : [] };
    console.log(JSON.stringify(out, null, 1)); return out;
  };
  WOG.refreshMap = function () { if (game && game.isMap) { game.buttons.forEach(function (b) { b.hidden = WOG.map.isHidden(b); }); game.data.scene.layers.forEach(function (l) { if (/^ocd_/.test(l.id)) l.hidden = !WOG.map.ocdDone(l.id.slice(4)); }); } };

  WOG.levelUnlocked = function (isl, id) {
    var lv = WOG.islandLevel(isl.id, id);
    if (!lv || (WOG.settings && WOG.settings.get('unlockAll'))) return true;
    return lv.depends.every(function (d) { return !!(WOG.save && WOG.save.isComplete(d)); });
  };
  WOG.islandUnlocked = function (n) {
    var isl = WOG.islands['island' + n];
    if (!isl || !isl.levels.length || (WOG.settings && WOG.settings.get('unlockAll'))) return true;
    return isl.levels.some(function (l) { return WOG.levelUnlocked(isl, l.id); });
  };
  function updateLevelVisibility() {
    if (game && game.isMap) {
      game.buttons.forEach(function (b) { if (b.island && b.island[1] <= 5) b.enabled = WOG.map.isEnabled(b) && WOG.islandUnlocked(+b.island[1]); });
      return;
    }
    if (!game || !game.island) return;
    var isl = game.island, m;
    game.buttons.forEach(function (b) { if ((m = /^lb_(.+)$/.exec(b.id || ''))) b.hidden = !WOG.levelUnlocked(isl, m[1]); });
    game.data.scene.layers.forEach(function (l) { if ((m = /^levelpipe_(.+)$/.exec(l.id || ''))) l.hidden = !WOG.levelUnlocked(isl, m[1]); });
  }

  WOG.map = {
    locked: [],
    ocdDone: function (levelId) { return false; },
    isHidden: function (b) { var m = /^wogcorp_(intact|3d|destroyed)$/.exec(b.id); return !!m && m[1] !== (WOG.save ? WOG.save.wogcorp() : 'intact'); },
    isEnabled: function (b) { return WOG.map.locked.indexOf(b.id) < 0; },
    handlers: {
      island1: function () { WOG.map.openIsland(1); }, island2: function () { WOG.map.openIsland(2); },
      island3: function () { WOG.map.openIsland(3); }, island4: function () { WOG.map.openIsland(4); },
      island5: function () { WOG.map.openIsland(5); }, island6: function () { WOG.map.openIsland(6); },
      wogcorp: function (b) {
        var lv = { wogcorp_intact: 'wogc', wogcorp_3d: 'wogc3d', wogcorp_destroyed: 'wogcd' }[b && b.id];
        if (lv && WOG.LEVELS.indexOf(lv) >= 0) { WOG.returnTo = MAP; WOG.go(lv); } else console.warn('WoG Corp level not found for ' + (b && b.id));
      },
      quit: function () { WOG.openSettings(); }
    },
    openIsland: function (n) {
      var name = 'island' + n;
      if (WOG.LEVELS.indexOf(name) < 0) { console.warn('No scene for ' + name + ' yet'); return; }
      WOG.go(name, { intro: n });
    },
    call: function (handler, button) {
      var h = WOG.map.handlers[handler], m;
      if (h) h(button);
      else if (handler === 'islandhidetext') setTip(null);
      else if ((m = /^island(\d)showtext$/.exec(handler))) {
        setTip({ big: true, title: WOG.text.get('CHAPTER' + m[1] + '_NAME'), body: WOG.text.get('CHAPTER' + m[1] + '_DESCRIPTION') });
      }
      else if (handler === 'wogcorpshowtext') { var k3 = button && button.id === 'wogcorp_3d' ? 'WOG_CORP_3D_' : 'WOG_CORP_'; setTip({ big: true, corp: true, title: WOG.text.get(k3 + 'NAME'), body: WOG.text.get(k3 + 'DESCRIPTION') }); }
      else if (handler === 'wogcorpdshowtext') setTip({ big: true, corp: true, title: WOG.text.get('WOG_CORP_D_NAME'), body: WOG.text.get('WOG_CORP_D_DESCRIPTION') });
      else if (handler === 'showtooltip') setTip({ title: WOG.text.get(button.tooltip), body: '', button: button });
      else if (handler === 'hidetooltip') setTip(null);
      else if ((m = /^(pl|ss|hs)_(.+)$/.exec(handler))) {
        if (m[1] === 'hs') setTip(null);
        else if (m[1] === 'pl') { if (WOG.LEVELS.indexOf(m[2]) >= 0) { WOG.returnTo = game && game.island ? game.island.id : MAP; WOG.go(m[2]); } else console.warn('Level not in WOG.LEVELS: ' + m[2]); }
        else {
          var lv = game && game.island && WOG.islandLevel(game.island.id, m[2]);
          var key = lv ? lv : { name: 'LEVEL_NAME_' + m[2].toUpperCase(), text: 'LEVEL_TEXT_' + m[2].toUpperCase() };
          setTip({ title: WOG.text.get(key.name), body: '', button: button });
        }
      }
      else console.log('map handler not built:', handler);
    }
  };
})();