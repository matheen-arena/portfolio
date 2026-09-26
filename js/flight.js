/* Cockpit flight: a night city seen from above, flown over as you scroll through the hero. */
import * as THREE from "./vendor/three.module.min.js";

const section = document.getElementById("flight");
const canvas = document.getElementById("flight-canvas");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = innerWidth < 760;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  renderer = null; // No WebGL: the CSS sky behind the cockpit stays visible.
}

if (renderer) {
  section.classList.add("has-webgl");
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));

  // Fog fades distant blocks to near-black, so the far city reads as a silhouette against the horizon glow.
  const FOG = new THREE.Color(0x020308);
  const scene = new THREE.Scene();
  scene.background = FOG;
  const camera = new THREE.PerspectiveCamera(58, 1, 2, 12000);
  camera.rotation.order = "YXZ";

  /* ---------- sky: black overhead, deep blue at the horizon ---------- */
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(9000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: `varying vec3 vP;
        void main(){
          vec3 top = vec3(.004,.006,.02), horizon = vec3(.07,.09,.26);
          gl_FragColor = vec4(mix(horizon, top, smoothstep(-.02,.32,vP.y)), 1.);
        }`
    })
  ));

  /* ---------- stars ---------- */
  {
    const n = small ? 1200 : 2400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = .06 + Math.random() * 1.4;
      pos.set([Math.cos(th) * Math.cos(ph) * 8000, Math.sin(ph) * 8000, Math.sin(th) * Math.cos(ph) * 8000], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9d2ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: .75, fog: false })));
  }

  /* ---------- ground ---------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), new THREE.MeshBasicMaterial({ color: 0x05060d }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  /* ---------- building shader: moon-lit bluish facades, sparse lit window slits ---------- */
  const uniforms = { uFog: { value: FOG }, uFogDen: { value: .00042 }, uTime: { value: 0 }, uBoost: { value: 0 } };
  const buildingMaterial = instanced => new THREE.ShaderMaterial({
    uniforms: instanced ? { ...uniforms, uLift: { value: 0 } } : { ...uniforms, aSeed: { value: 42 }, uLift: { value: 1 } },
    vertexShader: `
      ${instanced ? "attribute float aSeed;" : "uniform float aSeed;"}
      varying vec3 vW; varying vec3 vN; varying float vSeed; varying float vDepth;
      void main(){
        mat4 im = ${instanced ? "instanceMatrix" : "mat4(1.0)"};
        vec4 w = modelMatrix * im * vec4(position, 1.);
        vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(im) * normal); vSeed = aSeed;
        vec4 mv = viewMatrix * w; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uFog; uniform float uFogDen; uniform float uTime; uniform float uBoost; uniform float uLift;
      varying vec3 vW; varying vec3 vN; varying float vSeed; varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 L = normalize(vec3(-.35, .55, .75));
        float lambert = max(dot(vN, L), 0.);
        float ao = .45 + .55 * smoothstep(0., 90., vW.y);            // darker near street level
        vec3 col = mix(vec3(.03, .03, .075) * (1. + uLift * 3.), vec3(.25, .25, .56) * (1. + uLift * 1.4), lambert * lambert) * ao;
        if (vN.y > .5) col = vec3(.08, .085, .16);                    // roofs
        if (abs(vN.y) < .5) {
          float u = abs(vN.x) > .5 ? vW.z : vW.x;
          vec2 g = vec2(u / 5.5, vW.y / 7.);
          vec2 cell = floor(g), f = fract(g);
          float slit = step(.12, f.x) * step(f.x, .88) * step(.42, f.y) * step(f.y, .62);
          float h = hash(cell + vSeed * 17.3);
          float lit = step(.9 - uBoost * .08 - uLift * .45, h) * (.85 + .15 * sin(uTime * 1.5 + h * 50.));
          vec3 wc = h > .985 || uLift > .5 ? vec3(1., .96, .9) : vec3(1., .45, .72);
          col = mix(col, wc * (1.25 + uBoost), slit * lit);
        }
        float fog = 1. - exp(-uFogDen * uFogDen * vDepth * vDepth);
        gl_FragColor = vec4(mix(col, uFog, clamp(fog * (1. - uLift * .6), 0., 1.)), 1.);
      }`
  });

  /* ---------- city layout: dense downtown ahead, low sprawl out to the horizon ---------- */
  const boxes = [];
  const DT = { x: 0, z: -1150 }; // downtown centre
  const DT_W = 900;               // downtown half-width
  const place = (x0, x1, z0, z1, step, keep, farJitter = 0) => {
    for (let x = x0; x <= x1; x += step) {
      for (let z = z0; z >= z1; z -= step) {
        const ix = Math.round(x / step), iz = Math.round(z / step);
        if (Math.abs(x) < 34 && z > -2600) continue;        // the avenue straight ahead
        if (ix % 4 === 0 || iz % 5 === 0) continue;          // cross streets
        if (Math.random() > keep) continue;
        const d = Math.hypot((x - DT.x) / DT_W, (z - DT.z) / 620);
        const downtown = Math.exp(-d * d);
        const hgt = 12 + Math.pow(Math.random(), 2) * 55 + downtown * (60 + Math.pow(Math.random(), 1.4) * 330) + Math.pow(Math.random(), 3) * farJitter;
        const wdt = step * (.6 + Math.random() * .3), dpt = step * (.6 + Math.random() * .3);
        boxes.push([x + (Math.random() - .5) * 6, z + (Math.random() - .5) * 6, wdt, hgt, dpt]);
      }
    }
  };
  const far = small ? 150 : 110;
  place(-2600, 2600, 600, -2600, small ? 66 : 50, .92);   // near city
  place(-6500, 6500, -2650, -8200, far, .8, 260);          // sprawl to the skyline (jagged silhouette)
  place(-6500, -2660, 600, -2600, far, .8);                // sides
  place(2660, 6500, 600, -2600, far, .8);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, .5, 0);
  const cityMat = buildingMaterial(true);
  const city = new THREE.InstancedMesh(geo, cityMat, boxes.length);
  const seeds = new Float32Array(boxes.length);
  const m = new THREE.Matrix4();
  boxes.forEach(([x, z, wdt, hgt, dpt], i) => {
    m.makeScale(wdt, hgt, dpt); m.setPosition(x, 0, z);
    city.setMatrixAt(i, m);
    seeds[i] = Math.random() * 100;
  });
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  scene.add(city);

  /* ---------- landmarks: a pyramid tower and a lattice radio mast ---------- */
  const PYR = { x: -150, z: -950, h: 520 };
  const pyramid = new THREE.Mesh(new THREE.ConeGeometry(52, PYR.h, 4, 1), buildingMaterial(false));
  pyramid.rotation.y = Math.PI / 4;
  pyramid.position.set(PYR.x, PYR.h / 2, PYR.z);
  scene.add(pyramid);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(.6, 2.5, 90, 6), new THREE.MeshBasicMaterial({ color: 0x8a90c8 }));
  spire.position.set(PYR.x, PYR.h + 40, PYR.z);
  scene.add(spire);

  const MAST = { x: 330, y: 60, z: -1900, h: 560 };
  {
    const pts = [], base = 34, top = 5;
    const leg = (a, t) => { const r = base + (top - base) * t; return [Math.cos(a) * r, t * MAST.h, Math.sin(a) * r]; };
    const A = [0, 2.094, 4.189];
    for (let s = 0; s < 14; s++) {
      const t0 = s / 14, t1 = (s + 1) / 14;
      A.forEach((a, k) => {
        const b = A[(k + 1) % 3];
        pts.push(...leg(a, t0), ...leg(a, t1));   // legs
        pts.push(...leg(a, t0), ...leg(b, t1));   // cross bracing
        pts.push(...leg(a, t1), ...leg(b, t1));   // rings
      });
    }
    // Two crossbars with three prongs each.
    [.58, .78].forEach(t => {
      const y = t * MAST.h;
      pts.push(-70, y, 0, 70, y, 0);
      [-70, 0, 70].forEach(x => pts.push(x, y, 0, x, y + 110, 0));
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mast = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9aa6e8, transparent: true, opacity: .85 }));
    mast.position.set(MAST.x, MAST.y, MAST.z);
    scene.add(mast);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x040509 }));
    hill.scale.y = .25; hill.position.set(MAST.x, 0, MAST.z);
    scene.add(hill);
  }

  /* ---------- red roof beacons ---------- */
  const bPos = [];
  boxes.filter(b => b[3] > 160 && b[1] > -2600).forEach(([x, z, , hgt]) => bPos.push(x, hgt + 2, z));
  bPos.push(PYR.x, PYR.h + 86, PYR.z);
  [.58, .78].forEach(t => [-70, 0, 70].forEach(x => bPos.push(MAST.x + x, MAST.y + t * MAST.h + 112, MAST.z)));
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
  const beaconMat = new THREE.PointsMaterial({ color: 0xff3a4a, size: 4, sizeAttenuation: false, transparent: true, fog: false });
  scene.add(new THREE.Points(bGeo, beaconMat));

  /* ---------- a few cars on the avenue ---------- */
  const CARS = small ? 60 : 120;
  const cars = Array.from({ length: CARS }, () => ({ z: 600 - Math.random() * 3200, v: (.8 + Math.random() * 1.2) * (Math.random() < .5 ? 1 : -1) }));
  const carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3);
  const carGeo = new THREE.BufferGeometry();
  carGeo.setAttribute("position", new THREE.BufferAttribute(carPos, 3));
  carGeo.setAttribute("color", new THREE.BufferAttribute(carCol, 3));
  cars.forEach((c, i) => carCol.set(c.v > 0 ? [1, .25, .3] : [1, .9, .8], i * 3));
  scene.add(new THREE.Points(carGeo, new THREE.PointsMaterial({ size: 2.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .8 })));

  /* ---------- hostile skies: wingmen, a capital ship, interceptor fly-bys ---------- */
  const HULL = new THREE.MeshBasicMaterial({ color: 0x0a0c14 });
  const RIM = new THREE.LineBasicMaterial({ color: 0x8a93b8, transparent: true, opacity: .35 });
  const glowTex = (mid, edge) => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.25, mid); r.addColorStop(1, edge);
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
  const RED_T = glowTex("rgba(255,60,80,.9)", "rgba(255,0,30,0)"), HOT_T = glowTex("rgba(255,140,90,.85)", "rgba(255,40,20,0)"), WHITE_T = glowTex("rgba(210,225,255,.8)", "rgba(150,170,255,0)");
  const makeGlow = (size, tex = RED_T) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.setScalar(size); return sp; };
  const withRim = (geo, g) => { g.add(new THREE.Mesh(geo, HULL)); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), RIM)); };

  // Delta-wing fighter, nose along -Z, twin engines glowing at the tail.
  function makeFighter() {
    const g = new THREE.Group(), sh = new THREE.Shape();
    sh.moveTo(0, 62); sh.lineTo(12, 10); sh.lineTo(44, -18); sh.lineTo(40, -26); sh.lineTo(12, -20); sh.lineTo(-12, -20); sh.lineTo(-40, -26); sh.lineTo(-44, -18); sh.lineTo(-12, 10); sh.closePath();
    const wing = new THREE.ExtrudeGeometry(sh, { depth: 5, bevelEnabled: false }); wing.rotateX(-Math.PI / 2); withRim(wing, g);
    const canopy = new THREE.ConeGeometry(6, 40, 4); canopy.rotateX(-Math.PI / 2); canopy.translate(0, 7, -12); withRim(canopy, g);
    [-10, 10].forEach(x => { const f = new THREE.BoxGeometry(3, 12, 16); f.translate(x, 12, 14); withRim(f, g); });
    const engines = [-7, 7].map(x => { const e = makeGlow(26, HOT_T); e.position.set(x, 3, 22); g.add(e); return e; });
    const nav = [[-44, 3, -18, RED_T], [44, 3, -18, WHITE_T]].map(([x, y, z, tx]) => { const n = makeGlow(12, tx); n.position.set(x, y, z); g.add(n); return n; });
    return { g, engines, nav };
  }
  const wingmen = [makeFighter(), makeFighter()];
  wingmen.forEach(w => { if (!small) w.g.scale.setScalar(1.5); scene.add(w.g); });
  const wingOff = new THREE.Vector3(), camQ = new THREE.Quaternion(), bankQ = new THREE.Quaternion(), eul = new THREE.Euler();

  // Capital ship: a vast dark wedge hanging over the far city, lit from below, sweeping a scan beam.
  const mother = new THREE.Group();
  {
    const sh = new THREE.Shape(); sh.moveTo(0, 1500); sh.lineTo(620, -700); sh.lineTo(380, -900); sh.lineTo(-380, -900); sh.lineTo(-620, -700); sh.closePath();
    const hull = new THREE.ExtrudeGeometry(sh, { depth: 180, bevelEnabled: false }); hull.rotateX(-Math.PI / 2); withRim(hull, mother);
    [[0, 150, 650, 360, 70, 260], [0, 250, 780, 160, 80, 120], [-260, 130, 500, 120, 50, 200], [260, 130, 500, 120, 50, 200]].forEach(([x, y, z, w, h, d]) => {
      const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); withRim(b, mother); });
    // belly lights: rows of cold white pinpoints plus a red keel strip
    const pts = [];
    for (let i = 0; i < 260; i++) {
      const zz = 880 - Math.random() * 2300, y = -zz, lim = y < -700 ? 400 : 620 * (1500 - y) / 2200;
      pts.push((Math.random() * 2 - 1) * lim * .9, -2, zz);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    mother.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: .8, fog: false })));
    for (let i = 0; i < 7; i++) { const k = makeGlow(60); k.position.set(0, -6, 700 - i * 260); mother.add(k); }
    [[-600, 690], [600, 690], [0, -1480]].forEach(([x, z]) => { const k = makeGlow(90); k.position.set(x, 0, z); k.userData.blink = 1; mother.add(k); });
    [-240, -80, 80, 240].forEach(x => { const e = makeGlow(170, HOT_T); e.position.set(x, 60, 910); mother.add(e); });
  }
  mother.rotation.set(0, Math.PI / 2 + .45, -.38, "YXZ");   // nose to the left, belly tipped toward us
  mother.scale.setScalar(1.7);
  scene.add(mother);
  const scanMat = new THREE.MeshBasicMaterial({ color: 0xff2a3c, transparent: true, opacity: .06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const scanGeo = new THREE.ConeGeometry(260, 1, 32, 1, true); scanGeo.translate(0, -.5, 0);
  const scan = new THREE.Mesh(scanGeo, scanMat); scene.add(scan);

  // Red searchlights sweeping up from the city.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2a3c, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamGeo = new THREE.ConeGeometry(70, 900, 24, 1, true); beamGeo.translate(0, -450, 0); beamGeo.rotateX(Math.PI);
  const beams = [[-520, -1500, 0], [260, -1100, 1.7], [760, -2000, 3.1], [-120, -2500, 4.4]].map(([x, z, ph]) => {
    const b = new THREE.Mesh(beamGeo, beamMat); b.position.set(x, 30, z); b.userData.ph = ph; scene.add(b); return b; });

  // Drones: small red lights orbiting above the towers.
  const drones = Array.from({ length: small ? 5 : 9 }, (_, i) => { const d = makeGlow(22); d.userData = { r: 220 + i * 60, h: 260 + (i % 3) * 70, sp: .12 + (i % 4) * .04, ph: i * 1.3, cz: -1200 - (i % 3) * 500 }; scene.add(d); return d; });

  // Interceptors: a pair streaks across the sky every few seconds, leaving hot trails.
  const TRAIL = 36;
  const bandits = [0, 1].map(() => {
    const f = makeFighter(); f.g.scale.setScalar(1.6); f.g.visible = false; scene.add(f.g);
    const pos = new Float32Array(TRAIL * 3), col = new Float32Array(TRAIL * 3), tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    for (let i = 0; i < TRAIL; i++) { const k = 1 - i / TRAIL; col.set([k, k * .35, k * .25], i * 3); }
    const trail = new THREE.Points(tg, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    trail.frustumCulled = false; scene.add(trail);
    return { f, pos, tg, trail, hist: [] };
  });
  let raid = { t0: -7, dir: 1, y: 700, z: -900 };
  const tmp = new THREE.Vector3();

  /* ---------- sizing ---------- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 80 : 66;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  /* ---------- input ---------- */
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  section.addEventListener("pointermove", e => {
    look.tx = (e.clientX / innerWidth) * 2 - 1;
    look.ty = (e.clientY / innerHeight) * 2 - 1;
  });

  const audio = () => {
    const S = window.SFX;
    if (!S || !S.playing) return 0;
    const buf = S.wave(); if (!buf) return 0;
    let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 14);
  };

  /* ---------- loop (only while the hero is on screen) ---------- */
  let visible = true, raf = 0, last = performance.now(), eased = 0, boost = 0, yawS = 0, yawV = 0;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    const target = window.flightProgress ? window.flightProgress() : 0;
    eased += (target - eased) * (reduceMotion ? 1 : .06);
    boost += (audio() - boost) * .12;
    look.x += (look.tx - look.x) * .04; look.y += (look.ty - look.y) * .04;

    const p = ease(eased), t = now * .001;
    const drift = reduceMotion ? 0 : 60 - 60 * Math.cos(t * .05);
    // Left/right: the mouse steers, and a slow autonomous sweep keeps the view moving (all you get on touch).
    const sweep = reduceMotion ? 0 : Math.sin(t * .16) * .22 + Math.sin(t * .07 + 1) * .12;
    const yaw = -look.x * .38 + sweep;
    yawV += (yaw - yawS) * .08; yawS += yawV * .5; yawV *= .6;          // smoothed, with a little overshoot
    camera.position.set(
      Math.sin(t * .25) * 4 + look.x * 90 - sweep * 160,
      420 - p * 110 + Math.sin(t * .5) * 2,
      820 - p * 950 - drift
    );
    camera.rotation.set(-.3 + p * .08 - look.y * .06, yawS, -(yaw - yawS) * .9 - yawS * .12 + Math.sin(t * .25) * .006);

    camera.updateMatrixWorld();

    // wingmen hold formation off the nose, drifting wide as the view banks
    const tf = Math.tan(camera.fov * Math.PI / 360), dz = 560;
    wingmen.forEach((w, k) => {
      const side = k ? 1 : -1;
      wingOff.set(side * dz * tf * camera.aspect * (camera.aspect > 1 ? .44 : .6) + (yaw - yawS) * side * -60 + Math.sin(t * .6 + k * 2) * 10,
        -dz * tf * .32 + Math.sin(t * .9 + k) * 8 - k * 18, -dz - k * 90);
      w.g.position.copy(wingOff).applyMatrix4(camera.matrixWorld);
      camQ.copy(camera.quaternion);
      bankQ.setFromEuler(eul.set(Math.sin(t * .7 + k) * .04, 0, (yawS - yaw) * 1.4 + Math.sin(t * .5 + k) * .06));
      w.g.quaternion.copy(camQ).multiply(bankQ);
      w.engines.forEach(e => e.scale.setScalar(22 + 6 * Math.random() + boost * 16));
      w.nav.forEach((n, j) => { n.material.opacity = Math.sin(t * 4 + j * Math.PI + k) > .6 ? 1 : .15; });
    });

    // capital ship drifts slowly; its scan beam sweeps the streets below
    mother.position.set(600 - Math.sin(t * .02) * 400, 1250, -6000 + p * 900);
    mother.children.forEach(c => { if (c.userData.blink) c.material.opacity = Math.sin(t * 2.2) > .3 ? 1 : .2; });
    tmp.set(mother.position.x - 200 + Math.sin(t * .4) * 700, 0, mother.position.z + 1400 + Math.cos(t * .3) * 500);
    scan.position.copy(mother.position).setY(mother.position.y - 40);
    scan.scale.set(1, scan.position.distanceTo(tmp), 1);
    scan.lookAt(tmp); scan.rotateX(-Math.PI / 2);
    scanMat.opacity = .05 + .03 * Math.sin(t * 2.5) + boost * .05;

    beams.forEach(b => { b.rotation.z = Math.sin(t * .35 + b.userData.ph) * .5; b.rotation.x = Math.cos(t * .27 + b.userData.ph) * .25; });
    beamMat.opacity = .07 + boost * .06 + .02 * Math.sin(t * 3);
    drones.forEach(d => { const u = d.userData, a = t * u.sp + u.ph; d.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * 1.3 + u.ph) * 12, u.cz + Math.sin(a) * u.r * .5);
      d.material.opacity = Math.sin(t * 5 + u.ph) > .2 ? 1 : .25; });

    // interceptor raid: two bandits cut across in front of the ship, then the sky goes quiet again
    if (!reduceMotion && t - raid.t0 > 9 + (raid.t0 % 3)) raid = { t0: t, dir: Math.random() < .5 ? 1 : -1, y: 560 + Math.random() * 260, z: camera.position.z - 1300 - Math.random() * 900 };
    const rt = t - raid.t0;
    bandits.forEach((bd, k) => {
      const u = rt * .42 - k * .07, on = u > 0 && u < 1.1;
      bd.f.g.visible = on;
      if (on) {
        const x = (u * 2 - 1.05) * 2600 * raid.dir, y = raid.y + k * 40 - u * 120, z = raid.z - k * 120 + Math.sin(u * 3) * 200;
        bd.f.g.position.set(x, y, z);
        bd.f.g.rotation.set(0, raid.dir > 0 ? -Math.PI / 2 : Math.PI / 2, -raid.dir * (.5 + Math.sin(u * 4) * .25), "YXZ");
        bd.hist.unshift(x - raid.dir * 30, y, z); bd.hist.length = Math.min(bd.hist.length, TRAIL * 3);
      } else bd.hist.length = 0;
      for (let i = 0; i < TRAIL; i++) { const j = Math.min(i, bd.hist.length / 3 - 1); if (j < 0) { bd.pos.set([0, -999, 0], i * 3); continue; }
        bd.pos.set([bd.hist[j * 3], bd.hist[j * 3 + 1], bd.hist[j * 3 + 2]], i * 3); }
      bd.tg.attributes.position.needsUpdate = true;
      bd.f.engines.forEach(e => e.scale.setScalar(34 + 10 * Math.random()));
    });

    uniforms.uTime.value = t;
    uniforms.uBoost.value = boost;
    beaconMat.opacity = .3 + .7 * Math.max(0, Math.sin(t * 2));

    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      c.z += c.v * dt * .05;
      if (c.z < -2600) c.z += 3200; if (c.z > 600) c.z -= 3200;
      carPos.set([c.v > 0 ? 8 : -8, 1.5, c.z], i * 3);
    }
    carGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    if (visible) raf = requestAnimationFrame(frame);
  }

  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }).observe(section);
  raf = requestAnimationFrame(frame);
}
