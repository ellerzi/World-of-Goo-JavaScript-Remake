(function () {
  var KEY = 'wog_tune_v1';
  var T = WOG.tune = { defaults: null, panel: null, open: false };

  var GROUPS = [
    ['Strands / towers', ['springScale', 'dampScale', 'maxForceScale', 'towerMassScale', 'restRate', 'dampMax', 'correction', 'useTowerMass']],
    ['Time / gravity', ['timeScale', 'gravityScale', 'subStep']],
    ['Free balls', ['walkSpeedScale', 'jumpRange', 'jumpMaxSpeed', 'jumpCooldown', 'grabBlendTime', 'grabDist', 'climbSpeedScale', 'aiNear', 'aiTowardChance', 'defaultWakeDist', 'wakeByAttached']],
    ['Drag / throw / thwack', ['throwMaxSpeed', 'dragRadiusExtra', 'detachNudge', 'minTargetAngle', 'bridgeSegDist', 'dragTorque', 'pickSlack', 'thwackMinSpeed', 'hitMinSpeed', 'thwackKick', 'thwackMaxKick', 'thwackBounce', 'pinBounce', 'landMinSpeed', 'hitSoundGap']],
    ['Bouncing', ['freeBounce', 'freeBounceMinVel', 'ballBounce', 'ballBounceMinVel']]
  ];

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function changed() {
    var o = {}, P = WOG.PHYS;
    Object.keys(T.defaults).forEach(function (k) { if (P[k] !== T.defaults[k]) o[k] = P[k]; });
    return o;
  }

  function init() {
    var P = WOG.PHYS;
    T.defaults = {};
    Object.keys(P).forEach(function (k) { if (typeof P[k] === 'number' || typeof P[k] === 'boolean') T.defaults[k] = P[k]; });
    var saved = load();
    Object.keys(saved).forEach(function (k) { if (k in T.defaults && typeof saved[k] === typeof T.defaults[k]) P[k] = saved[k]; });
  }

  function fmt(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''); }

  function build() {
    var P = WOG.PHYS, root = document.createElement('div');
    root.id = 'wog-tune';
    root.style.cssText = 'position:fixed;top:8px;right:8px;width:320px;max-height:92vh;overflow:auto;z-index:99999;background:rgba(20,22,28,.94);color:#e8e8e8;' +
      'font:12px/1.3 system-ui,sans-serif;border:1px solid #555;border-radius:6px;padding:8px;display:none;user-select:none';
    ['mousedown', 'mouseup', 'mousemove', 'pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'wheel', 'keydown', 'keyup', 'click', 'contextmenu'].forEach(function (ev) {
      root.addEventListener(ev, function (e) { e.stopPropagation(); }, ev === 'wheel' || ev === 'touchstart' ? { passive: true } : false);
    });
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>Physics tuning</b>' +
      '<span><button data-a="copy">Copy values</button> <button data-a="reset">Reset all</button></span></div>' +
      '<label><input type="checkbox" data-k="enabled"> physics on</label>' +
      '<pre id="wog-tune-read" style="margin:6px 0;padding:4px;background:#111;border-radius:4px;white-space:pre-wrap;font:11px/1.3 monospace"></pre>';
    var used = {};
    function row(k) {
      used[k] = 1;
      var v = T.defaults[k], isBool = typeof v === 'boolean';
      if (isBool) return '<label style="display:block;margin:2px 0"><input type="checkbox" data-k="' + k + '"> ' + k + '</label>';
      var max = v === 0 ? 1 : Math.abs(v) * 4;
      return '<div style="margin:3px 0"><div style="display:flex;justify-content:space-between"><span data-n="' + k + '">' + k + '</span>' +
        '<span><input data-v="' + k + '" type="number" step="any" style="width:72px;background:#222;color:#eee;border:1px solid #555"> <button data-r="' + k + '" title="reset">x</button></span></div>' +
        '<input data-k="' + k + '" type="range" min="0" max="' + max + '" step="' + (max / 400) + '" style="width:100%"></div>';
    }
    GROUPS.forEach(function (g) {
      var rows = g[1].filter(function (k) { return k in T.defaults; }).map(row).join('');
      if (rows) html += '<details open><summary style="cursor:pointer;margin-top:6px"><b>' + g[0] + '</b></summary>' + rows + '</details>';
    });
    var rest = Object.keys(T.defaults).filter(function (k) { return !used[k] && k !== 'enabled'; }).map(row).join('');
    if (rest) html += '<details><summary style="cursor:pointer;margin-top:6px"><b>Other</b></summary>' + rest + '</details>';
    root.innerHTML = html;
    document.body.appendChild(root);
    T.panel = root;

    function sync() {
      root.querySelectorAll('[data-k]').forEach(function (el) {
        var k = el.getAttribute('data-k');
        if (el.type === 'checkbox') el.checked = !!P[k];
        else {
          if (+el.max < P[k]) el.max = Math.abs(P[k]) * 2;
          el.value = P[k];
        }
        var n = root.querySelector('[data-n="' + k + '"]');
        if (n) n.style.color = (k in T.defaults && P[k] !== T.defaults[k]) ? '#ffd24a' : '';
      });
      root.querySelectorAll('[data-v]').forEach(function (el) { if (document.activeElement !== el) el.value = fmt(P[el.getAttribute('data-v')]); });
    }
    T.sync = sync;
    function set(k, v) {
      if (typeof T.defaults[k] === 'boolean' || k === 'enabled') P[k] = !!v; else if (isFinite(v)) P[k] = +v;
      save(changed()); sync();
      if (k === 'springScale' || k === 'towerMassScale') { var g = WOG.getGame && WOG.getGame(); if (g && g.world && g.world.refreshMasses) g.world.refreshMasses(); }
    }
    root.addEventListener('input', function (e) {
      var el = e.target, k = el.getAttribute('data-k') || el.getAttribute('data-v');
      if (!k) return;
      set(k, el.type === 'checkbox' ? el.checked : parseFloat(el.value));
    });
    root.addEventListener('click', function (e) {
      var el = e.target, r = el.getAttribute && el.getAttribute('data-r'), a = el.getAttribute && el.getAttribute('data-a');
      if (r) set(r, T.defaults[r]);
      if (a === 'reset') { Object.keys(T.defaults).forEach(function (k) { P[k] = T.defaults[k]; }); save({}); sync(); }
      if (a === 'copy') {
        var txt = JSON.stringify(changed(), null, 1);
        try { navigator.clipboard.writeText(txt); el.textContent = 'Copied'; setTimeout(function () { el.textContent = 'Copy values'; }, 1200); } catch (x) { window.prompt('Changed values:', txt); }
      }
    });
    sync();
  }

  function readout() {
    var g = WOG.getGame && WOG.getGame(), el = document.getElementById('wog-tune-read');
    if (!el) return;
    if (!g || !g.world || !g.strands || !g.strands.length) { el.textContent = 'no level / no strands'; return; }
    var sum = 0, mx = 0, n = 0, vmax = 0, att = 0, i;
    g.strands.forEach(function (s) {
      var L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      if (s.rest > 0) { var st = (L - s.rest) / s.rest * 100; sum += st; if (Math.abs(st) > Math.abs(mx)) mx = st; n++; }
    });
    g.balls.forEach(function (b) { if (b.strandCount > 0 && !b.removed) { att++; vmax = Math.max(vmax, Math.hypot(b.vx || 0, b.vy || 0)); } });
    el.textContent = 'attached balls: ' + att + '   strands: ' + g.strands.length + '\nstrand stretch: avg ' + (n ? (sum / n).toFixed(1) : '0') + '%   worst ' + mx.toFixed(1) + '%\nfastest attached ball: ' + vmax.toFixed(1) + ' units/s';
  }

  T.toggle = function (on) {
    if (!T.defaults) init();
    if (!T.panel) build();
    T.open = on === undefined ? !T.open : !!on;
    T.panel.style.display = T.open ? 'block' : 'none';
    if (T.open) T.sync();
  };

  (function wait(n) {
    if (WOG.PHYS) { init(); return; }
    if (n < 200) setTimeout(function () { wait(n + 1); }, 100);
  })(0);
  setInterval(function () {
    var want = !!(WOG.settings && WOG.settings.get('tunePanel'));
    if (want !== T.open && (want || T.panel)) T.toggle(want);
    if (T.open) { readout(); if (T.sync) T.sync(); }
  }, 250);
})();
