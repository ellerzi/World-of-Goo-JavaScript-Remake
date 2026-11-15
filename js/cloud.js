// i use a temporary server for this, so im unsure if ill keep this
(function () {
  var DEFAULT_SERVER = 'https://markers-obtain-nov-brand.trycloudflare.com/wogbuddy2';
  var LS = { server: 'wog.cloud.server', key: 'wog.cloud.key', name: 'wog.cloud.name', on: 'wog.cloud.on' };
  var UPLOAD_EVERY = 30;      // 30s between uploads
  var POLL_EVERY = 30;        // seconds between cloud refreshes
  var HEIGHT_STEP = 100;      // skip an upload unless the height moved by 1 m 
  var MIN_CLOUD_H = 5;        // original ignores players at or below 5
  var X_MIN = -600, X_MAX = 2000;
  var DEPTH = -0.5;
  var LEVELS = { wogc: 1, wogcd: 1, wogc3d: 1 };
  var FLAG_PREFIX = ['IMAGE_SCENE_WOGC_FLAG_', 'IMAGE_SCENE_WOGCD_FLAG_', 'IMAGE_SCENE_WOGC3D_FLAG_'];
  var FONTS = { FONT_OUTLINE_18: 'TwCenMTCondensedExtraBold18', FONT_OUTLINE_26: 'TwCenMTCondensedExtraBold18', FONT_BIG: 'wogBig' };
  var FONT_SCALE = { FONT_OUTLINE_26: 26 / 18 };
  var SMALL = 'TwCenMTCondensedExtraBold18';

  var S = null;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function server() { return ls(LS.server) || DEFAULT_SERVER; }
  function playerName() { return ls(LS.name) || 'Goo Fan'; }
  function country() { var m = /[-_]([A-Za-z]{2})\b/.exec((navigator && navigator.language) || ''); return m ? m[1].toUpperCase() : ''; }
  function T(key, fallback) { return WOG.text && WOG.text.has && WOG.text.has(key) ? WOG.text.get(key) : fallback; }
  function fmt(s, a, b) {
    var vals = [a, b], i = 0, used = false;
    s = String(s).replace(/%s|%d|%i|%f|%0?\.\d+f|\{0\}|\{1\}|\$1|\$2/g, function (m) {
      used = true;
      if (m === '{0}' || m === '$1') return vals[0];
      if (m === '{1}' || m === '$2') return vals[1];
      return vals[Math.min(i++, 1)];
    });
    if (!used) s = s.replace(/\bX\b/, a).replace(/\bY\b/, b);
    return s;
  }
  function hash01(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; }

  function api(op, data) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    var body = Object.assign({ op: op, version: 'js-remake' }, data || {});
    return fetch(server(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || j.result !== 'OK') throw new Error((j && j.message) || 'bad reply'); return j; })
      .then(function (j) { clearTimeout(t); return j; }, function (e) { clearTimeout(t); throw e; });
  }
  function ensureKey() {
    var k = ls(LS.key);
    if (k) return Promise.resolve(k);
    return api('GetPlayerKey').then(function (j) { ls(LS.key, j.key); return j.key; });
  }
  function withKey(fn) {
    return ensureKey().then(fn).catch(function (e) {
      if (/unknown key/.test(e.message)) { ls(LS.key, null); return ensureKey().then(fn); }   // server lost our key: get a new one, retry once
      throw e;
    });
  }

  function setState(st) { if (S) { S.state = st; S.stateAt = S.t; applyUi(); } }
  function applyUi() {
    if (!S) return;
    var st = S.state;
    S.lines.forEach(function (l) { l.hidden = l.id !== 'linetext_' + st; });
    S.game.buttons.forEach(function (b) {
      if (b.group === 'connectbuttongroup') { b.hidden = st === 'connected'; b.enabled = st !== 'connecting'; }
    });
  }
  function measure() {
    var top = 0, n = 0, att = 0, sx = 0;
    S.game.balls.forEach(function (b) {
      if (b.held) return;
      n++;
      if (b.state === 'attached' || b.strandCount > 0) { att++; sx += b.x; var t = b.y + (b.radius || 0); if (t > top) top = t; }
    });
    S.h = Math.max(0, top); S.n = n; S.att = att; if (att) S.cx = sx / att;
  }

  function askName() {
    var n = '';
    try { n = window.prompt('Name for your cloud (other players will see it):', playerName()) || ''; } catch (e) {}
    n = n.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24);
    ls(LS.name, n || playerName());
  }

  function upload() {
    var sd = S; if (!sd || sd.state !== 'connected' || sd.upBusy) return Promise.resolve();
    sd.upBusy = true; sd.lastUp = sd.t; sd.lastH = sd.h;
    return withKey(function (key) {
      return api('SetWogcStat', { key: key, name: playerName(), country: country(), height: Math.round(sd.h), ballCount: sd.n, ballCountAttached: sd.att });
    }).then(function (j) { if (S === sd && j.rank) sd.rank = j.rank; })
      .catch(function (e) { console.warn('cloud upload failed:', e.message); })
      .then(function () { sd.upBusy = false; });
  }
  function poll() {
    var sd = S; if (!sd || sd.state !== 'connected' || sd.pollBusy) return Promise.resolve();
    sd.pollBusy = true; sd.lastPoll = sd.t;
    return withKey(function (key) { return api('GetWogcStats', { key: key, height: Math.round(sd.h) }); })
      .then(function (j) { if (S === sd) { if (j.rank) sd.rank = j.rank; syncClouds(sd, j.players || []); } })
      .catch(function (e) { console.warn('cloud poll failed:', e.message); })
      .then(function () { sd.pollBusy = false; });
  }
  function connect() {
    var sd = S; if (!sd || sd.state === 'connecting' || sd.state === 'connected') return;
    setState('connecting');
    ensureKey().then(function () {
      if (S !== sd) return;
      if (!ls(LS.name)) askName();
      ls(LS.on, '1');
      measure(); setState('connected');
      return upload().then(poll);
    }).catch(function (e) {
      console.warn('cloud connect failed:', e.message);
      if (S === sd) setState('connectfail');
    });
  }
  function disconnect() { ls(LS.on, null); if (S) { S.clouds = []; S.rank = null; setState('disconnected'); } }
  function sendFinal() {
    var sd = S, key = ls(LS.key); if (!sd || sd.state !== 'connected' || !key || sd.h <= MIN_CLOUD_H) return;
    try { fetch(server(), { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ op: 'SetWogcStat', version: 'js-remake', key: key, name: playerName(), country: country(), height: Math.round(sd.h), ballCount: sd.n, ballCountAttached: sd.att }) }).catch(function () {}); } catch (e) {}
  }

  // cloud thing
  function flagFor(res, cc) {
    cc = String(cc || '').toUpperCase();
    var ids = cc ? FLAG_PREFIX.map(function (p) { return p + cc; }) : [];
    ids.push('IMAGE_GLOBAL_FLAG_UNKNOWN');
    for (var i = 0; i < ids.length; i++) if (res.has(ids[i])) { res.loadImage(ids[i]); return ids[i]; }
    return null;
  }
  function makeCloud(sd, p) {
    var u = hash01(String(p.player_id));
    return { id: p.player_id, x: X_MIN + u * (X_MAX - X_MIN), y: 0, h: 0, a: 0, gone: false,
      sp: 0.005 + hash01('s' + p.player_id) * 0.095, amp: 30 + hash01('a' + p.player_id) * 70, ph: hash01('p' + p.player_id) * 6.283,
      img: hash01('i' + p.player_id) < 0.5 ? 'IMAGE_GLOBAL_CLOUD1' : 'IMAGE_GLOBAL_CLOUD2', flag: flagFor(sd.res, p.countryCode), first: true };
  }
  function syncClouds(sd, list) {
    var byId = {}; sd.clouds.forEach(function (c) { byId[c.id] = c; c.gone = true; });
    list.forEach(function (p) {
      if (!(p.height > MIN_CLOUD_H)) return;
      var c = byId[p.player_id];
      if (!c) { c = makeCloud(sd, p); sd.clouds.push(c); }
      c.gone = false; c.name = String(p.player_name || ''); c.cc = p.countryCode; c.h = p.height; c.hMax = p.heightMax;
      c.balls = p.ballCount; c.att = p.ballCountAttached;
      if (c.first) { c.y = c.h; c.first = false; }
    });
  }
  function cloudImg(sd, id) {
    var img = sd.res.image(id);
    if (img || sd.imgTried[id]) return img;
    sd.imgTried[id] = 1;
    if (sd.res.has(id)) sd.res.loadImage(id);
    return null;
  }
  function puff(ctx, w) {   // fallback
    var r = w / 5;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    [[-2, 0.4, 0.9], [-1, -0.3, 1.2], [0, -0.6, 1.4], [1, -0.2, 1.15], [2, 0.4, 0.9], [0, 0.5, 1.2]].forEach(function (c) {
      ctx.beginPath(); ctx.arc(c[0] * r * 0.9, c[1] * r, r * c[2], 0, Math.PI * 2); ctx.fill();
    });
  }
  function drawOne(ctx, sd, camera, ps, f, c, mouse, mine) {
    var z = camera.zoom * f;
    var bx = c.x + c.amp * Math.sin(sd.t * (0.15 + c.sp * 3) + c.ph), by = c.y + 10 * Math.sin(sd.t * 0.4 + c.ph * 2);
    var sx = 400 + (bx - camera.x) * z, sy = 300 - (by - camera.y) * z;
    if (sx < -260 * z || sx > 800 + 260 * z || sy < -200 * z || sy > 600 + 200 * z) return;
    var F = WOG.font, hovered = mouse && Math.abs(mouse.sx - sx) < 110 * z && Math.abs(mouse.sy - sy) < 60 * z;
    ctx.save();
    ctx.setTransform(ps, 0, 0, ps, sx * ps, sy * ps);
    ctx.globalAlpha = Math.max(0, Math.min(1, c.a));
    ctx.scale(z, z);
    var img = cloudImg(sd, c.img);
    if (img) { var k = 230 / img.width; ctx.scale(k, k); ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.scale(1 / k, 1 / k); }
    else puff(ctx, 230);
    var lines = [c.name || '?', fmt(T('CLOUD_HEIGHT', '{0} m'), (c.h / 100).toFixed(1))];
    if (hovered && c.balls != null) lines.push(fmt(T('CLOUD_BALLS_USED', 'using X of Y balls'), c.att, c.balls));
    if (F && F.get(SMALL)) {
      var lh = F.lineHeight(SMALL, 0.5);
      F.draw(ctx, SMALL, lines, 0, -lh * lines.length / 2 + (mine ? 0 : 0), { align: 'center', scale: 0.5 });
    }
    var fl = c.flag ? sd.res.image(c.flag) : null;
    if (fl) { var fh = 18, fw = fl.width * fh / fl.height; ctx.drawImage(fl, -fw / 2, -F.lineHeight(SMALL, 0.5) * lines.length / 2 - fh - 4, fw, fh); }
    ctx.restore();
  }

  function enter(game, res) {
    if (!LEVELS[game.name]) { S = null; return; }
    var lines = game.data.scene.layers.filter(function (l) { return /^linetext_/.test(l.id); });
    S = { game: game, res: res, state: 'disconnected', stateAt: 0, t: 0, clouds: [], rank: null, h: 0, n: 0, att: 0, cx: 0,
          lines: lines, lastUp: -1e9, lastH: -1e9, lastPoll: -1e9, tMeasure: 0, imgTried: {}, upBusy: false, pollBusy: false,
          me: { id: 'local_player_cloud', x: 0, y: 0, h: 0, a: 0, sp: 0.03, amp: 20, ph: 0, img: 'IMAGE_GLOBAL_CLOUD1', flag: flagFor(res, country()), name: '', first: true } };
    var layer = { cloudLayer: true, depth: DEPTH }, d = game.drawables, i = 0;
    while (i < d.length && d[i].depth <= DEPTH) i++;
    d.splice(i, 0, layer);
    applyUi();
    if (ls(LS.on) === '1' && ls(LS.key)) connect();
  }
  function leave() { if (S) { sendFinal(); S = null; } }

  function update(game, dt) {
    var sd = S; if (!sd || sd.game !== game) return;
    sd.t += dt;
    if ((sd.tMeasure -= dt) <= 0) { sd.tMeasure = 0.25; measure(); }
    if (sd.state === 'connectfail' && sd.t - sd.stateAt > 4) setState('disconnected');
    if (sd.state === 'connected') {
      if (sd.t - sd.lastUp >= UPLOAD_EVERY && Math.abs(sd.h - sd.lastH) >= HEIGHT_STEP) upload();
      if (sd.t - sd.lastPoll >= POLL_EVERY) poll();
    }
    var k = Math.min(1, dt * 2);
    sd.clouds.forEach(function (c) { c.y += (c.h - c.y) * k; c.a += ((c.gone ? 0 : 1) - c.a) * Math.min(1, dt * 1.5); });
    sd.clouds = sd.clouds.filter(function (c) { return !(c.gone && c.a < 0.02); });
    var m = sd.me; m.name = playerName(); m.h = sd.h; m.x = sd.cx; m.y += (sd.h - m.y) * k;
    m.a += ((sd.state === 'connected' && sd.att > 0 ? 1 : 0) - m.a) * Math.min(1, dt * 2);
  }

  function draw(ctx, res, camera, W, H, ps, game, mouse) {
    var sd = S; if (!sd || sd.game !== game) return;
    var f = camera.depthFactor(DEPTH); if (!f) return;
    sd.clouds.forEach(function (c) { drawOne(ctx, sd, camera, ps, f, c, mouse, false); });
    if (sd.me.a > 0.02) drawOne(ctx, sd, camera, ps, f, sd.me, mouse, true);
  }

  function drawHud(ctx, ps, game) {
    var sd = S; if (!sd || sd.game !== game || !game.data.scene.labels) return;
    var F = WOG.font; if (!F) return;
    ctx.save(); ctx.setTransform(ps, 0, 0, ps, 0, 0);
    game.data.scene.labels.forEach(function (l) {
      if (l.x >= 800) return;                       
      var text = '', connected = sd.state === 'connected';
      if (l.id === 'metershigh') text = T('LABEL_METERS_HIGH', 'meters high');
      else if (l.id === 'height') text = fmt(T('LABEL_X', 'X'), (sd.h / 100).toFixed(1));
      else if (l.id === 'ballsused') text = fmt(T('LABEL_USING_X_OF_Y', 'using X of Y balls'), sd.att, sd.n);
      else if (l.id === 'rank') { if (connected && sd.rank) text = sd.rank === 1 ? T('LABEL_TALLEST_IN_THE_WORLD', 'tallest in the world') : '#' + sd.rank + ' in the world'; }
      else if (l.id === 'name') { if (connected) text = fmt(T('LABEL_X', 'X'), playerName()); }
      else return;
      var font = FONTS[l.font] || l.font; if (!text || !F.get(font)) return;
      var sc = l.scale * (FONT_SCALE[l.font] || 1), lines = F.lines(text), lh = lines.length * F.lineHeight(font, sc);
      ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rotation);
      F.draw(ctx, font, lines, 0, -lh / 2, { align: l.align, scale: sc });
      ctx.restore();
    });
    ctx.restore();
  }

  WOG.cloud = {
    enter: enter, leave: leave, update: update, draw: draw, drawHud: drawHud, connect: connect, disconnect: disconnect,
    state: function () { return S ? S.state : 'off'; },
    setServer: function (u) { ls(LS.server, u || null); }, setName: function (n) { ls(LS.name, String(n || '').slice(0, 24)); }
  };
  if (WOG.map && WOG.map.handlers) {
    WOG.map.handlers.doconnect = function () { connect(); };
    if (!WOG.map.handlers.zoomout) WOG.map.handlers.zoomout = function () { WOG.go(WOG.returnTo || 'MapWorldView'); };
  }
  window.addEventListener('pagehide', sendFinal);
})();
