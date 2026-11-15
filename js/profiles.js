// j
(function () {
  var N = 3, META_KEY = 'wog.profiles.v1', MAX_NAME = 20;
  var K = WOG.PROFILES = {
    title: { x: 400, y: 58, scale: 1 },
    rowY: [185, 320, 455], slotX: 372, slotMaxW: 540, slotMaxH: 112,
    nameX: -0.44, nameY: -0.2, nameScale: 1.2,
    ballsY: 0.12, timeY: 0.34, statScale: 0.55,
    iconH: 30, iconGap: 6, iconRight: 0.44, iconY: 0,
    delGap: 14, delMaxH: 56
  };
  var FALLBACK = { FONT_BIGWHITE_52: 'wogBig', FONT_OUTLINE_18: 'TwCenMTCondensedExtraBold18', FONT_SIGNPOST: 'TwCenMTCondensedExtraBold18' };
  var IMG = {
    slot: ['IMAGE_GLOBAL_PROFILE_BUTTON_UP', 'IMAGE_GLOBAL_PROFILE_BUTTON_OVER'],
    empty: ['IMAGE_GLOBAL_PROFILE_BUTTON_EMPTY_UP', 'IMAGE_GLOBAL_PROFILE_BUTTON_EMPTY_OVER'],
    del: ['IMAGE_GLOBAL_PROFILE_DELETE_BUTTON_UP', 'IMAGE_GLOBAL_PROFILE_DELETE_BUTTON_OVER'],
    ok: ['IMAGE_GLOBAL_PLAYERNAMEOK_UP', 'IMAGE_GLOBAL_PLAYERNAMEOK_OVER'],
    cancel: ['IMAGE_GLOBAL_CANCEL_UP', 'IMAGE_GLOBAL_CANCEL_OVER']
  };

  var meta = null, ui = null, flushT = 0, fonts = {};
  function SV() { return WOG.save; }
  function txt(key, fb) { return WOG.text && WOG.text.has && WOG.text.has(key) ? WOG.text.get(key) : fb; }
  function sub(s, v) {
    var done = false;
    s = String(s).replace(/%s|%d|%i|\{0\}|\$1|\bX\b/, function () { done = true; return v; });
    return done ? s : s + ' ' + v;
  }
  function defName(n) { return sub(txt('GOO_SLOT_TEXT', 'Goo Slot'), n + 1); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock(t) { t = Math.floor(t); return pad2(Math.floor(t / 3600)) + ':' + pad2(Math.floor(t / 60) % 60) + ':' + pad2(t % 60); }

  // daata
  function loadMeta() {
    var m = null;
    try { var raw = SV().rawGet(META_KEY); m = raw ? JSON.parse(raw) : null; } catch (e) { m = null; }
    if (!m || !Array.isArray(m.slots)) m = { cur: 0, slots: [{ name: defName(0), time: 0 }] };
    var slots = [];
    for (var i = 0; i < N; i++) {
      var s = m.slots[i];
      slots.push(s && typeof s.name === 'string' ? { name: s.name.slice(0, MAX_NAME), time: +s.time > 0 ? +s.time : 0 } : null);
    }
    var cur = m.cur | 0;
    if (!(cur >= 0 && cur < N && slots[cur])) {
      cur = slots.findIndex(function (x) { return !!x; });
      if (cur < 0) { slots[0] = { name: defName(0), time: 0 }; cur = 0; }
    }
    return { v: 1, cur: cur, slots: slots };
  }
  function saveMeta() { try { SV().rawSet(META_KEY, JSON.stringify(meta)); } catch (e) {} }

  function stats(n) {
    var sl = meta.slots[n]; if (!sl) return null;
    var d = SV().peek(n), balls = 0, islands = [];
    Object.keys(d.extras || {}).forEach(function (k) { balls += d.extras[k] | 0; });
    for (var i = 1; i <= 5; i++) {
      var isl = WOG.islands && WOG.islands['island' + i];
      var open = isl && isl.levels.length ? isl.levels.some(function (l) { return l.depends.every(function (x) { return !!d.completed[x]; }); }) : i === 1;
      if (open) islands.push(i);
    }
    return { name: sl.name, time: sl.time, balls: balls, islands: islands };
  }

  function select(n) {
    if (!meta.slots[n]) return;
    meta.cur = n; saveMeta();
    SV().useSlot(n);
    if (WOG.refreshMap) WOG.refreshMap();
  }
  function create(n, name) {
    SV().wipeSlot(n);
    meta.slots[n] = { name: name, time: 0 };
    select(n);
  }
  function remove(n) {
    SV().wipeSlot(n);
    meta.slots[n] = null;
    if (meta.cur === n) {
      var f = meta.slots.findIndex(function (x) { return !!x; });
      if (f < 0) { meta.slots[n] = { name: defName(n), time: 0 }; f = n; }
      select(f);
    }
    saveMeta();
  }

  function F() { return WOG.font; }
  function font(id) { return fonts[id]; }
  async function resolveFont(res, id) {
    var d = res.defs[id], list = [];
    if (d && d.type === 'font') list.push(d.path.split('/').pop());
    list.push(FALLBACK[id] || 'TwCenMTCondensedExtraBold18');
    for (var i = 0; i < list.length; i++) {
      try { if (!(F().get(list[i]))) await F().load(list[i]); } catch (e) {}
      if (F().get(list[i])) { fonts[id] = list[i]; return; }
    }
    fonts[id] = null;
  }
  function text(ctx, id, str, x, y, scale, align, maxW) {
    var name = font(id), f = F();
    if (!name || !f || !f.get(name)) {
      ctx.save(); ctx.font = Math.round(26 * scale) + 'px sans-serif'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'; ctx.fillText(String(str).replace(/\|/g, ' '), x, y); ctx.restore(); return;
    }
    var lines = f.lines(String(str));
    if (maxW) { var w = 0; lines.forEach(function (l) { w = Math.max(w, f.width(name, l, scale)); }); if (w > maxW) scale *= maxW / w; }
    var h = lines.length * f.lineHeight(name, scale);
    f.draw(ctx, name, lines, x, y - h / 2, { align: align || 'center', scale: scale });
  }
  function inRect(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function addRect(r, id, slot) { r.id = id; r.slot = slot; ui.rects.push(r); return r; }

  function imgButton(ctx, res, pair, cx, cy, maxW, maxH, mx, my, id, slot, label) {
    var up = res.image(pair[0]), ov = res.image(pair[1]);
    var w = up ? up.width : maxW, h = up ? up.height : maxH, sc = Math.min(1, maxW / w, maxH / h);
    var r = addRect({ x: cx - w * sc / 2, y: cy - h * sc / 2, w: w * sc, h: h * sc, sc: sc }, id, slot), hov = inRect(r, mx, my);
    if (up) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.drawImage(up, -w / 2, -h / 2);
      if (hov && ov) ctx.drawImage(ov, -ov.width / 2, -ov.height / 2);
      ctx.restore();
    } else {
      ctx.fillStyle = hov ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (label) text(ctx, 'FONT_OUTLINE_18', label, cx, cy, 0.8, 'center', r.w * 0.8);
    r.hover = hov;
    return r;
  }

  function drawList(ctx, res, mx, my) {
    text(ctx, 'FONT_BIGWHITE_52', txt('PROFILE_SELECTION_LABEL', 'Select Profile'), K.title.x, K.title.y, K.title.scale, 'center', 700);
    var tip = null;
    for (var n = 0; n < N; n++) {
      var st = ui.stats[n], cy = K.rowY[n], cx = K.slotX;
      var r = imgButton(ctx, res, st ? IMG.slot : IMG.empty, cx, cy, K.slotMaxW, K.slotMaxH, mx, my, 'slot', n);
      var W = r.w, H = r.h;
      if (st) {
        if (n === meta.cur) { ctx.save(); ctx.strokeStyle = 'rgba(255,230,90,0.9)'; ctx.lineWidth = 3; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); ctx.restore(); }
        text(ctx, 'FONT_OUTLINE_18', st.name, cx + K.nameX * W, cy + K.nameY * H, K.nameScale, 'left', W * 0.55);
        text(ctx, 'FONT_OUTLINE_18', sub(txt('BALL_COUNT_TEXT', 'Balls:'), st.balls), cx + K.nameX * W, cy + K.ballsY * H, K.statScale, 'left', W * 0.5);
        text(ctx, 'FONT_OUTLINE_18', sub(txt('TIME_PLAYED_TEXT', 'Time:'), clock(st.time)), cx + K.nameX * W, cy + K.timeY * H, K.statScale, 'left', W * 0.5);
        var x = cx + K.iconRight * W;
        for (var k = st.islands.length - 1; k >= 0; k--) {
          var ic = res.image('IMAGE_GLOBAL_ISLAND_' + st.islands[k] + '_ICON');
          if (!ic) continue;
          var s2 = K.iconH / ic.height, w2 = ic.width * s2;
          ctx.drawImage(ic, x - w2, cy + K.iconY - K.iconH / 2, w2, K.iconH); x -= w2 + K.iconGap;
        }
        var d = imgButton(ctx, res, IMG.del, cx + W / 2 + K.delGap + 24, cy, 80, K.delMaxH, mx, my, 'del', n);
        if (d.hover) tip = { text: txt('TOOLTIP_DELETE_PROFILE', 'Delete profile'), x: mx, y: my };
      } else if (!res.image(IMG.empty[0])) {
        text(ctx, 'FONT_OUTLINE_18', txt('NEW_PROFILE_TEXT', 'New Profile'), cx, cy, 1, 'center', W * 0.8);
      } else {
        text(ctx, 'FONT_OUTLINE_18', txt('NEW_PROFILE_TEXT', 'New Profile'), cx, cy, 1.1, 'center', W * 0.7);
      }
    }
    if (tip) {
      var f = F(), nm = font('FONT_OUTLINE_18'), w = f && nm && f.get(nm) ? f.width(nm, tip.text, 0.6) : 160;
      var bx = Math.min(790 - w - 12, tip.x + 14), by = tip.y + 18;
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(bx, by, w + 12, 26);
      text(ctx, 'FONT_OUTLINE_18', tip.text, bx + 6, by + 13, 0.6, 'left');
    }
  }

  function drawNew(ctx, res, mx, my, time) {
    text(ctx, 'FONT_BIGWHITE_52', txt('NEW_PROFILE_TEXT', 'New Profile'), 400, 130, 0.9, 'center', 700);
    var box = { x: 190, y: 220, w: 420, h: 62 };
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(box.x, box.y, box.w, box.h);
    var shown = ui.text;
    if (shown) text(ctx, 'FONT_SIGNPOST', shown, 400, box.y + box.h / 2, 1, 'center', box.w - 30);
    else { ctx.save(); ctx.globalAlpha = 0.4; text(ctx, 'FONT_SIGNPOST', defName(ui.slot), 400, box.y + box.h / 2, 1, 'center', box.w - 30); ctx.restore(); }
    if (Math.floor(time * 2) % 2 === 0) {
      var f = F(), nm = font('FONT_SIGNPOST'), w = shown && f && nm && f.get(nm) ? Math.min(f.width(nm, shown, 1), box.w - 30) : 0;
      ctx.fillStyle = '#fff'; ctx.fillRect(400 + w / 2 + 3, box.y + 12, 3, box.h - 24);
    }
    imgButton(ctx, res, IMG.cancel, 300, 360, 170, 70, mx, my, 'cancel', ui.slot, txt('CANCEL_BUTTON_TEXT', 'Cancel'));
    imgButton(ctx, res, IMG.ok, 500, 360, 170, 70, mx, my, 'ok', ui.slot, txt('OK_BUTTON_TEXT', 'OK'));
  }

  function drawConfirm(ctx, res, mx, my) {
    var st = ui.stats[ui.slot];
    text(ctx, 'FONT_BIGWHITE_52', txt('ARE_YOU_SURE', 'Are you sure?'), 400, 170, 0.9, 'center', 700);
    if (st) text(ctx, 'FONT_OUTLINE_18', st.name, 400, 245, 1.1, 'center', 500);
    imgButton(ctx, res, IMG.cancel, 300, 340, 170, 70, mx, my, 'no', ui.slot, txt('CANCEL_BUTTON_TEXT', 'Cancel'));
    imgButton(ctx, res, IMG.ok, 500, 340, 170, 70, mx, my, 'yes', ui.slot, txt('OK_BUTTON_TEXT', 'OK'));
  }

  function refreshStats() { ui.stats = []; for (var n = 0; n < N; n++) ui.stats.push(stats(n)); }
  function cheer(res) {
    try { var id = 'SOUND_GLOBAL_CHEER'; if (res && res.has(id)) Promise.resolve(res.loadSounds([id])).then(function () { res.playSound([id]); }); } catch (e) {}
  }
  function commit(res) {
    var name = ui.text.replace(/[<>\u0000-\u001f]/g, '').trim() || defName(ui.slot);
    create(ui.slot, name.slice(0, MAX_NAME)); cheer(res);
    ui.mode = 'list'; refreshStats();
    if (WOG.closeProfiles) WOG.closeProfiles();
  }

  var P = WOG.profiles = {
    isOpen: function () { return !!ui; },
    current: function () { return meta.cur; },
    name: function () { return meta.slots[meta.cur].name; },
    select: select,

    show: async function (res) {
      var ids = [];
      Object.keys(IMG).forEach(function (k) { ids = ids.concat(IMG[k]); });
      for (var i = 1; i <= 5; i++) ids.push('IMAGE_GLOBAL_ISLAND_' + i + '_ICON');
      ids = ids.filter(function (id) { return res.has(id); });
      await Promise.all([res.loadImages(ids)].concat(['FONT_BIGWHITE_52', 'FONT_OUTLINE_18', 'FONT_SIGNPOST'].map(function (id) { return resolveFont(res, id); })));
      ui = { mode: 'list', slot: 0, text: '', rects: [], stats: [], res: res, t: 0 };
      refreshStats();
    },
    hide: function () { ui = null; saveMeta(); },

    draw: function (ctx, res, ps, mx, my, time) {
      if (!ui) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(ps, 0, 0, ps, 0, 0);
      ui.rects = [];
      if (ui.mode === 'list') drawList(ctx, res, mx, my);
      else if (ui.mode === 'new') drawNew(ctx, res, mx, my, time || 0);
      else drawConfirm(ctx, res, mx, my);
      ctx.restore();
    },

    click: function (mx, my) {
      if (!ui) return;
      var hit = null;
      for (var i = ui.rects.length - 1; i >= 0; i--) if (inRect(ui.rects[i], mx, my)) { hit = ui.rects[i]; break; }
      if (ui.mode === 'list') {
        if (!hit) { if (WOG.closeProfiles) WOG.closeProfiles(); return; }
        if (hit.id === 'del') { ui.mode = 'confirm'; ui.slot = hit.slot; }
        else if (meta.slots[hit.slot]) { if (hit.slot !== meta.cur) { select(hit.slot); refreshStats(); } if (WOG.closeProfiles) WOG.closeProfiles(); }
        else { ui.mode = 'new'; ui.slot = hit.slot; ui.text = ''; }
      } else if (ui.mode === 'new') {
        if (hit && hit.id === 'ok') commit(ui.res); else if (hit && hit.id === 'cancel') ui.mode = 'list';
      } else if (hit) {
        if (hit.id === 'yes') { remove(ui.slot); refreshStats(); }
        ui.mode = 'list';
      }
    },

    key: function (e) {
      if (!ui) return false;
      if (ui.mode === 'list') { if (e.key === 'Escape') { if (WOG.closeProfiles) WOG.closeProfiles(); return true; } return false; }
      if (ui.mode === 'confirm') {
        if (e.key === 'Escape') { ui.mode = 'list'; return true; }
        if (e.key === 'Enter') { remove(ui.slot); refreshStats(); ui.mode = 'list'; return true; }
        return false;
      }
      if (e.key === 'Escape') { ui.mode = 'list'; return true; }
      if (e.key === 'Enter') { commit(ui.res); return true; }
      if (e.key === 'Backspace') { ui.text = ui.text.slice(0, -1); return true; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { if (ui.text.length < MAX_NAME) ui.text += e.key; return true; }
      return false;
    },

    tick: function (dt) {
      var sl = meta.slots[meta.cur]; if (!sl || !(dt > 0)) return;
      sl.time += dt; flushT += dt;
      if (flushT > 10) { flushT = 0; saveMeta(); }
    }
  };

  meta = loadMeta();
  if (meta.cur !== 0) SV().useSlot(meta.cur);
  window.addEventListener('pagehide', saveMeta);
})();
