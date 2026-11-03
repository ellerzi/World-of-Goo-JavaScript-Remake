// chapter ui becausue thas a seperate level forsome reason :(*2
(function () {
  var A = WOG.attr, num = WOG.num;
  var NAME = 'IslandUi';
  var FONTS = { FONT_OUTLINE_18: 'TwCenMTCondensedExtraBold18', FONT_BIG: 'wogBig' };

  var U = WOG.islandUi = {
    show: { newmail: false, newballs: false },
    handlers: {
      zoomout: function () { WOG.go('MapWorldView'); },
      wogcorp_from_island: function () {
        var st = WOG.save ? WOG.save.wogcorp() : 'intact', lv = { intact: 'wogc', '3d': 'wogc3d', destroyed: 'wogcd' }[st];
        var g = WOG.getGame && WOG.getGame();
        if (WOG.LEVELS.indexOf(lv) < 0) { console.warn('WoG Corp level not found: ' + lv); return; }
        WOG.returnTo = g && g.island ? g.island.id : 'MapWorldView';
        WOG.go(lv);
      }
    }
  };

  function argb(s) {
    if (!s) return null;
    var v = WOG.vec(s); return v.length >= 4 ? 'rgb(' + v[1] + ',' + v[2] + ',' + v[3] + ')' : 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')';
  }

  function parseScene(doc) {
    var ui = { layers: [], buttons: [], labels: [] }, root = doc.documentElement;
    function button(el, group) {
      return {
        id: A(el, 'id'), group: group, x: num(A(el, 'x')), y: num(A(el, 'y')),
        scalex: num(A(el, 'scalex'), 1), scaley: num(A(el, 'scaley'), 1), rotation: -num(A(el, 'rotation')) * Math.PI / 180,
        alpha: num(A(el, 'alpha'), 1), colorize: WOG.rgb(A(el, 'colorize')),
        up: A(el, 'up'), over: A(el, 'over'), onclick: A(el, 'onclick'),
        text: A(el, 'text'), font: A(el, 'font'), colorUp: argb(A(el, 'textcolorup')), colorOver: argb(A(el, 'textcolorupover')),
        h: 0
      };
    }
    WOG.children(root).forEach(function (el) {
      if (el.tagName === 'SceneLayer') {
        ui.layers.push({ id: A(el, 'id') || '', x: num(A(el, 'x')), y: num(A(el, 'y')), scalex: num(A(el, 'scalex'), 1), scaley: num(A(el, 'scaley'), 1),
          rotation: -num(A(el, 'rotation')) * Math.PI / 180, alpha: num(A(el, 'alpha'), 1), colorize: WOG.rgb(A(el, 'colorize')), image: A(el, 'image') });
      } else if (el.tagName === 'buttongroup') {
        WOG.children(el).forEach(function (b) { if (b.tagName === 'button') ui.buttons.push(button(b, A(el, 'id'))); });
      } else if (el.tagName === 'button') {
        ui.buttons.push(button(el, null));
      } else if (el.tagName === 'label') {
        ui.labels.push({ id: A(el, 'id') || '', x: num(A(el, 'x')), y: num(A(el, 'y')), align: A(el, 'align') || 'center', rotation: -num(A(el, 'rotation')) * Math.PI / 180,
          scale: num(A(el, 'scale'), 1), font: A(el, 'font'), text: A(el, 'text') });
      }
    });
    return ui;
  }

  U.load = async function (res) {
    var dir = NAME, base, docs, moved = false;
    try { base = 'res/levels/' + dir + '/' + NAME; docs = await Promise.all([WOG.fetchXML(base + '.scene.xml'), res.addManifest(base + '.resrc.xml')]); }
    catch (e) {
      try {
        dir = NAME.toLowerCase(); base = 'res/levels/' + dir + '/' + NAME; moved = true;
        docs = await Promise.all([WOG.fetchXML(base + '.scene.xml'), res.addManifest(base + '.resrc.xml')]);
      } catch (e2) { console.warn('IslandUi not loaded:', e2.message); return null; }
    }
    if (moved) Object.keys(res.defs).forEach(function (id) {
      if (/^IMAGE_SCENE_ISLANDUI_/.test(id)) res.defs[id].path = res.defs[id].path.replace('res/levels/' + NAME + '/', 'res/levels/' + dir + '/');
    });
    var ui = parseScene(docs[0]), ids = {};
    ui.layers.forEach(function (l) { if (l.image) ids[l.image] = 1; });
    ui.buttons.forEach(function (b) { if (b.up) ids[b.up] = 1; if (b.over) ids[b.over] = 1; });
    await res.loadImages(Object.keys(ids));
    return ui;
  };

  U.buttonAt = function (ui, res, mx, my) {
    if (!ui) return null;
    for (var i = ui.buttons.length - 1; i >= 0; i--) {
      var b = ui.buttons[i], img = res.image(b.up); if (!img) continue;
      var dx = mx - b.x, dy = my - b.y, c = Math.cos(-b.rotation), s = Math.sin(-b.rotation);
      var u = (dx * c - dy * s) / b.scalex + img.width / 2, v = (dx * s + dy * c) / b.scaley + img.height / 2;
      if (solid(img, b.up, u, v)) return b;
    }
    return null;
  };
  var masks = {};
  var addMode = {};
  function additive(img, id) {
    if (addMode[id] === undefined) {
      var d = null; try { var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; var x = c.getContext('2d'); x.drawImage(img, 0, 0); d = x.getImageData(0, 0, c.width, c.height).data; } catch (e) {}
      var opaque = !!d; if (d) for (var i = 3; i < d.length; i += 4) if (d[i] < 255) { opaque = false; break; }
      addMode[id] = opaque ? 'lighter' : 'source-over';
    }
    return addMode[id];
  }
  function solid(img, id, px, py) {
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return false;
    var m = masks[id];
    if (m === undefined) {
      try { var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; var x = c.getContext('2d'); x.drawImage(img, 0, 0); m = masks[id] = x.getImageData(0, 0, c.width, c.height).data; }
      catch (e) { m = masks[id] = null; }
    }
    return m ? m[((py | 0) * img.width + (px | 0)) * 4 + 3] > 20 : true;
  }

  U.update = function (ui, hot, dt) {
    if (!ui) return;
    var step = dt / ((WOG.BTN && WOG.BTN.time) || 0.18);
    ui.buttons.forEach(function (b) { var goal = b === hot ? 1 : 0; b.h = Math.max(0, Math.min(1, b.h + (goal > b.h ? step : -step))); });
  };

  U.click = function (b) { var h = b && U.handlers[b.onclick]; if (h) h(b); else if (b) console.log('islandUi handler not built:', b.onclick); };

  U.draw = function (ctx, res, pixelScale, ui) {
    if (!ui) return;
    var F = WOG.font, grow = (WOG.BTN && WOG.BTN.grow) || 0, i;
    ctx.save();
    ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    ui.layers.forEach(function (l) {
      if (l.id in U.show && !U.show[l.id]) return;
      var img = res.tintedImage(l.image, l.colorize); if (!img) return;
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rotation); ctx.scale(l.scalex, l.scaley); ctx.globalAlpha = l.alpha; ctx.globalCompositeOperation = additive(res.image(l.image), l.image);
      ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
    });
    ui.buttons.forEach(function (b) {
      var img = res.tintedImage(b.up, b.colorize); if (!img) return;
      var g = 1 + grow * b.h;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rotation); ctx.scale(b.scalex * g, b.scaley * g); ctx.globalAlpha = b.alpha;
      ctx.globalCompositeOperation = additive(res.image(b.up), b.up);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      if (b.over && b.h > 0) {
        var ov = res.tintedImage(b.over, b.colorize);
        if (ov) { ctx.globalAlpha = b.alpha * b.h; ctx.drawImage(ov, -ov.width / 2, -ov.height / 2); ctx.globalAlpha = b.alpha; }
      }
      ctx.globalCompositeOperation = 'source-over';
      var font = FONTS[b.font] || b.font;
      if (b.text && F && F.get(font)) {
        var lines = F.lines(WOG.text.get(b.text)), lh = lines.length * F.lineHeight(font, 1);
        F.draw(ctx, font, lines, 0, -lh / 2, { align: 'center', color: (b.h >= 0.5 ? b.colorOver : b.colorUp) || undefined });
      }
      ctx.restore();
    });
    ui.labels.forEach(function (l) {
      if (l.id in U.show && !U.show[l.id]) return;
      var font = FONTS[l.font] || l.font;
      if (!F || !F.get(font)) return;
      var lines = F.lines(WOG.text.get(l.text)), lh = lines.length * F.lineHeight(font, l.scale);
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rotation);
      F.draw(ctx, font, lines, 0, -lh / 2, { align: l.align, scale: l.scale });
      ctx.restore();
    });
    ctx.restore();
  };
})();
