// now that im thinking about it why are they called islands? theyre chapters not islands
(function () {
  var A = WOG.attr;
  WOG.islands = {};
  WOG.loadIsland = async function (name) {
    if (WOG.islands[name]) return WOG.islands[name];
    var doc = await WOG.fetchXML('res/islands/' + name + '.xml.xml');
    var root = doc.documentElement;
    var isl = { id: name, name: A(root, 'name'), map: A(root, 'map'), icon: A(root, 'icon'), levels: [] };
    WOG.children(root).forEach(function (el) {
      if (el.tagName !== 'level') return;
      var ocd = WOG.list(A(el, 'ocd'));
      isl.levels.push({
        id: A(el, 'id'), depends: WOG.list(A(el, 'depends')),
        name: A(el, 'name'), text: A(el, 'text'),
        ocd: ocd.length ? { kind: ocd[0], value: parseFloat(ocd[1]) } : null,
        oncomplete: A(el, 'oncomplete'), cutscene: WOG.list(A(el, 'cutscene'))
      });
    });
    WOG.islands[name] = isl;
    return isl;
  };
  WOG.islandLevel = function (islandId, levelId) {
    var isl = WOG.islands[islandId];
    return isl && isl.levels.filter(function (l) { return l.id === levelId; })[0] || null;
  };
})();
