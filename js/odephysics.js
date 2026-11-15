/* ODE physics i tried to get it as close to the original as possible */
/* MOSTLY DERIVED FROM GHIDRA! i dont know a lot of c/c++ code but I know some */
(function () {
  'use strict';

  if (!WOG.ODE || !WOG.ODE.Solver || !WOG.World) return;

  var P = WOG.PHYS;
  var TICKS_PER_UNIT = 60 / 8;
  P.subStep = 1 / TICKS_PER_UNIT;
  P.restRate = 0.5;
  P.walkSpeedScale = TICKS_PER_UNIT;
  P.fieldDampScale = 1;
  P.antigravScale = 1;
  P.useODE = true;
  P.odeIterations = 20;
  P.odeSOR = 1.3;
  P.odeERP = 0.2;
  P.odeCFM = 1e-5;
  P.odeContactSlop = 0;
  P.odeMaxBias = 0;
  P.odeWarmStart = 0;
  P.odePositionIterations = 0;
  P.odeSphereInertiaFactor = 0.4;
  P.springScale = 1;
  P.dampScale = 1;
  P.maxForceScale = 1;
  P.towerMassScale = 1;
  P.correction = 1;

  function immobile(b) {
    var attrs = b.def.attrs || {};
    return !!(b.stick || b.climb || (b.held && !b.detachPhase) ||
      boolAttr(attrs.static, false) || (b.sleeping && boolAttr(attrs.staticwhensleeping, false)));
  }
  function fixed(b) { return immobile(b) || b.odeDisabled; }
  function bodyInertia(b) {
    var mass = Math.max(1e-9, b.mass || 1), inertia;
    if (b.radius > 0) inertia = P.odeSphereInertiaFactor * mass * b.radius * b.radius;
    else if (b.width > 0 && b.height > 0) inertia = mass * (b.width * b.width + b.height * b.height) / 12;
    else inertia = mass;
    return inertia;
  }
  function wakeSolverBody(ob, b) {
    var mass = Math.max(1e-9, b.mass || 1);
    ob.invMass = 1 / mass;
    ob.invI = 1 / Math.max(1e-9, bodyInertia(b));
  }
  function boolAttr(v, fallback) { return v == null ? fallback : String(v).toLowerCase() === 'true'; }
  function intrinsicSticky(b) {
    var a = b.def.attrs || {};
    return boolAttr(b.strandCount ? a.stickyattached : a.stickyunattached, boolAttr(a.sticky, false));
  }
  function canStick(b) {
    return !b.held && !b.climb && !b.sleeping && !b.sucked && (b.strandCount > 0 || intrinsicSticky(b));
  }

  function circleShape(o) { return { kind: 'circle', x: o.x, y: o.y, radius: o.radius }; }
  function boxShape(o) {
    var angle = o.angle == null ? (o.rotation || 0) : o.angle;
    var c = Math.cos(angle), s = Math.sin(angle);
    return { kind: 'box', x: o.x, y: o.y, hx: o.width / 2, hy: o.height / 2,
      ux: c, uy: s, vx: -s, vy: c };
  }
  function dynamicShape(b) {
    if (b.radius > 0) return circleShape(b);
    if (b.width > 0 && b.height > 0) return boxShape(b);
    return null;
  }
  function staticShape(g) {
    if (g.kind === 'circle') return circleShape(g);
    if (g.kind === 'rectangle') return boxShape(g);
    return null;
  }
  function boundRadius(s) { return s.kind === 'circle' ? s.radius : Math.hypot(s.hx, s.hy); }
  function boxVertices(b) {
    return [
      { x: b.x - b.ux * b.hx - b.vx * b.hy, y: b.y - b.uy * b.hx - b.vy * b.hy, feature: 0 },
      { x: b.x + b.ux * b.hx - b.vx * b.hy, y: b.y + b.uy * b.hx - b.vy * b.hy, feature: 1 },
      { x: b.x + b.ux * b.hx + b.vx * b.hy, y: b.y + b.uy * b.hx + b.vy * b.hy, feature: 2 },
      { x: b.x - b.ux * b.hx + b.vx * b.hy, y: b.y - b.uy * b.hx + b.vy * b.hy, feature: 3 }
    ];
  }
  function boxRadiusOn(b, x, y) {
    return b.hx * Math.abs(x * b.ux + y * b.uy) + b.hy * Math.abs(x * b.vx + y * b.vy);
  }
  function boxBoxManifold(a, b) {
    var axes = [[a.ux, a.uy], [a.vx, a.vy], [b.ux, b.uy], [b.vx, b.vy]];
    var dx = a.x - b.x, dy = a.y - b.y, best = Infinity, nx, ny, face;
    for (var i = 0; i < axes.length; i++) {
      var ax = axes[i][0], ay = axes[i][1], separation = dx * ax + dy * ay;
      var overlap = boxRadiusOn(a, ax, ay) + boxRadiusOn(b, ax, ay) - Math.abs(separation);
      if (overlap < 0) return [];
      if (overlap < best) {
        best = overlap; face = i;
        nx = separation > 0 ? ax : -ax;
        ny = separation > 0 ? ay : -ay;
      }
    }

    var ref = face < 2 ? a : b, inc = face < 2 ? b : a;
    var rx = ref === a ? -nx : nx, ry = ref === a ? -ny : ny;
    var tx = -ry, ty = rx, side = face % 2 === 0 ? ref.hy : ref.hx;
    var front = face % 2 === 0 ? ref.hx : ref.hy;
    var du = inc.ux * rx + inc.uy * ry, dv = inc.vx * rx + inc.vy * ry;
    var onU = Math.abs(du) >= Math.abs(dv);
    var toward = (onU ? du : dv) > 0 ? -1 : 1;
    var midX = inc.x + toward * (onU ? inc.ux * inc.hx : inc.vx * inc.hy);
    var midY = inc.y + toward * (onU ? inc.uy * inc.hx : inc.vy * inc.hy);
    var edgeX = onU ? inc.vx * inc.hy : inc.ux * inc.hx;
    var edgeY = onU ? inc.vy * inc.hy : inc.uy * inc.hx;
    var mid = (midX - ref.x) * tx + (midY - ref.y) * ty;
    var span = edgeX * tx + edgeY * ty;
    var low = -1, high = 1;
    if (Math.abs(span) > 1e-12) {
      var first = (-side - mid) / span, last = (side - mid) / span;
      low = Math.max(low, Math.min(first, last));
      high = Math.min(high, Math.max(first, last));
    } else if (Math.abs(mid) > side) return [];
    if (low > high) return [];

    var points = [];
    function add(t, feature) {
      var px = midX + t * edgeX, py = midY + t * edgeY;
      var depth = front - ((px - ref.x) * rx + (py - ref.y) * ry);
      if (depth >= 0) points.push({ nx: nx, ny: ny, pen: depth, px: px, py: py, feature: face + ':' + feature });
    }
    add(low, 0);
    if (high > low) add(high, 1);
    return points;
  }
  function circleCircleManifold(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, rr = a.radius + b.radius, d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) return [];
    if (d2 === 0) return [{ nx: 1, ny: 0, pen: rr, px: a.x, py: a.y, feature: 0 }];
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    var pen = rr - d;
    return [{ nx: nx, ny: ny, pen: pen,
      px: b.x + nx * (b.radius - pen * 0.5), py: b.y + ny * (b.radius - pen * 0.5), feature: 0 }];
  }
  function circleBoxManifold(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    var lx = dx * b.ux + dy * b.uy, ly = dx * b.vx + dy * b.vy;
    var qx = Math.max(-b.hx, Math.min(b.hx, lx)), qy = Math.max(-b.hy, Math.min(b.hy, ly));
    var ex = lx - qx, ey = ly - qy, d2 = ex * ex + ey * ey, nx, ny, pen, feature;
    if (d2 > a.radius * a.radius) return [];
    if (d2 > 0) {
      var d = Math.sqrt(d2), lnx = ex / d, lny = ey / d;
      nx = lnx * b.ux + lny * b.vx; ny = lnx * b.uy + lny * b.vy;
      pen = a.radius - d; feature = 'edge';
    } else {
      var gx = b.hx - Math.abs(lx), gy = b.hy - Math.abs(ly), sx, sy;
      if (gx <= gy) { sx = lx > 0 ? 1 : -1; sy = 0; pen = a.radius + gx; feature = 'x'; }
      else { sx = 0; sy = ly > 0 ? 1 : -1; pen = a.radius + gy; feature = 'y'; }
      nx = sx * b.ux + sy * b.vx; ny = sx * b.uy + sy * b.vy;
    }
    return [{ nx: nx, ny: ny, pen: pen,
      px: b.x + qx * b.ux + qy * b.vx, py: b.y + qx * b.uy + qy * b.vy, feature: feature }];
  }
  function boxCircleManifold(a, b) {
    return circleBoxManifold(b, a).map(function (c) {
      return { nx: -c.nx, ny: -c.ny, pen: c.pen, px: c.px, py: c.py, feature: c.feature };
    });
  }
  function boxLineManifold(a, line) {
    var nl = Math.hypot(line.normal[0], line.normal[1]) || 1;
    var nx = line.normal[0] / nl, ny = line.normal[1] / nl, points = [];
    boxVertices(a).forEach(function (p) {
      var signed = (p.x - line.anchor[0]) * nx + (p.y - line.anchor[1]) * ny;
      if (signed <= 1e-7) points.push({ nx: nx, ny: ny, pen: Math.max(0, -signed), px: p.x, py: p.y, feature: p.feature });
    });
    points.sort(function (p, q) { return q.pen - p.pen; });
    return points.slice(0, 2);
  }
  function manifold(a, b) {
    if (a.kind === 'circle' && b.kind === 'circle') return circleCircleManifold(a, b);
    if (a.kind === 'circle' && b.kind === 'box') return circleBoxManifold(a, b);
    if (a.kind === 'box' && b.kind === 'circle') return boxCircleManifold(a, b);
    if (a.kind === 'box' && b.kind === 'box') return boxBoxManifold(a, b);
    return [];
  }
  function staticManifold(s, g) {
    if (g.kind === 'line') {
      if (s.kind === 'box') return boxLineManifold(s, g);
      var length = Math.hypot(g.normal[0], g.normal[1]);
      if (!length) return [];
      var nx = g.normal[0] / length, ny = g.normal[1] / length;
      var depth = s.radius - ((s.x - g.anchor[0]) * nx + (s.y - g.anchor[1]) * ny);
      if (depth < 0) return [];
      return [{ nx: nx, ny: ny, pen: depth,
        px: s.x - nx * s.radius, py: s.y - ny * s.radius, feature: 0 }];
    }
    var other = staticShape(g);
    return other ? manifold(s, other) : [];
  }
  function pointVelocity(b, px, py) {
    var rx = px - b.x, ry = py - b.y, w = b.angVel || 0;
    return { x: (b.vx || 0) - w * ry, y: (b.vy || 0) + w * rx };
  }
  function normalSpeed(a, b, c) {
    var va = pointVelocity(a, c.px, c.py), vb = pointVelocity(b, c.px, c.py);
    return (va.x - vb.x) * c.nx + (va.y - vb.y) * c.ny;
  }
  WOG.ODE.geometry = {
    dynamicShape: dynamicShape,
    staticManifold: staticManifold,
    manifold: manifold
  };

  function ODEWorld(game, materials) {
    this.odeSphereFactor = P.odeSphereInertiaFactor;
    WOG.World.call(this, game, materials);
    this.bodyShapes.forEach(function (shape, i) { shape.contactId = i; });
    this.tickRemainder = 0;
    this.balls.forEach(function (b) { b.odeDisabled = false; b.odeQuietSteps = 0; });
    this.ode = new WOG.ODE.Solver({
      iterations: P.odeIterations, sor: P.odeSOR, erp: P.odeERP,
      cfm: P.odeCFM, slop: P.odeContactSlop,
      maxBias: P.odeMaxBias > 0 ? P.odeMaxBias : Infinity,
      warmStart: P.odeWarmStart, sphereInertiaFactor: P.odeSphereInertiaFactor
    });
  }
  ODEWorld.prototype = Object.create(WOG.World.prototype);
  ODEWorld.prototype.constructor = ODEWorld;

  ODEWorld.prototype.refreshMasses = function () {
    this.balls.forEach(function (b) {
      var d = b.def;
      b.mass = b.held && !b.detachPhase ? (d.dragmass || d.mass || 1) : (d.mass || 1);
    });
  };

  ODEWorld.prototype.update = function (realDt) {
    if (!P.enabled || !(realDt > 0) || !(P.timeScale > 0)) return;
    this.tickRemainder += realDt * P.timeScale;
    var tick = 1 / TICKS_PER_UNIT;
    while (this.tickRemainder + 1e-10 >= tick) {
      this.tickRemainder = Math.max(0, this.tickRemainder - tick);
      WOG.World.prototype.update.call(this, tick / P.timeScale);
    }
  };

  // force fields and gooballs damping use distances per native tick
  function fieldForces(fields, b, mass, h, out) {
    var ball = !!b.def, attrs = ball ? b.def.attrs || {} : {};
    var lift = ball ? b.antigrav || 0 : 0;
    var lifted = lift !== 0 && (b.strandCount > 0 || b.detachPhase
      ? boolAttr(attrs.isantigravattached, true) : boolAttr(attrs.isantigravunattached, false));
    var vx = b.vx / TICKS_PER_UNIT, vy = b.vy / TICKS_PER_UNIT;
    var drag = ball && b.airDamp > 0 && !b.held ? b.airDamp * Math.hypot(vx, vy) : 0;
    out.x = 0;
    out.y = 0;
    out.spin = 1;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.enabled === false || (ball && f.geomonly)) continue;
      var fx, fy;
      if (f.kind === 'linear') {
        if (f.width && f.center && (Math.abs(b.x - f.center[0]) > f.width / 2 ||
            Math.abs(b.y - f.center[1]) > (f.height || 0) / 2)) continue;
        var scale = f.type === 'force' ? 1 : mass / 40;
        fx = f.force[0] * scale;
        fy = f.force[1] * scale;
      } else if (f.kind === 'radial') {
        if (ball && boolAttr(attrs.stacking, false)) continue;
        var dx = b.x - f.center[0], dy = b.y - f.center[1];
        var dist = Math.hypot(dx, dy);
        if (!(f.radius > 0) || dist > f.radius) continue;
        // mass/40
        var ratio = mass / 40;
        var strength = f.forceatedge + (1 - dist / f.radius) * (f.forceatcenter - f.forceatedge) * ratio;
        var radial = dist > 0 ? strength * ratio / dist : 0;
        fx = dx * radial;
        fy = dy * radial;
      } else continue;
      var direction = lifted && f.antigrav !== false ? -lift * P.antigravScale : 1;
      out.x += fx * direction * P.gravityScale;
      out.y += fy * direction * P.gravityScale;
      drag += (f.dampeningfactor || 0) * P.fieldDampScale;
      if (f.rotationaldampeningfactor) {
        out.spin *= 1 - f.rotationaldampeningfactor * h * TICKS_PER_UNIT;
      }
    }
    out.x -= drag * vx;
    out.y -= drag * vy;
  }

  ODEWorld.prototype.applyNativeFields = function (ax, ay, index, h) {
    var out = {};
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.sucked || (b.held && !b.detachPhase)) continue;
      var rider = b.climb;
      var mass = rider && b.def.attrs && b.def.attrs.towermass != null
        ? Math.trunc(b.def.towermass) : b.mass;
      fieldForces(this.fields, b, mass, h, out);
      b.angVel *= out.spin;
      if (!rider) {
        ax[i] += out.x / b.mass;
        ay[i] += out.y / b.mass;
        continue;
      }
      var a = rider.s.a, z = rider.s.b, ia = index.get(a), iz = index.get(z);
      ax[ia] += (1 - rider.t) * out.x / a.mass;
      ay[ia] += (1 - rider.t) * out.y / a.mass;
      ax[iz] += rider.t * out.x / z.mass;
      ay[iz] += rider.t * out.y / z.mass;
    }
  };

  ODEWorld.prototype.applySceneFields = function (h) {
    var bodies = this.bodySys.bodies, out = {};
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      fieldForces(this.fields, b, b.mass, h, out);
      var delta = h * TICKS_PER_UNIT * TICKS_PER_UNIT / b.mass;
      b.vx += out.x * delta;
      b.vy += out.y * delta;
      b.w *= out.spin;
    }
  };

  ODEWorld.prototype.pickCandidate = function (x, y) {
    var best = null, bestDistance = Infinity;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i], s = dynamicShape(b);
      if (!s || b.sucked || (b.strandCount > 0 && !b.def.detachable) || b.sleeping || !b.def.draggable) continue;
      var hitDistance;
      if (s.kind === 'circle') hitDistance = Math.hypot(x - s.x, y - s.y) - s.radius;
      else {
        var dx = x - s.x, dy = y - s.y;
        var lx = Math.abs(dx * s.ux + dy * s.uy) - s.hx;
        var ly = Math.abs(dx * s.vx + dy * s.vy) - s.hy;
        hitDistance = Math.hypot(Math.max(0, lx), Math.max(0, ly));
        if (lx <= 0 && ly <= 0) hitDistance = Math.max(lx, ly);
      }
      var centerDistance = Math.hypot(x - b.x, y - b.y);
      if (hitDistance <= P.pickSlack && centerDistance < bestDistance) { best = b; bestDistance = centerDistance; }
    }
    return best;
  };

  ODEWorld.prototype.moveHeld = function (b, tx, ty) {
    var x = b.x, y = b.y, dx = tx - x, dy = ty - y;
    var initial = dynamicShape(b), extent = initial ? boundRadius(initial) : 4;
    var steps = Math.min(200, Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(2, extent * 0.35))));
    var sx = dx / steps, sy = dy / steps;
    for (var n = 0; n < steps; n++) {
      x += sx; y += sy; b.x = x; b.y = y;
      for (var it = 0; it < 4; it++) {
        var moved = false, shape = dynamicShape(b);
        for (var j = 0; j < this.statics.length; j++) {
          var contacts = staticManifold(shape, this.statics[j]);
          if (!contacts.length) continue;
          var c = contacts.reduce(function (p, q) { return q.pen > p.pen ? q : p; });
          if (c.pen > 0) { x += c.nx * c.pen; y += c.ny * c.pen; b.x = x; b.y = y; moved = true; }
        }
        if (!moved) break;
      }
    }
  };
  function walkingMotors(balls, bm, h) {
    var motors = [];
    balls.forEach(function (b) {
      var ob = bm.map.get(b);
      b.walkDrive = !!(ob.invI && !b.sleeping && !b.held && !b.hovered && !b.strandCount && b.onGround && b.def.walkspeed);
      if (!b.walkDrive) return;
      var target = -b.ai.dir * b.def.walkspeed * P.walkSpeedScale * b.ai.speedMul;
      var limit = WOG.num(b.def.attrs && b.def.attrs.walkforce, 200) * TICKS_PER_UNIT * TICKS_PER_UNIT * h;
      motors.push({ body: ob, target: target, limit: limit, impulse: 0 });
    });
    return motors;
  }

  function solveMotor(motor) {
    var b = motor.body, old = motor.impulse;
    motor.impulse = Math.max(-motor.limit, Math.min(motor.limit, old + (motor.target - b.w) / b.invI));
    b.w += (motor.impulse - old) * b.invI;
  }

  ODEWorld.prototype._materialPair = function (a, b) {
    if (!a && !b) return { friction: 0, bounce: 0.4, minbouncevel: 10 };
    a = a || b;
    b = b || a;
    function threshold(m) { return m.bounceminvel == null ? (m.minbouncevel || 0) : m.bounceminvel; }
    return { friction: Math.min(a.friction, b.friction), bounce: Math.min(a.bounce, b.bounce),
      minbouncevel: Math.max(threshold(a), threshold(b)) };
  };

  function ballMaterial(world, b) {
    return world.materials[b.def.attrs && b.def.attrs.material] || null;
  }

  function ballsCollide(a, b) {
    if (a.climb || b.climb || a.held || b.held) return false;
    if (a.strandCount && b.strandCount) {
      return boolAttr(a.def.attrs.collideattached, false) || boolAttr(b.def.attrs.collideattached, false);
    }
    if (a.strandCount || b.strandCount) {
      return boolAttr((a.strandCount ? b : a).def.attrs.collidewithattached, false);
    }
    return true;
  }

  ODEWorld.prototype._bodyMap = function () {
    var map = new Map(), list = [], solver = this.ode;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i], ob = solver.body(b, fixed(b));
      map.set(b, ob); list.push(ob);
    }
    return { map: map, list: list };
  };

  ODEWorld.prototype._contact = function (a, b, n, mat, key, px, py, soft) {
    return {
      a: a, b: b, nx: n.nx, ny: n.ny,
      penetration: n.pen, mu: mat.friction,
      bounce: mat.bounce, bounceVel: mat.minbouncevel * TICKS_PER_UNIT, key: key,
      normalCFM: soft ? 0.001 / TICKS_PER_UNIT : null,
      px: px, py: py
    };
  };

  ODEWorld.prototype._generateContacts = function (bm, load) {
    var rows = [], balls = this.balls, i, j, b, mat, shape, contacts;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      shape = dynamicShape(b);
      if (!shape || b.climb || (b.held && !b.detachPhase) || (fixed(b) && !b.stick && !b.odeDisabled)) continue;
      var mayStick = P.stickEnabled && !b.stick && canStick(b);
      for (j = 0; j < this.statics.length; j++) {
        var g = this.statics[j];
        contacts = staticManifold(shape, g);
        if (!contacts.length) continue;
        var full = this.material(g.material);
        var deepest = contacts.reduce(function (p, q) { return q.pen > p.pen ? q : p; });
        var strength = Math.max(full.stickiness || 0, intrinsicSticky(b) ? 999999 : 0);
        var tags = (g.tag || '').split(',');
        if (mayStick && strength > 0 && load[i] <= strength && tags.indexOf('detaching') < 0 &&
            (tags.indexOf('mostlydeadly') < 0 || boolAttr(b.def.attrs.invulnerable, false))) {
          b.x += deepest.nx * deepest.pen; b.y += deepest.ny * deepest.pen;
          var anchorBody = bm.map.get(b);
          anchorBody.x = b.x; anchorBody.y = b.y;
          b.vx = b.vy = b.angVel = anchorBody.vx = anchorBody.vy = anchorBody.w = 0;
          b.stick = { x: b.x, y: b.y, S: strength };
          bm.map.get(b).invMass = bm.map.get(b).invI = 0;
          if (deepest.ny > 0.5) { b.onGround = true; b.groundN = [deepest.nx, deepest.ny]; }
          break;
        }
        mat = this._materialPair(full, ballMaterial(this, b));
        for (var ci = 0; ci < contacts.length && ci < 4; ci++) {
          var sc = contacts[ci];
          rows.push(this._contact(bm.map.get(b), null, sc, mat,
            's:' + b.id + ':' + j + ':' + sc.feature, sc.px, sc.py, g.kind !== 'line' || boolAttr(b.def.attrs.stacking, false)));
          if (sc.ny > 0.35) { b.onGround = true; b.groundN = [sc.nx, sc.ny]; }
        }
      }
    }

    for (i = 0; i < balls.length; i++) for (j = i + 1; j < balls.length; j++) {
      var lo = balls[i], hi = balls[j];
      var loShape = dynamicShape(lo), hiShape = dynamicShape(hi);
      if (!loShape || !hiShape || !ballsCollide(lo, hi)) continue;
      var dx = hi.x - lo.x, dy = hi.y - lo.y, rr = boundRadius(loShape) + boundRadius(hiShape);
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      contacts = manifold(hiShape, loShape);
      if (!contacts.length) continue;
      var relativeWakeSpeed = Math.hypot(hi.vx - lo.vx, hi.vy - lo.vy);
      if (relativeWakeSpeed > 0.05) {
        if (lo.odeDisabled && !hi.odeDisabled) { lo.odeDisabled = false; lo.odeQuietSteps = 0; wakeSolverBody(bm.map.get(lo), lo); }
        if (hi.odeDisabled && !lo.odeDisabled) { hi.odeDisabled = false; hi.odeQuietSteps = 0; wakeSolverBody(bm.map.get(hi), hi); }
      }
      var rvn = contacts.reduce(function (v, c) { return Math.min(v, normalSpeed(hi, lo, c)); }, Infinity);
      var impact = (lo.fast || hi.fast) && !lo.strandCount && -rvn > P.hitMinSpeed;
      mat = this._materialPair(ballMaterial(this, lo), ballMaterial(this, hi));
      for (ci = 0; ci < contacts.length && ci < 4; ci++) {
        var bc = contacts[ci];
        rows.push(this._contact(bm.map.get(hi), bm.map.get(lo), bc, mat,
          'b:' + lo.id + ':' + hi.id + ':' + bc.feature, bc.px, bc.py, boolAttr(lo.def.attrs.stacking, false) || boolAttr(hi.def.attrs.stacking, false)));
        if (bc.ny > 0.35) { hi.onGround = true; hi.groundN = [bc.nx, bc.ny]; }
        else if (bc.ny < -0.35) { lo.onGround = true; lo.groundN = [-bc.nx, -bc.ny]; }
      }
      if (impact) { lo.fast = hi.fast = true; this.hitSound(lo); this.hitSound(hi); }
    }
    return rows;
  };

  ODEWorld.prototype._sceneContacts = function (bm, rows) {
    var world = this, sys = this.bodySys;
    if (!sys || !sys.bodies.length) return;
    sys.bodies.forEach(function (body) {
      body.invMass = body.im; body.invI = body.ii;
      body.impactVX = body.vx; body.impactVY = body.vy; body.impactW = body.w;
    });
    sys.collect(function (s, a, t, b) {
      var contacts = staticManifold(staticShape(s), t);
      if (!contacts.length) return;
      var mat = world._materialPair(world.material(s.material), world.material(t.material));
      var target = b ? 'm' + t.contactId : 's' + world.statics.indexOf(t);
      contacts.forEach(function (c) {
        rows.push(world._contact(a, b, c, mat, 'm' + s.contactId + ':' + target + ':' + c.feature, c.px, c.py, true));
      });
    });
    this.balls.forEach(function (ball) {
      if (ball.climb || (ball.held && !ball.detachPhase)) return;
      var shape = dynamicShape(ball);
      if (!shape) return;
      var radius = boundRadius(shape), ob = bm.map.get(ball);
      sys.shapes.forEach(function (s) {
        var reach = s.br + radius;
        if (Math.abs(shape.x - s.x) > reach || Math.abs(shape.y - s.y) > reach) return;
        var contacts = manifold(shape, staticShape(s));
        if (!contacts.length) return;
        if (ball.odeDisabled && !immobile(ball)) {
          ball.odeDisabled = false; ball.odeQuietSteps = 0;
          wakeSolverBody(ob, ball);
        }
        var mat = world._materialPair(ballMaterial(world, ball), world.material(s.material));
        contacts.forEach(function (c) {
          rows.push(world._contact(ob, s.body, c, mat, 'g' + ball.id + ':m' + s.contactId + ':' + c.feature, c.px, c.py, true));
          if (c.ny > 0.35) { ball.onGround = true; ball.groundN = [c.nx, c.ny]; }
        });
      });
    });
  };

  ODEWorld.prototype.step = function (h) {
    var balls = this.balls, i, s, a, b, shape, contacts;
    var ax = new Array(balls.length), ay = new Array(balls.length);
    for (i = 0; i < balls.length; i++) { ax[i] = ay[i] = 0; }
    var index = new Map();
    balls.forEach(function (ball, q) { index.set(ball, q); });
    this.applyNativeFields(ax, ay, index, h);

    for (i = 0; i < this.strands.length; i++) {
      s = this.strands[i]; a = s.a; b = s.b;
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      s.atTensionLimit = false;
      if (len === 0) continue;
      var nx = dx / len, ny = dy / len;
      var extension = len - s.rest;
      if (s.def.type === 'rope' && extension <= 0) continue;
      var maxForce = s.def.maxforce > 0 ? s.def.maxforce * P.maxForceScale : Infinity;
      var force = Math.max(-maxForce, Math.min(maxForce, extension * s.k * P.springScale));
      s.atTensionLimit = maxForce > 0 && force >= maxForce;
      var dvx = (b.vx - a.vx) / TICKS_PER_UNIT, dvy = (b.vy - a.vy) / TICKS_PER_UNIT;
      var speed = Math.hypot(dvx, dvy);
      var gain = s.def.dampfac * P.dampScale * Math.abs(dvx * nx + dvy * ny);
      if (speed > 0) gain = Math.min(gain, 0.15 * Math.abs(force) / speed);
      var fx = force * nx + gain * dvx, fy = force * ny + gain * dvy;
      var ia = index.get(a), ib = index.get(b);
      ax[ia] += fx / a.mass; ay[ia] += fy / a.mass;
      ax[ib] -= fx / b.mass; ay[ib] -= fy / b.mass;
    }

    if (this.held) {
      b = this.held;
      if (b.pendingTorque) {
        b.angVel += b.pendingTorque * h / Math.max(1e-6, bodyInertia(b));
        b.pendingTorque = 0;
      }
      if (!b.detachPhase) b.angle += 2 * Math.atan(b.angVel * h / 2);
    }

    var load = new Array(balls.length);
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      load[i] = Math.hypot(ax[i], ay[i]) * b.mass * P.stickForceScale;
      if (b.stick && (!P.stickEnabled || !canStick(b) || load[i] > b.stick.S)) b.stick = null;
      if (b.odeDisabled && (b.held || b.climb || b.strandCount || (b.onGround && b.def.walkspeed))) {
        b.odeDisabled = false; b.odeQuietSteps = 0;
      }
    }

    var bm = this._bodyMap();
    var motors = walkingMotors(balls, bm, h);
    for (i = 0; i < balls.length; i++) balls[i].onGround = false;
    var contacts = this._generateContacts(bm, load);
    this._sceneContacts(bm, contacts);
    var forceStep = h * TICKS_PER_UNIT * TICKS_PER_UNIT;
    for (i = 0; i < balls.length; i++) {
      var ob = bm.list[i];
      if (ob.invMass) { ob.vx += ax[i] * forceStep; ob.vy += ay[i] * forceStep; }
      else { ob.vx = ob.vy = ob.w = 0; }
    }
    var sys = this.bodySys;
    if (sys && sys.bodies.length) this.applySceneFields(h);
    this.ode.iterations = P.odeIterations;
    this.ode.sor = P.odeSOR;
    this.ode.erp = P.odeERP;
    this.ode.cfm = P.odeCFM / TICKS_PER_UNIT;
    this.ode.warmStart = P.odeWarmStart;
    this.ode.slop = P.odeContactSlop;
    this.ode.maxBias = P.odeMaxBias > 0 ? P.odeMaxBias : Infinity;
    if (sys) sys.prepareJoints();
    var solveJoints = (motors.length || (sys && sys.joints.length)) ? function () {
      for (var j = 0; sys && j < sys.joints.length; j++) sys.solveJoint(sys.joints[j], h);
      for (var m = 0; m < motors.length; m++) solveMotor(motors[m]);
    } : null;
    this.ode.quickStep(bm.list.filter(function (ob) { return !ob.source.held || ob.source.detachPhase; }), contacts, h, solveJoints);

    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.stick) { b.x = b.stick.x; b.y = b.stick.y; b.vx = b.vy = 0; continue; }
      if (fixed(b)) continue;
      b.x += b.vx * h; b.y += b.vy * h;
      b.angle += 2 * Math.atan(b.angVel * h / 2);
      if (b.strandCount === 0) this.tryGrab(b);
    }

    for (var posIt = 0; posIt < P.odePositionIterations; posIt++) {
      for (i = 0; i < balls.length; i++) for (var pi = i + 1; pi < balls.length; pi++) {
        var pa = balls[i], pb = balls[pi];
        if (!ballsCollide(pa, pb)) continue;
        var psa = dynamicShape(pa), psb = dynamicShape(pb);
        if (!psa || !psb) continue;
        var pbr = boundRadius(psa) + boundRadius(psb);
        if (Math.abs(pb.x - pa.x) > pbr || Math.abs(pb.y - pa.y) > pbr) continue;
        var pm = manifold(psb, psa);
        if (!pm.length) continue;
        var pc = pm.reduce(function (p, q) { return q.pen > p.pen ? q : p; });
        var corr = Math.max(0, pc.pen - P.odeContactSlop);
        var ima = fixed(pa) ? 0 : 1 / pa.mass, imb = fixed(pb) ? 0 : 1 / pb.mass, isum = ima + imb;
        if (!(corr > 0) || !(isum > 0)) continue;
        pa.x -= pc.nx * corr * ima / isum; pa.y -= pc.ny * corr * ima / isum;
        pb.x += pc.nx * corr * imb / isum; pb.y += pc.ny * corr * imb / isum;
        if (pc.ny > 0.35) { pb.onGround = true; pb.groundN = [pc.nx, pc.ny]; }
        else if (pc.ny < -0.35) { pa.onGround = true; pa.groundN = [-pc.nx, -pc.ny]; }
      }
    }


    if (P.odePositionIterations > 0) {
      for (i = 0; i < balls.length; i++) {
        b = balls[i];
        shape = dynamicShape(b);
        if (fixed(b) || !shape) continue;
        for (var j = 0; j < this.statics.length; j++) {
          contacts = staticManifold(shape, this.statics[j]);
          if (!contacts.length) continue;
          var c = contacts.reduce(function (p, q) { return q.pen > p.pen ? q : p; });
          var push = Math.max(0, c.pen - P.odeContactSlop);
          b.x += c.nx * push; b.y += c.ny * push;
          shape.x = b.x; shape.y = b.y;
          if (c.ny > 0.35) { b.onGround = true; b.groundN = [c.nx, c.ny]; }
        }
      }
    }

    if (sys && sys.bodies.length) {
      sys.bodies.forEach(function (body) {
        body.x += body.vx * h; body.y += body.vy * h;
        body.a += 2 * Math.atan(body.w * h / 2);
      });
      sys.sync();
      if (this.level.strandgeom) { this.strandsVsBodies(); sys.sync(); }
    }
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      var autoDisable = b.def.attrs && boolAttr(b.def.attrs.autodisable, false);
      if (!autoDisable || b.held || b.climb || b.stick || b.strandCount > 0) {
        b.odeDisabled = false; b.odeQuietSteps = 0;
      } else if (Math.hypot(b.vx, b.vy) <= 0.05 * TICKS_PER_UNIT && Math.abs(b.angVel) <= 0.01 * TICKS_PER_UNIT) {
        b.odeQuietSteps++;
        if (b.odeQuietSteps >= 20) { b.odeDisabled = true; b.vx = b.vy = b.angVel = 0; }
      } else {
        b.odeDisabled = false; b.odeQuietSteps = 0;
      }
    }
    this.stepCount++;
  };

  var basePickup = WOG.World.prototype.pickup;
  ODEWorld.prototype.pickup = function (x, y) {
    var b = basePickup.call(this, x, y);
    if (b) { b.odeDisabled = false; b.odeQuietSteps = 0; }
    return b;
  };

  var baseRelease = WOG.World.prototype.release;
  ODEWorld.prototype.release = function () {
    var b = this.held;
    baseRelease.call(this);
    if (b) { b.odeDisabled = false; b.odeQuietSteps = 0; }
  };

  ODEWorld.prototype.frameUpdate = function () {
    var broken = new Set();
    for (var i = this.strands.length - 1; i >= 0; i--) {
      var s = this.strands[i];
      s.overloadTicks = s.atTensionLimit ? (s.overloadTicks || 0) + 1 : 0;
      if (s.overloadTicks > 50) {
        broken.add(s);
        this.strands.splice(i, 1);
        s.a.strandCount--; s.b.strandCount--;
        continue;
      }
      var min = s.def.minlen, max = s.def.shrinklen == null ? s.def.maxlen2 : s.def.shrinklen;
      var below = min - s.rest, above = s.rest - max;
      if (below > 0) s.rest = below >= 1 ? s.rest + Math.min(P.restRate, below * 0.02) : min;
      else if (above > 0) s.rest = above >= 1 ? s.rest - Math.min(P.restRate, above * 0.02) : max;
      s.k = WOG.World.springConstant(s.def, s.rest);
    }
    if (broken.size) {
      this.balls.forEach(function (b) {
        if (b.climb && broken.has(b.climb.s)) {
          b.climb = null;
          b.state = 'falling';
        }
        if (!b.strandCount && b.state === 'attached') b.state = 'falling';
      });
      this.refreshMasses();
    }
  };

  WOG.ODEWorld = ODEWorld;
})();
