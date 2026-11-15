/* small constraint solver */
(function () {
  'use strict';

  var ODE = WOG.ODE = {};

  function finite(v, fallback) { return Number.isFinite(v) ? v : fallback; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function Solver(options) {
    options = options || {};
    this.iterations = options.iterations || 20;
    this.sor = options.sor || 1.3;
    this.erp = options.erp == null ? 0.2 : options.erp;
    this.cfm = options.cfm == null ? 1e-5 : options.cfm;
    this.slop = options.slop == null ? 0 : options.slop;
    this.maxBias = options.maxBias == null ? Infinity : options.maxBias;
    /* contacts are joined eVERy frame */
    this.warmStart = options.warmStart == null ? 0 : options.warmStart;
    this.sphereInertiaFactor = options.sphereInertiaFactor == null ? 0.4 : options.sphereInertiaFactor;
    this.cache = new Map();
    this.frame = 0;
  }

  Solver.prototype.body = function (source, fixed) {
    var mass = Math.max(1e-9, finite(source.mass, 1));
    var inertia = source.inertia;
    if (!(inertia > 0)) {
      if (source.radius > 0) inertia = this.sphereInertiaFactor * mass * source.radius * source.radius;
      else if (source.width > 0 && source.height > 0) inertia = mass * (source.width * source.width + source.height * source.height) / 12;
      else inertia = mass;
    }
    return {
      source: source,
      x: finite(source.x, 0),
      y: finite(source.y, 0),
      vx: finite(source.vx, 0),
      vy: finite(source.vy, 0),
      w: finite(source.angVel, 0),
      impactVX: fixed ? 0 : finite(source.vx, 0),
      impactVY: fixed ? 0 : finite(source.vy, 0),
      impactW: fixed ? 0 : finite(source.angVel, 0),
      invMass: fixed ? 0 : 1 / mass,
      invI: fixed ? 0 : 1 / inertia
    };
  };

  function apply(c, normalImpulse, tangentImpulse) {
    var px = c.nx * normalImpulse + c.tx * tangentImpulse;
    var py = c.ny * normalImpulse + c.ty * tangentImpulse;
    if (c.a.invMass) {
      c.a.vx += px * c.a.invMass; c.a.vy += py * c.a.invMass;
      c.a.w += (c.rax * py - c.ray * px) * c.a.invI;
    }
    if (c.b && c.b.invMass) {
      c.b.vx -= px * c.b.invMass; c.b.vy -= py * c.b.invMass;
      c.b.w -= (c.rbx * py - c.rby * px) * c.b.invI;
    }
  }

  function pointVelocity(body, rx, ry) {
    return { x: body.vx - body.w * ry, y: body.vy + body.w * rx };
  }

  Solver.prototype.prepareContact = function (c, h) {
    c.tx = -c.ny; c.ty = c.nx;
    c.px = finite(c.px, c.a.x);
    c.py = finite(c.py, c.a.y);
    c.rax = c.px - c.a.x; c.ray = c.py - c.a.y;
    c.rbx = c.b ? c.px - c.b.x : 0; c.rby = c.b ? c.py - c.b.y : 0;
    var inv = c.a.invMass + (c.b ? c.b.invMass : 0);
    var ran = c.rax * c.ny - c.ray * c.nx;
    var rbn = c.b ? c.rbx * c.ny - c.rby * c.nx : 0;
    var rat = c.rax * c.ty - c.ray * c.tx;
    var rbt = c.b ? c.rbx * c.ty - c.rby * c.tx : 0;
    var kn = inv + ran * ran * c.a.invI + (c.b ? rbn * rbn * c.b.invI : 0);
    var kt = inv + rat * rat * c.a.invI + (c.b ? rbt * rbt * c.b.invI : 0);
    c.softN = (c.normalCFM == null ? this.cfm : c.normalCFM) / h;
    c.softT = this.cfm / h;
    c.massN = kn > 0 ? 1 / (kn + c.softN) : 0;
    c.massT = kt > 0 ? 1 / (kt + c.softT) : 0;
    c.mu = Math.max(0, finite(c.mu, 0));
    c.penetration = Math.max(0, finite(c.penetration, 0));
    var closing = c.a.impactVX * c.nx + c.a.impactVY * c.ny + ran * c.a.impactW;
    if (c.b) closing -= c.b.impactVX * c.nx + c.b.impactVY * c.ny + rbn * c.b.impactW;
    var bounce = closing < -finite(c.bounceVel, 0) ? -finite(c.bounce, 0) * closing : 0;
    var correction = this.erp * Math.max(0, c.penetration - this.slop) / h;
    c.target = Math.max(bounce, Math.min(this.maxBias, correction));
    var old = c.key && this.cache.get(c.key);
    c.lambdaN = old ? old.n * this.warmStart : 0;
    c.lambdaT = old ? old.t * this.warmStart : 0;
    apply(c, c.lambdaN, c.lambdaT);
  };

  Solver.prototype.solveContact = function (c) {
    if (!c.massN) return;
    var va = pointVelocity(c.a, c.rax, c.ray);
    var vb = c.b ? pointVelocity(c.b, c.rbx, c.rby) : { x: 0, y: 0 };
    var rvx = va.x - vb.x, rvy = va.y - vb.y;
    var vn = rvx * c.nx + rvy * c.ny;
    var oldN = c.lambdaN;
    var deltaN = (c.target - vn - c.softN * oldN) * c.massN * this.sor;
    c.lambdaN = Math.max(0, oldN + deltaN);
    deltaN = c.lambdaN - oldN;
    apply(c, deltaN, 0);

    va = pointVelocity(c.a, c.rax, c.ray);
    vb = c.b ? pointVelocity(c.b, c.rbx, c.rby) : { x: 0, y: 0 };
    rvx = va.x - vb.x; rvy = va.y - vb.y;
    var vt = rvx * c.tx + rvy * c.ty;
    var oldT = c.lambdaT;
    var limit = c.mu * c.lambdaN;
    c.lambdaT = clamp(oldT - (vt + c.softT * oldT) * c.massT * this.sor, -limit, limit);
    apply(c, 0, c.lambdaT - oldT);
  };

  Solver.prototype.quickStep = function (bodies, contacts, h, solveJoints) {
    h = Math.max(1e-6, h);
    this.frame++;
    for (var i = 0; i < contacts.length; i++) this.prepareContact(contacts[i], h);

    /* z */
    var n = contacts.length;
    for (var pass = 0; pass < this.iterations && (n || solveJoints); pass++) {
      if (solveJoints) solveJoints();
      var start = (pass * 7 + this.frame * 3) % n;
      for (i = 0; i < n; i++) this.solveContact(contacts[(start + i) % n]);
    }

    var next = new Map();
    for (i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      if (this.warmStart && c.key) next.set(c.key, { n: c.lambdaN, t: c.lambdaT });
    }
    this.cache = next;

    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      b.source.vx = finite(b.vx, 0);
      b.source.vy = finite(b.vy, 0);
      b.source.angVel = finite(b.w, 0);
    }
  };

  ODE.Solver = Solver;
  ODE.version = '0.8-compatible-2d';
  ODE.ready = true;
  WOG.initODE = function () { return Promise.resolve(ODE); };
})();
