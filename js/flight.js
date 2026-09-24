/* Cockpit flight: a night city flown over as you scroll through the hero. */
import * as THREE from "./vendor/three.module.min.js";

const section = document.getElementById("flight");
const canvas = document.getElementById("flight-canvas");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = innerWidth < 760;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: "high-performance" });
} catch (e) {
  renderer = null; // No WebGL: the CSS sky behind the cockpit stays visible.
}

if (renderer) {
  section.classList.add("has-webgl");
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));

  const FOG = new THREE.Color(0x0b0f2e);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050b);
  const camera = new THREE.PerspectiveCamera(62, 1, 1, 6000);

  /* ---------- sky dome with a glowing horizon ---------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(5000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 top = vec3(.012,.016,.05), mid = vec3(.05,.06,.19), glow = vec3(.22,.12,.32);
          vec3 c = mix(mid, top, smoothstep(.02,.45,h));
          c = mix(c, glow, smoothstep(.12,-.02,h) * .8);
          gl_FragColor = vec4(c,1.);
        }`
    })
  );
  scene.add(sky);

  /* ---------- stars ---------- */
  {
    const n = small ? 900 : 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.2 + .12;
      pos.set([Math.cos(th) * Math.cos(ph) * 4500, Math.sin(ph) * 4500, Math.sin(th) * Math.cos(ph) * 4500], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: .8, fog: false })));
  }

  /* ---------- distant hills silhouette ---------- */
  {
    const shape = new THREE.Shape();
    shape.moveTo(-6000, -50);
    for (let x = -6000; x <= 6000; x += 120) shape.lineTo(x, 60 + Math.abs(Math.sin(x * .0011) * 160 + Math.sin(x * .0043) * 60 + Math.sin(x * .013) * 18));
    shape.lineTo(6000, -50);
    const hills = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x050611, fog: false }));
    hills.position.set(0, 0, -3900);
    scene.add(hills);
  }

  /* ---------- ground ---------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: 0x03040a }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  /* ---------- city: one instanced mesh, windows drawn procedurally in the shader ---------- */
  const boxes = [];
  const STEP = small ? 58 : 44;
  for (let x = -1300; x <= 1300; x += STEP) {
    for (let z = 500; z >= -3600; z -= STEP) {
      const ix = Math.round(x / STEP), iz = Math.round(z / STEP);
      if (Math.abs(x) < 80) continue;              // the avenue we fly down
      if (ix % 5 === 0 || iz % 6 === 0) continue;   // cross streets
      if (Math.random() < .12) continue;
      const near = Math.max(0, 1 - Math.abs(x) / 900);
      const hgt = 18 + Math.pow(Math.random(), 2.4) * (140 + near * 320);
      const wdt = STEP * (.55 + Math.random() * .3), dpt = STEP * (.55 + Math.random() * .3);
      boxes.push([x + (Math.random() - .5) * 8, z + (Math.random() - .5) * 8, wdt, hgt, dpt]);
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, .5, 0);
  const seeds = new Float32Array(boxes.length);
  const cityMat = new THREE.ShaderMaterial({
    uniforms: { uFog: { value: FOG }, uFogDen: { value: .00085 }, uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: `
      attribute float aSeed;
      varying vec3 vW; varying vec3 vN; varying float vSeed; varying float vDepth;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
        vW = w.xyz; vN = normalize(mat3(instanceMatrix) * normal); vSeed = aSeed;
        vec4 mv = viewMatrix * w; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uFog; uniform float uFogDen; uniform float uTime; uniform float uBoost;
      varying vec3 vW; varying vec3 vN; varying float vSeed; varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 base = vec3(.03, .04, .1) + vec3(.02, .03, .09) * max(0., vN.z) + vec3(.01,.012,.03) * (vW.y / 200.);
        vec3 col = base;
        if (abs(vN.y) < .5) {
          float u = abs(vN.x) > .5 ? vW.z : vW.x;
          vec2 g = vec2(u / 4.2, vW.y / 6.);
          vec2 cell = floor(g), f = fract(g);
          float win = step(.22, f.x) * step(f.x, .78) * step(.28, f.y) * step(f.y, .72);
          float h = hash(cell + vSeed * 31.7);
          float lit = step(.74 - uBoost * .12, h);
          lit *= .85 + .15 * sin(uTime * 2. + h * 60.);
          vec3 wc = h > .985 ? vec3(1., .22, .25) : h > .93 ? vec3(1., .4, .75) : h > .86 ? vec3(.45, .62, 1.) : vec3(1., .74, .45);
          col = mix(base, wc * (1.2 + uBoost), win * lit);
        } else if (vN.y > .5) {
          col = vec3(.02, .025, .06);
        }
        float fog = 1. - exp(-uFogDen * uFogDen * vDepth * vDepth);
        gl_FragColor = vec4(mix(col, uFog, clamp(fog, 0., 1.)), 1.);
      }`
  });
  const city = new THREE.InstancedMesh(geo, cityMat, boxes.length);
  const m = new THREE.Matrix4();
  boxes.forEach(([x, z, wdt, hgt, dpt], i) => {
    m.makeScale(wdt, hgt, dpt); m.setPosition(x, 0, z);
    city.setMatrixAt(i, m);
    seeds[i] = Math.random() * 100;
  });
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  scene.add(city);

  /* ---------- red aircraft beacons on the tallest roofs ---------- */
  const tall = boxes.filter(b => b[3] > 220);
  const beaconPos = new Float32Array(tall.length * 3);
  tall.forEach(([x, z, , hgt], i) => beaconPos.set([x, hgt + 3, z], i * 3));
  const beaconGeo = new THREE.BufferGeometry(); beaconGeo.setAttribute("position", new THREE.BufferAttribute(beaconPos, 3));
  const beaconMat = new THREE.PointsMaterial({ color: 0xff3030, size: 5, sizeAttenuation: false, transparent: true });
  scene.add(new THREE.Points(beaconGeo, beaconMat));

  /* ---------- traffic light trails along the avenue and cross streets ---------- */
  const CARS = small ? 260 : 520;
  const cars = Array.from({ length: CARS }, () => {
    const avenue = Math.random() < .55;
    return {
      avenue, lane: avenue ? (Math.random() < .5 ? -1 : 1) : 0,
      x: avenue ? 0 : -1300 + Math.random() * 2600,
      z: avenue ? 500 - Math.random() * 4100 : 500 - Math.round(Math.random() * 90) * 6 * STEP,
      v: (1.2 + Math.random() * 1.8) * (Math.random() < .5 ? 1 : -1)
    };
  });
  const carPos = new Float32Array(CARS * 3), carCol = new Float32Array(CARS * 3);
  const carGeo = new THREE.BufferGeometry();
  carGeo.setAttribute("position", new THREE.BufferAttribute(carPos, 3));
  carGeo.setAttribute("color", new THREE.BufferAttribute(carCol, 3));
  cars.forEach((c, i) => carCol.set(c.v > 0 ? [1, .25, .2] : [1, .92, .8], i * 3));
  scene.add(new THREE.Points(carGeo, new THREE.PointsMaterial({ size: small ? 3 : 3.5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .95 })));

  /* ---------- sizing ---------- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 78 : 62;
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
  const $id = id => document.getElementById(id);
  const hud = { spd: $id("hud-spd"), alt: $id("hud-alt"), nspd: $id("nav-spd"), nalt: $id("nav-alt"), wpt: $id("nav-wpt"), ladder: $id("hud-ladder") };
  let lastHud = 0;
  let visible = true, raf = 0, last = performance.now(), eased = 0, boost = 0, glide = 0;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    const target = (window.flightProgress ? window.flightProgress() : 0);
    eased += (target - eased) * (reduceMotion ? 1 : .06);
    boost += (audio() - boost) * .12;
    look.x += (look.tx - look.x) * .05; look.y += (look.ty - look.y) * .05;

    const p = ease(eased);
    const t = now * .001;
    glide = reduceMotion ? 0 : 180 - 180 * Math.cos(t * .03); // slow idle drift forward and back
    camera.position.set(
      Math.sin(t * .35) * 6 + look.x * 12,
      150 - p * 70 + Math.sin(t * .6) * 3,
      380 - p * 2300 - glide
    );
    camera.rotation.set(-.12 + p * .05 - look.y * .05, -look.x * .09, Math.sin(t * .35) * .012 - look.x * .02);

    cityMat.uniforms.uTime.value = t;
    cityMat.uniforms.uBoost.value = boost;
    beaconMat.opacity = .35 + .65 * Math.max(0, Math.sin(t * 2.2));

    for (let i = 0; i < CARS; i++) {
      const c = cars[i];
      if (c.avenue) {
        c.z += c.v * dt * .06;
        if (c.z < -3600) c.z += 4100; if (c.z > 500) c.z -= 4100;
        carPos.set([c.lane * 30 + (c.v > 0 ? 8 : -8), 2, c.z], i * 3);
      } else {
        c.x += c.v * dt * .06;
        if (c.x < -1300) c.x += 2600; if (c.x > 1300) c.x -= 2600;
        carPos.set([c.x, 2, c.z], i * 3);
      }
    }
    carGeo.attributes.position.needsUpdate = true;

    // Cockpit instruments follow the flight.
    if (now - lastHud > 90) {
      lastHud = now;
      const spd = Math.round(420 + (target - eased) * 9000 + boost * 120 + Math.sin(t * 1.3) * 6);
      const alt = Math.round(camera.position.y * 10);
      const wpt = (target < .3 ? 1 : target < .66 ? 2 : 3) + " / 3";
      if (hud.spd) hud.spd.textContent = String(spd).padStart(3, "0");
      if (hud.alt) hud.alt.textContent = String(alt).padStart(4, "0");
      if (hud.nspd) hud.nspd.textContent = spd + " kt";
      if (hud.nalt) hud.nalt.textContent = alt + " m";
      if (hud.wpt) hud.wpt.textContent = wpt;
      if (hud.ladder) hud.ladder.setAttribute("transform", `translate(0 ${(look.y * 30 + Math.sin(t * .6) * 4).toFixed(1)}) rotate(${(look.x * 4).toFixed(2)} 800 430)`);
    }

    renderer.render(scene, camera);
    if (visible) raf = requestAnimationFrame(frame);
  }

  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }).observe(section);
  raf = requestAnimationFrame(frame);
}
