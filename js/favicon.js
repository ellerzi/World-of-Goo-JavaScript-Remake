(function () {
  var F = WOG.favicon = { DIR: 'res/favicons/', EXT: '.png', ISLANDS: ['island1', 'island2', 'island3', 'island4', 'island5', 'island6'], map: null, last: null, ticket: 0 };

  async function levelMap() {
    if (F.map) return F.map;
    var m = {};
    await Promise.all(F.ISLANDS.map(async function (id) {
      try { var isl = await WOG.loadIsland(id); isl.levels.forEach(function (l) { m[l.id] = id; }); } catch (e) { }
    }));
    return (F.map = m);
  }

  F.key = async function (name) {
    if (name === 'MapWorldView' || name === 'wogc' || name === 'wogc3d' || name === 'wogcd') return name;
    if (/^island\d+$/.test(name)) return name;
    return (await levelMap())[name] || 'default';
  };

  function apply(url) {
    var link = document.querySelector('link[rel~="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/png'; link.href = url;
  }

  F.set = async function (name) {
    var t = ++F.ticket;
    var key = await F.key(name);
    if (t !== F.ticket || key === F.last) return;
    var tryKeys = key === 'default' ? ['default'] : [key, 'default'];
    for (var i = 0; i < tryKeys.length; i++) {
      var url = F.DIR + tryKeys[i] + F.EXT;
      var ok = await new Promise(function (res) { var im = new Image(); im.onload = function () { res(true); }; im.onerror = function () { res(false); }; im.src = url; });
      if (t !== F.ticket) return;
      if (ok) { apply(url); F.last = key; return; }
    }
  };
})();
