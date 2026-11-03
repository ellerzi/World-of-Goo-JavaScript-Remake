//saving games quite lazy to finish this one but YAY its done :)
(function () {
  var KEY = 'wog.save.v1', MAX_AGE = 10 * 365 * 24 * 3600;
  function fresh() { return { v: 1, completed: {}, extras: {}, wogcorp: 'intact', struct: null }; }
  var data = fresh(), listeners = [];

  function readRaw() {
    var m = new RegExp('(?:^|; )' + KEY.replace(/\./g, '\\.') + '=([^;]*)').exec(document.cookie || '');
    if (m) return decodeURIComponent(m[1]);
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write() {
    var json = JSON.stringify(data), ok = false;
    if (encodeURIComponent(json).length > 3500) {
      try { window.localStorage.setItem(KEY, json); document.cookie = KEY + '=; max-age=0; path=/; SameSite=Lax'; return; } catch (e) { console.warn('save data too big for a cookie and localStorage is blocked'); }
    }
    try {
      document.cookie = KEY + '=' + encodeURIComponent(json) + '; max-age=' + MAX_AGE + '; path=/; SameSite=Lax';
      ok = (document.cookie || '').indexOf(KEY + '=') >= 0;
    } catch (e) {}
    if (!ok) { try { window.localStorage.setItem(KEY, json); } catch (e) {} }
    else { try { window.localStorage.removeItem(KEY); } catch (e) {} }
  }
  function wipe() {
    try { document.cookie = KEY + '=; max-age=0; path=/; SameSite=Lax'; } catch (e) {}
    try { window.localStorage.removeItem(KEY); } catch (e) {}
  }
  function changed() { listeners.forEach(function (f) { try { f(data); } catch (e) { console.warn(e); } }); }

  var S = WOG.save = {
    isComplete: function (id) { return !!data.completed[id]; },
    completedList: function () { return Object.keys(data.completed); },
    wogcorp: function () { return data.wogcorp; },
    totalExtras: function () { var n = 0; Object.keys(data.extras).forEach(function (k) { n += data.extras[k] | 0; }); return n; },
    extras: function (id) { return data.extras[id] | 0; },
    complete: function (id, extra) {
      if (!id) return;
      data.completed[id] = 1;
      if (extra > 0 && extra > (data.extras[id] | 0)) data.extras[id] = extra | 0;
      if (id === 'ProductLauncher' && data.wogcorp !== 'destroyed') data.wogcorp = '3d';
      if (id === 'Deliverance') data.wogcorp = 'destroyed';
      write(); changed();
      console.log('level completed: ' + id + ' (saved)');
    },
    structure: function () { return data.struct; },
    setStructure: function (st) { data.struct = st; write(); },
    reset: function () { data = fresh(); wipe(); changed(); },
    onChange: function (f) { listeners.push(f); },
    load: function () {
      try {
        var raw = readRaw(), s = raw ? JSON.parse(raw) : null;
        if (s && s.completed && typeof s.completed === 'object') { data = fresh(); data.completed = s.completed; if (s.extras && typeof s.extras === 'object') data.extras = s.extras; if (s.struct && Array.isArray(s.struct.b)) data.struct = s.struct; if (/^(intact|3d|destroyed)$/.test(s.wogcorp)) data.wogcorp = s.wogcorp; }
      } catch (e) { data = fresh(); }
    }
  };
  S.load();
})();
