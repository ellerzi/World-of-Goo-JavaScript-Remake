(function () {
  var strings = {};
  WOG.text = {
    lang: 'en',
    loaded: false,
    load: async function (url) {
      try {
        var doc = await WOG.fetchXML(url || 'properties/text.xml.xml');
        var all = doc.getElementsByTagName('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i], id = el.getAttribute('id');
          if (!id) continue;
          var v = el.getAttribute(WOG.text.lang) || el.getAttribute('text') || el.getAttribute('value');
          if (v == null) {
            var kid = el.getElementsByTagName(WOG.text.lang)[0];
            v = kid ? kid.textContent : (el.children.length ? null : el.textContent);
          }
          if (v != null) strings[id] = String(v).trim();
        }
        WOG.text.loaded = Object.keys(strings).length > 0;
      } catch (e) { console.warn('text.xml not read:', e.message); }
    },
    get: function (key) { return strings[key] != null ? strings[key] : key; },
    has: function (key) { return strings[key] != null; }
  };
})();
