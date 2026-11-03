// here, you can use the sign posts! -The JavaScript Sign Painter
(function () {
  var S = WOG.signpost = {
    loaded: false,
    slackX: 0, slackY: 0
  };
  var MOVIES = ['signpostDlg_in', 'signpostDlg_loop', 'signpostDlg_flipin', 'signpostDlg_flipout', 'signpostDlg_out'];

  S.load = function (res) {
    if (S._p) return S._p;
    return (S._p = Promise.all(MOVIES.map(function (m) { return WOG.movie.preload(res, m, { vars: { SIGN_TEXT: '' } }); })).then(function () { S.loaded = true; }));
  };

  function hits(l, sx, sy, cam, res) {
    if (!l.sign || l.hidden || !l.image) return false;
    var img = res.image(l.image), f = cam.depthFactor(l.depth);
    if (!img || !f) return false;
    var z = cam.zoom, tx = 800 / 2 + (l.x - cam.x) * z * f, ty = 600 / 2 - (l.y - cam.y) * z * f;
    var ux = (sx - tx) / z, uy = -(sy - ty) / z;
    var c = Math.cos(l.rotation), sn = Math.sin(l.rotation);
    var lx = ux * c + uy * sn, ly = -ux * sn + uy * c;
    return Math.abs(lx) <= img.width * Math.abs(l.scalex) / 2 + S.slackX && Math.abs(ly) <= img.height * Math.abs(l.scaley) / 2 + S.slackY;
  }
  S.signAt = function (game, sx, sy, cam, res) {
    var best = null;
    game.data.scene.layers.forEach(function (l) { if (l.sign && hits(l, sx, sy, cam || WOG.camera, res || WOG.res) && (!best || l.depth >= best.depth)) best = l; });
    return best;
  };

  S.clickLevel = function (game, sx, sy, cam, res) {
    if (!game || game.sign || game.eol || game.isMap) return false;
    var l = S.signAt(game, sx, sy, cam, res);
    if (!l) return false;
    run(game, res || WOG.res, l).catch(function (e) { console.error('signpost dialog failed:', e); if (game.sign) game.sign = null; });
    return true;
  };

  S.click = function (game) {
    var s = game && game.sign;
    if (!s || !s.waiting) return false;
    s.waiting = false;
    if (s.onClick) s.onClick();
    WOG.movie.skip();
    return true;
  };

  S.lines = function (l) {
    var t = WOG.text ? WOG.text.get(l.text) : l.text;
    var out = String(t == null ? '' : t).split('|').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; });
    return out.length ? out : [''];
  };

  async function run(game, res, l) {
    var M = WOG.movie, lines = S.lines(l);
    if (!S.loaded) await S.load(res);
    var s = game.sign = { layer: l, lines: lines, idx: 0, waiting: false, onClick: null };
    if (game.world) { if (game.world.setHover) game.world.setHover(null); }
    var v = function (i) { return { vars: { SIGN_TEXT: lines[i] }, hold: true }; };
    await M.play(res, 'signpostDlg_in', v(0));
    for (;;) {
      s.waiting = true;
      var clicked = new Promise(function (r) { s.onClick = r; });
      await M.play(res, 'signpostDlg_loop', { vars: { SIGN_TEXT: lines[s.idx] }, hold: true, loopFor: 0.05, loopUntil: clicked });
      s.waiting = false;
      if (s.idx >= lines.length - 1) break;
      await M.play(res, 'signpostDlg_flipin', v(s.idx));
      s.idx++;
      await M.play(res, 'signpostDlg_flipout', v(s.idx));
    }
    await M.play(res, 'signpostDlg_out', { vars: { SIGN_TEXT: lines[s.idx] } });
    game.sign = null;
  }
})();
