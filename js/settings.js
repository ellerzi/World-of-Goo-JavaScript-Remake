// settings because i needed to replace the quit button and thought of this
(function () {
  var KEY = 'wog.settings.v1'
  var CATS = [
    { id: 'general', label: 'General' },
    { id: 'display', label: 'Display' },
    { id: 'audio',   label: 'Audio' },
    { id: 'cursor',  label: 'Cursor' },
    { id: 'debug',   label: 'Debug' }
  ]

  var DEFS = [
    { id: 'resetSave', cat: 'general', type: 'action', label: 'Reset everything',
      hint: 'wipes all progress and settings completely out' },
    { id: 'fullscreen', cat: 'general', type: 'fullscreen', def: false, label: 'Fullscreen',
      hint: 'jumps right back into fullscreen mode when you click next' },

    { id: 'edgeScroll', cat: 'display', type: 'toggle', def: true, label: 'Edge scrolling',
      hint: 'pans the camera around when your mouse hits the window edge' },
    { id: 'edgeSpeed', cat: 'display', type: 'slider', def: 600, min: 100, max: 1200, step: 50, unit: '', label: 'Edge scroll speed',
      hint: 'how fast the view pans when you are all the way at the edge' },
    { id: 'particles', cat: 'display', type: 'toggle', def: true, label: 'Particles',
      hint: 'turns off fancy particles to help keep older machines running smooth' },
    { id: 'buttonGrow', cat: 'display', type: 'toggle', def: true, label: 'Button grow',
      hint: 'makes menu buttons scale up a bit when your mouse hovers over them' },
    { id: 'fpsCounter', cat: 'display', type: 'toggle', def: false, label: 'FPS counter',
      hint: 'displays the current frame rate up in the corner' },

    { id: 'musicVolume', cat: 'audio', type: 'slider', def: 100, min: 0, max: 100, step: 5, unit: '%', label: 'Music volume',
      hint: 'how loud the background tracks play' },
    { id: 'sfxVolume', cat: 'audio', type: 'slider', def: 100, min: 0, max: 100, step: 5, unit: '%', label: 'Sound effects volume',
      hint: 'volume for goo splats and level sounds' },

    { id: 'mouseCursor', cat: 'cursor', type: 'toggle', def: false, label: 'Standard mouse pointer',
      hint: 'uses a regular system cursor instead of the custom game circle' },
    { id: 'cursorSize', cat: 'cursor', type: 'slider', def: 100, min: 50, max: 200, step: 10, unit: '%', label: 'Pointer size',
      hint: 'how big the cursor graphic looks on screen' },
    { id: 'pointerAnchor', cat: 'cursor', type: 'choice', def: 'topleft', label: 'Pointer position',
      hint: 'picks which part of the cursor image acts as the exact click spot',
      opts: [{ v: 'topleft', label: 'TIP' }, { v: 'center', label: 'CENTER' }] },
    { id: 'trailFollow', cat: 'cursor', type: 'slider', def: 35, min: 0, max: 100, step: 5, unit: '%', label: 'Trail follow speed',
      hint: 'how fast the particle trail catches up to your movement' },

    { id: 'debugInputs', cat: 'debug', type: 'toggle', def: true, label: 'Debug inputs',
      hint: 'hotkeys for quick navigation and testing stuff out' },
    { id: 'unlockAll', cat: 'debug', type: 'toggle', def: false, label: 'Unlock all levels',
      hint: 'forces every level on the map screen to open up right away' },
    { id: 'tunePanel', cat: 'debug', type: 'toggle', def: false, label: 'Physics tuning panel',
      hint: 'tweak game physics' },
    { id: 'resetAll', cat: 'debug', type: 'action', label: 'Reset settings',
      hint: 'reset all settings' }
  ]

  var values = {}
  DEFS.forEach(function (d) { if (d.type !== 'action') values[d.id] = d.def })

  function readStored() {
    var raw = null
    try { raw = window.localStorage.getItem(KEY) } catch (e) {}
    if (raw == null) { var m = new RegExp('(?:^|; )' + KEY.replace(/\./g, '\\.') + '=([^;]*)').exec(document.cookie || ''); if (m) raw = decodeURIComponent(m[1]) }
    try { return raw ? JSON.parse(raw) : null } catch (e) { return null }
  }
  function writeStored() {
    var json = JSON.stringify(values), ok = false
    try { window.localStorage.setItem(KEY, json); ok = true } catch (e) {}
    if (!ok) { try { document.cookie = KEY + '=' + encodeURIComponent(json) + '; max-age=31536000; path=/; SameSite=Lax' } catch (e) {} }
  }

  var S = WOG.settings = {
    defs: DEFS,
    cats: CATS,
    get: function (id) { return values[id] },
    set: function (id, v) { if (values[id] === v) return; values[id] = v; writeStored() },
    toggle: function (id) { S.set(id, !values[id]) },
    load: function () {
      var s = readStored()
      if (s) DEFS.forEach(function (d) { if (d.type !== 'action' && typeof s[d.id] === typeof d.def) values[d.id] = s[d.id] })
    },
    reset: function () {
      DEFS.forEach(function (d) { if (d.type !== 'action') values[d.id] = d.def })
      writeStored()
      S.setFullscreen(false)
    },
    resetAllData: function () {
      S.reset()
      if (WOG.save) WOG.save.reset()
      try { window.localStorage.removeItem(KEY) } catch (e) {}
      try { document.cookie = KEY + '=; max-age=0; path=/; SameSite=Lax' } catch (e) {}
    },
    apply: function () {
      var v = values
      if (WOG.CAMERA) WOG.CAMERA.edgeSpeed = v.edgeSpeed
      if (WOG.BTN) WOG.BTN.grow = v.buttonGrow ? 0.06 : 0
      WOG.sfxVolume = v.sfxVolume / 100
      if (WOG.music && WOG.music.setVolume && Math.abs(WOG.music.volume - v.musicVolume / 100) > 1e-6) WOG.music.setVolume(v.musicVolume / 100)
      if (WOG.cursor) {
        WOG.cursor.mouseScale = 0.7 * v.cursorSize / 100
        WOG.cursor.mouseAnchor = v.pointerAnchor
        WOG.cursor.follow = v.trailFollow / 100
      }
    },
    isFullscreen: function () { return !!(document.fullscreenElement || document.webkitFullscreenElement) },
    setFullscreen: function (on) {
      var el = document.documentElement
      try {
        if (on && !S.isFullscreen()) { var p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (p && p.catch) p.catch(function () {}) }
        else if (!on && S.isFullscreen()) { var q = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (q && q.catch) q.catch(function () {}) }
      } catch (e) { console.warn('fullscreen:', e.message) }
    }
  }
  S.load()
  function fsChanged() { S.set('fullscreen', S.isFullscreen()) }
  document.addEventListener('fullscreenchange', fsChanged)
  document.addEventListener('webkitfullscreenchange', fsChanged)

  var BIG = 'wogBig', SMALL = 'TwCenMTCondensedExtraBold18'
  var ROW_X = 130, ROW_W = 540, ROW_H = 52, ROW_GAP = 6, ROW_Y0 = 170, BACK_Y = 505, BACK_W = 200
  var BAR_X = 290, BAR_W = 150
  var dragRow = null, armedAt = 0, armedId = null
  var TAB_Y = 105, TAB_H = 38, TAB_GAP = 10, TAB_MAX_W = 150
  var curCat = CATS[0].id

  function catOf(d) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === d.cat) return d.cat; return CATS[0].id }
  function tabs() {
    var w = Math.min(TAB_MAX_W, (ROW_W - (CATS.length - 1) * TAB_GAP) / CATS.length)
    var total = CATS.length * w + (CATS.length - 1) * TAB_GAP, x0 = 400 - total / 2
    return CATS.map(function (c, i) { return { x: x0 + i * (w + TAB_GAP), y: TAB_Y, w: w, h: TAB_H, cat: c.id, label: c.label } })
  }
  function rows() {
    var out = DEFS.filter(function (d) { return catOf(d) === curCat })
      .map(function (d, i) { return { x: ROW_X, y: ROW_Y0 + i * (ROW_H + ROW_GAP), w: ROW_W, h: ROW_H, def: d } })
    out.push({ x: 400 - BACK_W / 2, y: BACK_Y, w: BACK_W, h: 44, def: null })
    return out
  }
  function valueText(d) {
    if (d.type === 'fullscreen') return S.isFullscreen() ? 'ON' : 'OFF'
    if (d.type === 'slider') return values[d.id] + d.unit
    if (d.type === 'choice') { for (var i = 0; i < d.opts.length; i++) if (d.opts[i].v === values[d.id]) return d.opts[i].label; return '?' }
    if (d.type === 'action') return armedId === d.id && Date.now() - armedAt < 3000 ? 'CLICK AGAIN' : (d.id === 'resetSave' ? 'DELETE' : 'RESET')
    return values[d.id] ? 'ON' : 'OFF'
  }

  function setSliderFromX(r, x) {
    var d = r.def, t = Math.max(0, Math.min(1, (x - (r.x + BAR_X)) / BAR_W))
    S.set(d.id, Math.round((d.min + t * (d.max - d.min)) / d.step) * d.step)
  }

  WOG.settingsUI = {
    drag: function (x, y, down) {
      if (!down) { dragRow = null; return }
      if (dragRow) setSliderFromX(dragRow, x)
    },
    rowAt: function (x, y) {
      var r = rows()
      for (var i = 0; i < r.length; i++) if (x >= r[i].x && x <= r[i].x + r[i].w && y >= r[i].y && y <= r[i].y + r[i].h) return r[i]
      return null
    },
    tabAt: function (x, y) {
      var t = tabs()
      for (var i = 0; i < t.length; i++) if (x >= t[i].x && x <= t[i].x + t[i].w && y >= t[i].y && y <= t[i].y + t[i].h) return t[i]
      return null
    },
    click: function (x, y) {
      var tab = WOG.settingsUI.tabAt(x, y)
      if (tab) { curCat = tab.cat; return null }
      var r = WOG.settingsUI.rowAt(x, y)
      if (!r) return null
      if (!r.def) return 'back'
      var d = r.def
      if (d.type === 'fullscreen') S.setFullscreen(!S.isFullscreen())
      else if (d.type === 'slider') { if (x >= r.x + BAR_X - 8 && x <= r.x + BAR_X + BAR_W + 8) { dragRow = r; setSliderFromX(r, x) } }
      else if (d.type === 'choice') {
        var i = 0; while (i < d.opts.length && d.opts[i].v !== values[d.id]) i++
        S.set(d.id, d.opts[(i + 1) % d.opts.length].v)
      } else if (d.type === 'action') {
        if (armedId === d.id && Date.now() - armedAt < 3000) { if (d.id === 'resetSave') S.resetAllData(); else S.reset(); armedAt = 0; armedId = null } else { armedAt = Date.now(); armedId = d.id }
      } else S.toggle(d.id)
      return null
    },
    draw: function (ctx, mx, my) {
      var F = WOG.font
      ctx.fillStyle = '#0d0d14'; ctx.fillRect(0, 0, 800, 600)
      var hot = WOG.settingsUI.rowAt(mx, my)
      var haveFont = F && F.get(SMALL) && F.get(BIG)
      ctx.textBaseline = 'middle'
      if (haveFont) F.draw(ctx, BIG, 'Settings', 400, 55, { align: 'center', scale: 0.5 })
      else { ctx.fillStyle = '#fff'; ctx.font = '36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Settings', 400, 85) }
      var hotTab = WOG.settingsUI.tabAt(mx, my)
      tabs().forEach(function (t) {
        var open = t.cat === curCat, over = t === hotTab
        ctx.fillStyle = open ? 'rgba(255,255,255,0.20)' : over ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'
        ctx.fillRect(t.x, t.y, t.w, t.h)
        ctx.strokeStyle = open ? 'rgba(255,226,122,0.9)' : over ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.strokeRect(t.x, t.y, t.w, t.h)
        var tc = open ? '#ffe27a' : over ? '#ffffff' : '#cccccc'
        if (haveFont) F.draw(ctx, SMALL, t.label, t.x + t.w / 2, t.y + (t.h - F.lineHeight(SMALL, 1)) / 2, { align: 'center', color: tc })
        else { ctx.fillStyle = tc; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2) }
      })
      rows().forEach(function (r) {
        var on = r === hot
        ctx.fillStyle = on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
        ctx.fillRect(r.x, r.y, r.w, r.h)
        ctx.strokeStyle = on ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h)
        var d = r.def, label = d ? d.label : 'Back', val = d ? valueText(d) : null
        var color = on ? '#ffe27a' : null
        if (haveFont) {
          if (d) {
            F.draw(ctx, SMALL, label, r.x + 18, r.y + 8, { color: color })
            F.draw(ctx, SMALL, d.hint, r.x + 18, r.y + 8 + F.lineHeight(SMALL, 1) + 1, { scale: 0.62, color: '#aaaaaa' })
            var vcol = val === 'ON' ? '#8dff8d' : val === 'OFF' ? '#ff9a9a' : val === 'RESET' || val === 'CLICK AGAIN' ? '#ffb070' : '#ffffff'
            F.draw(ctx, SMALL, val, r.x + r.w - 18, r.y + (r.h - F.lineHeight(SMALL, 1)) / 2, { align: 'right', color: vcol })
          } else F.draw(ctx, SMALL, label, r.x + r.w / 2, r.y + (r.h - F.lineHeight(SMALL, 1)) / 2, { align: 'center', color: color })
          if (d && d.type === 'slider') {
            var bx = r.x + BAR_X, by = r.y + r.h / 2, t = (values[d.id] - d.min) / (d.max - d.min)
            ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx, by - 2, BAR_W, 4)
            ctx.fillStyle = on || dragRow === r ? '#ffe27a' : '#cfcfcf'; ctx.fillRect(bx, by - 2, BAR_W * t, 4); ctx.fillRect(bx + BAR_W * t - 4, by - 9, 8, 18)
          }
        } else {
          ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.textAlign = d ? 'left' : 'center'
          ctx.fillText(label, d ? r.x + 18 : r.x + r.w / 2, r.y + r.h / 2)
          if (val) { ctx.textAlign = 'right'; ctx.fillText(val, r.x + r.w - 18, r.y + r.h / 2) }
        }
      })
      ctx.textAlign = 'left'
    }
  }
})()