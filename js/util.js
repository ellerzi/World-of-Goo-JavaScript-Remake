var WOG = window.WOG || {};
window.WOG = WOG;

WOG.num = function (s, d) {
  if (s === null || s === undefined || s === '') return d === undefined ? 0 : d;
  var v = parseFloat(s);
  return isNaN(v) ? (d === undefined ? 0 : d) : v;
};
WOG.bool = function (s, d) {
  if (s === null || s === undefined || s === '') return !!d;
  return s === 'true' || s === '1';
};
WOG.vec = function (s, d) {
  if (!s) return d || [0, 0];
  return s.split(',').map(function (t) { return parseFloat(t); });
};
WOG.range = function (s, d) {
  if (!s) return d || [0, 0];
  var p = s.split(',').map(function (t) { return parseFloat(t); });
  return p.length === 1 ? [p[0], p[0]] : [p[0], p[1]];
};
WOG.list = function (s) {
  return s ? s.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
};
WOG.rgb = function (s, d) {
  var v = WOG.vec(s, d || [255, 255, 255]);
  return [v[0] | 0, v[1] | 0, v[2] | 0];
};
WOG.attr = function (el, name) { return el.hasAttribute(name) ? el.getAttribute(name) : null; };

WOG.rng = function (seed) {
  var a = (seed * 2654435761) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

WOG.fetchText = async function (url) {
  var r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r.text();
};
WOG.fetchXML = async function (url) {
  var txt = await WOG.fetchText(url);
  txt = txt.replace(/^\uFEFF/, '');
  var doc = new DOMParser().parseFromString(txt, 'text/xml');
  var err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('XML parse error in ' + url + ': ' + err.textContent.slice(0, 200));
  return doc;
};
WOG.children = function (el) { return Array.prototype.slice.call(el.children); };

WOG.smoothstep = function (t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
