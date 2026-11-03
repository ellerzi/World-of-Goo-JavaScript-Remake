// keep keep keep read hahahahahahahahahahahahahaha fuckersssss
(function () {
  function joinPath(base, p) {
    if (!base) return p;
    var j = /\/$/.test(base) ? base + p : base + '/' + p;
    return j.replace(/^\.\//, '').replace(/\/\.\//g, '/');
  }

  function Resources() {
    this.defs = {};
    this.images = {};
    this.pending = {};
    this.tinted = {};
    this.missing = [];
    this.sounds = {};
    this.soundPending = {};
  }

  Resources.prototype.addManifest = async function (url) {
    var doc = await WOG.fetchXML(url);
    var groups = doc.getElementsByTagName('Resources');
    for (var g = 0; g < groups.length; g++) {
      var path = '', prefix = '';
      WOG.children(groups[g]).forEach(function (el) {
        var tag = el.tagName;
        if (tag === 'SetDefaults') {
          path = el.getAttribute('path') || '';
          prefix = el.getAttribute('idprefix') || '';
        } else if (tag === 'Image' || tag === 'Sound' || tag === 'font') {
          var id = prefix + el.getAttribute('id');
          this.defs[id] = { type: tag.toLowerCase(), path: joinPath(path, el.getAttribute('path')) };
        }
      }, this);
    }
  };

  Resources.prototype.has = function (id) { return !!this.defs[id]; };

  Resources.prototype.loadImage = function (id) {
    if (this.pending[id]) return this.pending[id];
    var def = this.defs[id], self = this;
    if (!def || def.type !== 'image') {
      this.missing.push(id + ' (no definition)');
      return (this.pending[id] = Promise.resolve(null));
    }
    this.pending[id] = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { self.images[id] = img; resolve(img); };
      img.onerror = function () { self.missing.push(id + ' -> ' + def.path + '.png'); resolve(null); };
      img.src = def.path + '.png';
    });
    return this.pending[id];
  };

  Resources.prototype.loadImages = function (ids) {
    return Promise.all(ids.map(this.loadImage, this));
  };

  Resources.prototype.image = function (id) { return this.images[id] || null; };

  Resources.prototype.tintedImage = function (id, rgb) {
    var img = this.images[id];
    if (!img) return null;
    if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) return img;
    var key = id + '|' + rgb.join(',');
    if (this.tinted[key]) return this.tinted[key];
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgb(' + rgb.join(',') + ')';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    return (this.tinted[key] = c);
  };

  var actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = false; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  Resources.prototype.audioContext = function () { return audio(); };
  Resources.prototype.loadSound = function (id) {
    if (this.soundPending[id]) return this.soundPending[id];
    var def = this.defs[id], self = this;
    if (!def || def.type !== 'sound') { this.missing.push(id + ' (no sound definition)'); return (this.soundPending[id] = Promise.resolve(null)); }
    this.soundPending[id] = (async function () {
      try {
        var ctx = audio(); if (!ctx) return null;
        var r = await fetch(def.path + '.ogg');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var buf = await ctx.decodeAudioData(await r.arrayBuffer());
        self.sounds[id] = buf; return buf;
      } catch (e) { self.missing.push(id + ' -> ' + def.path + '.ogg'); return null; }
    })();
    return this.soundPending[id];
  };
  Resources.prototype.loadSounds = function (ids) { return Promise.all(ids.map(this.loadSound, this)); };
  Resources.prototype.playSound = function (ids, volume) {
    if (!ids || !ids.length) return;
    var id = ids[Math.floor(Math.random() * ids.length)], buf = this.sounds[id], ctx = audio();
    if (!ctx) return;
    if (!buf) { this.loadSound(id); return; }
    var src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf; gain.gain.value = (volume == null ? 1 : volume) * (WOG.sfxVolume == null ? 1 : WOG.sfxVolume);
    src.connect(gain); gain.connect(ctx.destination); src.start();
  };

  WOG.Resources = Resources;
})();
