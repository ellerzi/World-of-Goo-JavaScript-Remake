(function () {

  WOG.GEOM_IMAGE_DEPTH = 0;
  function geomImage(el, scene) {
    var id = A(el, 'image');
    if (!id) return null;
    var p = WOG.vec(A(el, 'imagepos'), [num(A(el, 'x')), num(A(el, 'y'))]), sc = WOG.vec(A(el, 'imagescale'), [1, 1]);
    var layer = { id: A(el, 'id') || '', name: A(el, 'id') || '', geomImage: true, screen: false, depth: WOG.GEOM_IMAGE_DEPTH,
      x: p[0], y: p[1], scalex: sc[0], scaley: sc.length > 1 ? sc[1] : sc[0], rotation: num(A(el, 'imagerot')), alpha: 1, colorize: [255, 255, 255],
      image: id, tilex: false, tiley: false, anim: null, animspeed: 1, animdelay: 0, animloop: true };
    scene.layers.push(layer);
    return { layer: layer, x: p[0], y: p[1], rot: layer.rotation };
  }

  function movingShape(el, ch) {
    var g = { id: A(ch, 'id') || '', tag: A(ch, 'tag'), material: A(ch, 'material') || (el && A(el, 'material')), mass: num(A(ch, 'mass')), x: num(A(ch, 'x')), y: num(A(ch, 'y')), rotation: 0 };
    if (ch.tagName === 'circle') { g.kind = 'circle'; g.radius = num(A(ch, 'radius')); }
    else if (ch.tagName === 'rectangle') { g.kind = 'rectangle'; g.width = num(A(ch, 'width')); g.height = num(A(ch, 'height')); g.rotation = num(A(ch, 'rotation')); }
    else return null;
    return g;
  }

  function flattenComposite(el, scene) {
    var out = scene.geometry;
    var px = num(A(el, 'x')), py = num(A(el, 'y')), pr = num(A(el, 'rotation'));
    var stat = WOG.bool(A(el, 'static')), mat = A(el, 'material'), tag = A(el, 'tag'), gid = A(el, 'id');
    var img = geomImage(el, scene);
    if (!stat) {
      var shapes = [];
      WOG.children(el).forEach(function (ch) { var g = movingShape(el, ch); if (g) { g.tag = g.tag || tag; shapes.push(g); } });
      scene.bodies.push({ id: gid, x: px, y: py, rotation: pr, mass: num(A(el, 'mass')), noGeom: WOG.bool(A(el, 'nogeomcollisions')), image: img, shapes: shapes });
      return;
    }
    var c = Math.cos(pr), sn = Math.sin(pr);
    WOG.children(el).forEach(function (ch) {
      var lx = num(A(ch, 'x')), ly = num(A(ch, 'y'));
      var g = { id: A(ch, 'id') || gid, parent: gid, static: stat, tag: A(ch, 'tag') || tag,
        material: A(ch, 'material') || mat, nogeom: WOG.bool(A(el, 'nogeomcollisions')),
        x: px + lx * c - ly * sn, y: py + lx * sn + ly * c };
      if (ch.tagName === 'circle') { g.kind = 'circle'; g.radius = num(A(ch, 'radius')); }
      else if (ch.tagName === 'rectangle') {
        g.kind = 'rectangle'; g.width = num(A(ch, 'width')); g.height = num(A(ch, 'height'));
        g.rotation = num(A(ch, 'rotation')) + pr;
      } else return;
      out.push(g);
    });
  }
  var A = WOG.attr, num = WOG.num;

  function parseButton(el, group) {
    return {
      id: A(el, 'id'), group: group, depth: num(A(el, 'depth')), screen: WOG.bool(A(el, 'screenspace')) || A(el, 'context') === 'screen',
      x: num(A(el, 'x')), y: num(A(el, 'y')),
      scalex: num(A(el, 'scalex'), 1), scaley: num(A(el, 'scaley'), 1),
      rotation: num(A(el, 'rotation')) * Math.PI / 180,
      alpha: num(A(el, 'alpha'), 1), colorize: WOG.rgb(A(el, 'colorize')),
      up: A(el, 'up'), over: A(el, 'over'), disabled: A(el, 'disabled'),
      onclick: A(el, 'onclick'), onmouseenter: A(el, 'onmouseenter'), onmouseexit: A(el, 'onmouseexit'),
      tooltip: A(el, 'tooltip')
    };
  }

  function parseSignpost(el) {
    return { sign: true, id: A(el, 'name') || '', name: A(el, 'name') || '', depth: num(A(el, 'depth')), x: num(A(el, 'x')), y: num(A(el, 'y')),
      scalex: num(A(el, 'scalex'), 1), scaley: num(A(el, 'scaley'), 1), rotation: num(A(el, 'rotation')) * Math.PI / 180,
      alpha: num(A(el, 'alpha'), 1), colorize: WOG.rgb(A(el, 'colorize')), image: A(el, 'image'), text: A(el, 'text') || '' };
  }

  function parseScene(doc) {
    var root = doc.documentElement;
    var scene = {
      minx: num(A(root, 'minx')), miny: num(A(root, 'miny')),
      maxx: num(A(root, 'maxx')), maxy: num(A(root, 'maxy')),
      background: WOG.rgb(A(root, 'backgroundcolor'), [0, 0, 0]),
      layers: [], buttons: [], geometry: [], bodies: [], hinges: [], forcefields: [], particles: [], unknown: {}
    };
    WOG.children(root).forEach(function (el) {
      switch (el.tagName) {
        case 'SceneLayer':
          scene.layers.push({
            id: A(el, 'id') || '',
            screen: WOG.bool(A(el, 'screenspace')) || A(el, 'context') === 'screen',
            name: A(el, 'name') || '',
            depth: num(A(el, 'depth')),
            x: num(A(el, 'x')), y: num(A(el, 'y')),
            scalex: num(A(el, 'scalex'), 1), scaley: num(A(el, 'scaley'), 1),
            rotation: num(A(el, 'rotation')) * Math.PI / 180,
            alpha: num(A(el, 'alpha'), 1),
            colorize: WOG.rgb(A(el, 'colorize')),
            image: A(el, 'image'),
            tilex: WOG.bool(A(el, 'tilex')), tiley: WOG.bool(A(el, 'tiley')),
            anim: A(el, 'anim'),
            animspeed: num(A(el, 'animspeed'), 1),
            animdelay: num(A(el, 'animdelay'), 0),
            animloop: true,
          });
          break;
        case 'buttongroup':
          WOG.children(el).forEach(function (b) { if (b.tagName === 'button') scene.buttons.push(parseButton(b, A(el, 'id'))); });
          break;
        case 'signpost':
          scene.layers.push(parseSignpost(el));
          break;
        case 'button':
          scene.buttons.push(parseButton(el, null));
          break;
        case 'circle':
        case 'rectangle':
          var gi = geomImage(el, scene);
          if (!WOG.bool(A(el, 'static'))) {
            var ms = movingShape(null, el), mx = ms.x, my = ms.y, mr = ms.rotation;
            ms.x = 0; ms.y = 0; ms.rotation = 0;
            scene.bodies.push({ id: A(el, 'id') || '', x: mx, y: my, rotation: mr, mass: 0, noGeom: WOG.bool(A(el, 'nogeomcollisions')), image: gi, shapes: [ms] });
            break;
          }
          if (el.tagName === 'circle') scene.geometry.push({ kind: 'circle', id: A(el, 'id'), static: true,
            material: A(el, 'material'), tag: A(el, 'tag'), nogeom: WOG.bool(A(el, 'nogeomcollisions')),
            x: num(A(el, 'x')), y: num(A(el, 'y')), radius: num(A(el, 'radius')) });
          else scene.geometry.push({ kind: 'rectangle', id: A(el, 'id'), static: true,
            material: A(el, 'material'), tag: A(el, 'tag'), nogeom: WOG.bool(A(el, 'nogeomcollisions')),
            x: num(A(el, 'x')), y: num(A(el, 'y')), width: num(A(el, 'width')), height: num(A(el, 'height')),
            rotation: num(A(el, 'rotation')) });
          break;
        case 'hinge':
          scene.hinges.push({ body1: A(el, 'body1'), body2: A(el, 'body2'), anchor: WOG.vec(A(el, 'anchor')),
            lo: A(el, 'lostop') != null ? num(A(el, 'lostop')) : null, hi: A(el, 'histop') != null ? num(A(el, 'histop')) : null });
          break;
        case 'line':
          scene.geometry.push({ kind: 'line', id: A(el, 'id'), static: WOG.bool(A(el, 'static')),
            material: A(el, 'material'), tag: A(el, 'tag'), nogeom: WOG.bool(A(el, 'nogeomcollisions')),
            anchor: WOG.vec(A(el, 'anchor')), normal: WOG.vec(A(el, 'normal')) });
          break;
        case 'compositegeom':
          flattenComposite(el, scene);
          break;
        case 'linearforcefield':
          scene.forcefields.push({ kind: 'linear', id: A(el, 'id'), type: A(el, 'type'), force: WOG.vec(A(el, 'force')),
            center: A(el, 'center') != null ? WOG.vec(A(el, 'center')) : null,
            width: A(el, 'width') != null ? num(A(el, 'width')) : null,
            height: A(el, 'height') != null ? num(A(el, 'height')) : null,
            dampeningfactor: num(A(el, 'dampeningfactor')), antigrav: WOG.bool(A(el, 'antigrav')),
            geomonly: WOG.bool(A(el, 'geomonly')),
            enabled: A(el, 'enabled') == null ? true : WOG.bool(A(el, 'enabled')),
            water: WOG.bool(A(el, 'water')), color: A(el, 'color'),
            argb: A(el, 'color') ? (function (v) { return [v[0] | 0, v[1] | 0, v[2] | 0, v[3] | 0]; })(WOG.vec(A(el, 'color'))) : [0, 0, 0, 0],
            depth: A(el, 'depth') != null ? num(A(el, 'depth')) : 0.0001 });
          break;
        case 'radialforcefield':
          scene.forcefields.push({ kind: 'radial', id: A(el, 'id'), type: A(el, 'type'),
            center: WOG.vec(A(el, 'center')), radius: num(A(el, 'radius')),
            forceatcenter: num(A(el, 'forceatcenter')), forceatedge: num(A(el, 'forceatedge')),
            dampeningfactor: num(A(el, 'dampeningfactor')), antigrav: WOG.bool(A(el, 'antigrav')),
            geomonly: WOG.bool(A(el, 'geomonly')),
            enabled: A(el, 'enabled') == null ? true : WOG.bool(A(el, 'enabled')) });
          break;
        case 'particles':
          var pp = WOG.vec(A(el, 'pos'), [0, 0]);
          scene.particles.push({ effect: A(el, 'effect'), depth: num(A(el, 'depth')), pretick: num(A(el, 'pretick')), x: pp[0], y: pp[1] });
          break;
        default:
          scene.unknown[el.tagName] = (scene.unknown[el.tagName] || 0) + 1;
      }
    });
    return scene;
  }

  WOG.parseScene = parseScene;

  function parseLevel(doc) {
    var root = doc.documentElement;
    var lvl = {
      ballsrequired: num(A(root, 'ballsrequired')),
      autobounds: WOG.bool(A(root, 'autobounds')),
      cursorColor: A(root, 'cursor1color') ? WOG.rgb(A(root, 'cursor1color')) : [255, 255, 255],
      letterboxed: WOG.bool(A(root, 'letterboxed')),
      textcolor: WOG.rgb(A(root, 'textcolor')),
      cameras: { normal: null, widescreen: null },
      balls: [], strands: [], exit: null, pipe: null, music: null, signposts: [], unknown: {}
    };
    WOG.children(root).forEach(function (el) {
      switch (el.tagName) {
        case 'camera':
          lvl.cameras[A(el, 'aspect') || 'normal'] = {
            endpos: A(el, 'endpos') != null ? WOG.vec(A(el, 'endpos')) : null,
            endzoom: num(A(el, 'endzoom'), 1),
            pois: WOG.children(el).filter(function (p) { return p.tagName === 'poi'; }).map(function (p) {
              return { pos: WOG.vec(A(p, 'pos')), traveltime: num(A(p, 'traveltime')),
                       pause: num(A(p, 'pause')), zoom: num(A(p, 'zoom'), 1) };
            })
          };
          break;
        case 'BallInstance':
          lvl.balls.push({ type: A(el, 'type'), x: num(A(el, 'x')), y: num(A(el, 'y')),
            id: num(A(el, 'id')), angle: num(A(el, 'angle')) * Math.PI / 180, discovered: WOG.bool(A(el, 'discovered'), true) });
          break;
        case 'Strand':
          lvl.strands.push({ gb1: num(A(el, 'gb1')), gb2: num(A(el, 'gb2')) });
          break;
        case 'levelexit':
          lvl.exit = { id: A(el, 'id'), pos: WOG.vec(A(el, 'pos')), radius: num(A(el, 'radius')),
            filter: (A(el, 'filter') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean) };
          break;
        case 'pipe':
          lvl.pipe = { id: A(el, 'id'), depth: num(A(el, 'depth')), type: A(el, 'type') || 'NORMAL',
            vertices: WOG.children(el).filter(function (v) { return v.tagName === 'Vertex'; })
              .map(function (v) { return [num(A(v, 'x')), num(A(v, 'y'))]; }) };
          break;
        case 'music':
          lvl.music = A(el, 'id');
          break;
        case 'signpost':
          lvl.signposts.push(parseSignpost(el));
          break;
        default:
          lvl.unknown[el.tagName] = (lvl.unknown[el.tagName] || 0) + 1;
      }
    });
    return lvl;
  }

  WOG.peekMusic = async function (name, res) {
    var base = 'res/levels/' + name + '/' + name;
    var doc = await WOG.fetchXML(base + '.level.xml');
    await res.addManifest(base + '.resrc.xml');
    var m = doc.getElementsByTagName('music')[0];
    return m ? m.getAttribute('id') : null;
  };

  WOG.loadLevel = async function (name, res, onStatus) {
    var base = 'res/levels/' + name + '/' + name;
    onStatus && onStatus('Reading ' + name + ' XML...');
    var docs = await Promise.all([
      WOG.fetchXML(base + '.scene.xml'),
      WOG.fetchXML(base + '.level.xml')
    ]);
    await res.addManifest(base + '.resrc.xml');
    var level = { name: name, scene: parseScene(docs[0]), level: parseLevel(docs[1]) };
    level.level.signposts.forEach(function (sp) { level.scene.layers.push(sp); });

    onStatus && onStatus('Loading scene images...');
    var ids = {};
    level.scene.layers.forEach(function (l) { if (l.image) ids[l.image] = 1; });
    level.scene.buttons.forEach(function (b) { [b.up, b.over, b.disabled].forEach(function (i) { if (i) ids[i] = 1; }); });
    await res.loadImages(Object.keys(ids));
    return level;
  };
})();
