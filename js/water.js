// i honestly could have just merged this with another javascript file but who gaf its more organized
(function () {
  var S = WOG.water = {
    SPACING: 10,
    TICK: 1 / 60,
    spread: 0.05,
    slowAbove: 1, slowBy: 0.95,
    pushScale: 0.25,
    startPush: 0.3,
    maxWave: 30,
    minSplashSpeed: 12, maxSpeed: 20,
    insideWake: 0.1
  };

  function Water(f) {
    this.field = f;
    var w = f.width, h = f.height;
    this.left = f.center[0] - w / 2; this.right = f.center[0] + w / 2;
    this.top = f.center[1] + h / 2; this.bottom = f.center[1] - h / 2;
    this.n = Math.max(4, Math.round(w / S.SPACING));
    this.dx = w / this.n;
    var N = this.n + 1;
    this.h = new Float32Array(N); this.v = new Float32Array(N); this.p = new Float32Array(N);
    for (var i = 0; i < N; i++) this.p[i] = (Math.random() * 4 - 2) * S.startPush;
    this.depth = f.depth != null ? f.depth : 0.0001;
    this.argb = f.argb || [0, 0, 0, 0];
    this.acc = 0;
    this.isWater = true;
  }

  Water.prototype.tick = function () {
    var N = this.n + 1, h = this.h, v = this.v, p = this.p, i, d, mean = 0, lim = Math.min(S.maxWave, (this.top - this.bottom) / 2);
    for (i = 0; i < N; i++) { v[i] += p[i] * S.pushScale; p[i] = 0; }
    for (i = 0; i < N - 1; i++) { d = (h[i + 1] - h[i]) * S.spread; v[i] += d; v[i + 1] -= d; }
    for (i = 0; i < N; i++) mean += v[i];
    mean /= N;
    for (i = 0; i < N; i++) {
      v[i] -= mean;
      h[i] += v[i];
      if (h[i] > lim) { h[i] = lim; if (v[i] > 0) v[i] = 0; } else if (h[i] < -lim) { h[i] = -lim; if (v[i] < 0) v[i] = 0; }
      if (Math.abs(v[i]) >= S.slowAbove) v[i] *= S.slowBy;
    }
  };

  Water.prototype.update = function (dt) {
    this.acc += Math.min(dt, 0.1);
    var n = 0;
    while (this.acc >= S.TICK && n++ < 6) { this.tick(); this.acc -= S.TICK; }
    if (this.acc > S.TICK) this.acc = 0;
  };

  Water.prototype.push = function (x, speed) {
    var i = Math.max(0, Math.min(this.n, Math.round((x - this.left) / this.dx)));
    this.p[i] += speed;
    if (i > 1) this.p[i - 2] -= speed * 0.5;
    if (i < this.n - 1) this.p[i + 2] -= speed * 0.5;
  };

  Water.prototype.contains = function (x, y) { return x >= this.left && x <= this.right && y >= this.bottom && y <= this.top; };

  Water.prototype.draw = function (ctx) {
    var a = this.argb;
    if (!(a[0] > 0)) return;
    ctx.fillStyle = 'rgba(' + a[1] + ',' + a[2] + ',' + a[3] + ',' + (a[0] / 255) + ')';
    ctx.beginPath();
    ctx.moveTo(this.left, this.bottom);
    for (var i = 0; i <= this.n; i++) ctx.lineTo(this.left + i * this.dx, this.top + this.h[i]);
    ctx.lineTo(this.right, this.bottom);
    ctx.closePath();
    ctx.fill();
  };

  S.Water = Water;
  WOG.Water = Water;

  WOG.World.prototype.waterStep = function () {
    var ws = this.waters;
    if (!ws || !ws.length) return;
    for (var j = 0; j < ws.length; j++) {
      var w = ws[j];
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i];
        if (b.radius <= 0 || b.climb || b.held && !b.detachPhase) continue;
        var wet = w.contains(b.x, b.y), was = b._wet ? b._wet[j] : false;
        (b._wet || (b._wet = []))[j] = wet;
        var vy = Math.max(-S.maxSpeed, Math.min(S.maxSpeed, b.vy)), av = Math.abs(vy);
        if (wet !== was && av > S.minSplashSpeed) {
          w.push(b.x, Math.sign(vy) * (av - S.minSplashSpeed * 0.5) * 0.8);
          if (this.onSplash) this.onSplash(b.x, Math.max(w.bottom, Math.min(w.top, b.y)), av);
        } else if (wet && av > S.minSplashSpeed) w.push(b.x, Math.sign(vy) * (av - S.minSplashSpeed * 0.5) * 0.8 * S.insideWake);
      }
    }
  };
})();