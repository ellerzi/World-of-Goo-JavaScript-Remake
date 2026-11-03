(function () {
  var N = 24, STEP_HZ = 60;
  var pts = [], acc = 0, started = false, t = 0;
  for (var i = 0; i < N; i++) pts.push({ x: 0, y: 0 });

  var MOUSE_ID = 'IMAGE_GLOBAL_CURSOR_MOUSE';
  function drawMouse(ctx, res, pixelScale, ox, oy) {
    if (!res.defs[MOUSE_ID]) res.defs[MOUSE_ID] = { type: 'image', path: 'res/images/cursor_mouse' };
    var img = res.image(MOUSE_ID);
    if (!img) { res.loadImage(MOUSE_ID); return false; }
    var breath = 1 + 0.05 * Math.sin(t * C.breathSpeed), sc = C.mouseScale * breath, w = img.width * sc, h = img.height * sc;
    var x0 = pts[0].x - (C.mouseAnchor === 'center' ? w / 2 : 0), y0 = pts[0].y - (C.mouseAnchor === 'center' ? h / 2 : 0);
    ctx.save();
    ctx.setTransform(pixelScale, 0, 0, pixelScale, ox || 0, oy || 0);
    ctx.globalAlpha = 1;
    [{ tint: C.color, k: 1 }, { tint: [0, 0, 0], k: 0.9 }].forEach(function (pass) {
      var pic = res.tintedImage(MOUSE_ID, pass.tint), pw = w * pass.k, ph = h * pass.k;
      ctx.drawImage(pic, x0 + (w - pw) / 2, y0 + (h - ph) / 2, pw, ph);
    });
    ctx.restore();
    return true;
  }

  var C = WOG.cursor = {
    color: [255, 255, 255],
    visible: true,
    follow: 0.35,
    breathSpeed: 0.9 * Math.PI,
    mouseScale: 0.7,
    mouseAnchor: 'topleft',

    update: function (dt, mx, my, holding) {
      t += dt;
      if (!started) { pts.forEach(function (p) { p.x = mx; p.y = my; }); started = true; }
      acc += dt * STEP_HZ;
      var steps = Math.min(4, Math.floor(acc)); acc -= Math.floor(acc);
      pts[0].x = mx; pts[0].y = my;
      for (var s = 0; s < steps; s++) {
        pts[0].x = mx; pts[0].y = my;
        for (var i = 1; i < N; i++) {
          if (holding) { pts[i].x = mx; pts[i].y = my; continue; }
          var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 5) { pts[i].x = pts[i - 1].x + dx / d * 3.5; pts[i].y = pts[i - 1].y + dy / d * 3.5; }
          else if (d > 0) {
            if (d < 0.05) { pts[i].x = pts[i - 1].x; pts[i].y = pts[i - 1].y; }
            else { var k = C.follow; pts[i].x -= dx * k; pts[i].y -= dy * k; }
          }
        }
      }
    },

    draw: function (ctx, res, pixelScale, ox, oy) {
      if (!C.visible || !started) return;
      if (WOG.settings && WOG.settings.get('mouseCursor') && drawMouse(ctx, res, pixelScale, ox, oy)) return;
      var img = res.image('IMAGE_GLOBAL_CURSOR_CIRCLE');
      var f = N - 1;
      for (var i = 1; i < N; i++) if (pts[i].x !== pts[0].x || pts[i].y !== pts[0].y) { f = i; break; }
      var breath = 1 + 0.05 * Math.sin(t * C.breathSpeed);
      ctx.save();
      ctx.setTransform(pixelScale, 0, 0, pixelScale, ox || 0, oy || 0);
      ctx.globalAlpha = 1;
      [{ tint: C.color, k: 1 }, { tint: [0, 0, 0], k: 0.9 }].forEach(function (pass) {
        var pic = img && res.tintedImage('IMAGE_GLOBAL_CURSOR_CIRCLE', pass.tint);
        for (var i = N - 1; i >= 0; i--) {
          var sc = Math.pow(0.96, Math.max(i - f, 0)) * 0.7 * breath * pass.k;
          if (pic) {
            ctx.drawImage(pic, pts[i].x - pic.width * sc / 2, pts[i].y - pic.height * sc / 2, pic.width * sc, pic.height * sc);
          } else {
            ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 14 * sc, 0, Math.PI * 2);
            ctx.fillStyle = 'rgb(' + pass.tint.join(',') + ')'; ctx.fill();
          }
        }
      });
      ctx.restore();
    }
  };
})();
