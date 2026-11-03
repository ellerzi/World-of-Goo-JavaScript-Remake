// why are they .ogg files and not .mp3? probably some old 2008 shit
// 2008 prime ronaldo
(function () {
  var M = WOG.music = {
    volume: 1,
    fadeIn: 1.0,
    fadeOut: 1.0,
    current: null
  };
  var token = 0;

  function resumeOnGesture(ctx) {
    if (ctx.state === 'running' || M._hooked) return;
    M._hooked = true;
    var go = function () { ctx.resume(); if (ctx.state === 'running') { ['pointerdown', 'keydown'].forEach(function (e) { window.removeEventListener(e, go, true); }); M._hooked = false; } };
    ['pointerdown', 'keydown'].forEach(function (e) { window.addEventListener(e, go, true); });
  }

  M.stop = function (fade) {
    token++;
    var c = M.current; M.current = null;
    if (!c) return;
    var ctx = c.gain.context, t = ctx.currentTime, f = fade == null ? M.fadeOut : fade;
    c.gain.gain.cancelScheduledValues(t);
    c.gain.gain.setValueAtTime(c.gain.gain.value, t);
    c.gain.gain.linearRampToValueAtTime(0, t + f);
    try { c.src.stop(t + f + 0.05); } catch (e) {}
  };

  M.preload = async function (res, id) {
    if (!id || !res.has(id)) return null;
    return res.loadSound(id);
  };

  M.play = async function (res, id, opts) {
    if (!id) { M.stop(); return; }
    if (M.current && M.current.id === id) return;
    M.stop();
    var mine = token;
    if (!res.has(id)) { console.warn('music: no Sound defined for ' + id); return; }
    var buf = res.sounds[id];
    if (!buf) buf = await res.loadSound(id);
    if (!buf || mine !== token) return;
    var ctx = res.audioContext();
    if (!ctx) return;
    var fade = opts && opts.fade != null ? opts.fade : M.fadeIn;
    var src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf; src.loop = true;
    var t = ctx.currentTime;
    if (fade > 0) { gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(M.volume, t + fade); }
    else gain.gain.setValueAtTime(M.volume, t);
    src.connect(gain); gain.connect(ctx.destination); src.start(t);
    M.current = { id: id, src: src, gain: gain };
    resumeOnGesture(ctx);
  };
  M.setVolume = function (v) {
    M.volume = v;
    var c = M.current; if (c) c.gain.gain.setTargetAtTime(v, c.gain.context.currentTime, 0.05);
  };
})();
