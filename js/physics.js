(function () {
  var P = WOG.PHYS = {
    enabled: true,
    timeScale: 8,
    gravityScale: 1,
    fieldDampScale: 0.125,
    subStep: 0.01,
    correction: 0.1,
    springScale: 3,
    dampScale: 1.5,
    maxForceScale: 3,
    towerMassScale: 0.6,
    restRate: 0.1,
    dampMax: 0.3,
    walkMaterial: { friction: 0, bounce: 0, minbouncevel: 100, stickiness: 0 },
    freeMaterial: { friction: 1, bounce: 0, minbouncevel: 100, stickiness: 0 },
    walkSpeedScale: 60,
    aiWalk: [2, 8],
    jumpRange: 100,
    defaultWakeDist: 100,
    jumpMaxSpeed: 40,
    jumpCooldown: 6,
    grabBlendTime: 1.2,
    grabDist: 10,
    climbSpeedScale: 5,
    aiNear: 60,
    aiTowardChance: 0.8,
    aiGoalChance: 0.6,
    aiClimbGoal: 0.7,
    antigravScale: 0.2,
    useTowerMass: true,
    throwMaxSpeed: 300,
    dragRadiusExtra: 40,
    detachNudge: 8,
    minTargetAngle: 20,
    bridgeGapField: 'maxlen1',
    attachBlockMargin: 6,
    bridgeSegDist: 30,
    dragTorque: 20,
    pickSlack: 10,
    wakeByAttached: false,
    thwackMinSpeed: 60,
    grabBuffer: 50,
    grabMargin: 15,
    hitMinSpeed: 30,
    thwackKick: 0.25,
    thwackMaxKick: 30,
    thwackBounce: 0.35,
    pinBounce: 0.8,
    landMinSpeed: 30,
    hitSoundGap: 2,
    freeBounce: true,
    freeBounceMinVel: 0,
    ballBounce: 0.4,
    ballBounceMinVel: 10,
    defaultMaterialId: 'rock',
    defaultMaterial: { friction: 4, bounce: 0.5, minbouncevel: 0.05, stickiness: 0 },
    stickEnabled: true,
    stickyAttached: true,
    stickyUnattached: false,
    stickForceScale: 1,
    stickMargin: 1.5
  };

  WOG.loadMaterials = async function (url) {
    var doc = await WOG.fetchXML(url || 'properties/materials.xml.xml');
    var m = {};
    WOG.children(doc.documentElement).forEach(function (el) {
      if (el.tagName !== 'material') return;
      m[WOG.attr(el, 'id')] = {
        friction: WOG.num(WOG.attr(el, 'friction')),
        bounce: WOG.num(WOG.attr(el, 'bounce')),
        minbouncevel: WOG.num(WOG.attr(el, 'minbouncevel')),
        stickiness: WOG.num(WOG.attr(el, 'stickiness'))
      };
    });
    return m;
  };

  function World(game, materials) {
    this.balls = game.balls;
    this.strands = game.strands;
    this.materials = materials || {};
    this.statics = [];
    this.stopSigns = [];
    this.skipped = {};
    var self = this;
    game.data.scene.geometry.forEach(function (g) {
      if (!g.static) { self.skipped[g.kind + '(dynamic)'] = (self.skipped[g.kind + '(dynamic)'] || 0) + 1; return; }
      if (g.tag === 'stopsign') { self.stopSigns.push(g); return; }
      self.statics.push(g);
    });
    this.fields = game.data.scene.forcefields;
    this.level = game.data.level;
    this.bodySys = WOG.BodySystem ? new WOG.BodySystem(this, game.data.scene) : null;
    this.bodyShapes = this.bodySys ? this.bodySys.shapes : [];
    this.simTime = 0;
    this.stepCount = 0;
    this.mouse = { x: 0, y: 0 };

    this.balls.forEach(function (b) {
      b.vx = 0; b.vy = 0;
      b.onGround = false; b.groundN = [0, 1];
      b.climb = null; b.jumping = null; b.jumpCool = 0; b.wakeJump = false;
      b.held = false; b.pendingTorque = 0; b.angVel = 0;
      b.fast = false; b.fastGround = 0; b.released = false; b.peakFall = 0; b.soundT = -99;
      b.stick = null;
      b.ai = { mode: 'walk', until: 0, dir: 1, speedMul: 1, rand: WOG.rng(b.id * 7 + 555) };
      b.ai.dir = b.ai.rand() < 0.5 ? -1 : 1;
      b.ai.speedMul =1 + (b.ai.rand() * 2 - 1) * (b.def.attrs && b.def.attrs.speedvariance ? WOG.num(b.def.attrs.speedvariance) : 0);
      b.mass = b.def.mass || 1;
      var at = b.def.attrs || {};
      b.antigrav = at.antigrav != null ? WOG.num(at.antigrav) : 0;
      b.airDamp = at.dampening != null ? WOG.num(at.dampening) : 0;
    });
    this.strands.forEach(function (s) {
      s.rest = dist(s.a, s.b);
      s.k = springConst(s.def, s.rest);
    });
    this.refreshMasses();
  }

  function segPoint(A, B, px, py) {
    var dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
    var t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((px - A.x) * dx + (py - A.y) * dy) / L2)) : 0;
    var x = A.x + dx * t, y = A.y + dy * t;
    return { x: x, y: y, t: t, d: Math.sqrt((px - x) * (px - x) + (py - y) * (py - y)) };
  }
  function dist(a, b) { var dx = b.x - a.x, dy = b.y - a.y; return Math.sqrt(dx * dx + dy * dy); }
  function springConst(def, rest) {
    var span = (def.maxlen2 - def.minlen) || 1;
    var t = Math.max(0, Math.min(1, (rest - def.minlen) / span));
    return t * (def.springconstmax - def.springconstmin) + def.springconstmin;
  }

  World.prototype.refreshMasses = function () {
    this.balls.forEach(function (b) {
      var d = b.def;
      if (b.held && !b.detachPhase) b.mass = d.dragmass || d.mass || 1;
      else b.mass = (P.useTowerMass && b.strandCount > 0 && d.towermass > 0) ? d.towermass * P.towerMassScale : (d.mass || 1);
    });
  };

  World.prototype.pickCandidate = function (x, y) {
    var best = null, bd = Infinity;
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.radius <= 0 || b.sucked || (b.strandCount > 0 && !b.def.detachable) || b.sleeping || !b.def.draggable) continue;
      var d = Math.sqrt((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y));
      if (d <= b.radius + P.pickSlack && d < bd) { bd = d; best = b; }
    }
    return best;
  };
  World.prototype.setHover = function (x, y) {
    var h = (x == null || this.held) ? null : this.pickCandidate(x, y);
    if (this.hover && this.hover !== h) this.hover.hovered = false;
    if (h && h !== this.hover) this.sound(h, 'marker');
    this.hover = h;
    if (h) h.hovered = true;
  };
  World.prototype.pickup = function (x, y) {
    if (this.held) return null;
    var best = this.pickCandidate(x, y);
    if (!best) return null;
    best.hovered = false; this.hover = null;
    best.detaching = best.strandCount > 0;
    best.detachPhase = null;
    var pullEv = 'pickup';
    if (best.detaching) {
      var ds = best.def.detachStrand;
      if (ds && ds.maxlen > 0) { best.detachPhase = { ox: best.x, oy: best.y, cx: x, cy: y, px: 0, py: 0, lx: 0, ly: 0, pull: 0, maxlen: ds.maxlen }; if (best.def.sounds.detaching) pullEv = 'detaching'; }
      else { this.detach(best); if (best.def.sounds.detached) pullEv = 'detached'; }
    }
    best.held = true; best.climb = null; best.jumping = null; best.wakeJump = false;
    best.vx = 0; best.vy = 0; best.onGround = false; best.state = 'dragging';
    best.fast = false; best.released = false; best.peakFall = 0; best.fastGround = 0;
    this.refreshMasses();
    best.pendingTorque = (best.ai.rand() < 0.5 ? -1 : 1) * best.mass * P.dragTorque;
    this.held = best;
    this.mouse.x = x; this.mouse.y = y;
    if (!best.detachPhase) this.moveHeld(best, x, y);
    this.dragStrands = best.detachPhase ? [] : this.dragTargets(best);
    this.sound(best, pullEv);
    return best;
  };

  World.prototype.detach = function (b) {
    var strands = this.strands, gone = [], i;
    for (i = strands.length - 1; i >= 0; i--) {
      var s = strands[i];
      if (s.a !== b && s.b !== b) continue;
      (s.a === b ? s.b : s.a).strandCount--;
      gone.push(s); strands.splice(i, 1);
    }
    b.strandCount = 0;
    var loose = function (o) { o.climb = null; o.jumping = null; o.wakeJump = false; o.state = 'falling'; o.ai.until = 0; o.onGround = false; o.fast = false; o.released = false; };
    for (i = 0; i < this.balls.length; i++) {
      var o = this.balls[i];
      if (o === b) continue;
      if (o.climb && gone.indexOf(o.climb.s) >= 0) loose(o);
      else if (o.strandCount <= 0 && gone.some(function (g) { return g.a === o || g.b === o; })) { o.strandCount = 0; loose(o); }
    }
    return gone.length;
  };

  function segHitsStatic(g, x1, y1, x2, y2) {
    if (g.kind === 'circle') {
      var dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
      var t = Math.max(0, Math.min(1, ((g.x - x1) * dx + (g.y - y1) * dy) / L2));
      var px = x1 + dx * t - g.x, py = y1 + dy * t - g.y;
      return px * px + py * py < g.radius * g.radius;
    }
    if (g.kind === 'line') {
      var nl = Math.sqrt(g.normal[0] * g.normal[0] + g.normal[1] * g.normal[1]) || 1, nx = g.normal[0] / nl, ny = g.normal[1] / nl;
      return (x1 - g.anchor[0]) * nx + (y1 - g.anchor[1]) * ny < 0 || (x2 - g.anchor[0]) * nx + (y2 - g.anchor[1]) * ny < 0;
    }
    if (g.kind === 'rectangle') {
      var c = Math.cos(g.rotation || 0), sn = Math.sin(g.rotation || 0);
      var ax = (x1 - g.x) * c + (y1 - g.y) * sn, ay = -(x1 - g.x) * sn + (y1 - g.y) * c;
      var bx = (x2 - g.x) * c + (y2 - g.y) * sn, by = -(x2 - g.x) * sn + (y2 - g.y) * c;
      var hw = g.width / 2, hh = g.height / 2, t0 = 0, t1 = 1, ddx = bx - ax, ddy = by - ay;
      var pp = [-ddx, ddx, -ddy, ddy], qq = [ax + hw, hw - ax, ay + hh, hh - ay];
      for (var k = 0; k < 4; k++) {
        if (Math.abs(pp[k]) < 1e-9) { if (qq[k] < 0) return false; }
        else {
          var r = qq[k] / pp[k];
          if (pp[k] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
          else { if (r < t0) return false; if (r < t1) t1 = r; }
        }
      }
      return true;
    }
    return false;
  }
  World.prototype.strandBlocked = function (x1, y1, x2, y2) {
    for (var i = 0; i < this.statics.length; i++) if (segHitsStatic(this.statics[i], x1, y1, x2, y2)) return true;
    for (i = 0; i < this.bodyShapes.length; i++) if (segHitsStatic(this.bodyShapes[i], x1, y1, x2, y2)) return true;
    return false;
  };

  World.prototype.connected = function (a, b) {
    for (var i = 0; i < this.strands.length; i++) {
      var s = this.strands[i];
      if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return true;
    }
    return false;
  };
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = ax + dx * t - px, qy = ay + dy * t - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function vertexAngle(v, a, b) {
    var ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y;
    var l = Math.sqrt(ax * ax + ay * ay) * Math.sqrt(bx * bx + by * by);
    if (l < 1e-9) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / l))) * 180 / Math.PI;
  }
  function triMinAngle(p, a, b) { return Math.min(vertexAngle(p, a, b), vertexAngle(a, p, b), vertexAngle(b, p, a)); }
  function bridgeOf(arr) { arr.bridge = true; return arr; }

  World.prototype.attachBlocked = function (b) {
    var i, o, m = P.attachBlockMargin, d;
    for (i = 0; i < this.balls.length; i++) {
      o = this.balls[i];
      if (o === b || o.strandCount <= 0 || o.held || o.climb || o.radius <= 0) continue;
      d = Math.sqrt((o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y));
      if (d < b.radius + o.radius + m) return true;
    }
    for (i = 0; i < this.strands.length; i++) {
      var s = this.strands[i];
      if (s.a === b || s.b === b || s.a.removed || s.b.removed) continue;
      if (segDist(b.x, b.y, s.a.x, s.a.y, s.b.x, s.b.y) < b.radius + m) return true;
    }
    return false;
  };
  World.prototype.dragTargets = function (b) {
    var def = b.def, sd = def.strand, need = def.strands || 0;
    if (!sd || need < 1) return [];
    if (this.attachBlocked(b)) return [];
    var R = sd.maxlen1 + P.dragRadiusExtra, c = [], i, o;
    for (i = 0; i < this.balls.length; i++) {
      o = this.balls[i];
      if (o === b || o.strandCount <= 0 || o.held || o.climb || o.radius <= 0) continue;
      var d = Math.sqrt((o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y));
      if (d < R) c.push({ o: o, d: d });
    }
    c.sort(function (p, q) { return p.d - q.d; });
    c = c.slice(0, 4).filter(function (e) { return !this.strandBlocked(b.x, b.y, e.o.x, e.o.y); }, this);
    if (!c.length) return [];
    if (need === 1) return [c[0].o];
    var first = c[0].o, out = [first];
    if (need === 2) {
      var gap = sd[P.bridgeGapField]; if (gap == null) gap = sd.minlen;
      for (i = 1; i < c.length; i++) {
        o = c[i].o;
        if (dist(first, o) < gap && !this.connected(first, o) && segDist(b.x, b.y, first.x, first.y, o.x, o.y) < P.bridgeSegDist) return bridgeOf([first, o]);
      }
      for (i = 1; i < c.length; i++) {
        o = c[i].o;
        if (this.connected(first, o)) { if (triMinAngle(b, first, o) >= P.minTargetAngle) return [first, o]; }
        else if (dist(first, o) < gap) return bridgeOf([first, o]);
      }
      return [];
    }
    for (i = 1; i < c.length && out.length < need; i++) out.push(c[i].o);
    return out.length >= 2 ? out : [];
  };

  World.prototype.removeBall = function (b) {
    var i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
    b.removed = true; b.held = false; b.vx = 0; b.vy = 0;
    if (this.hover === b) this.hover = null;
    if (this.held === b) this.held = null;
  };

  World.prototype.release = function () {
    var b = this.held;
    if (!b) return;
    if (b.detachPhase) {
      b.x -= b.detachPhase.lx; b.y -= b.detachPhase.ly;
      b.detachPhase = null; b.detaching = false; b.held = false; b.angVel = 0; b.pendingTorque = 0; b.state = 'attached';
      this.held = null; this.dragStrands = [];
      this.refreshMasses();
      return;
    }
    var targets = this.dragStrands || [];
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    b.held = false; b.angVel = 0; b.pendingTorque = 0; b.detaching = false;
    this.held = null; this.dragStrands = [];
    if (targets.length === 2 && targets.bridge) {
      var t0 = targets[0], t1 = targets[1], bs = { a: t0, b: t1, def: b.def.strand };
      bs.rest = dist(t0, t1); bs.k = springConst(bs.def, bs.rest);
      this.strands.push(bs); t0.strandCount++; t1.strandCount++;
      this.removeBall(b);
      this.refreshMasses();
      this.sound(b, 'attach');
    } else if (targets.length) {
      var self = this;
      targets.forEach(function (o) {
        var s = { a: b, b: o, def: b.def.strand };
        s.rest = dist(b, o); s.k = springConst(s.def, s.rest);
        self.strands.push(s); b.strandCount++; o.strandCount++;
      });
      b.vx = 0; b.vy = 0; b.climb = null; b.jumping = null; b.state = 'attached'; b.fast = false; b.released = false;
      this.refreshMasses();
      this.sound(b, 'attach');
    } else {
      b.state = 'falling'; b.ai.until = 0;
      b.fast = speed >= P.thwackMinSpeed;
      b.fastGround = 0; b.released = true; b.peakFall = 0;
      this.refreshMasses();
      this.sound(b, speed < 5 ? 'drop' : 'throw');
    }
    if (this.onDrop) this.onDrop(b, targets);
  };

  World.prototype.sound = function (b, ev) { if (this.playSound) this.playSound(b, ev); };

  World.prototype.material = function (id) {
    return (id && this.materials[id]) || this.materials[P.defaultMaterialId] || P.defaultMaterial;
  };
  function flag(v, dflt) { return v == null ? dflt : String(v).toLowerCase() === 'true'; }
  function canStick(b) {
    if (b.held || b.sleeping || b.climb || b.radius <= 0 || b.sucked) return false;
    var a = (b.def && b.def.attrs) || {}, both = a.sticky != null ? flag(a.sticky, false) : null;
    var sa = a.stickyattached != null ? flag(a.stickyattached, false) : (both != null ? both : P.stickyAttached);
    var su = a.stickyunattached != null ? flag(a.stickyunattached, false) : (both != null ? both : P.stickyUnattached);
    return b.strandCount > 0 ? sa : su;
  }
  World.prototype.freeSurface = function (b, matId) {
    var base = b.walkDrive ? P.walkMaterial : P.freeMaterial;
    if (!P.freeBounce) return base;
    var m = this.material(matId);
    return { friction: base.friction, bounce: m.bounce || 0, minbouncevel: P.freeBounceMinVel, stickiness: 0 };
  };

  function contact(g, x, y, r) {
    var dx, dy, d, s;
    if (g.kind === 'circle') {
      dx = x - g.x; dy = y - g.y; d = Math.sqrt(dx * dx + dy * dy);
      var pen = g.radius + r - d;
      if (pen <= 0) return null;
      if (d < 1e-6) return { nx: 0, ny: 1, pen: pen };
      return { nx: dx / d, ny: dy / d, pen: pen };
    }
    if (g.kind === 'line') {
      var nx = g.normal[0], ny = g.normal[1], nl = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nl; ny /= nl;
      s = (x - g.anchor[0]) * nx + (y - g.anchor[1]) * ny;
      if (s >= r) return null;
      return { nx: nx, ny: ny, pen: r - s };
    }
    if (g.kind === 'rectangle') {
      var c = Math.cos(g.rotation || 0), sn = Math.sin(g.rotation || 0);
      dx = x - g.x; dy = y - g.y;
      var lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
      var hw = g.width / 2, hh = g.height / 2;
      var cx = Math.max(-hw, Math.min(hw, lx)), cy = Math.max(-hh, Math.min(hh, ly));
      var ex = lx - cx, ey = ly - cy, e2 = ex * ex + ey * ey, lnx, lny, p2;
      if (e2 > 1e-9) {
        d = Math.sqrt(e2);
        if (d >= r) return null;
        lnx = ex / d; lny = ey / d; p2 = r - d;
      } else {
        var ox = hw - Math.abs(lx), oy = hh - Math.abs(ly);
        if (ox < oy) { lnx = lx >= 0 ? 1 : -1; lny = 0; p2 = ox + r; }
        else { lnx = 0; lny = ly >= 0 ? 1 : -1; p2 = oy + r; }
      }
      return { nx: lnx * c - lny * sn, ny: lnx * sn + lny * c, pen: p2 };
    }
    return null;
  }
  World.contact = contact;

  function respondStatic(b, n, mat) {
    var vn = b.vx * n.nx + b.vy * n.ny;
    if (vn >= 0) return;
    var e = (-vn > mat.minbouncevel) ? mat.bounce : 0;
    var jn = -(1 + e) * vn;
    b.vx += jn * n.nx; b.vy += jn * n.ny;
    var tx = -n.ny, ty = n.nx;
    var vt = b.vx * tx + b.vy * ty;
    var maxF = mat.friction * jn;
    var dv = Math.max(-maxF, Math.min(maxF, vt));
    b.vx -= dv * tx; b.vy -= dv * ty;
  }

  World.prototype.walkStep = function (h) {
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      b.walkDrive = false;
      if (b.held || b.hovered || b.strandCount > 0 || b.radius <= 0 || b.climb || b.sleeping || !b.onGround) continue;
      b.walkDrive = true;
      var wsp = (b.def.walkspeed || 0) * P.walkSpeedScale * b.ai.speedMul, wacc = (b.def.attrs && b.def.attrs.walkforce ? WOG.num(b.def.attrs.walkforce) : 100) / b.mass;
      var tx0 = b.groundN[1] * b.ai.dir, ty0 = -b.groundN[0] * b.ai.dir;
      var vt0 = b.vx * tx0 + b.vy * ty0, dv0 = Math.max(-wacc * h, Math.min(wacc * h, wsp - vt0));
      b.vx += tx0 * dv0; b.vy += ty0 * dv0;
    }
  };

  World.prototype.checkStopSigns = function (b, t) {
    if (!this.stopSigns.length || !b.onGround) return false;
    var ai = b.ai;
    for (var i = 0; i < this.stopSigns.length; i++) {
      var c = contact(this.stopSigns[i], b.x, b.y, b.radius);
      if (!c) continue;
      var gx = b.groundN[0], gy = b.groundN[1], along = (gy * c.nx - gx * c.ny) * ai.dir;
      if (along < -0.05) {
        ai.dir = -ai.dir;
        ai.until = t + P.aiWalk[0] + ai.rand() * (P.aiWalk[1] - P.aiWalk[0]);
        ai.chkT = t; ai.chkX = b.x;
        return true;
      }
    }
    return false;
  };

  World.prototype.step = function (h) {
    var i, j, a, b, s, balls = this.balls;
    var ax = [], ay = [], sfx = [], sfy = [];
    for (i = 0; i < balls.length; i++) { ax[i] = 0; ay[i] = 0; sfx[i] = 0; sfy[i] = 0; }
    this.applyFields(ax, ay, h);
    var index = new Map(); balls.forEach(function (bb, n) { index.set(bb, n); });

    for (i = 0; i < this.strands.length; i++) {
      s = this.strands[i]; a = s.a; b = s.b;
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-6) continue;
      var F = (L - s.rest) * s.k * P.springScale;
      var mf = s.def.maxforce > 0 ? s.def.maxforce * P.maxForceScale : Infinity;
      F = Math.max(-mf, Math.min(mf, F));
      var ux = dx / L, uy = dy / L, ia = index.get(a), ib = index.get(b);
      ax[ia] += F * ux / a.mass; ay[ia] += F * uy / a.mass;
      ax[ib] -= F * ux / b.mass; ay[ib] -= F * uy / b.mass;
      sfx[ia] += F * ux; sfy[ia] += F * uy; sfx[ib] -= F * ux; sfy[ib] -= F * uy;
    }

    if (this.held) {
      b = this.held;
      if (b.pendingTorque) { b.angVel += b.pendingTorque * h / (0.5 * b.mass * b.radius * b.radius); b.pendingTorque = 0; }
      b.angle += b.angVel * h;
    }

    this.walkStep(h);

    var load = [];
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      load[i] = Math.sqrt(ax[i] * ax[i] + ay[i] * ay[i]) * b.mass * P.stickForceScale;
      if (b.stick && (!P.stickEnabled || !canStick(b) || load[i] > b.stick.S)) b.stick = null;
    }

    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.climb || (b.held && !b.detachPhase)) continue;
      if (b.stick) { b.vx = 0; b.vy = 0; continue; }
      b.vx += ax[i] * h; b.vy += ay[i] * h;
      b.x += b.vx * h; b.y += b.vy * h;
    }

    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b.radius <= 0 || b.climb || (b.held && !b.detachPhase)) continue;
      var attached = b.strandCount > 0, canStk = P.stickEnabled && canStick(b);
      b.onGround = false;
      if (b.stick) {
        b.x = b.stick.x; b.y = b.stick.y; b.vx = 0; b.vy = 0;
        for (j = 0; j < this.statics.length; j++) {
          var c0 = contact(this.statics[j], b.x, b.y, b.radius + P.stickMargin);
          if (c0 && c0.ny > 0.5) { b.onGround = true; b.groundN = [c0.nx, c0.ny]; }
        }
        continue;
      }
      for (j = 0; j < this.statics.length; j++) {
        var sg = this.statics[j], c = contact(sg, b.x, b.y, b.radius);
        if (!c) continue;
        var full = this.material(sg.material);
        if (canStk && full.stickiness > 0 && load[i] <= full.stickiness) {
          b.x += c.nx * c.pen; b.y += c.ny * c.pen; b.vx = 0; b.vy = 0;
          b.stick = { x: b.x, y: b.y, S: full.stickiness };
          if (c.ny > 0.5) { b.onGround = true; b.groundN = [c.nx, c.ny]; }
          break;
        }
        b.x += c.nx * c.pen * P.correction; b.y += c.ny * c.pen * P.correction;
        var mat = attached ? full : this.freeSurface(b, sg.material);
        respondStatic(b, c, mat);
        if (c.ny > 0.5) { b.onGround = true; b.groundN = [c.nx, c.ny]; }
      }
      if (b.onGround) b.angle -= (b.vx * b.groundN[1] - b.vy * b.groundN[0]) / b.radius * h;
      if (!attached) this.tryGrab(b);
    }

    if (this.bodySys && this.bodySys.bodies.length) { this.bodySys.step(h); this.ballVsBodies(h); }

    for (i = 0; i < balls.length; i++) {
      for (j = i + 1; j < balls.length; j++) {
        a = balls[i]; b = balls[j];
        if (a.radius <= 0 || b.radius <= 0) continue;
        var ddx = b.x - a.x, ddy = b.y - a.y, rr = a.radius + b.radius;
        if (Math.abs(ddx) > rr || Math.abs(ddy) > rr) continue;
        var d2 = ddx * ddx + ddy * ddy;
        if (d2 >= rr * rr) continue;
        if (this.joined(a, b)) continue;
        if (a.climb || b.climb || a.held || b.held) continue;
        if ((a.strandCount > 0) !== (b.strandCount > 0)) continue;
        var d = Math.sqrt(d2) || 1e-6, nx = ddx / d, ny = ddy / d, pen = rr - d;
        if (a.strandCount === 0 && b.strandCount === 0) {
          if (ny > 0.5) { b.onGround = true; b.groundN = [nx, ny]; }
          else if (ny < -0.5) { a.onGround = true; a.groundN = [-nx, -ny]; }
        }
        var ima = a.stick ? 0 : 1 / a.mass, imb = b.stick ? 0 : 1 / b.mass, isum = ima + imb;
        if (isum === 0) continue;
        a.x -= nx * pen * P.correction * ima / isum; a.y -= ny * pen * P.correction * ima / isum;
        b.x += nx * pen * P.correction * imb / isum; b.y += ny * pen * P.correction * imb / isum;
        var rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          var e = ((a.fast || b.fast) && a.strandCount === 0 && b.strandCount === 0 && -rvn > P.hitMinSpeed) ? P.pinBounce : 0;
          if (e === 0 && P.freeBounce && a.strandCount === 0 && b.strandCount === 0 && -rvn > P.ballBounceMinVel) e = P.ballBounce;
          if (e > 0) { a.fast = true; b.fast = true; this.hitSound(a); this.hitSound(b); }
          var jimp = -(1 + e) * rvn / isum;
          a.vx -= jimp * ima * nx; a.vy -= jimp * ima * ny;
          b.vx += jimp * imb * nx; b.vy += jimp * imb * ny;
        }
      }
    }
    this.stepCount++;
  };

  World.prototype.applyFields = function (ax, ay, h) {
    for (var q = 0; q < this.balls.length; q++) {
      var bq = this.balls[q];
      if (bq.airDamp > 0 && !(bq.held && !bq.detachPhase)) { var kq = Math.max(0, 1 - bq.airDamp * P.fieldDampScale * h); bq.vx *= kq; bq.vy *= kq; }
    }
    for (var f = 0; f < this.fields.length; f++) {
      var fld = this.fields[f];
      if (fld.enabled === false || fld.geomonly) continue;
      for (var i = 0; i < this.balls.length; i++) {
        var b = this.balls[i], fx = 0, fy = 0;
        if (b.held && !b.detachPhase) continue;
        if (fld.kind === 'linear') {
          if (fld.center && fld.width != null && fld.height != null) {
            if (Math.abs(b.x - fld.center[0]) > fld.width / 2 || Math.abs(b.y - fld.center[1]) > fld.height / 2) continue;
          }
          fx = fld.force[0]; fy = fld.force[1];
        } else if (fld.kind === 'radial') {
          var dx = fld.center[0] - b.x, dy = fld.center[1] - b.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d > fld.radius || d < 1e-6) continue;
          var mag = fld.forceatcenter + (fld.forceatedge - fld.forceatcenter) * (d / fld.radius);
          fx = -mag * dx / d; fy = -mag * dy / d;
        } else continue;
        var k = P.gravityScale / (fld.type === 'gravity' ? 1 : b.mass);
        if (b.antigrav > 0 && fld.antigrav) k *= -b.antigrav * P.antigravScale;
        ax[i] += fx * k; ay[i] += fy * k;
        if (fld.dampeningfactor > 0) {
          var keep = Math.max(0, 1 - fld.dampeningfactor * (fld.water ? 1 : P.fieldDampScale) * h);
          b.vx *= keep; b.vy *= keep;
        }
      }
    }
  };

  World.prototype.goal = function () {
    var lv = this.level;
    if (lv && lv.exit && lv.exit.pos) return { x: lv.exit.pos[0], y: lv.exit.pos[1] };
    if (lv && lv.pipe && lv.pipe.vertices && lv.pipe.vertices.length) return { x: lv.pipe.vertices[0][0], y: lv.pipe.vertices[0][1] };
    return null;
  };
  World.prototype.goalCost = function (x, y, goal) { return goal ? Math.hypot(goal.x - x, goal.y - y) : -y; };

  World.prototype.joined = function (a, b) {
    for (var i = 0; i < this.strands.length; i++) {
      var s = this.strands[i];
      if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return true;
    }
    return false;
  };

  World.prototype.frameUpdate = function () {
    var i, s, a, b;
    for (i = 0; i < this.strands.length; i++) {
      s = this.strands[i]; a = s.a; b = s.b;
      var dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy);
      if (L > 1e-6) {
        var ux = dx / L, uy = dy / L;
        var rv = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
        var dv = Math.min(Math.abs(s.def.dampfac * P.dampScale * rv), P.dampMax * Math.abs(rv)) * (rv > 0 ? 1 : -1);
        var ma = a.mass, mb = b.mass;
        a.vx += ux * dv * mb / (ma + mb); a.vy += uy * dv * mb / (ma + mb);
        b.vx -= ux * dv * ma / (ma + mb); b.vy -= uy * dv * ma / (ma + mb);
      }
      var minlen = s.def.minlen, maxlen = s.def.maxlen2 || s.def.maxlen1;
      var low = minlen - s.rest, high = s.rest - maxlen;
      if (low > 0) s.rest = low >= 1 ? s.rest + Math.min(P.restRate, low * 0.02) : minlen;
      else if (maxlen && high > 0) s.rest = high >= 1 ? s.rest - Math.min(P.restRate, high * 0.02) : maxlen;
      s.k = springConst(s.def, s.rest);
    }
  };

  World.prototype.gravityDown = function () {
    for (var f = 0; f < this.fields.length; f++) {
      var fld = this.fields[f];
      if (fld.kind === 'linear' && fld.type === 'gravity' && fld.enabled !== false) return Math.abs(fld.force[1]) * P.gravityScale || 10;
    }
    return 10;
  };

  World.prototype.climbDir = function (b, st) {
    var r = b.ai.rand;
    if (r() < P.aiClimbGoal) {
      var goal = this.goal(), ca = this.goalCost(st.a.x, st.a.y, goal), cb = this.goalCost(st.b.x, st.b.y, goal);
      if (ca !== cb) return cb < ca ? 1 : -1;
    }
    return r() < 0.5 ? 1 : -1;
  };

  World.prototype.tryGrab = function (b) {
    if (b.radius <= 0 || b.held || b.climb || b.sleeping || b.strandCount > 0) return false;
    if (b.fast && this.thwack(b)) return false;
    var k, st, sp, best = null, o, gm = b.fast ? 0 : P.grabMargin;
    for (k = 0; k < this.strands.length; k++) {
      st = this.strands[k]; sp = segPoint(st.a, st.b, b.x, b.y);
      if (sp.d < b.radius + gm && (!best || sp.d < best.d)) best = { s: st, t: sp.t, x: sp.x, y: sp.y, d: sp.d, dir: this.climbDir(b, st) };
    }
    if (!best) {
      for (k = 0; k < this.balls.length && !best; k++) {
        o = this.balls[k];
        if (o === b || o.strandCount <= 0 || o.radius <= 0) continue;
        var dx = o.x - b.x, dy = o.y - b.y, rr = b.radius + o.radius + gm;
        if (dx * dx + dy * dy >= rr * rr) continue;
        var bs = null, bd = Infinity;
        for (var q = 0; q < this.strands.length; q++) {
          st = this.strands[q]; if (st.a !== o && st.b !== o) continue;
          var oth = st.a === o ? st.b : st.a, dd = (oth.x - b.x) * (oth.x - b.x) + (oth.y - b.y) * (oth.y - b.y);
          if (dd < bd) { bd = dd; bs = st; }
        }
        if (bs) best = { s: bs, t: bs.a === o ? 0 : 1, x: o.x, y: o.y, dir: this.climbDir(b, bs) };
      }
    }
    if (!best) return false;
    b.climb = { s: best.s, t: best.t, dir: best.dir, offX: b.x - best.x, offY: b.y - best.y, age: 0 };
    b.jumping = null; b.wakeJump = false; b.vx = 0; b.vy = 0; b.state = 'climbing';
    return true;
  };

  World.prototype.pushOutStatic = function (x, y, r) {
    for (var it = 0; it < 4; it++) {
      var moved = false;
      for (var j = 0; j < this.statics.length; j++) {
        var c = contact(this.statics[j], x, y, r);
        if (c) { x += c.nx * c.pen; y += c.ny * c.pen; moved = true; }
      }
      for (j = 0; j < this.bodyShapes.length; j++) {
        var cb = contact(this.bodyShapes[j], x, y, r);
        if (cb) { x += cb.nx * cb.pen; y += cb.ny * cb.pen; moved = true; }
      }
      if (!moved) break;
    }
    return [x, y];
  };

  World.prototype.moveHeld = function (b, tx, ty) {
    var x = b.x, y = b.y, r = b.radius, dx = tx - x, dy = ty - y, L = Math.sqrt(dx * dx + dy * dy);
    var n = Math.min(200, Math.max(1, Math.ceil(L / Math.max(2, r * 0.5))));
    var sx = dx / n, sy = dy / n, p;
    for (var i = 0; i < n; i++) { p = this.pushOutStatic(x + sx, y + sy, r); x = p[0]; y = p[1]; }
    b.x = x; b.y = y;
  };

  World.prototype.followMouse = function (simDt) {
    var hb = this.held;
    if (!hb) return;
    var ox = hb.x, oy = hb.y, sdt = Math.max(simDt, 1e-6);
    var dp = hb.detachPhase;
    if (dp) {
      dp.px = this.mouse.x - dp.cx; dp.py = this.mouse.y - dp.cy; dp.pull = Math.hypot(dp.px, dp.py);
      if (dp.pull > dp.maxlen) { hb.detachPhase = null; this.detach(hb); this.refreshMasses(); this.sound(hb, 'detached'); dp = null; }
      else {
        var k = P.detachNudge * (dp.pull / dp.maxlen) / (dp.pull || 1), lx = dp.px * k, ly = dp.py * k;
        hb.x += lx - dp.lx; hb.y += ly - dp.ly; dp.lx = lx; dp.ly = ly;
        return;
      }
    }
    this.moveHeld(hb, this.mouse.x, this.mouse.y);
    var ivx = (hb.x - ox) / sdt, ivy = (hb.y - oy) / sdt;
    var sp = Math.sqrt(ivx * ivx + ivy * ivy), cap = P.throwMaxSpeed, kk = sp > cap ? cap / sp : 1;
    hb.vx += (ivx * kk - hb.vx) * 0.5; hb.vy += (ivy * kk - hb.vy) * 0.5;
  };

  World.prototype.hitSound = function (b) {
    if (this.simTime - b.soundT < P.hitSoundGap) return;
    b.soundT = this.simTime; this.sound(b, 'bounce');
  };

  World.prototype.thwack = function (b) {
    var k, st, sp, best = null, o, r = b.radius;
    for (k = 0; k < this.strands.length; k++) {
      st = this.strands[k]; sp = segPoint(st.a, st.b, b.x, b.y);
      if (sp.d < r && (!best || sp.d < best.d)) best = { s: st, t: sp.t, x: sp.x, y: sp.y, d: sp.d };
    }
    for (k = 0; k < this.balls.length; k++) {
      o = this.balls[k];
      if (o === b || o.strandCount <= 0 || o.radius <= 0) continue;
      var d = Math.sqrt((o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y));
      if (d < r + o.radius && (!best || d - o.radius < best.d)) best = { ball: o, x: o.x, y: o.y, d: Math.max(0, d - o.radius) };
    }
    if (!best) return false;
    var nx = b.x - best.x, ny = b.y - best.y, nl = Math.sqrt(nx * nx + ny * ny);
    if (nl < 1e-6) {
      var sv = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1; nx = -b.vx / sv; ny = -b.vy / sv; nl = 1;
    }
    nx /= nl; ny /= nl;
    var vn = -(b.vx * nx + b.vy * ny);
    if (vn > 0 && vn < P.hitMinSpeed + P.grabBuffer) return false;
    var gap = best.ball ? r + best.ball.radius : r;
    b.x = best.x + nx * (gap + 0.5); b.y = best.y + ny * (gap + 0.5);
    if (vn <= 0) return true;
    var kick = Math.min(P.thwackKick * vn, P.thwackMaxKick);
    if (best.ball) { best.ball.vx -= nx * kick; best.ball.vy -= ny * kick; }
    else {
      var A = best.s.a, B = best.s.b;
      A.vx -= nx * kick * (1 - best.t); A.vy -= ny * kick * (1 - best.t);
      B.vx -= nx * kick * best.t;       B.vy -= ny * kick * best.t;
    }
    var tvx = b.vx + nx * vn, tvy = b.vy + ny * vn;
    b.vx = tvx * 0.9 + nx * vn * P.thwackBounce; b.vy = tvy * 0.9 + ny * vn * P.thwackBounce;
    b.angVel += (nx * tvy - ny * tvx) * 0.02;
    this.hitSound(b);
    return true;
  };

  World.prototype.lifecycle = function (simDt) {
    for (var i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.radius <= 0) continue;
      if (b.fast) {
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (b.strandCount > 0 || b.climb || b.held || b.sleeping || sp < P.hitMinSpeed * 0.5) b.fast = false;
        else if (b.onGround) { b.fastGround += simDt; if (b.fastGround > 1.5) b.fast = false; }
        else b.fastGround = 0;
      }
      if (b.released) {
        if (b.strandCount > 0 || b.climb || b.held) b.released = false;
        else if (b.onGround) { if (b.peakFall > P.landMinSpeed) this.sound(b, 'land'); b.released = false; }
        else b.peakFall = Math.max(b.peakFall, -b.vy);
      }
    }
  };

  World.prototype.climbStep = function (b, dt) {
    var c = b.climb, r = b.ai.rand, guard = 0;
    var move = (b.def.climbspeed || 2) * P.climbSpeedScale * b.ai.speedMul * dt;
    while (move > 0 && guard++ < 16) {
      var A = c.s.a, B = c.s.b, L = dist(A, B) || 1e-6;
      var remain = c.dir > 0 ? (1 - c.t) * L : c.t * L;
      if (move < remain) { c.t += c.dir * move / L; move = 0; break; }
      move -= remain;
      var E = c.dir > 0 ? B : A, options = [];
      this.strands.forEach(function (s2) { if (s2 !== c.s && (s2.a === E || s2.b === E)) options.push(s2); });
      if (!options.length) { c.t = c.dir > 0 ? 1 : 0; c.dir = -c.dir; continue; }
      var pick = options[Math.floor(r() * options.length)];
      if (r() < P.aiClimbGoal) {
        var goal = this.goal(), bc = Infinity;
        for (var oi = 0; oi < options.length; oi++) {
          var far = options[oi].a === E ? options[oi].b : options[oi].a, cc = this.goalCost(far.x, far.y, goal);
          if (cc < bc) { bc = cc; pick = options[oi]; }
        }
      }
      c.s = pick;
      if (c.s.a === E) { c.t = 0; c.dir = 1; } else { c.t = 1; c.dir = -1; }
    }
    var A2 = c.s.a, B2 = c.s.b;
    var px = A2.x + (B2.x - A2.x) * c.t, py = A2.y + (B2.y - A2.y) * c.t;
    c.age += dt;
    var u = Math.min(1, c.age / P.grabBlendTime), f = 1 - u * u * (3 - 2 * u);
    b.x = px + (c.offX || 0) * f; b.y = py + (c.offY || 0) * f;
  };

  World.prototype.wake = function (b) { if (b.sleeping) { b.sleeping = false; b.wakeJump = true; } };

  World.prototype.updateAI = function (dt) {
    var balls = this.balls, t = this.simTime, g = this.gravityDown();
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.held) { b.state = b.detachPhase ? 'detaching' : b.sucked ? 'falling' : 'dragging'; continue; }
      if (b.strandCount > 0) { b.state = 'attached'; b.climb = null; b.jumping = null; b.sleeping = false; b.wakeJump = false; continue; }
      if (b.radius <= 0) continue;
      if (b.hovered) { if (b.climb) { this.climbStep(b, 0); b.state = 'climbing'; } else b.state = b.onGround ? 'standing' : 'falling'; continue; }
      var ai = b.ai, r = ai.rand, k, o, d2;
      if (b.sleeping) {
        var wd = (b.def.attrs && b.def.attrs.wakedist != null) ? WOG.num(b.def.attrs.wakedist) : P.defaultWakeDist;
        for (k = 0; k < balls.length; k++) {
          o = balls[k];
          if (!(o.held || (P.wakeByAttached && o.strandCount > 0))) continue;
          var rr = wd + b.radius + o.radius;
          d2 = (o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y);
          if (d2 < rr * rr) { b.sleeping = false; b.wakeJump = true; break; }
        }
        if (b.sleeping) { b.state = 'sleeping'; continue; }
      }
      if (b.climb) { this.climbStep(b, dt); b.state = 'climbing'; continue; }
      if (b.jumping) {
        b.state = 'falling';
        if (b.onGround && t - b.jumping.t0 > 1) b.jumping = null;
        continue;
      }
      this.checkStopSigns(b, t);
      if (ai.mode === 'walk' && b.onGround) {
        if (ai.chkT == null || t - ai.chkT > 1.5) {
          if (ai.chkT != null && Math.abs(b.x - ai.chkX) < 3) { ai.dir = -ai.dir; ai.until = t + P.aiWalk[0] + r() * (P.aiWalk[1] - P.aiWalk[0]); }
          ai.chkT = t; ai.chkX = b.x;
        }
      }
      if (t >= ai.until) {
        var near = null, nd = Infinity;
        for (k = 0; k < balls.length; k++) {
          o = balls[k];
          if (o.strandCount <= 0) continue;
          d2 = (o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y);
          if (d2 < nd) { nd = d2; near = o; }
        }
        var dir = r() < 0.5 ? -1 : 1;
        if (near && Math.abs(near.x - b.x) > P.aiNear && r() < P.aiTowardChance) dir = near.x > b.x ? 1 : -1;
        if (r() < P.aiGoalChance) {
          var gl = this.goal(), gb = null, gc = Infinity;
          for (k = 0; k < balls.length; k++) {
            o = balls[k];
            if (o.strandCount <= 0) continue;
            var oc = this.goalCost(o.x, o.y, gl);
            if (oc < gc) { gc = oc; gb = o; }
          }
          var tx = gb ? gb.x : (gl ? gl.x : null);
          if (tx != null && Math.abs(tx - b.x) > P.aiNear) dir = tx > b.x ? 1 : -1;
        }
        ai.mode = 'walk'; ai.dir = dir;
        ai.until = t + P.aiWalk[0] + r() * (P.aiWalk[1] - P.aiWalk[0]);
      }
      if (b.onGround && (b.wakeJump || t >= b.jumpCool)) {
        var best = null;
        for (k = 0; k < this.strands.length; k++) {
          var sp = segPoint(this.strands[k].a, this.strands[k].b, b.x, b.y);
          if (!best || sp.d < best.d) best = sp;
        }
        if (best && (best.d < P.jumpRange || b.wakeJump)) {
          var dx = best.x - b.x, dy = best.y - b.y;
          var tf = Math.max(1, Math.sqrt(2 * Math.max(dy + b.radius, 10) / g) + 0.3, Math.abs(dx) / P.jumpMaxSpeed);
          tf = Math.min(tf, 14);
          b.vx = dx / tf; b.vy = dy / tf + 0.5 * g * tf;
          b.onGround = false; b.jumping = { t0: t }; b.jumpCool = t + P.jumpCooldown; b.wakeJump = false;
          b.state = 'falling';
          continue;
        }
      }
      b.state = b.onGround ? 'walking' : 'falling';
    }
  };

  World.prototype.update = function (realDt) {
    if (!P.enabled) return;
    this.refreshMasses();
    var simDt = realDt * P.timeScale;
    this.followMouse(simDt);
    this.noteFall();
    var n = Math.max(1, Math.ceil(simDt / P.subStep)), h = simDt / n;
    for (var i = 0; i < n; i++) this.step(h);
    this.simTime += simDt;
    this.updateAI(simDt);
    if (this.waterStep) this.waterStep();
    this.lifecycle(simDt);
    this.frameUpdate();
    this.dragStrands = this.held && !this.held.detachPhase ? this.dragTargets(this.held) : [];
  };

  World.prototype.noteFall = function () {
    for (var i = 0; i < this.balls.length; i++) { var b = this.balls[i]; if (b.released && !b.onGround) b.peakFall = Math.max(b.peakFall, -b.vy); }
  };

  WOG.World = World;
})();