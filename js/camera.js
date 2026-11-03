//camera functions including end cameras and other stuff idk
(function () {
  function Camera() {
    this.x = 0; this.y = 0; this.zoom = 1;
    this.keys = [];
    this.t = 0;
    this.playing = false;
  }

  Camera.prototype.setLevelCamera = function (cfg) {
    this.cfg = cfg;
    this.keys = [];
    if (!cfg) { this.x = 0; this.y = 300; this.zoom = 1; this.playing = false; return; }
    cfg.pois.forEach(function (p) {
      this.keys.push({ x: p.pos[0], y: p.pos[1], zoom: p.zoom, travel: p.traveltime, pause: p.pause });
    }, this);
    this.intro = this.keys;
    this.replay();
  };

  Camera.prototype.flyToEnd = function (travel) {
    var cfg = this.cfg;
    if (!cfg || !cfg.endpos) return;
    this.keys = [{ x: this.x, y: this.y, zoom: this.zoom, travel: 0, pause: 0 },
                 { x: cfg.endpos[0], y: cfg.endpos[1], zoom: cfg.endzoom, travel: travel || 1, pause: 0 }];
    this.mode = 'end'; this.t = 0; this.playing = true;
  };

  Camera.prototype.replay = function () {
    if (this.intro) this.keys = this.intro;
    this.mode = 'intro';
    this.t = 0; this.playing = this.keys.length > 1 || (this.keys.length === 1 && this.keys[0].pause > 0);
    var k = this.keys[0];
    if (k) { this.x = k.x; this.y = k.y; this.zoom = k.zoom; }
  };

  Camera.prototype.skipToEnd = function () {
    var k = this.keys[this.keys.length - 1];
    if (k) { this.x = k.x; this.y = k.y; this.zoom = k.zoom; }
    this.playing = false;
  };

  Camera.prototype.introLength = function () {
    var n = 0, ks = this.intro || this.keys;
    ks.forEach(function (k, i) { n += (i ? k.travel : 0) + k.pause; });
    return n;
  };

  Camera.prototype.update = function (dt) {
    if (!this.playing) return;
    this.t += dt;
    var t = this.t;
    if (this.keys.length && t < this.keys[0].pause) return;
    t -= this.keys.length ? this.keys[0].pause : 0;
    for (var i = 1; i < this.keys.length; i++) {
      var a = this.keys[i - 1], b = this.keys[i];
      if (t < b.travel) {
        var u = WOG.smoothstep(t / b.travel);
        this.x = a.x + (b.x - a.x) * u; this.y = a.y + (b.y - a.y) * u;
        this.zoom = a.zoom + (b.zoom - a.zoom) * u;
        return;
      }
      t -= b.travel;
      if (t < b.pause) { this.x = b.x; this.y = b.y; this.zoom = b.zoom; return; }
      t -= b.pause;
    }
    this.skipToEnd();
  };

  Camera.prototype.apply = function (ctx, viewW, viewH, pixelScale) {
    var s = this.zoom * pixelScale;
    ctx.setTransform(s, 0, 0, -s, viewW / 2 - this.x * s, viewH / 2 + this.y * s);
  };

  Camera.DISTANCE = 800;
  Camera.prototype.depthFactor = function (depth) {
    var d = Camera.DISTANCE - depth;
    return d > 1 ? Camera.DISTANCE / d : 0;
  };
  Camera.prototype.applyDepth = function (ctx, viewW, viewH, pixelScale, depth, lx, ly) {
    var s = this.zoom * pixelScale, f = this.depthFactor(depth);
    ctx.setTransform(s, 0, 0, -s,
      viewW / 2 + (lx - this.x) * s * f,
      viewH / 2 - (ly - this.y) * s * f);
  };

  Camera.prototype.screenToWorld = function (sx, sy, viewW, viewH, pixelScale) {
    var s = this.zoom * pixelScale;
    return { x: (sx - viewW / 2) / s + this.x, y: -(sy - viewH / 2) / s + this.y };
  };

  WOG.Camera = Camera;
})();
