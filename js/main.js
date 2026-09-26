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

  /* ================= HERO: COCKPIT FLIGHT (stages, radar, log) ================= */
  (function flightHud() {
    const section = $("#flight");
    const stages = $$(".stage", section), dots = $$(".stage-dots i", section), label = $("#dash-label");
    const LABELS = ["scroll down", "scroll down", "scroll down"];
    let current = 0;

    // Scroll progress through the pinned section (0 → 1), shared with the 3D scene.
    const progress = () => {
      const r = section.getBoundingClientRect(), span = r.height - innerHeight;
      return span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;
    };
    window.flightProgress = progress;

    const meter = $$("#dc-meter i");
    function update() {
      const p = progress();
      const lit = Math.round(p * meter.length);
      meter.forEach((m, i) => m.classList.toggle("on", meter.length - 1 - i < lit));
      const next = p < .3 ? 0 : p < .66 ? 1 : 2;
      if (next === current) return;
      current = next;
      stages.forEach((st, i) => st.classList.toggle("is-on", i === next));
      dots.forEach((d, i) => d.classList.toggle("is-on", i <= next));
      label.textContent = LABELS[next];
      SFX.whoosh();
    }
    addEventListener("scroll", update, { passive: true });
    update();

    // Center console jumps to the next stage, then into the page.
    $(".dash-center", section).addEventListener("click", e => {
      e.preventDefault();
      const span = section.offsetHeight - innerHeight;
      const target = current < 2 ? section.offsetTop + span * (current === 0 ? .45 : .82) : $("#about").offsetTop;
      scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
    });

    /* dashboard radar sweeping the skill domains */
    const rc = $("#radar");
    const DOMAINS = ["AWS", "OBSERV", "CI/CD", "DATA", "IAC", "AI", "SCRIPT"].map((n, i) => ({ n, a: i / 7 * Math.PI * 2 + .3, r: .45 + (i % 3) * .18, g: 0 }));
    let radar = null;
    const fitRadar = () => { if (rc.offsetParent) radar = fitCanvas(rc); };
    fitRadar();
    addEventListener("resize", debounce(fitRadar, 200));
    // Live bar chart beside the log.
    const lc = $("#log-chart");
    let lchart = null;
    const lvals = Array.from({ length: 14 }, () => Math.random());
    const fitLc = () => { if (lc.offsetParent) lchart = fitCanvas(lc); };
    fitLc();
    addEventListener("resize", debounce(fitLc, 200));
    let lcAcc = 0;
    const sc = $("#dc-scope");
    let scope = null;
    const fitScope = () => { if (sc.offsetParent) scope = fitCanvas(sc); };
    fitScope();
    addEventListener("resize", debounce(fitScope, 200));
    whileVisible(section, (dt, t) => {
      if (scope && sc.offsetParent) {
        const { ctx: g, w: sw, h: sh } = scope, buf = SFX.playing ? SFX.wave() : null;
        g.clearRect(0, 0, sw, sh);
        g.strokeStyle = "rgba(255,80,90,.18)"; g.lineWidth = 1;
        for (let x = 0; x <= sw; x += sw / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, sh); g.stroke(); }
        g.beginPath(); g.moveTo(0, sh / 2); g.lineTo(sw, sh / 2); g.stroke();
        let peak = .02;
        if (buf) for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
        g.beginPath();
        for (let x = 0; x <= sw; x++) {
          const v = buf ? buf[Math.floor(x / sw * (buf.length - 1))] / peak * .8 : Math.sin(x * .12 + t * .004) * .35 * Math.sin(x / sw * Math.PI);
          x ? g.lineTo(x, sh / 2 - v * (sh / 2 - 2)) : g.moveTo(x, sh / 2 - v * (sh / 2 - 2));
        }
        g.strokeStyle = "#ff5a68"; g.lineWidth = 1.4; g.shadowColor = "#ff3b4e"; g.shadowBlur = 6; g.stroke(); g.shadowBlur = 0;
      }
      if (lchart && lc.offsetParent) {
        lcAcc += dt;
        if (lcAcc > 260) { lcAcc = 0; lvals.shift(); lvals.push(.15 + Math.random() * .7 + (SFX.playing ? .2 : 0)); }
        const { ctx: g, w: lw, h: lh } = lchart, bw = lw / lvals.length;
        g.clearRect(0, 0, lw, lh);
        g.strokeStyle = "rgba(255,80,90,.15)"; g.lineWidth = 1;
        [.25, .5, .75].forEach(q => { g.beginPath(); g.moveTo(0, lh * q); g.lineTo(lw, lh * q); g.stroke(); });
        lvals.forEach((v, i) => {
          const bh = Math.min(1, v) * (lh - 2);
          g.fillStyle = i === lvals.length - 1 ? "#ffd0d4" : `rgba(255,${80 + v * 60},${90 + v * 40},${.35 + v * .5})`;
          g.fillRect(i * bw + 1, lh - bh, bw - 2, bh);
        });
        g.beginPath();
        lvals.forEach((v, i) => { const x = i * bw + bw / 2, y = lh - Math.min(1, v) * (lh - 2); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.strokeStyle = "#ff8a95"; g.lineWidth = 1; g.stroke();
      }
      if (!radar || !rc.offsetParent) return;
      const { ctx: r, w: rw, h: rh } = radar, c = rw / 2, cy = rh / 2, rr = Math.min(c, cy) - 3;
      const sweep = (t * .0018) % (Math.PI * 2);
      r.clearRect(0, 0, rw, rh);
      r.strokeStyle = "rgba(255,120,100,.3)"; r.lineWidth = 1;
      [1, .6, .25].forEach(q => { r.beginPath(); r.arc(c, cy, rr * q, 0, Math.PI * 2); r.stroke(); });
      for (let i = 0; i < 24; i++) {
        const a0 = sweep - i * .035;
        r.fillStyle = `rgba(255,80,60,${.3 * (1 - i / 24)})`;
        r.beginPath(); r.moveTo(c, cy); r.arc(c, cy, rr, a0 - .035, a0); r.closePath(); r.fill();
      }
      r.font = '500 7px "JetBrains Mono", monospace'; r.textAlign = "center";
      DOMAINS.forEach(d => {
        if ((sweep - d.a + Math.PI * 4) % (Math.PI * 2) < .08) d.g = 1;
        d.g = Math.max(.2, d.g - dt * .0006);
        const x = c + Math.cos(d.a) * rr * d.r, y = cy + Math.sin(d.a) * rr * d.r;
        r.globalAlpha = d.g; r.fillStyle = "#ffd2c8";
        r.beginPath(); r.arc(x, y, 2, 0, Math.PI * 2); r.fill();
        r.fillText(d.n, x, y - 5);
        r.globalAlpha = 1;
      });
    });

    /* dashboard log streaming resume facts */
    const log = $("#dash-log");
    const LINES = [
      ["cloud", "AWS · EKS · ECS · Lambda · S3"], ["iac", "Terraform"], ["gitops", "Argo CD · Argo Cron Workflow"],
      ["ci/cd", "GitHub Actions · ARC runners"], ["observe", "Grafana Loki · Grafana Mimir · Tempo"], ["collect", "Grafana Alloy pipelines"],
      ["data", "RDS · Aurora · Elasticsearch"], ["gov", "Control Tower · SCPs · IAM Identity Center"], ["otel", "Grafana Alloy · OpenTelemetry"], ["ai", "Kiro AI Agent · Copilot Agent"],
      ["status", "all systems nominal"]
    ];
    let li = 0;
    const addLine = () => {
      const [who, msg] = LINES[li++ % LINES.length];
      const d = document.createElement("div");
      d.innerHTML = "<b></b> ";
      $("b", d).textContent = who + " ›";
      d.append(msg);
      log.append(d);
      while (log.children.length > 6) log.firstChild.remove();
    };
    for (let k = 0; k < 6; k++) addLine();
    setInterval(() => { if (log.offsetParent && document.visibilityState === "visible") addLine(); }, 1600);
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
      { name: "AWS Compute", c: C.orange, items: ["AWS Batch", "Lambda", "EKS", "ECS", "EC2", "ECR", "API Gateway"] },
      { name: "AWS Data & Network", c: C.orange, items: ["DataSync", "S3", "EFS", "Kinesis", "Firehose", "CloudFront", "ElastiCache", "AWS Network"] },
      { name: "Governance & Security", c: C.pink, items: ["IAM Identity Center", "Control Tower", "Organizations", "AWS Config", "SCPs", "AWS WAF"] },
      { name: "Databases & Search", c: C.blue, items: ["RDS", "Aurora", "Elasticsearch", "MongoDB Atlas"] },
      { name: "Observability", c: C.green, items: ["Grafana Metrics", "Grafana OSS", "Grafana Loki", "Alloy", "OpenTelemetry", "Logz.io", "Grafana Mimir", "Grafana Logs", "Grafana Tempo"] },
      { name: "CI/CD & GitOps", c: C.amber, items: ["Argo Cron Workflow", "GitHub Actions", "GitLab", "JFrog", "GitHub", "Jenkins", "CodeCommit", "Argo CD", "ServiceNow", "GitHub ARC", "GitSync"] },
      { name: "IaC & Containers", c: C.purple, items: ["Terraform", "Docker"] },
      { name: "AI Agents", c: C.bone, items: ["Kiro AI Agent", "GitHub Copilot Agent"] },
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
      // A grid of clusters (3 columns on desktop, 2 on phones). Each hub sits on the left of its
      // cell and its skills fan out to the right, one per evenly spaced row, so labels never collide.
      const small = canvas.parentElement.clientWidth < 640;
      const COLS = small ? 2 : 3, CELL_H = small ? 230 : 250, PAD = small ? 8 : 24;
      canvas.style.height = Math.ceil(GROUPS.length / COLS) * CELL_H + PAD * 2 + "px";
      ({ ctx, w, h } = fitCanvas(canvas));
      const cw = (w - PAD * 2) / COLS;
      hubs = GROUPS.map((g, i) => {
        const x0 = PAD + (i % COLS) * cw, y0 = PAD + Math.floor(i / COLS) * CELL_H;
        const bx = x0 + (small ? 10 : 34), by = y0 + CELL_H / 2 + 10;
        return { ...g, i, bx, by, x: bx, y: by, lx: x0 + (small ? 8 : 14), ly: y0 + 16, la: "left" };
      });
      const old = nodes;
      nodes = [];
      hubs.forEach(hb => hb.items.forEach((label, j) => {
        const prev = old.find(n => n.label === label);
        const n = hb.items.length;
        const span = Math.min(CELL_H - 64, (n - 1) * (small ? 17 : 19));
        const oy = n === 1 ? 0 : -span / 2 + (j / (n - 1)) * span;
        const reach = small ? 30 : 70;
        const ox = reach + (small ? 10 : 30) * Math.cos((oy / (span / 2 || 1)) * 1.1);
        nodes.push({
          label, hub: hb, ox, oy,
          x: prev ? Math.min(w, prev.x) : hb.x, y: prev ? Math.min(h, prev.y) : hb.y,
          vx: 0, vy: 0, r: j === 0 ? 5.5 : 4, phase: Math.random() * 6
        });
      }));
      stackSmall = true; // grid drawing mode (left-aligned labels, cell captions)
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
      const font = w < 640 ? 10 : 12.5;

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
        ctx.font = `500 ${w < 640 ? 9 : 10.5}px "JetBrains Mono", monospace`;
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
                             Retail · Grafana OTEL
                             Finance · AWS Enterprise Cloud Modernization
                             Education · University Athletics Cloud Platform
                             Retail · ETL Data Portal
<span class="t-ok">May 2025 – April 2026</span>        Cloud and DevOps Engineer, <span class="t-acc">Avasoft</span>, Chennai
                             Retail · Logz to Grafana OSS Migration
                             Retail · GitLab to GitHub Migration
<span class="t-ok">August 2024 – November 2024</span>  Python Developer – Intern, <span class="t-acc">Stellar Innovations</span>, Bangalore
                             Healthcare · ETL pipeline development</pre>`,
      work: () => CMDS.experience(),
      skills: () => `<pre><span class="t-acc">iac</span>            Terraform
<span class="t-acc">aws</span>            EKS ECS ECR Lambda EC2 Batch API Gateway S3 EFS Kinesis Firehose DataSync CloudFront ElastiCache, AWS Network
<span class="t-acc">governance</span>     Control Tower, Organizations, AWS Config, IAM Identity Center (SSO), SCPs, AWS WAF
<span class="t-blue">data</span>           RDS, Aurora, Elasticsearch, MongoDB Atlas
<span class="t-ok">observability</span>  Grafana OSS, Grafana Logs, Grafana Metrics, Grafana Tempo, Grafana Loki, Grafana Mimir, Grafana Alloy, OpenTelemetry, Logz.io
<span class="t-blue">tools</span>          Argo Cron Workflow, Argo CD, GitSync, Docker
<span class="t-acc">ci/cd</span>          GitLab, GitHub, GitHub Actions, Action Runner Controller, Jenkins, CodeCommit, ServiceNow, JFrog
<span class="t-ok">ai agents</span>      GitHub Copilot Agent, Kiro AI Agent
<span class="t-blue">scripting</span>      Shell Scripting, Python, MySQL</pre>`,
      stack: () => CMDS.skills(),
      impact: () => `<pre><span class="t-ok">~$250K/yr</span>  observability costs reduced (self-hosted Grafana OSS on EKS)
<span class="t-ok">1,200+</span>     Lambda functions with centralized log ingestion (+ 50+ Batch/ECS workloads)
<span class="t-ok">2,100+</span>     projects migrated from GitLab to GitHub, reducing user seat costs
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
      <span class="t-ok">+</span> focus    = ["Cloud", "DevOps", "AIOps", "Platform Engineering", "Observability", "AI automation"]
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


  /* ================= CUSTOM SCROLL RAIL ================= */
  (function rail() {
    const rail = $(".rail");
    if (!rail || !finePointer) return;
    const track = $(".rail-track", rail), thumb = $(".rail-thumb", rail);
    let dragging = null;
    const metrics = () => {
      const max = document.documentElement.scrollHeight - innerHeight, th = track.clientHeight;
      const h = thumb.offsetHeight || 26;
      return { max, th, h };
    };
    const paint = () => {
      const { max, th, h } = metrics();
      thumb.style.height = h + "px";
      thumb.style.transform = `translateY(${max > 0 ? (scrollY / max) * (th - h) : 0}px)`;
    };
    addEventListener("scroll", paint, { passive: true });
    addEventListener("resize", paint);
    new ResizeObserver(paint).observe(document.body);
    paint();
    const jumpTo = clientY => {
      const r = track.getBoundingClientRect(), { max, th, h } = metrics();
      const p = Math.max(0, Math.min(1, (clientY - r.top - h / 2) / (th - h)));
      scrollTo({ top: p * max, behavior: "instant" });
    };
    thumb.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      const r = thumb.getBoundingClientRect();
      dragging = { off: e.clientY - r.top - r.height / 2 };
      rail.classList.add("is-drag");
      thumb.setPointerCapture(e.pointerId);
    });
    thumb.addEventListener("pointermove", e => { if (dragging) jumpTo(e.clientY - dragging.off); });
    const end = () => { dragging = null; rail.classList.remove("is-drag"); };
    thumb.addEventListener("pointerup", end);
    thumb.addEventListener("pointercancel", end);
    track.addEventListener("pointerdown", e => { if (e.target === track) jumpTo(e.clientY); });
  })();

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  requestAnimationFrame(() => document.body.classList.add("is-ready"));
})();
