//saving games quite lazy to finish this one but YAY its done :)
(function () {
  var BASE = 'wog.save.v1', KEY = BASE, MAX_AGE = 10 * 365 * 24 * 3600;
  function fresh() { return { v: 1, completed: {}, extras: {}, wogcorp: 'intact', struct: null }; }
  var data = fresh(), listeners = [];

  // raw storage by key 
  function rawGet(k) {
    var m = new RegExp('(?:^|; )' + k.replace(/\./g, '\\.') + '=([^;]*)').exec(document.cookie || '');
    if (m) return decodeURIComponent(m[1]);
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function rawSet(k, json) {
    var ok = false;
    if (encodeURIComponent(json).length > 3500) {
      try { window.localStorage.setItem(k, json); document.cookie = k + '=; max-age=0; path=/; SameSite=Lax'; return; } catch (e) { console.warn('save data too big for a cookie and localStorage is blocked'); }
    }
    try {
      document.cookie = k + '=' + encodeURIComponent(json) + '; max-age=' + MAX_AGE + '; path=/; SameSite=Lax';
      ok = (document.cookie || '').indexOf(k + '=') >= 0;
    } catch (e) {}
    if (!ok) { try { window.localStorage.setItem(k, json); } catch (e) {} }
    else { try { window.localStorage.removeItem(k); } catch (e) {} }
  }
  function rawDel(k) {
    try { document.cookie = k + '=; max-age=0; path=/; SameSite=Lax'; } catch (e) {}
    try { window.localStorage.removeItem(k); } catch (e) {}
  }
  function readRaw() { return rawGet(KEY); }
  function write() { rawSet(KEY, JSON.stringify(data)); }
  function wipe() { rawDel(KEY); }
  function slotKey(n) { return n ? BASE + '.p' + n : BASE; }   // slot 0 keeps the old key, so existing saves become profile 1
  function parse(raw) {
    var d = fresh();
    try {
      var s = raw ? JSON.parse(raw) : null;
      if (s && s.completed && typeof s.completed === 'object') { d.completed = s.completed; if (s.extras && typeof s.extras === 'object') d.extras = s.extras; if (s.struct && Array.isArray(s.struct.b)) d.struct = s.struct; if (/^(intact|3d|destroyed)$/.test(s.wogcorp)) d.wogcorp = s.wogcorp; }
    } catch (e) {}
    return d;
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
    load: function () { data = parse(readRaw()); },
    // profile slots
    rawGet: rawGet, rawSet: rawSet, rawDel: rawDel,
    slotKey: slotKey,
    useSlot: function (n) { KEY = slotKey(n); data = parse(readRaw()); changed(); },
    peek: function (n) { return parse(rawGet(slotKey(n))); },
    wipeSlot: function (n) { rawDel(slotKey(n)); if (slotKey(n) === KEY) { data = fresh(); changed(); } }
  };
  S.load();
})();
