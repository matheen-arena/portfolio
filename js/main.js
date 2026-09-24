(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const SFX = window.SFX;

  const C = {
    bg: "#07080a", fg: "#ece9e2", muted: "#7d858f", line: "#2b323b",
    orange: "#ff5b2e", green: "#7cf7c1", blue: "#8ab4ff", amber: "#f5c542",
    purple: "#c79bff", pink: "#ff7ab6", bone: "#c9c4ba"
  };

  $("#year").textContent = new Date().getFullYear();

  /* ================= SOUND TOGGLE + UI SFX ================= */
  const toggle = $("#sound-toggle");
  if (!SFX.supported) toggle.hidden = true;
  toggle.addEventListener("click", () => {
    SFX.toggle();
    if (SFX.enabled) SFX.toggleOn();
  });
  SFX.onChange(on => {
    toggle.setAttribute("aria-pressed", on ? "true" : "false");
    toggle.setAttribute("aria-label", on ? "Sound on. Turn sound off" : "Sound off. Turn sound on");
    $(".sound-state", toggle).textContent = on ? "on" : "off";
  });

  // Tiny oscilloscope inside the toggle: a flat line when muted, the live output waveform when on.
  (function scope() {
    const canvas = $(".scope", toggle);
    const { ctx, w, h } = fitCanvas(canvas);
    let level = 0; // eases between off (0) and on (1)
    (function draw(t) {
      level += ((SFX.enabled ? 1 : 0) - level) * .08;
      ctx.clearRect(0, 0, w, h);
      const buf = SFX.wave();
      let peak = .02;
      if (buf) for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const i = buf ? Math.floor((x / w) * (buf.length - 1)) : 0;
        const live = buf ? buf[i] / peak : 0;
        // Add a gentle synthetic wobble so the line stays alive between quiet notes.
        const idle = Math.sin(x * .45 + t * .006) * .35 * Math.sin(x / w * Math.PI);
        const off = Math.sin(x * .3 + t * .002) * .06;
        const y = (live * .6 + idle) * level + off * (1 - level);
        ctx.lineTo(x, h / 2 - y * (h / 2 - 2));
      }
      ctx.strokeStyle = level > .5 ? C.green : C.muted;
      ctx.globalAlpha = .5 + level * .5;
      ctx.lineWidth = 1.4; ctx.lineJoin = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    })(0);
  })();
  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "m" && !/input|textarea/i.test(e.target.tagName)) toggle.click();
  });

  document.addEventListener("pointerover", e => {
    const t = e.target.closest("[data-sfx], .btn, .log li, .metric, .stack-legend button");
    if (t && !t.contains(e.relatedTarget)) SFX.hover();
  });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-sfx]:not(#sound-toggle), .btn")) SFX.click();
  });

  /* ================= CURSOR ================= */
  if (finePointer) {
    const cur = $(".cursor"), ring = $(".cursor-ring");
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      if (!cur.classList.contains("is-visible")) { rx = e.clientX; ry = e.clientY; cur.classList.add("is-visible"); }
      mx = e.clientX; my = e.clientY;
    });
    document.documentElement.addEventListener("mouseleave", () => cur.classList.remove("is-visible"));
    addEventListener("pointerdown", () => cur.classList.add("is-down"));
    addEventListener("pointerup", () => cur.classList.remove("is-down"));
    document.addEventListener("pointerover", e => cur.classList.toggle("is-hover", !!e.target.closest("a, button, input, #stack-canvas")));
    (function loop() {
      rx += (mx - rx) * .2; ry += (my - ry) * .2;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(loop);
    })();
  }

  /* ================= REVEAL + NAV ================= */
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add("is-in");
      revealIO.unobserve(en.target);
      en.target.dispatchEvent(new CustomEvent("reveal"));
    });
  }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach(el => revealIO.observe(el));

  const navLinks = $$(".nav-links a");
  const navIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("main section[id]").forEach(s => navIO.observe(s));

  // Runs `fn` every frame only while `el` is on screen.
  function whileVisible(el, fn) {
    let on = false, raf = 0, last = performance.now();
    const tick = now => { const dt = Math.min(50, now - last); last = now; fn(dt, now); if (on) raf = requestAnimationFrame(tick); };
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !on) { on = true; last = performance.now(); raf = requestAnimationFrame(tick); }
      else if (!en.isIntersecting) { on = false; cancelAnimationFrame(raf); }
    }).observe(el);
  }

  function fitCanvas(canvas, maxDpr = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  // 0..1 loudness of what the site is currently playing (0 when muted).
  function audioEnergy() {
    if (!SFX.playing) return 0;
    const buf = SFX.wave();
    if (!buf) return 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 14);
  }

  /* ================= SMALL EFFECTS ================= */
  // Decode-style text reveal.
  const GLYPHS = "!<>-_\\/[]{}=+*^?#01";
  function scramble(el, dur = 650) {
    if (reduceMotion) return;
    const final = el._final || (el._final = el.textContent);
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    (function step(now) {
      const p = Math.min(1, (now - start) / dur), n = Math.floor(final.length * p);
      let out = final.slice(0, n);
      for (let i = n; i < final.length; i++) out += final[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = out;
      if (p < 1) el._raf = requestAnimationFrame(step); else el.textContent = final;
    })(start);
  }
  $$(".section-head").forEach(h => h.addEventListener("reveal", () => scramble($("h2", h))));
  $$(".metric").forEach(m => m.addEventListener("reveal", () => scramble($(".tag", m), 900)));
  setTimeout(() => scramble($(".hero-role"), 900), 500);
  if (finePointer) $$(".nav-links a").forEach(a => a.addEventListener("pointerenter", () => scramble(a, 350)));

  // Scroll progress bar.
  const bar = $(".progress i");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  if (finePointer && !reduceMotion) {
    // Faint grid revealed around the cursor.
    const spot = $(".spot");
    addEventListener("pointermove", e => {
      spot.style.setProperty("--mx", e.clientX + "px");
      spot.style.setProperty("--my", e.clientY + "px");
      spot.classList.add("is-on");
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", () => spot.classList.remove("is-on"));

    // Magnetic buttons.
    $$(".btn, .sound-toggle").forEach(el => {
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .25}px, ${(e.clientY - r.top - r.height / 2) * .35}px)`;
      });
      el.addEventListener("pointerleave", () => (el.style.transform = ""));
    });

    // Spotlight inside metric cards.
    $$(".metric").forEach(m => m.addEventListener("pointermove", e => {
      const r = m.getBoundingClientRect();
      m.style.setProperty("--mx", e.clientX - r.left + "px");
      m.style.setProperty("--my", e.clientY - r.top + "px");
    }));
  }

  /* ================= HERO LETTERS ================= */
  (function heroLetters() {
    const h1 = $(".hero-title"), split = $(".hero-title .split"), dot = $(".end-dot", split);
    const text = split.firstChild.textContent;
    h1.setAttribute("aria-label", text.trim());
    split.firstChild.remove();
    const chars = [...text].map(ch => {
      const el = document.createElement("span");
      el.className = "ch" + (ch === " " ? " sp" : "");
      el.textContent = ch === " " ? " " : ch;
      el.setAttribute("aria-hidden", "true");
      split.insertBefore(el, dot);
      return { el, y: 0 };
    });
    if (!finePointer || reduceMotion) return;
    let mx = -1e4, my = -1e4;
    const hero = $(".hero");
    hero.addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; });
    hero.addEventListener("pointerleave", () => { mx = my = -1e4; });
    whileVisible(h1, () => {
      const e = audioEnergy();
      chars.forEach((c, i) => {
        const r = c.el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2 - c.y; // undo our own offset
        const f = Math.max(0, 1 - Math.hypot(mx - cx, my - cy) / 180);
        const target = -f * f * 22 - e * 10 * Math.max(0, Math.sin(performance.now() * .006 - i * .5));
        c.y += (target - c.y) * .18;
        c.el.style.transform = `translateY(${c.y.toFixed(2)}px)`;
        c.el.style.color = f > .35 ? C.green : "";
      });
    });
  })();

  /* ================= MARQUEE (scroll-velocity driven) ================= */
  (function marquee() {
    const wrap = $(".marquee");
    const rows = $$(".marquee-row", wrap).map(row => {
      const tr = $(".marquee-track", row);
      return { tr, unit: tr.innerHTML, dir: +row.dataset.dir, x: 0, w: 0 };
    });
    // Repeat the content until one copy-set covers the screen twice over, so the loop never shows a gap.
    const measure = () => rows.forEach(r => {
      r.tr.innerHTML = r.unit;
      const one = r.tr.scrollWidth || 1;
      const copies = Math.max(2, Math.ceil(innerWidth / one) + 1) * 2;
      r.tr.innerHTML = r.unit.repeat(copies);
      r.w = one * copies / 2;
      r.x = r.dir < 0 ? 0 : -r.w;
    });
    measure();
    addEventListener("resize", debounce(measure, 200));
    if (document.fonts) document.fonts.ready.then(measure);
    if (reduceMotion) return;
    let lastY = scrollY, vel = 0, flip = 1;
    whileVisible(wrap, dt => {
      const d = scrollY - lastY; lastY = scrollY;
      vel += (d - vel) * .1;
      if (Math.abs(d) > 1) flip = d > 0 ? 1 : -1;
      const speed = (.035 + Math.min(1.2, Math.abs(vel) * .02)) * dt;
      const skew = Math.max(-8, Math.min(8, vel * .15));
      rows.forEach(r => {
        r.x += speed * r.dir * flip;
        if (r.x < -r.w) r.x += r.w;
        if (r.x > 0) r.x -= r.w;
        r.tr.style.transform = `translate3d(${r.x.toFixed(1)}px,0,0) skewX(${(-skew * r.dir).toFixed(2)}deg)`;
      });
    });
  })();

  /* ================= LIVE TAIL (facts from the resume) ================= */
  (function tail() {
    const body = $("#tail-body");
    const LINES = [
      ["DEPLOY", "ship", "zeb", "Argo Cron Workflows on Amazon EKS for on-demand ETL compute"],
      ["COST", "cost", "zeb", "always-on EC2 instances eliminated for ETL jobs"],
      ["COST", "cost", "zeb", "AWS data transfer costs reduced with a cost-optimized architecture"],
      ["COST", "cost", "avasoft", "self-hosted Grafana OSS on Amazon EKS, ~$250K/yr observability savings"],
      ["INGEST", "", "avasoft", "log ingestion centralized for 1,200+ Lambda functions with Amazon Kinesis"],
      ["INGEST", "", "avasoft", "log ingestion for 50+ AWS Batch and Amazon ECS workloads"],
      ["AI", "ai", "avasoft", "Kiro AI agent migrated 150+ dashboards and 300+ alerts"],
      ["GITOPS", "", "avasoft", "GitSync: production Grafana dashboards version-controlled in Git"],
      ["MIGRATE", "ship", "avasoft", "2,100 projects migrated GitLab → GitHub, reducing user seat costs"],
      ["SCALE", "ship", "avasoft", "self-hosted GitHub ARC runners on EKS with auto-scaling"],
      ["COST", "cost", "avasoft", "CI/CD runner costs reduced by 80%"],
      ["ETL", "", "stellar", "ETL pipelines from open-source databases to AWS S3"],
      ["DATA", "", "stellar", "MySQL data integrated and cleaned for high data quality"]
    ];
    let i = 0, timer = 0, running = false;
    const ts = () => new Date().toTimeString().slice(0, 8);

    function add(instant) {
      const [lvl, cls, who, msg] = LINES[i++ % LINES.length];
      const line = document.createElement("div");
      line.className = "tail-line";
      line.innerHTML = `<span class="ts"></span><span class="lv ${cls}"></span><span class="msg"><b></b> <span class="txt"></span></span>`;
      $(".ts", line).textContent = ts();
      $(".lv", line).textContent = lvl;
      $("b", line).textContent = who + " ›";
      body.append(line);
      while (body.children.length > 6) body.firstChild.remove();
      const txt = $(".txt", line);
      if (instant || reduceMotion) { txt.textContent = msg; return; }
      const caret = document.createElement("span"); caret.className = "caret";
      line.querySelector(".msg").append(caret);
      let n = 0;
      (function type() {
        txt.textContent = msg.slice(0, ++n);
        if (n % 3 === 0) SFX.key();
        if (n < msg.length) setTimeout(type, 16 + Math.random() * 18); else caret.remove();
      })();
    }
    for (let k = 0; k < 4; k++) add(true);
    new IntersectionObserver(([en]) => {
      running = en.isIntersecting;
      clearInterval(timer);
      if (running) timer = setInterval(() => add(false), 2600);
    }).observe(body);
  })();

  /* ================= WORK TIMELINE ================= */
  (function timeline() {
    const jobs = $(".jobs"), line = $(".timeline", jobs), fill = $(".tl-fill", line), dot = $(".tl-dot", line);
    const cards = $$(".job", jobs);
    let queued = false;
    function update() {
      queued = false;
      const r = line.getBoundingClientRect(), mark = innerHeight * .6;
      const p = Math.max(0, Math.min(1, (mark - r.top) / r.height));
      fill.style.transform = `scaleY(${p})`;
      dot.style.transform = `translateY(${p * r.height - 6}px)`;
      cards.forEach(c => c.classList.toggle("is-passed", c.getBoundingClientRect().top + 40 < mark));
    }
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener("resize", debounce(update, 150));
    update();
  })();

  /* ================= HERO: COCKPIT + BLACK HOLE ================= */
  (function cockpit() {
    const section = $(".cockpit"), canvas = $("#hero-canvas"), slot = $(".bh-slot");
    const reticle = $(".reticle"), rlabel = $("#rlabel"), clock = $("#hud-clock");
    const radarCanvas = $("#radar"), radarRead = $("#radar-read"), tapeCanvas = $("#tape");
    const thrustBar = $("#thrust"), thrustVal = $("#thrust-val"), cursorEl = $(".cursor");
    let ctx, w, h, radar, tape, bh = { x: 0, y: 0, R: 60 };
    const mouse = { nx: 0, ny: 0, tx: 0, ty: 0 };
    let warp = 0, energy = 0, lastScroll = scrollY, scrollVel = 0, flare = 0;

    /* --- starfield --- */
    const newStar = any => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: any ? Math.random() : 1,
      c: Math.random() < .12 ? (Math.random() < .5 ? C.green : C.blue) : "#cfd6de" });
    const stars = Array.from({ length: reduceMotion ? 220 : 640 }, () => newStar(true));

    /* --- accretion disk: radii in units of the event-horizon radius --- */
    const R_IN = 1.55, R_SPAN = 2.5;
    const HEAT = ["#fff6e6", "#ffd08a", "#ff9a3c", "#ff5b2e"]; // hot inner edge → cooler outer edge
    const disk = Array.from({ length: reduceMotion ? 700 : 2400 }, () => {
      const r = R_IN + Math.pow(Math.random(), 1.7) * R_SPAN;
      return { r, a: Math.random() * Math.PI * 2, y: (Math.random() - .5) * .05 * r, b: .45 + Math.random() * .55,
        heat: Math.min(3, Math.floor((r - R_IN) / R_SPAN * 4.2)) };
    });
    const jets = Array.from({ length: reduceMotion ? 40 : 160 }, (_, i) => ({ dir: i % 2 ? 1 : -1, s: Math.random(), v: Math.random() * .006, off: (Math.random() - .5) * .22 }));
    // Skills caught in orbit around the hole.
    const PROBES = ["EKS", "TERRAFORM", "GRAFANA", "ARGO CD", "GITHUB ACTIONS", "KIRO AI"].map((label, i) => ({
      label, r: 4.5 + (i % 2) * .6, a: i / 6 * Math.PI * 2, c: [C.orange, C.purple, C.green, C.amber, C.blue, C.pink][i]
    }));

    /* --- gauges (values straight from the resume) --- */
    const GAUGES = [
      { num: "~$250K", cap: "observability cost saved / yr", pct: 1, c: C.orange },
      { num: "80%", cap: "ci/cd runner cost cut", pct: .8, c: C.green },
      { num: "1,200+", cap: "lambdas, centralized logs", pct: 1, c: C.amber },
      { num: "2,100", cap: "projects migrated", pct: 1, c: C.blue }
    ];
    const gWrap = $("#gauges");
    const RAD = 34, CIRC = 2 * Math.PI * RAD, ARC = CIRC * .75;
    GAUGES.forEach((g, gi) => {
      const d = document.createElement("div");
      d.className = "gauge";
      d.innerHTML = `<svg viewBox="0 0 90 80"><g transform="rotate(135 45 42)">
          <circle class="g-ticks" cx="45" cy="42" r="${RAD + 7}" />
          <circle class="g-track" cx="45" cy="42" r="${RAD}" stroke-dasharray="${ARC} ${CIRC}" />
          <circle class="g-val" cx="45" cy="42" r="${RAD}" stroke="${g.c}" stroke-dasharray="${ARC} ${CIRC}" stroke-dashoffset="${ARC}" />
        </g><text class="g-num" x="45" y="47"></text></svg><div class="g-cap"></div>`;
      $("text", d).textContent = g.num;
      if (g.num.length > 5) $("text", d).style.fontSize = "12.5px";
      $(".g-cap", d).textContent = g.cap;
      gWrap.append(d);
      g.el = $(".g-val", d);
      d.addEventListener("pointerenter", () => SFX.note(gi + 4, .04));
    });
    setTimeout(() => GAUGES.forEach(g => g.el.setAttribute("stroke-dashoffset", ARC * (1 - g.pct))), 700);

    const DOMAINS = [
      { name: "AWS", items: "EKS · ECS · Lambda · S3 · Kinesis", a: .4, r: .72, c: C.orange },
      { name: "Observability", items: "Grafana · Loki · Mimir · Tempo · Alloy", a: 1.3, r: .5, c: C.green },
      { name: "CI/CD & GitOps", items: "GitHub Actions · ARC · Argo CD", a: 2.2, r: .8, c: C.amber },
      { name: "Databases & Search", items: "RDS · Aurora · Elasticsearch · MySQL", a: 3.1, r: .62, c: C.blue },
      { name: "IaC", items: "Terraform", a: 3.9, r: .38, c: C.purple },
      { name: "AI Agents", items: "Kiro AI Agent · GitHub Copilot Agent", a: 4.8, r: .7, c: C.pink },
      { name: "Scripting", items: "Python · Shell Scripting", a: 5.6, r: .55, c: C.bone }
    ].map(d => ({ ...d, glow: 0 }));

    /* --- sizing: the hole sits in the empty grid cell reserved for it --- */
    function resize() {
      ({ ctx, w, h } = fitCanvas(canvas, 1.5));
      if (radarCanvas.offsetParent) radar = fitCanvas(radarCanvas);
      if (tapeCanvas.offsetParent) tape = fitCanvas(tapeCanvas);
      const s0 = section.getBoundingClientRect(), r = slot.getBoundingClientRect();
      bh.x = r.left - s0.left + r.width / 2;
      bh.y = r.top - s0.top + r.height / 2;
      bh.R = Math.max(24, Math.min(r.width / 6.4, r.height / 4, (w - bh.x) / 4.4, 110));
    }
    resize();
    addEventListener("resize", debounce(resize, 150));
    if (document.fonts) document.fonts.ready.then(resize);

    /* --- input --- */
    section.addEventListener("pointermove", e => {
      const r = section.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      mouse.tx = x / r.width * 2 - 1; mouse.ty = y / r.height * 2 - 1;
      if (e.pointerType === "mouse") {
        $(".rx", reticle).style.transform = `translateY(${y}px)`;
        $(".ry", reticle).style.transform = `translateX(${x}px)`;
        $(".rbox", reticle).style.left = x + "px"; $(".rbox", reticle).style.top = y + "px";
        rlabel.style.left = x + "px"; rlabel.style.top = y + "px";
        const dist = Math.hypot(x - bh.x, y - bh.y) / bh.R;
        rlabel.textContent = dist < 6 ? `TARGET · EVENT HORIZON · ${dist.toFixed(1)} R` : `BRG ${((mouse.tx + 1) * 180).toFixed(1).padStart(5, "0")} · ELV ${(-mouse.ty * 45).toFixed(1)}`;
        cursorEl.classList.add("is-hidden");
      }
    });
    section.addEventListener("pointerleave", () => { mouse.tx = mouse.ty = 0; cursorEl.classList.remove("is-hidden"); });
    section.addEventListener("pointerdown", e => {
      if (e.target.closest("a, button")) return;
      warp = 1; flare = 1;
      SFX.whoosh();
    });
    const tick = () => { clock.textContent = new Date().toTimeString().slice(0, 8); };
    tick(); setInterval(tick, 1000);

    let spin = 0;
    whileVisible(canvas, (dt, t) => {
      const k = Math.min(3, dt / 16.67);
      energy += (audioEnergy() - energy) * .15;
      const d = scrollY - lastScroll; lastScroll = scrollY;
      scrollVel += (d - scrollVel) * .1;
      warp *= Math.pow(.965, k); flare *= Math.pow(.95, k);
      mouse.nx += (mouse.tx - mouse.nx) * .05 * k; mouse.ny += (mouse.ty - mouse.ny) * .05 * k;

      const { x: gx, y: gy, R } = bh;
      const incl = 1.36 + mouse.ny * .1;              // near edge-on view of the disk
      const ci = Math.cos(incl), si = Math.sin(incl);
      const roll = -.12 + mouse.nx * .08, cr = Math.cos(roll), sr = Math.sin(roll);
      const toScreen = (sx, sy) => [gx + (sx * cr - sy * sr) * R, gy + (sx * sr + sy * cr) * R];
      const diskSpeed = (1 + warp * 5 + energy * 2.5) * (reduceMotion ? .3 : 1);
      spin += .0009 * dt * diskSpeed;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);

      /* stars, bent away from the hole (gravitational lensing) */
      const speed = (.0016 + warp * .04 + energy * .01 + Math.min(.02, Math.abs(scrollVel) * .0006)) * k * (reduceMotion ? .3 : 1);
      const vx = w / 2 - mouse.nx * 60, vy = h / 2 - mouse.ny * 40, f = Math.max(w, h) * .28;
      const lens = (x, y) => {
        const dx = x - gx, dy = y - gy, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
        const push = (R * R * 2.2) / d;
        return [x + dx / d * push, y + dy / d * push, d];
      };
      ctx.lineCap = "round";
      for (const st of stars) {
        const pz = st.z;
        st.z -= speed;
        if (st.z <= .03) { Object.assign(st, newStar(false)); continue; }
        const [x1, y1] = lens(vx + st.x / pz * f, vy + st.y / pz * f);
        const [x2, y2, dd] = lens(vx + st.x / st.z * f, vy + st.y / st.z * f);
        if (x2 < -20 || x2 > w + 20 || y2 < -20 || y2 > h + 20) { Object.assign(st, newStar(false)); continue; }
        if (dd < R * 1.05) continue; // swallowed
        ctx.globalAlpha = Math.min(1, (1 - st.z) * 1.3);
        ctx.strokeStyle = st.c; ctx.lineWidth = (1 - st.z) * 1.8;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 + .01, y2); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* outer glow */
      const glow = ctx.createRadialGradient(gx, gy, R, gx, gy, R * 6);
      glow.addColorStop(0, `rgba(255,140,60,${.16 + energy * .2 + flare * .25})`);
      glow.addColorStop(.4, "rgba(255,91,46,.05)");
      glow.addColorStop(1, "rgba(255,91,46,0)");
      ctx.fillStyle = glow; ctx.fillRect(gx - R * 6, gy - R * 6, R * 12, R * 12);

      /* relativistic jets: particles streaming out along the spin axis */
      ctx.globalCompositeOperation = "lighter";
      const jetLen = 4.8 + energy * 2 + flare * 2.5;
      for (const jp of jets) {
        jp.s += (.004 + jp.v) * k * (1 + warp * 3 + energy * 2);
        if (jp.s > 1) { jp.s = 0; jp.off = (Math.random() - .5) * .22; }
        const along = 1.05 + jp.s * jetLen, spread = jp.off * (.3 + jp.s * 1.6);
        const [x0, y0] = toScreen(spread, jp.dir * along), [x1, y1] = toScreen(spread * 1.02, jp.dir * (along + .18));
        ctx.globalAlpha = (1 - jp.s) * (.45 + energy * .4 + flare * .4);
        ctx.strokeStyle = jp.s < .25 ? "#e8f0ff" : jp.s < .6 ? C.blue : C.green;
        ctx.lineWidth = 1.4 * (1 - jp.s * .6);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }

      /* disk particles, bucketed by colour and brightness so each bucket is one stroke */
      const back = HEAT.map(() => [[], [], []]), front = HEAT.map(() => [[], [], []]), lensTop = HEAT.map(() => [[], [], []]), lensBot = HEAT.map(() => [[], [], []]);
      for (const p of disk) {
        const a = p.a + spin / Math.pow(p.r, 1.5) * 3;
        const ca = Math.cos(a), sa = Math.sin(a);
        const X = p.r * ca, Z = p.r * sa;
        const doppler = 1 + .6 * -ca;                 // the side moving towards us is brighter
        const lvl = Math.min(2, Math.floor(p.b * doppler * 1.6));
        const trail = .11 / Math.sqrt(p.r);           // streak along the orbit
        const X0 = p.r * Math.cos(a - trail), Z0 = p.r * Math.sin(a - trail);
        const seg = [...toScreen(X0, -Z0 * ci + p.y), ...toScreen(X, -Z * ci + p.y)];
        (Z > 0 ? back : front)[p.heat][lvl].push(seg);
        // Lensed images: the far side bends over the top of the hole, the near side under it.
        const rl = 1.1 + (p.r - R_IN) * .32;
        const img = [...toScreen(rl * Math.cos(a - trail), -rl * Math.abs(Math.sin(a - trail))), ...toScreen(rl * ca, -rl * Math.abs(sa))];
        if (Z > 0 && p.r < R_IN + 1.6) lensTop[p.heat][lvl].push(img);
        else if (p.r < R_IN + .9) lensBot[p.heat][lvl].push([img[0], 2 * gy - img[1], img[2], 2 * gy - img[3]]);
      }
      const drawBuckets = (b, alphaMul, width) => b.forEach((levels, hi) => levels.forEach((segs, li) => {
        if (!segs.length) return;
        ctx.strokeStyle = HEAT[hi];
        ctx.globalAlpha = Math.min(1, (.22 + li * .28) * alphaMul * (1 + energy * .6 + flare * .8));
        ctx.lineWidth = width * (1 + li * .25);
        ctx.beginPath();
        for (const [a1, b1, a2, b2] of segs) { ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); }
        ctx.stroke();
      }));
      drawBuckets(back, .8, 1.2);
      drawBuckets(lensTop, 1.05, 1.1);
      drawBuckets(lensBot, .3, .8);

      /* event horizon + photon ring */
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.shadowColor = "rgba(255,170,90,.9)"; ctx.shadowBlur = 16 + energy * 20 + flare * 30;
      ctx.strokeStyle = `rgba(255,236,200,${.75 + energy * .25})`; ctx.lineWidth = 1.4 + energy * 1.5 + flare * 2;
      ctx.beginPath(); ctx.arc(gx, gy, R * 1.04, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      /* near side of the disk passes in front of the hole */
      ctx.globalCompositeOperation = "lighter";
      drawBuckets(front, 1, 1.3);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      /* captured skill probes */
      ctx.font = `500 ${w < 760 ? 9 : 10.5}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "middle";
      PROBES.forEach(pr => {
        const a = pr.a + spin / Math.pow(pr.r, 1.5) * 3;
        const X = pr.r * Math.cos(a), Z = pr.r * Math.sin(a);
        const [px, py] = toScreen(X, -Z * ci);
        const behind = Z > 0 && Math.hypot(px - gx, py - gy) < R * 1.1;
        if (behind) return;
        ctx.globalAlpha = Z > 0 ? .45 : 1;
        ctx.fillStyle = pr.c;
        ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
        if (Z <= 0) {
          ctx.strokeStyle = pr.c; ctx.lineWidth = 1;
          const up = py < gy ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 10, py + up * 12); ctx.lineTo(px + 18, py + up * 12); ctx.stroke();
          ctx.fillText(pr.label, px + 21, py + up * 12);
        }
      });
      ctx.globalAlpha = 1;

      /* radar */
      if (radar && radarCanvas.offsetParent) {
        const { ctx: r, w: rw } = radar, c = rw / 2, rr = c - 4;
        const sweep = (t * .0016) % (Math.PI * 2);
        r.clearRect(0, 0, rw, rw);
        r.strokeStyle = "rgba(124,247,193,.18)"; r.lineWidth = 1;
        [1, .66, .33].forEach(q => { r.beginPath(); r.arc(c, c, rr * q, 0, Math.PI * 2); r.stroke(); });
        r.beginPath(); r.moveTo(c - rr, c); r.lineTo(c + rr, c); r.moveTo(c, c - rr); r.lineTo(c, c + rr); r.stroke();
        for (let i = 0; i < 28; i++) {
          const a0 = sweep - i * .03;
          r.fillStyle = `rgba(124,247,193,${.28 * (1 - i / 28)})`;
          r.beginPath(); r.moveTo(c, c); r.arc(c, c, rr, a0 - .03, a0); r.closePath(); r.fill();
        }
        r.strokeStyle = C.green; r.beginPath(); r.moveTo(c, c); r.lineTo(c + Math.cos(sweep) * rr, c + Math.sin(sweep) * rr); r.stroke();
        r.font = '500 9px "JetBrains Mono", monospace'; r.textBaseline = "middle";
        DOMAINS.forEach(dm => {
          const diff = (sweep - dm.a + Math.PI * 4) % (Math.PI * 2);
          if (diff < .08 && dm.glow < .5) {
            dm.glow = 1;
            radarRead.innerHTML = `contact › <b></b> <span></span>`;
            $("b", radarRead).textContent = dm.name; $("span", radarRead).textContent = dm.items;
          }
          dm.glow = Math.max(.15, dm.glow - dt * .0005);
          const x = c + Math.cos(dm.a) * rr * dm.r, y = c + Math.sin(dm.a) * rr * dm.r;
          r.globalAlpha = dm.glow;
          r.fillStyle = dm.c; r.beginPath(); r.arc(x, y, 3, 0, Math.PI * 2); r.fill();
          r.strokeStyle = dm.c; r.beginPath(); r.arc(x, y, 3 + (1 - dm.glow) * 8, 0, Math.PI * 2); r.stroke();
          r.fillStyle = C.fg; r.textAlign = x > c ? "right" : "left";
          r.fillText(dm.name.split(" ")[0].toUpperCase(), x + (x > c ? -7 : 7), y - 8);
          r.globalAlpha = 1;
        });
      }

      /* heading tape follows the disk's rotation */
      if (tape && tapeCanvas.offsetParent) {
        const { ctx: tc, w: tw, h: th } = tape;
        const heading = ((spin * 20 + mouse.nx * 30) % 360 + 360) % 360, pxPerDeg = 4;
        tc.clearRect(0, 0, tw, th);
        tc.font = '500 9px "JetBrains Mono", monospace'; tc.textAlign = "center"; tc.textBaseline = "top";
        const from = Math.floor((heading - tw / 2 / pxPerDeg) / 5) * 5;
        for (let deg = from; deg < heading + tw / 2 / pxPerDeg; deg += 5) {
          const x = tw / 2 + (deg - heading) * pxPerDeg, major = deg % 30 === 0;
          tc.globalAlpha = Math.max(0, 1 - Math.abs(x - tw / 2) / (tw / 2));
          tc.strokeStyle = major ? C.fg : C.muted;
          tc.beginPath(); tc.moveTo(x, 0); tc.lineTo(x, major ? 10 : 5); tc.stroke();
          if (major) {
            const n = ((deg % 360) + 360) % 360;
            tc.fillStyle = C.muted;
            tc.fillText({ 0: "N", 90: "E", 180: "S", 270: "W" }[n] || String(n).padStart(3, "0"), x, 14);
          }
        }
        tc.globalAlpha = 1; tc.fillStyle = C.orange;
        tc.beginPath(); tc.moveTo(tw / 2 - 5, th); tc.lineTo(tw / 2 + 5, th); tc.lineTo(tw / 2, th - 7); tc.fill();
        tc.fillStyle = C.fg; tc.fillText(heading.toFixed(0).padStart(3, "0") + "°", tw / 2, 24);
      }

      /* thrust meter */
      const thrust = Math.min(1, .08 + warp * .9 + energy * .7 + Math.min(.4, Math.abs(scrollVel) * .01));
      thrustBar.style.transform = `scaleX(${thrust.toFixed(3)})`;
      thrustVal.textContent = String(Math.round(thrust * 100)).padStart(3, "0");
    });
  })();

  /* ================= METRICS: COUNT-UP + SPARKLINES ================= */
  $$(".metric").forEach((card, idx) => {
    const num = $(".count", card);
    const to = +num.dataset.to;
    const canvas = $(".spark", card);
    const dir = card.dataset.spark;

    // Deterministic-looking random walk trending the right way.
    const pts = [];
    let v = dir === "down" ? .85 : .15;
    for (let i = 0; i < 40; i++) {
      v += (dir === "down" ? -.02 : .02) + (Math.sin(i * 1.7 + idx) * .05) + (Math.random() - .5) * .05;
      pts.push(Math.min(.95, Math.max(.05, v)));
    }

    function draw(prog) {
      const { ctx, w, h } = fitCanvas(canvas);
      const n = Math.max(2, Math.floor(pts.length * prog));
      const col = dir === "down" ? C.orange : C.green;
      const X = i => (i / (pts.length - 1)) * w, Y = p => h - 4 - p * (h - 8);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, col + "44"); grad.addColorStop(1, col + "00");
      ctx.beginPath(); ctx.moveTo(X(0), h);
      for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(pts[i]));
      ctx.lineTo(X(n - 1), h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < n; i++) i ? ctx.lineTo(X(i), Y(pts[i])) : ctx.moveTo(X(i), Y(pts[i]));
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(n - 1), Y(pts[n - 1]), 3, 0, Math.PI * 2); ctx.fill();
    }
    draw(1);
    addEventListener("resize", debounce(() => draw(1), 200));

    card.addEventListener("reveal", () => {
      const dur = reduceMotion ? 1 : 1800, start = performance.now();
      (function step(now) {
        const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 4);
        num.textContent = Math.round(to * e).toLocaleString();
        draw(e);
        if (p < 1) requestAnimationFrame(step); else SFX.note(idx + 3, .03);
      })(start);
    });
  });

  /* ================= STACK GRAPH ================= */
  (function stack() {
    const canvas = $("#stack-canvas");
    const legend = $("#stack-legend");
    const list = $("#stack-list");
    // Items are ordered so the longest labels sit at the ends of each fan (more room on phones).
    const GROUPS = [
      { name: "AWS", c: C.orange, items: ["AWS Batch", "Lambda", "EKS", "ECS", "EC2", "S3", "Kinesis", "AWS Network"] },
      { name: "Databases & Search", c: C.blue, items: ["RDS", "Aurora", "Elasticsearch", "MySQL"] },
      { name: "Observability", c: C.green, items: ["Grafana Metrics", "Grafana OSS", "Loki", "Mimir", "Alloy", "Logz.io", "Grafana Logs", "Grafana Tempo"] },
      { name: "CI/CD & GitOps", c: C.amber, items: ["Argo Cron Workflow", "GitHub Actions", "GitLab", "JFrog", "GitHub", "Argo CD", "GitHub ARC"] },
      { name: "Infrastructure as Code", c: C.purple, items: ["Terraform"] },
      { name: "AI Agents", c: C.pink, items: ["Kiro AI Agent", "GitHub Copilot Agent"] },
      { name: "Scripting", c: C.bone, items: ["Python", "Shell Scripting"] }
    ];

    let ctx, w, h, hubs = [], nodes = [], focus = -1, hover = null, stackSmall = false;
    const mouse = { x: -1e4, y: -1e4 };

    GROUPS.forEach((g, gi) => {
      const li = document.createElement("li");
      li.textContent = `${g.name}: ${g.items.join(", ")}`;
      list.append(li);
      const b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--c", g.c);
      b.innerHTML = `<i></i>`; b.append(g.name);
      b.addEventListener("click", () => {
        focus = focus === gi ? -1 : gi;
        $$("button", legend).forEach((x, i) => x.classList.toggle("is-on", i === focus));
        SFX.note(gi + 2, .05);
      });
      legend.append(b);
    });

    function build() {
      // Phones get a 2-column grid of clusters; wider screens get a ring.
      const small = canvas.parentElement.clientWidth < 640;
      const CELL_H = 160;
      canvas.style.height = small ? Math.ceil(GROUPS.length / 2) * CELL_H + 16 + "px" : "";
      ({ ctx, w, h } = fitCanvas(canvas));
      const R = small ? 62 : 92;
      const rx = w / 2 - R - 110, ry = h / 2 - R - 30;
      hubs = GROUPS.map((g, i) => {
        let bx, by, lx, ly, la;
        if (small) {
          const cw = (w - 16) / 2, x0 = 8 + (i % 2) * cw, y0 = 8 + Math.floor(i / 2) * CELL_H;
          bx = x0 + 16; by = y0 + CELL_H / 2 + 8; lx = x0 + 8; ly = y0 + 12; la = "left";
        } else {
          const a = (i / GROUPS.length) * Math.PI * 2 - Math.PI / 2;
          bx = w / 2 + Math.cos(a) * rx; by = h / 2 + Math.sin(a) * ry; lx = 0; ly = -18; la = "center";
        }
        return { ...g, i, bx, by, x: bx, y: by, lx, ly, la };
      });
      const old = nodes;
      nodes = [];
      hubs.forEach(hb => hb.items.forEach((label, j) => {
        const prev = old.find(n => n.label === label);
        const n = hb.items.length;
        let a, rr;
        if (small) {
          // Fan out to the right of the hub so labels have room.
          a = n === 1 ? 0 : -1.2 + (j / (n - 1)) * 2.4;
          rr = n <= 3 ? 48 : R;
        } else {
          // Spread items around the hub, leaving the top free for the hub label.
          a = -Math.PI / 2 + Math.PI / 5 + (j + .5) / n * (Math.PI * 2 - Math.PI * 2 / 5);
          rr = R * (n > 5 && j % 2 ? .62 : 1);
        }
        nodes.push({
          label, hub: hb, ox: Math.cos(a) * rr, oy: Math.sin(a) * rr,
          x: prev ? Math.min(w, prev.x) : hb.x, y: prev ? Math.min(h, prev.y) : hb.y,
          vx: 0, vy: 0, r: j === 0 ? 5.5 : 4, phase: Math.random() * 6
        });
      }));
      stackSmall = small;
    }
    build();
    addEventListener("resize", debounce(build, 200));

    canvas.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener("pointerleave", () => { mouse.x = mouse.y = -1e4; });

    whileVisible(canvas, (dt, t) => {
      const k = Math.min(2, dt / 16.67);
      const small = stackSmall;
      const font = small ? 10.5 : 12;

      hubs.forEach(hb => {
        hb.x = hb.bx + Math.sin(t * .0004 + hb.i) * 8;
        hb.y = hb.by + Math.cos(t * .0005 + hb.i * 2) * 8;
      });

      // Forces: spring to hub, repel each other, flee the cursor.
      for (const n of nodes) {
        n.vx += (n.hub.x + n.ox - n.x) * .02 * k;
        n.vy += (n.hub.y + n.oy - n.y) * .02 * k;
        const mx = n.x - mouse.x, my = n.y - mouse.y, md = Math.hypot(mx, my) || 1;
        if (md < 110) { const f = (1 - md / 110) * 2.2; n.vx += mx / md * f * k; n.vy += my / md * f * k; }
      }
      let newHover = null;
      for (const n of nodes) {
        n.vx *= .86; n.vy *= .86;
        n.x += n.vx * k + Math.sin(t * .001 + n.phase) * .08;
        n.y += n.vy * k + Math.cos(t * .0012 + n.phase) * .08;
        n.x = Math.max(8, Math.min(w - 8, n.x)); n.y = Math.max(8, Math.min(h - 8, n.y));
        if (Math.hypot(n.x - mouse.x, n.y - mouse.y) < 130 && !newHover) newHover = n;
      }
      if (newHover !== hover) { hover = newHover; if (hover) SFX.hover(); }

      ctx.clearRect(0, 0, w, h);
      // Faint links between neighbouring hubs.
      ctx.lineWidth = 1;
      if (!small) {
        ctx.strokeStyle = C.line; ctx.setLineDash([2, 6]);
        ctx.beginPath();
        hubs.forEach((hb, i) => { const nx = hubs[(i + 1) % hubs.length]; ctx.moveTo(hb.x, hb.y); ctx.lineTo(nx.x, nx.y); });
        ctx.stroke(); ctx.setLineDash([]);
      }

      for (const n of nodes) {
        const dim = focus >= 0 && n.hub.i !== focus;
        ctx.globalAlpha = dim ? .08 : .35;
        ctx.strokeStyle = n.hub.c;
        ctx.beginPath(); ctx.moveTo(n.hub.x, n.hub.y); ctx.lineTo(n.x, n.y); ctx.stroke();
      }

      ctx.textBaseline = "middle";
      for (const n of nodes) {
        const dim = focus >= 0 && n.hub.i !== focus;
        const near = Math.max(0, 1 - Math.hypot(n.x - mouse.x, n.y - mouse.y) / 160);
        ctx.globalAlpha = dim ? .15 : 1;
        ctx.fillStyle = n.hub.c;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + near * 3, 0, Math.PI * 2); ctx.fill();
        ctx.font = `${500} ${font + near * 2}px "Space Grotesk", sans-serif`;
        ctx.fillStyle = dim ? C.muted : C.fg;
        ctx.textAlign = !small && n.x < n.hub.x - 4 ? "right" : "left";
        ctx.fillText(n.label, n.x + (ctx.textAlign === "right" ? -9 : 9), n.y);
      }

      for (const hb of hubs) {
        const dim = focus >= 0 && hb.i !== focus;
        ctx.globalAlpha = dim ? .2 : 1;
        ctx.fillStyle = C.bg; ctx.strokeStyle = hb.c; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hb.x, hb.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = `500 ${small ? 9 : 10.5}px "JetBrains Mono", monospace`;
        ctx.fillStyle = hb.c; ctx.textAlign = hb.la;
        if (small) ctx.fillText(hb.name.toUpperCase(), hb.lx, hb.ly);
        else ctx.fillText(hb.name.toUpperCase(), hb.x, hb.y + hb.ly);
      }
      ctx.globalAlpha = 1;
    });
  })();

  /* ================= TERMINAL ================= */
  (function terminal() {
    const out = $("#term-out"), form = $("#term-form"), input = $("#term-input"), body = $("#term-body");
    const history = []; let hIdx = 0;
    const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const print = (html, cls = "") => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; out.append(d); body.scrollTop = body.scrollHeight; };

    const CMDS = {
      help: () => `<pre><span class="t-acc">available commands</span>
  <span class="t-ok">whoami</span>        who is this
  <span class="t-ok">experience</span>    work history
  <span class="t-ok">skills</span>        the stack
  <span class="t-ok">impact</span>        numbers that matter
  <span class="t-ok">contact</span>       get in touch
  <span class="t-ok">neofetch</span>      system info
  <span class="t-ok">sound</span> on|off  toggle audio
  <span class="t-ok">clear</span>         clear screen
<span class="t-dim">also try: kubectl get pods, terraform plan, sudo hire-me
tip: ↑/↓ for history, tab to autocomplete</span></pre>`,
      whoami: () => `Abdul Matheen: AI-first Cloud and Platform Engineer, Chennai, India.
Expertise in Cloud, DevOps, Observability and AI automation. Focused on building reliable cloud platforms,
modern developer workflows, and integrating AI into modern engineering practices.`,
      about: () => CMDS.whoami(),
      experience: () => `<pre><span class="t-ok">May 2026 – Present</span>           Cloud and Platform Engineer, <span class="t-acc">zeb</span>, Chennai
                             Retail · Unified Customer Data Portal
<span class="t-ok">May 2025 – April 2026</span>        Cloud and DevOps Engineer, <span class="t-acc">Avasoft</span>, Chennai
                             Retail · Logz to Grafana OSS Migration
                             Retail · GitLab to GitHub Migration
<span class="t-ok">August 2024 – November 2024</span>  Python Developer – Intern, <span class="t-acc">Stellar Innovations</span>, Bangalore
                             Healthcare · ETL pipeline development</pre>`,
      work: () => CMDS.experience(),
      skills: () => `<pre><span class="t-acc">iac</span>            Terraform
<span class="t-acc">aws</span>            EKS ECS S3 Lambda EC2 RDS Aurora Elasticsearch Kinesis Batch, AWS Network
<span class="t-ok">observability</span>  Grafana OSS, Grafana Logs, Grafana Metrics, Grafana Tempo, Loki, Mimir, Alloy, Logz.io
<span class="t-blue">tools</span>          Argo Cron Workflow, Argo CD
<span class="t-acc">ci/cd</span>          GitLab, GitHub, GitHub Actions, Action Runner Controller, JFrog
<span class="t-ok">ai agents</span>      GitHub Copilot Agent, Kiro AI Agent
<span class="t-blue">scripting</span>      Shell Scripting, Python, MySQL</pre>`,
      stack: () => CMDS.skills(),
      impact: () => `<pre><span class="t-ok">~$250K/yr</span>  observability costs reduced (self-hosted Grafana OSS on EKS)
<span class="t-ok">1,200+</span>     Lambda functions with centralized log ingestion (+ 50+ Batch/ECS workloads)
<span class="t-ok">2,100</span>      projects migrated from GitLab to GitHub, reducing user seat costs
<span class="t-ok">80%</span>        reduction in CI/CD runner costs (GitHub ARC runners on EKS)
<span class="t-ok">150+ / 300+</span> dashboards / alerts migrated by a custom Kiro AI agent</pre>`,
      contact: () => `<pre>email     <a href="mailto:matheenroy@gmail.com">matheenroy@gmail.com</a>
linkedin  <a href="https://linkedin.com/in/abumatheen" target="_blank" rel="noopener">linkedin.com/in/abumatheen</a>
github    <a href="https://github.com/matheen-arena" target="_blank" rel="noopener">github.com/matheen-arena</a></pre>`,
      neofetch: () => `<pre><span class="t-acc">    ▄▄▄▄▄▄▄     </span> <span class="t-ok">matheen</span>@<span class="t-ok">platform</span>
<span class="t-acc">  ▄█▀     ▀█▄   </span> ----------------
<span class="t-acc"> █▀  ▄▄▄▄▄  ▀█  </span> <span class="t-acc">Role</span>      Cloud and Platform Engineer
<span class="t-acc"> █  █ ◉ ◉ █  █  </span> <span class="t-acc">Location</span>  Chennai, India
<span class="t-acc"> █▄  ▀▀▀▀▀  ▄█  </span> <span class="t-acc">Cloud</span>     AWS
<span class="t-acc">  ▀█▄     ▄█▀   </span> <span class="t-acc">IaC</span>       Terraform
<span class="t-acc">    ▀▀▀▀▀▀▀     </span> <span class="t-acc">GitOps</span>    Argo CD
                  <span class="t-acc">Observe</span>   Grafana OSS
                  <span class="t-acc">AI</span>        Kiro AI Agent, GitHub Copilot Agent
                  <span class="t-acc">Study</span>     Bachelor of Engineering</pre>`,
      ls: () => `about/  experience/  skills/  impact/  contact/  <span class="t-ok">hire-me.sh</span>`,
      "./hire-me.sh": () => CMDS["sudo hire-me"](),
      "kubectl get pods": () => `<pre><span class="t-dim">NAMESPACE: career</span>
<span class="t-dim">NAME                                     STATUS      LOCATION    AGE</span>
<span class="t-ok">zeb-cloud-platform-engineer              Running     Chennai     May 2026 – Present</span>
avasoft-cloud-devops-engineer            Completed   Chennai     May 2025 – April 2026
stellar-innovations-python-dev-intern    Completed   Bangalore   August 2024 – November 2024</pre>`,
      "terraform plan": () => `<pre>Terraform will perform the following actions:

  <span class="t-ok">+ resource "team_member" "abdul_matheen"</span> {
      <span class="t-ok">+</span> role     = "Cloud and Platform Engineer"
      <span class="t-ok">+</span> location = "Chennai, India"
      <span class="t-ok">+</span> focus    = ["Cloud", "DevOps", "Observability", "AI automation"]
    }

<span class="t-acc">Plan:</span> 1 to add, 0 to change, 0 to destroy.
<span class="t-dim">run 'sudo hire-me' to apply.</span></pre>`,
      "sudo hire-me": () => { setTimeout(() => { location.href = "mailto:matheenroy@gmail.com?subject=Let%27s%20talk"; }, 700); return `<span class="t-ok">[sudo] access granted.</span> opening mail client…`; },
      date: () => new Date().toString(),
      pwd: () => "/home/matheen/portfolio",
      history: () => history.map((h, i) => `${String(i + 1).padStart(4)}  ${esc(h)}`).join("<br>"),
      exit: () => { document.getElementById("contact").scrollIntoView({ behavior: "smooth" }); return "logout. taking you to contact →"; },
      "sound on": () => { if (!SFX.enabled) toggle.click(); return "audio: <span class='t-ok'>on</span>"; },
      "sound off": () => { if (SFX.enabled) toggle.click(); return "audio: <span class='t-dim'>off</span>"; },
      sound: () => `audio is ${SFX.enabled ? "<span class='t-ok'>on</span>" : "<span class='t-dim'>off</span>"}. use: sound on | sound off`
    };
    const NAMES = Object.keys(CMDS);

    print(`<span class="t-dim">Last login: ${new Date().toDateString()} on ttys001</span>`);
    print(`Welcome. Type <span class="t-ok">help</span> to get started.`);

    function run(raw) {
      const cmd = raw.trim().replace(/\s+/g, " ");
      print(esc(raw), "t-cmd");
      if (!cmd) return;
      history.push(cmd); hIdx = history.length;
      const lower = cmd.toLowerCase();
      if (lower === "clear") { out.innerHTML = ""; return; }
      if (lower.startsWith("echo ")) { print(esc(cmd.slice(5))); return; }
      if (lower.startsWith("sudo ") && !CMDS[lower]) { print(`<span class="t-acc">matheen is not in the sudoers file.</span> nice try though. <span class="t-dim">(try 'sudo hire-me')</span>`); SFX.error(); return; }
      const fn = CMDS[lower];
      if (fn) { print(fn()); SFX.enter(); }
      else { print(`<span class="t-acc">command not found:</span> ${esc(cmd.split(" ")[0])}. type <span class="t-ok">help</span>`); SFX.error(); }
    }

    form.addEventListener("submit", e => { e.preventDefault(); run(input.value); input.value = ""; });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowUp") { e.preventDefault(); if (hIdx > 0) input.value = history[--hIdx]; }
      else if (e.key === "ArrowDown") { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ""; }
      else if (e.key === "Tab") {
        e.preventDefault();
        const v = input.value.toLowerCase(), hit = NAMES.filter(n => n.startsWith(v));
        if (v && hit.length === 1) input.value = hit[0];
        else if (v && hit.length > 1) print(hit.join("  "), "t-dim");
      } else if (e.key.length === 1 || e.key === "Backspace") SFX.key();
    });
    body.addEventListener("click", () => { if (!getSelection().toString()) input.focus({ preventScroll: true }); });
  })();

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  requestAnimationFrame(() => document.body.classList.add("is-ready"));
})();
