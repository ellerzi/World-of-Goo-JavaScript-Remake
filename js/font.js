(function () {
  function tokenize(src) {
    var t = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "'" || c === '"') {
        var s = '', q = c; i++;
        while (i < n && src[i] !== q) { if (src[i] === '\\' && i + 1 < n) i++; s += src[i++]; }
        i++; t.push({ s: s }); continue;
      }
      if ('(),;'.indexOf(c) >= 0) { t.push(c); i++; continue; }
      var m = /^-?[0-9.]+/.exec(src.slice(i, i + 24));
      if (m) { t.push({ n: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 64));
      if (m) { t.push({ id: m[0] }); i += m[0].length; continue; }
      i++;
    }
    return t;
  }
  function parseValue(t, p, vars) {
    var k = t[p.i];
    if (k === '(') {
      p.i++; var list = [];
      while (t[p.i] !== ')' && p.i < t.length) { if (t[p.i] === ',') { p.i++; continue; } list.push(parseValue(t, p, vars)); }
      p.i++; return list;
    }
    p.i++;
    if (k.s != null) return k.s;
    if (k.n != null) return k.n;
    return k.id in vars ? vars[k.id] : k.id;
  }
  function parseFont(src) {
    var t = tokenize(src), vars = {}, f = { spacing: 0, ascent: 0, padding: 0, lineOff: 0, pointSize: 1, widths: {}, glyphs: {}, kern: {} };
    var p = { i: 0 };
    while (p.i < t.length) {
      var stmt = [];
      while (p.i < t.length && t[p.i] !== ';') stmt.push(parseValueAt(t, p, vars));
      p.i++;
      if (!stmt.length) continue;
      var cmd = stmt[0].id;
      if (cmd === 'Define') { vars[stmt[1].id] = stmt[2]; continue; }
      var a = stmt.slice(2);
      if (cmd === 'LayerSetAscent') f.ascent = a[0];
      else if (cmd === 'LayerSetAscentPadding') f.padding = a[0];
      else if (cmd === 'LayerSetLineSpacingOffset') f.lineOff = a[0];
      else if (cmd === 'LayerSetPointSize') f.pointSize = a[0];
      else if (cmd === 'LayerSetSpacing') f.spacing = a[0];
      else if (cmd === 'LayerSetCharWidths') a[0].forEach(function (ch, n) { f.widths[ch] = a[1][n]; });
      else if (cmd === 'LayerSetImageMap') a[0].forEach(function (ch, n) { var r = a[1][n]; f.glyphs[ch] = { x: r[0], y: r[1], w: r[2], h: r[3], ox: 0, oy: 0 }; });
      else if (cmd === 'LayerSetCharOffsets') a[0].forEach(function (ch, n) { if (f.glyphs[ch]) { f.glyphs[ch].ox = a[1][n][0]; f.glyphs[ch].oy = a[1][n][1]; } });
      else if (cmd === 'LayerSetKerningPairs') a[0].forEach(function (pair, n) { f.kern[pair] = a[1][n]; });
      else if (cmd === 'LayerSetImage') f.imageName = a[0];
    }
    return f;
  }
  function parseValueAt(t, p, vars) {
    var k = t[p.i];
    if (k && k.id && !(k.id in vars)) { p.i++; return k; }
    return parseValue(t, p, vars);
  }

  var fonts = {}, tints = {};
  WOG.font = {
    load: async function (name) {
      if (fonts[name]) return fonts[name];
      try {
        var r = await fetch('res/fonts/' + name + '.txt');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var f = parseFont(await r.text());
        f.name = name;
        f.img = await new Promise(function (ok, fail) {
          var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { fail(new Error('png missing')); };
          im.src = 'res/fonts/' + name + '.png';
        });
        return (fonts[name] = f);
      } catch (e) { console.warn('font ' + name + ' not loaded:', e.message); return null; }
    },
    get: function (name) { return fonts[name] || null; },
    lineHeight: function (name, scale) { var f = fonts[name]; return f ? (f.ascent + f.padding + f.lineOff) * (scale || 1) : 0; },
    lines: function (text) { return String(text).split(/\||\n/); },
    _adv: function (f, line, i, scale) {
      var ch = line[i], w = f.widths[ch];
      if (w == null) return 0;
      var k = i + 1 < line.length ? (f.kern[ch + line[i + 1]] || 0) : 0;
      return (w + k + f.spacing) * scale;
    },
    width: function (name, line, scale) {
      var f = fonts[name]; if (!f) return 0; scale = scale || 1;
      var x = 0; for (var i = 0; i < line.length; i++) x += WOG.font._adv(f, line, i, scale);
      return x;
    },
    wrap: function (name, text, maxW, scale) {
      var out = [];
      WOG.font.lines(text).forEach(function (para) {
        var words = para.split(/ +/), cur = '';
        words.forEach(function (w) {
          var t = cur ? cur + ' ' + w : w;
          if (cur && WOG.font.width(name, t, scale) > maxW) { out.push(cur); cur = w; } else cur = t;
        });
        out.push(cur);
      });
      return out;
    },
    draw: function (ctx, name, text, x, y, opt) {
      var f = fonts[name]; if (!f) return 0;
      opt = opt || {};
      var scale = opt.scale || 1, align = opt.align || 'left', color = opt.color || null, atlas = f.img;
      if (color) {
        var key = name + '|' + color;
        if (!tints[key]) {
          var c = document.createElement('canvas'); c.width = f.img.width; c.height = f.img.height;
          var g = c.getContext('2d'); g.drawImage(f.img, 0, 0);
          g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
          g.globalCompositeOperation = 'destination-in'; g.drawImage(f.img, 0, 0);
          tints[key] = c;
        }
        atlas = tints[key];
      }
      var lines = Array.isArray(text) ? text : WOG.font.lines(text), step = (f.ascent + f.padding + f.lineOff) * scale;
      ctx.save(); ctx.imageSmoothingEnabled = true;
      lines.forEach(function (line, n) {
        var w = WOG.font.width(name, line, scale);
        var px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, py = y + n * step;
        for (var i = 0; i < line.length; i++) {
          var gl = f.glyphs[line[i]];
          if (gl) ctx.drawImage(atlas, gl.x, gl.y, gl.w, gl.h, px + gl.ox * scale, py + gl.oy * scale, gl.w * scale, gl.h * scale);
          px += WOG.font._adv(f, line, i, scale);
        }
      });
      ctx.restore();
      return lines.length * step;
    }
  };
})();
