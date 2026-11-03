(function () {
  var contact = WOG.World.contact;
  var K = WOG.BODY = {
    density: 0.01,
    iterations: 10,
    beta: 0.2,
    slop: 0.5,
    maxSpeed: 4000, maxSpin: 60,
    ballPush: 1,
    strandWidth: 8,
    strandStep: 12,
    bounceMin: 60
  };
  var GROUND = { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, im: 0, ii: 0, ground: true };

  function rot(x, y, a) { var c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

  function BodySystem(world, scene) {
    this.world = world; this.bodies = []; this.shapes = []; this.joints = []; this.skip = {}; this.contacts = [];
    var self = this, byId = {};
    (scene.bodies || []).forEach(function (d) {
      var b = self.make(d); b.index = self.bodies.length; self.bodies.push(b);
      if (d.id && !byId[d.id]) byId[d.id] = b;
    });
    (scene.hinges || []).forEach(function (h) {
      var b1 = byId[h.body1] || GROUND, b2 = byId[h.body2] || GROUND;
      if (b1 === GROUND && b2 === GROUND) { console.warn('hinge ' + h.body1 + ' / ' + h.body2 + ': no moving body, ignored'); return; }
      if (b1 === GROUND) { b1 = b2; b2 = GROUND; }
      var lim = h.lo != null || h.hi != null;
      var j = { b1: b1, b2: b2, l1: self.local(b1, h.anchor), l2: self.local(b2, h.anchor), limit: lim,
                lo: h.lo != null ? h.lo : -1e9, hi: h.hi != null ? h.hi : 1e9, ref: b2.a - b1.a, id: h.body1 + '-' + (h.body2 || 'world') };
      self.joints.push(j);
      if (b1.index != null && b2.index != null) self.skip[Math.min(b1.index, b2.index) + ',' + Math.max(b1.index, b2.index)] = true;
    });
    this.sync();
  }

  BodySystem.prototype.local = function (b, p) {
    if (b === GROUND) return [p[0], p[1]];
    return rot(p[0] - b.x, p[1] - b.y, -b.a);
  };

  BodySystem.prototype.make = function (d) {
    var self = this, shapes = d.shapes, total = 0, M = 0, mx = 0, my = 0;
    shapes.forEach(function (s) { s.area = s.kind === 'circle' ? Math.PI * s.radius * s.radius : s.width * s.height; total += s.area; });
    shapes.forEach(function (s) {
      s.m = s.mass > 0 ? s.mass : (d.mass > 0 ? d.mass * s.area / (total || 1) : s.area * K.density);
      M += s.m; mx += s.m * s.x; my += s.m * s.y;
    });
    M = M || 1;
    var cx = mx / M, cy = my / M, off = rot(cx, cy, d.rotation), I = 0;
    var b = { id: d.id, x: d.x + off[0], y: d.y + off[1], a: d.rotation, vx: 0, vy: 0, w: 0, mass: M, noGeom: !!d.noGeom, shapes: [], image: null };
    shapes.forEach(function (s) {
      var dx = s.x - cx, dy = s.y - cy;
      I += (s.kind === 'circle' ? s.m * s.radius * s.radius / 2 : s.m * (s.width * s.width + s.height * s.height) / 12) + s.m * (dx * dx + dy * dy);
      var o = { kind: s.kind, id: s.id, tag: s.tag, material: s.material, static: false, body: b, lx: dx, ly: dy, la: s.rotation || 0,
                width: s.width, height: s.height, radius: s.radius, x: 0, y: 0, rotation: 0, mass: s.m };
      o.br = s.kind === 'circle' ? s.radius : Math.sqrt(s.width * s.width + s.height * s.height) / 2;
      b.shapes.push(o); self.shapes.push(o);
    });
    b.im = 1 / M; b.ii = I > 0 ? 1 / I : 0;
    if (d.image) {
      var im = d.image, l = rot(im.x - b.x, im.y - b.y, -b.a);
      b.image = { layer: im.layer, lx: l[0], ly: l[1], la: im.rot - b.a };
    }
    return b;
  };

  BodySystem.prototype.sync = function () {
    this.shapes.forEach(function (o) {
      var b = o.body, c = Math.cos(b.a), s = Math.sin(b.a);
      o.x = b.x + o.lx * c - o.ly * s; o.y = b.y + o.lx * s + o.ly * c; o.rotation = b.a + o.la;
    });
    this.bodies.forEach(function (b) {
      if (!b.image) return;
      var c = Math.cos(b.a), s = Math.sin(b.a), im = b.image, L = im.layer;
      L.x = b.x + im.lx * c - im.ly * s; L.y = b.y + im.lx * s + im.ly * c; L.rotation = b.a + im.la;
    });
  };

  BodySystem.prototype.jointPoints = function () {
    return this.joints.map(function (j) { var p = rot(j.l1[0], j.l1[1], j.b1.a); return [j.b1.x + p[0], j.b1.y + p[1]]; });
  };

  function corners(s) {
    var c = Math.cos(s.rotation), n = Math.sin(s.rotation), hw = s.width / 2, hh = s.height / 2, out = [];
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(function (p) { out.push([s.x + p[0] * c - p[1] * n, s.y + p[0] * n + p[1] * c]); });
    return out;
  }

  BodySystem.prototype.pair = function (S, A, T, B) {
    var W = this.world, out = this.contacts, c, i, pts, mS = W.material(S.material), mT = W.material(T.material);
    var fr = Math.sqrt(Math.max(0, mS.friction * mT.friction)), bo = Math.min(mS.bounce || 0, mT.bounce || 0);
    function add(px, py, nx, ny, pen) { out.push({ A: A, B: B, px: px, py: py, nx: nx, ny: ny, pen: pen, fr: fr, bo: bo, accN: 0, accT: 0 }); }
    if (S.kind === 'circle') {
      c = contact(T, S.x, S.y, S.radius);
      if (c) add(S.x - c.nx * (S.radius - c.pen / 2), S.y - c.ny * (S.radius - c.pen / 2), c.nx, c.ny, c.pen);
    } else if (T.kind === 'circle') {
      c = contact(S, T.x, T.y, T.radius);
      if (c) add(T.x - c.nx * (T.radius - c.pen / 2), T.y - c.ny * (T.radius - c.pen / 2), -c.nx, -c.ny, c.pen);
    } else {
      pts = corners(S);
      for (i = 0; i < pts.length; i++) { c = contact(T, pts[i][0], pts[i][1], 0); if (c) add(pts[i][0], pts[i][1], c.nx, c.ny, c.pen); }
      if (T.kind === 'rectangle') {
        pts = corners(T);
        for (i = 0; i < pts.length; i++) { c = contact(S, pts[i][0], pts[i][1], 0); if (c) add(pts[i][0], pts[i][1], -c.nx, -c.ny, c.pen); }
      }
    }
  };

  BodySystem.prototype.forces = function (h) {
    var W = this.world, P = WOG.PHYS, i, f, b, fld, fx, fy, k;
    for (i = 0; i < this.bodies.length; i++) {
      b = this.bodies[i];
      for (f = 0; f < W.fields.length; f++) {
        fld = W.fields[f]; fx = 0; fy = 0;
        if (fld.enabled === false) continue;
        if (fld.kind === 'linear') {
          if (fld.center && fld.width != null && fld.height != null &&
              (Math.abs(b.x - fld.center[0]) > fld.width / 2 || Math.abs(b.y - fld.center[1]) > fld.height / 2)) continue;
          fx = fld.force[0]; fy = fld.force[1];
        } else if (fld.kind === 'radial') {
          var dx = fld.center[0] - b.x, dy = fld.center[1] - b.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > fld.radius || d < 1e-6) continue;
          var mag = fld.forceatcenter + (fld.forceatedge - fld.forceatcenter) * (d / fld.radius);
          fx = -mag * dx / d; fy = -mag * dy / d;
        } else continue;
        k = P.gravityScale / (fld.type === 'gravity' ? 1 : b.mass);
        b.vx += fx * k * h; b.vy += fy * k * h;
        if (fld.dampeningfactor > 0) {
          var keep = Math.max(0, 1 - fld.dampeningfactor * (fld.water ? 1 : P.fieldDampScale) * h);
          b.vx *= keep; b.vy *= keep; b.w *= keep;
        }
      }
    }
  };

  BodySystem.prototype.collect = function () {
    var W = this.world, bs = this.bodies, i, j, a, b, s, t, k, g, dx, dy;
    this.contacts.length = 0;
    for (i = 0; i < bs.length; i++) {
      a = bs[i];
      if (a.noGeom) continue;
      for (k = 0; k < a.shapes.length; k++) {
        s = a.shapes[k];
        for (j = 0; j < W.statics.length; j++) {
          g = W.statics[j];
          if (g.nogeom) continue;
          if (g.kind !== 'line') {
            if (g._br == null) g._br = g.kind === 'circle' ? g.radius : Math.sqrt(g.width * g.width + g.height * g.height) / 2;
            dx = s.x - g.x; dy = s.y - g.y;
            if (dx * dx + dy * dy > (s.br + g._br) * (s.br + g._br)) continue;
          }
          this.pair(s, a, g, GROUND);
        }
      }
      for (j = i + 1; j < bs.length; j++) {
        b = bs[j];
        if (b.noGeom || this.skip[i + ',' + j]) continue;
        for (k = 0; k < a.shapes.length; k++) for (var m = 0; m < b.shapes.length; m++) {
          s = a.shapes[k]; t = b.shapes[m]; dx = s.x - t.x; dy = s.y - t.y;
          if (dx * dx + dy * dy > (s.br + t.br) * (s.br + t.br)) continue;
          this.pair(s, a, t, b);
        }
      }
    }
  };

  function applyImpulse(b, px, py, rx, ry, sign) {
    b.vx += sign * b.im * px; b.vy += sign * b.im * py; b.w += sign * b.ii * (rx * py - ry * px);
  }

  BodySystem.prototype.step = function (h) {
    if (!this.bodies.length) return;
    var i, it, c, j, A, B, n, k;
    this.forces(h);
    this.collect();
    var cs = this.contacts;
    for (i = 0; i < cs.length; i++) {
      c = cs[i]; A = c.A; B = c.B;
      c.rax = c.px - A.x; c.ray = c.py - A.y; c.rbx = c.px - B.x; c.rby = c.py - B.y;
      var rnA = c.rax * c.ny - c.ray * c.nx, rnB = c.rbx * c.ny - c.rby * c.nx;
      c.kn = A.im + B.im + A.ii * rnA * rnA + B.ii * rnB * rnB;
      var tx = -c.ny, ty = c.nx, rtA = c.rax * ty - c.ray * tx, rtB = c.rbx * ty - c.rby * tx;
      c.kt = A.im + B.im + A.ii * rtA * rtA + B.ii * rtB * rtB;
      var vn = this.relN(c);
      c.target = Math.max(0, K.beta / h * Math.max(c.pen - K.slop, 0));
      if (c.bo > 0 && -vn > K.bounceMin) c.target = Math.max(c.target, -c.bo * vn);
    }
    var js = this.joints;
    for (i = 0; i < js.length; i++) {
      j = js[i]; A = j.b1; B = j.b2;
      var r1 = rot(j.l1[0], j.l1[1], A.a), r2 = rot(j.l2[0], j.l2[1], B.a);
      j.r1x = r1[0]; j.r1y = r1[1]; j.r2x = r2[0]; j.r2y = r2[1];
      j.cx = (B.x + r2[0]) - (A.x + r1[0]); j.cy = (B.y + r2[1]) - (A.y + r1[1]);
      var k11 = A.im + B.im + A.ii * r1[1] * r1[1] + B.ii * r2[1] * r2[1];
      var k12 = -A.ii * r1[0] * r1[1] - B.ii * r2[0] * r2[1];
      var k22 = A.im + B.im + A.ii * r1[0] * r1[0] + B.ii * r2[0] * r2[0];
      var det = k11 * k22 - k12 * k12 || 1e-9;
      j.i11 = k22 / det; j.i12 = -k12 / det; j.i22 = k11 / det;
      j.ka = A.ii + B.ii; j.theta = B.a - A.a - j.ref; j.accLo = 0; j.accHi = 0;
    }
    for (it = 0; it < K.iterations; it++) {
      for (i = 0; i < js.length; i++) this.solveJoint(js[i], h);
      for (i = 0; i < cs.length; i++) this.solveContact(cs[i]);
    }
    for (i = 0; i < this.bodies.length; i++) {
      n = this.bodies[i];
      var sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (sp > K.maxSpeed) { n.vx *= K.maxSpeed / sp; n.vy *= K.maxSpeed / sp; }
      n.w = Math.max(-K.maxSpin, Math.min(K.maxSpin, n.w));
      n.x += n.vx * h; n.y += n.vy * h; n.a += n.w * h;
    }
    this.sync();
  };

  BodySystem.prototype.relN = function (c) {
    var A = c.A, B = c.B;
    var vx = (A.vx - A.w * c.ray) - (B.vx - B.w * c.rby), vy = (A.vy + A.w * c.rax) - (B.vy + B.w * c.rbx);
    return vx * c.nx + vy * c.ny;
  };

  BodySystem.prototype.solveContact = function (c) {
    var A = c.A, B = c.B, vx, vy, lam, old;
    if (c.kn <= 0) return;
    vx = (A.vx - A.w * c.ray) - (B.vx - B.w * c.rby); vy = (A.vy + A.w * c.rax) - (B.vy + B.w * c.rbx);
    lam = (c.target - (vx * c.nx + vy * c.ny)) / c.kn;
    old = c.accN; c.accN = Math.max(0, old + lam); lam = c.accN - old;
    applyImpulse(A, c.nx * lam, c.ny * lam, c.rax, c.ray, 1); applyImpulse(B, c.nx * lam, c.ny * lam, c.rbx, c.rby, -1);
    vx = (A.vx - A.w * c.ray) - (B.vx - B.w * c.rby); vy = (A.vy + A.w * c.rax) - (B.vy + B.w * c.rbx);
    var tx = -c.ny, ty = c.nx, lt = -(vx * tx + vy * ty) / (c.kt || 1), mx = c.fr * c.accN;
    old = c.accT; c.accT = Math.max(-mx, Math.min(mx, old + lt)); lt = c.accT - old;
    applyImpulse(A, tx * lt, ty * lt, c.rax, c.ray, 1); applyImpulse(B, tx * lt, ty * lt, c.rbx, c.rby, -1);
  };

  BodySystem.prototype.solveJoint = function (j, h) {
    var A = j.b1, B = j.b2;
    var dvx = (B.vx - B.w * j.r2y) - (A.vx - A.w * j.r1y), dvy = (B.vy + B.w * j.r2x) - (A.vy + A.w * j.r1x);
    var bx = dvx + K.beta / h * j.cx, by = dvy + K.beta / h * j.cy;
    var px = -(j.i11 * bx + j.i12 * by), py = -(j.i12 * bx + j.i22 * by);
    applyImpulse(B, px, py, j.r2x, j.r2y, 1); applyImpulse(A, px, py, j.r1x, j.r1y, -1);
    if (!j.limit || j.ka <= 0) return;
    var em = 1 / j.ka, cd, lam, old;
    if (j.hi - j.lo < 1e-6) {
      cd = B.w - A.w; lam = -(cd + K.beta / h * (j.theta - j.lo)) * em;
      B.w += B.ii * lam; A.w -= A.ii * lam;
      return;
    }
    var C = j.theta - j.lo;
    cd = B.w - A.w; lam = em * (-(C > 0 ? C / h : K.beta * C / h) - cd);
    old = j.accLo; j.accLo = Math.max(0, old + lam); lam = j.accLo - old;
    B.w += B.ii * lam; A.w -= A.ii * lam;
    C = j.hi - j.theta;
    cd = -(B.w - A.w); lam = em * (-(C > 0 ? C / h : K.beta * C / h) - cd);
    old = j.accHi; j.accHi = Math.max(0, old + lam); lam = j.accHi - old;
    B.w -= B.ii * lam; A.w += A.ii * lam;
  };

  WOG.BodySystem = BodySystem;

  WOG.World.prototype.ballVsBodies = function (h) {
    var sys = this.bodySys, P = WOG.PHYS, balls = this.balls, shapes = sys.shapes, i, k, b, o, c;
    if (!shapes.length) return;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.radius <= 0 || b.climb || b.held || b.stick) continue;
      for (k = 0; k < shapes.length; k++) {
        o = shapes[k];
        if (Math.abs(b.x - o.x) > o.br + b.radius || Math.abs(b.y - o.y) > o.br + b.radius) continue;
        c = contact(o, b.x, b.y, b.radius);
        if (!c) continue;
        var body = o.body, ib = 1 / b.mass, im = K.ballPush * body.im, share = ib / (ib + im || 1);
        b.x += c.nx * c.pen * P.correction * share; b.y += c.ny * c.pen * P.correction * share;
        if (im > 0) { body.x -= c.nx * c.pen * P.correction * (1 - share); body.y -= c.ny * c.pen * P.correction * (1 - share); }
        var px = b.x - c.nx * (b.radius - c.pen / 2), py = b.y - c.ny * (b.radius - c.pen / 2), rx = px - body.x, ry = py - body.y;
        var vbx = body.vx - body.w * ry, vby = body.vy + body.w * rx;
        var rvx = b.vx - vbx, rvy = b.vy - vby, vn = rvx * c.nx + rvy * c.ny;
        var attached = b.strandCount > 0, mat = attached ? this.material(o.material) : this.freeSurface(b, o.material);
        if (vn < 0) {
          var rn = rx * c.ny - ry * c.nx, kn = ib + im + body.ii * rn * rn * (im > 0 ? 1 : 0);
          var e = (-vn > mat.minbouncevel) ? mat.bounce : 0, jn = -(1 + e) * vn / kn;
          b.vx += jn * c.nx * ib; b.vy += jn * c.ny * ib;
          if (im > 0) { body.vx -= jn * c.nx * im; body.vy -= jn * c.ny * im; body.w -= body.ii * (rx * c.ny - ry * c.nx) * jn; }
          var tx = -c.ny, ty = c.nx, vt = (b.vx - vbx) * tx + (b.vy - vby) * ty;
          var dv = Math.max(-mat.friction * jn * ib, Math.min(mat.friction * jn * ib, vt));
          b.vx -= dv * tx; b.vy -= dv * ty;
          if (im > 0) { var jt = dv / ib; body.vx += jt * tx * im; body.vy += jt * ty * im; body.w += body.ii * (rx * ty - ry * tx) * jt; }
        }
        if (c.ny > 0.5) { b.onGround = true; b.groundN = [c.nx, c.ny]; }
      }
    }
    this.strandsVsBodies();
  };

  WOG.World.prototype.strandsVsBodies = function () {
    var sys = this.bodySys, P = WOG.PHYS, shapes = sys.shapes, strands = this.strands, i, k, n, o, c, a, b, rad = K.strandWidth / 2;
    if (!shapes.length || !(rad > 0)) return;
    for (i = 0; i < strands.length; i++) {
      a = strands[i].a; b = strands[i].b;
      if (a.held || b.held || a.climb && b.climb) continue;
      var L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L / K.strandStep));
      for (n = 0; n <= steps; n++) {
        var t = n / steps, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
        for (k = 0; k < shapes.length; k++) {
          o = shapes[k];
          if (Math.abs(px - o.x) > o.br + rad || Math.abs(py - o.y) > o.br + rad) continue;
          c = contact(o, px, py, rad);
          if (!c) continue;
          var body = o.body, ia = (1 - t) * (1 - t) / a.mass, ib = t * t / b.mass, im = K.ballPush * body.im, rx = px - body.x, ry = py - body.y;
          var rn = rx * c.ny - ry * c.nx, kn = ia + ib + im + (im > 0 ? body.ii * rn * rn : 0);
          var sh = (ia + ib) / (ia + ib + im || 1), mv = c.pen * P.correction;
          var wa = (1 - t) / a.mass, wb = t / b.mass, ws = wa + wb || 1;
          a.x += c.nx * mv * sh * wa / ws; a.y += c.ny * mv * sh * wa / ws;
          b.x += c.nx * mv * sh * wb / ws; b.y += c.ny * mv * sh * wb / ws;
          if (im > 0) { body.x -= c.nx * mv * (1 - sh); body.y -= c.ny * mv * (1 - sh); }
          var vbx = body.vx - body.w * ry, vby = body.vy + body.w * rx;
          var vn = (a.vx * (1 - t) + b.vx * t - vbx) * c.nx + (a.vy * (1 - t) + b.vy * t - vby) * c.ny;
          if (vn < 0) {
            var jn = -vn / kn;
            a.vx += jn * c.nx * (1 - t) / a.mass; a.vy += jn * c.ny * (1 - t) / a.mass;
            b.vx += jn * c.nx * t / b.mass; b.vy += jn * c.ny * t / b.mass;
            if (im > 0) { body.vx -= jn * c.nx * im; body.vy -= jn * c.ny * im; body.w -= body.ii * rn * jn; }
          }
        }
      }
    }
  };
})();
