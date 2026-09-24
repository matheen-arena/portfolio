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
      tr.innerHTML += tr.innerHTML; // two copies so it can loop seamlessly
      return { tr, dir: +row.dataset.dir, x: 0, w: 0 };
    });
    const measure = () => rows.forEach(r => { r.w = r.tr.scrollWidth / 2; r.x = r.dir < 0 ? 0 : -r.w; });
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

  /* ================= HERO: TELEMETRY FLOW FIELD ================= */
  (function hero() {
    const canvas = $("#hero-canvas");
    const section = $(".hero");
    const hud = $("#hud-rate");
    let ctx, w, h, parts = [], ingested = 0;
    const mouse = { x: -1e4, y: -1e4, lastMove: -1e4 };
    const shocks = [];
    const PALETTE = [C.bone, C.bone, C.bone, C.bone, C.green, C.orange, C.blue, C.amber];

    function spawn(p, anywhere) {
      p.x = anywhere ? Math.random() * w : (Math.random() < .5 ? -5 : Math.random() * w);
      p.y = Math.random() * h;
      p.px = p.x; p.py = p.y;
      p.s = .6 + Math.random() * 1.4;
      p.life = 200 + Math.random() * 400;
      p.c = (Math.random() * PALETTE.length) | 0;
      return p;
    }

    function resize() {
      ({ ctx, w, h } = fitCanvas(canvas, 1.5));
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
      const target = Math.round(Math.min(1500, (w * h) / 750) * (reduceMotion ? .3 : 1));
      while (parts.length < target) parts.push(spawn({}, true));
      parts.length = target;
    }
    resize();
    addEventListener("resize", debounce(resize, 150));

    section.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.lastMove = performance.now();
    });
    section.addEventListener("pointerleave", () => { mouse.lastMove = -1e4; });
    section.addEventListener("pointerdown", e => {
      if (e.target.closest("a, button")) return;
      const r = canvas.getBoundingClientRect();
      shocks.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 0 });
      SFX.whoosh();
    });

    const field = (x, y, t) =>
      Math.sin(x * .0018 + t * .00015) * 1.3 +
      Math.cos(y * .0024 - t * .0001) * 1.3 +
      Math.sin((x - y) * .0009 + t * .0002) * .9;

    const buckets = PALETTE.map(() => []);
    let energy = 0;

    whileVisible(canvas, (dt, t) => {
      // With sound on, the field speeds up and the collector pulses with the audio.
      energy += (audioEnergy() - energy) * .15;
      const k = dt / 16.67 * (reduceMotion ? .4 : 1) * (1 + energy * 2.2);
      ctx.fillStyle = "rgba(7,8,10,0.11)";
      ctx.fillRect(0, 0, w, h);

      // Collector follows the cursor; with no cursor it drifts on its own.
      let cx = mouse.x, cy = mouse.y;
      if (t - mouse.lastMove > 2500) {
        cx = w * (.62 + .22 * Math.sin(t * .00023));
        cy = h * (.5 + .28 * Math.sin(t * .00031 + 1));
      }
      const R = Math.min(220, Math.max(140, w * .14)), R2 = R * R;

      for (const s of shocks) s.r += 14 * k;
      while (shocks.length && shocks[0].r > Math.max(w, h)) shocks.shift();

      buckets.forEach(b => (b.length = 0));
      for (const p of parts) {
        const a = field(p.x, p.y, t);
        let vx = Math.cos(a) * p.s, vy = Math.sin(a) * p.s;
        const dx = cx - p.x, dy = cy - p.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1, f = 1 - d / R;
          vx += (-dy / d) * f * 3.2 + (dx / d) * f * 1.6;
          vy += (dx / d) * f * 3.2 + (dy / d) * f * 1.6;
          if (d < 10) { ingested++; spawn(p); continue; }
        }
        for (const s of shocks) {
          const sx = p.x - s.x, sy = p.y - s.y, sd = Math.sqrt(sx * sx + sy * sy) || 1;
          if (Math.abs(sd - s.r) < 40) { vx += sx / sd * 6; vy += sy / sd * 6; }
        }
        p.px = p.x; p.py = p.y;
        p.x += vx * k; p.y += vy * k;
        p.life -= k;
        if (p.life < 0 || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) { spawn(p); continue; }
        buckets[p.c].push(p);
      }

      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      buckets.forEach((b, i) => {
        if (!b.length) return;
        ctx.strokeStyle = PALETTE[i];
        ctx.globalAlpha = PALETTE[i] === C.bone ? .45 : .85;
        ctx.beginPath();
        for (const p of b) { ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // Collector ring.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * .0008);
      ctx.strokeStyle = C.green; ctx.globalAlpha = .55; ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.arc(0, 0, 26 * (1 + energy * .9), 0, Math.PI * 2); ctx.stroke();
      if (energy > .05) {
        ctx.setLineDash([]); ctx.strokeStyle = C.orange; ctx.globalAlpha = energy * .8;
        ctx.beginPath(); ctx.arc(0, 0, 40 + energy * 50, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = C.orange;
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      hud.textContent = ingested.toLocaleString();
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

  /* ================= STACK SPHERE ================= */
  (function stack() {
    const canvas = $("#stack-canvas");
    const legend = $("#stack-legend");
    const list = $("#stack-list");
    const tip = $("#stack-tip");
    const GROUPS = [
      { name: "AWS", c: C.orange, items: ["AWS Batch", "Lambda", "EKS", "ECS", "EC2", "S3", "Kinesis", "AWS Network"] },
      { name: "Databases & Search", c: C.blue, items: ["RDS", "Aurora", "Elasticsearch", "MySQL"] },
      { name: "Observability", c: C.green, items: ["Grafana Metrics", "Grafana OSS", "Loki", "Mimir", "Alloy", "Logz.io", "Grafana Logs", "Grafana Tempo"] },
      { name: "CI/CD & GitOps", c: C.amber, items: ["Argo Cron Workflow", "GitHub Actions", "GitLab", "JFrog", "GitHub", "Argo CD", "GitHub ARC"] },
      { name: "Infrastructure as Code", c: C.purple, items: ["Terraform"] },
      { name: "AI Agents", c: C.pink, items: ["Kiro AI Agent", "GitHub Copilot Agent"] },
      { name: "Scripting", c: C.bone, items: ["Python", "Shell Scripting"] }
    ];

    // Spread every skill evenly over the sphere (Fibonacci points), then give each
    // group a contiguous region: points are handed out greedily to the nearest group seed.
    const GOLD = Math.PI * (3 - Math.sqrt(5));
    const fib = (i, n) => { const y = 1 - ((i + .5) / n) * 2, r = Math.sqrt(1 - y * y), phi = i * GOLD; return [Math.cos(phi) * r, y, Math.sin(phi) * r]; };
    const total = GROUPS.reduce((a, g) => a + g.items.length, 0);
    const spots = Array.from({ length: total }, (_, i) => fib(i, total));
    const seeds = GROUPS.map((_, gi) => fib(gi, GROUPS.length));
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // Round-robin region growing: each group in turn takes the free spot nearest its seed,
    // which keeps every group in one compact patch.
    const taken = new Set(), slots = GROUPS.map(() => []);
    for (let round = 0; slots.some((sl, gi) => sl.length < GROUPS[gi].items.length); round++) {
      GROUPS.forEach((g, gi) => {
        if (slots[gi].length >= g.items.length) return;
        let best = -1, bd = 9;
        spots.forEach((p, si) => { if (!taken.has(si)) { const d = dist(p, seeds[gi]); if (d < bd) { bd = d; best = si; } } });
        taken.add(best); slots[gi].push(spots[best]);
      });
    }
    const items = [];
    GROUPS.forEach((g, gi) => g.items.forEach((label, j) => {
      const [x, y, z] = slots[gi][j];
      items.push({ label, gi, x, y, z });
    }));
    // Link each skill to its nearest neighbour in the same group.
    const links = [];
    items.forEach((a, i) => {
      let best = -1, bd = 9;
      items.forEach((b, j) => { if (i !== j && a.gi === b.gi) { const d = dist([a.x, a.y, a.z], [b.x, b.y, b.z]); if (d < bd) { bd = d; best = j; } } });
      if (best >= 0 && !links.some(([p, q]) => p === best && q === i)) links.push([i, best]);
    });
    // Three guide rings for depth.
    const RINGS = [0, 1, 2].map(k => Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2;
      return k === 0 ? [Math.cos(a), 0, Math.sin(a)] : k === 1 ? [Math.cos(a), Math.sin(a), 0] : [0, Math.sin(a), Math.cos(a)];
    }));

    let ctx, w, h, ax = -.35, ay = 0, vax = 0, vay = .004, focus = -1, hover = null, energy = 0;
    let drag = null;
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

    function resize() { ({ ctx, w, h } = fitCanvas(canvas)); }
    resize();
    addEventListener("resize", debounce(resize, 200));

    canvas.addEventListener("pointerdown", e => {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
    });
    canvas.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      vay = dx * .006; vax = dy * .006;
      if (Math.abs(dx) + Math.abs(dy) > 2) { drag.moved = true; focus = -1; $$("button", legend).forEach(x => x.classList.remove("is-on")); }
    });
    const end = () => { drag = null; canvas.classList.remove("is-dragging"); };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { if (!drag) mouse.x = mouse.y = -1e4; });

    const rot = (x, y, z) => {
      const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
    };
    const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

    whileVisible(canvas, (dt, t) => {
      const k = Math.min(3, dt / 16.67);
      energy += (audioEnergy() - energy) * .12;

      if (focus >= 0 && !drag) {
        // Turn the chosen group's centre towards the viewer.
        let cx = 0, cy = 0, cz = 0;
        items.forEach(it => { if (it.gi === focus) { cx += it.x; cy += it.y; cz += it.z; } });
        const tay = Math.atan2(cx, cz), tax = Math.atan2(cy, Math.hypot(cx, cz));
        ay += wrapAngle(tay - ay) * .08 * k; ax += (tax - ax) * .08 * k;
        vax = vay = 0;
      } else if (!drag) {
        vay += ((reduceMotion ? .0008 : .003) - vay) * .02 * k;
        vax += (0 - vax) * .04 * k;
        ax += (-.35 - ax) * .01 * k;
      }
      ay += vay * k; ax += vax * k;
      ax = Math.max(-1.3, Math.min(1.3, ax));

      const small = w < 640;
      const R = Math.min(w, h) * (small ? .42 : .4) * (1 + energy * .06);
      const ox = w / 2, oy = h / 2;
      const proj = ([x, y, z]) => { const p = 1 / (1 - z * .25); return [ox + x * R * p, oy - y * R * p, z, p]; };

      ctx.clearRect(0, 0, w, h);

      // Soft core glow.
      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * 1.2);
      glow.addColorStop(0, `rgba(124,247,193,${.05 + energy * .12})`); glow.addColorStop(1, "rgba(124,247,193,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

      ctx.lineWidth = 1;
      RINGS.forEach(ring => {
        for (let i = 0; i < ring.length; i++) {
          const a = proj(rot(...ring[i])), b = proj(rot(...ring[(i + 1) % ring.length]));
          ctx.strokeStyle = `rgba(125,133,143,${.06 + (a[2] + 1) * .07})`;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
      });

      const pts = items.map(it => { const p = proj(rot(it.x, it.y, it.z)); return { it, sx: p[0], sy: p[1], z: p[2], s: p[3] }; });

      // Constellation lines inside each group.
      links.forEach(([i, j]) => {
        const a = pts[i], b = pts[j], dim = focus >= 0 && a.it.gi !== focus;
        ctx.strokeStyle = GROUPS[a.it.gi].c;
        ctx.globalAlpha = dim ? .04 : .1 + ((a.z + b.z) / 2 + 1) * .2;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      });
      ctx.globalAlpha = 1;

      let best = null, bestD = 36;
      pts.forEach(p => {
        if (p.z < -.1) return;
        const d = Math.hypot(p.sx - mouse.x, p.sy - mouse.y);
        if (d < bestD) { bestD = d; best = p; }
      });
      const newHover = best && best.it;
      if (newHover !== hover) {
        hover = newHover;
        if (hover) { SFX.hover(); tip.innerHTML = `${GROUPS[hover.gi].name} › <b></b>`; $("b", tip).textContent = hover.label; }
        else tip.textContent = "drag to spin";
      }

      pts.sort((a, b) => a.z - b.z);
      ctx.textBaseline = "middle";
      const base = small ? 10 : 12.5;
      pts.forEach(p => {
        const g = GROUPS[p.it.gi];
        const dim = focus >= 0 && p.it.gi !== focus;
        const isHover = p.it === hover;
        const depth = (p.z + 1) / 2;
        ctx.globalAlpha = dim ? .08 + depth * .12 : .18 + depth * .82;
        const size = base * Math.min(1.2, p.s) * (isHover ? 1.3 : 1);
        ctx.fillStyle = g.c;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, (isHover ? 4.5 : 2.6) * p.s, 0, Math.PI * 2); ctx.fill();
        if (isHover) { ctx.strokeStyle = g.c; ctx.beginPath(); ctx.arc(p.sx, p.sy, 10 + Math.sin(t * .01) * 2, 0, Math.PI * 2); ctx.stroke(); }
        ctx.font = `${isHover || depth > .75 ? 600 : 500} ${size.toFixed(1)}px "Space Grotesk", sans-serif`;
        ctx.fillStyle = isHover ? g.c : dim ? C.muted : C.fg;
        // Labels on the right side of the sphere go to the left of their dot so they stay inside the canvas.
        const left = p.sx > ox + R * .25;
        ctx.textAlign = left ? "right" : "left";
        ctx.fillText(p.it.label, p.sx + (left ? -7 : 7) * p.s, p.sy);
      });
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
