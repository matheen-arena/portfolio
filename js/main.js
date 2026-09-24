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
    document.addEventListener("pointerover", e => cur.classList.toggle("is-hover", !!e.target.closest("a, button, input, .node, #stack-canvas")));
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

    whileVisible(canvas, (dt, t) => {
      const k = dt / 16.67 * (reduceMotion ? .4 : 1);
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
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
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

  /* ================= PIPELINE (SVG) ================= */
  (function pipeline() {
    const svg = $("#pipe-svg");
    const info = $("#pipe-info");
    const NS = "http://www.w3.org/2000/svg";
    const TYPE = { log: C.green, metric: C.amber, trace: C.blue, git: C.purple };

    const NODES = [
      { id: "lambda", col: 0, t: "Lambda", s: "1,200+ fns", c: C.orange, d: "1,200+ AWS Lambda functions, all sending logs to one central pipeline." },
      { id: "ecs", col: 0, t: "ECS", s: "containers", c: C.orange, d: "Container services on Amazon ECS, part of the 50+ ECS and Batch workloads I onboarded." },
      { id: "batch", col: 0, t: "AWS Batch", s: "jobs", c: C.orange, d: "Short-lived, bursty AWS Batch jobs whose logs are now in the same place as everything else." },
      { id: "kinesis", col: 1, t: "Kinesis", s: "stream", c: C.amber, d: "Amazon Kinesis buffers the telemetry stream so traffic spikes don't drop data." },
      { id: "alloy", col: 2, t: "Alloy", s: "collector", c: C.green, d: "Grafana Alloy collects each signal, relabels it and routes it to the right backend." },
      { id: "loki", col: 3, t: "Loki", s: "logs", c: C.green, d: "Loki indexes only labels, which makes log storage much cheaper than a SaaS vendor." },
      { id: "mimir", col: 3, t: "Mimir", s: "metrics", c: C.amber, d: "Mimir stores Prometheus metrics long-term and scales horizontally." },
      { id: "tempo", col: 3, t: "Tempo", s: "traces", c: C.blue, d: "Tempo stores distributed traces, so you can follow one request across services." },
      { id: "grafana", col: 4, t: "Grafana", s: "dashboards", c: C.orange, d: "Grafana OSS on EKS: 150+ dashboards and 300+ alerts, migrated by a custom Kiro AI agent." },
      { id: "git", col: 4, t: "Git Sync", s: "as code", c: C.purple, d: "Git Sync keeps production dashboards version-controlled in one central repository." }
    ];
    const EDGES = [
      ["lambda", "kinesis"], ["ecs", "kinesis"], ["batch", "kinesis"], ["kinesis", "alloy"],
      ["alloy", "loki"], ["alloy", "mimir"], ["alloy", "tempo"],
      ["loki", "grafana"], ["mimir", "grafana"], ["tempo", "grafana"], ["git", "grafana"]
    ];
    const COLS = ["sources", "stream", "collect", "store", "visualise"];
    const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
    const edgeMap = {};
    let packets = [], pool = [], mode = "";
    let gPackets;

    const el = (tag, attrs = {}, parent) => {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    };

    function layout() {
      const vertical = svg.clientWidth < 640;
      const m = vertical ? "v" : "h";
      if (m === mode) return;
      mode = m;
      svg.textContent = "";
      packets = []; pool = [];

      const W = vertical ? 420 : 1100, H = vertical ? 820 : 360;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const cols = COLS.map((_, c) => NODES.filter(n => n.col === c));

      cols.forEach((list, c) => {
        if (vertical) {
          const pad = 10, gap = 10, top = 30 + c * 160;
          const nw = Math.min(170, (W - pad * 2 - gap * (list.length - 1)) / list.length);
          const total = nw * list.length + gap * (list.length - 1);
          list.forEach((n, i) => Object.assign(n, { w: nw, h: 58, x: (W - total) / 2 + i * (nw + gap), y: top }));
          el("text", { x: 10, y: top - 12, class: "col-label" }, svg).textContent = COLS[c];
        } else {
          const nw = 168, nh = 60, gap = 26, left = 12 + c * 222;
          const total = nh * list.length + gap * (list.length - 1);
          list.forEach((n, i) => Object.assign(n, { w: nw, h: nh, x: left, y: (H - total) / 2 + 16 + i * (nh + gap) }));
          el("text", { x: left, y: 22, class: "col-label" }, svg).textContent = COLS[c];
        }
      });

      const gEdges = el("g", {}, svg);
      EDGES.forEach(([a, b]) => {
        const A = byId[a], B = byId[b];
        let d;
        const sameCol = A.col === B.col;
        if (!vertical && !sameCol) {
          const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = B.x, y2 = B.y + B.h / 2, mx = (x1 + x2) / 2;
          d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        } else if (vertical && !sameCol) {
          const x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y, my = (y1 + y2) / 2;
          d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
        } else if (!vertical) {
          const x = A.x + A.w / 2;
          d = `M${x},${A.y} L${x},${B.y + B.h}`;
        } else {
          const y = A.y + A.h / 2;
          d = `M${A.x},${y} L${B.x + B.w},${y}`;
        }
        const path = el("path", { d, class: "edge" }, gEdges);
        edgeMap[a + ">" + b] = { path, len: path.getTotalLength(), from: a, to: b };
      });

      gPackets = el("g", {}, svg);

      NODES.forEach(n => {
        const g = el("g", { class: "node", tabindex: 0, role: "button", "aria-label": `${n.t}: ${n.d}`, style: `--c:${n.c}` }, svg);
        el("rect", { x: n.x, y: n.y, width: n.w, height: n.h, rx: 10 }, g);
        el("circle", { cx: n.x + 14, cy: n.y + 20, r: 4, class: "n-dot" }, g);
        el("text", { x: n.x + 26, y: n.y + 25, class: "n-title" }, g).textContent = n.t;
        el("text", { x: n.x + 14, y: n.y + 45, class: "n-sub" }, g).textContent = n.s;
        n.g = g;
        const show = () => select(n);
        g.addEventListener("pointerenter", show);
        g.addEventListener("focus", show);
        g.addEventListener("click", show);
      });
    }

    let active = null;
    function select(n) {
      if (active === n) return;
      if (active) active.g.classList.remove("is-active");
      active = n; n.g.classList.add("is-active");
      info.innerHTML = `<span class="muted">node</span> <b></b><p></p>`;
      $("b", info).textContent = n.t.toLowerCase();
      $("p", info).textContent = n.d;
      SFX.note(NODES.indexOf(n), .045);
    }

    function launch(edgeKey, type) {
      const e = edgeMap[edgeKey];
      if (!e) return;
      const c = pool.pop() || el("circle", { r: 3.5 }, gPackets);
      c.setAttribute("fill", TYPE[type]);
      c.style.display = "";
      packets.push({ e, t: 0, v: .0006 + Math.random() * .0004, type, c });
    }

    function nextHop(p) {
      const at = p.e.to;
      if (at === "kinesis") return "kinesis>alloy";
      if (at === "alloy") return { log: "alloy>loki", metric: "alloy>mimir", trace: "alloy>tempo" }[p.type];
      if (at === "loki" || at === "mimir" || at === "tempo") return at + ">grafana";
      return null;
    }

    function flash(id) {
      const r = byId[id].g && byId[id].g.querySelector("rect");
      if (!r) return;
      r.style.stroke = byId[id].c;
      clearTimeout(r._t);
      r._t = setTimeout(() => (r.style.stroke = ""), 160);
    }

    layout();
    addEventListener("resize", debounce(layout, 200));

    let spawnAcc = 0;
    const SOURCES = ["lambda", "ecs", "batch"], TYPES = ["log", "log", "metric", "trace"];
    whileVisible(svg, dt => {
      spawnAcc += dt;
      const every = reduceMotion ? 900 : 140;
      while (spawnAcc > every) {
        spawnAcc -= every;
        if (Math.random() < .06) launch("git>grafana", "git");
        else launch(SOURCES[(Math.random() * 3) | 0] + ">kinesis", TYPES[(Math.random() * 4) | 0]);
      }
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += p.v * dt * (400 / p.e.len);
        if (p.t >= 1) {
          flash(p.e.to);
          const hop = nextHop(p);
          p.c.style.display = "none"; pool.push(p.c);
          packets.splice(i, 1);
          if (hop) launch(hop, p.type);
          continue;
        }
        const pt = p.e.path.getPointAtLength(p.t * p.e.len);
        p.c.setAttribute("cx", pt.x); p.c.setAttribute("cy", pt.y);
      }
    });
  })();

  /* ================= STACK GRAPH ================= */
  (function stack() {
    const canvas = $("#stack-canvas");
    const legend = $("#stack-legend");
    const list = $("#stack-list");
    const GROUPS = [
      { name: "AWS", c: C.orange, items: ["EKS", "ECS", "EC2", "Lambda", "S3", "Kinesis", "AWS Batch", "Networking"] },
      { name: "Data", c: C.blue, items: ["RDS", "Aurora", "Elasticsearch", "MySQL"] },
      { name: "Observability", c: C.green, items: ["Grafana", "Loki", "Mimir", "Tempo", "Alloy", "Logz.io"] },
      { name: "CI/CD & GitOps", c: C.amber, items: ["GitHub Actions", "ARC Runners", "GitLab CI", "Argo CD", "Argo Workflows", "JFrog"] },
      { name: "IaC & Platform", c: C.purple, items: ["Terraform", "Kubernetes", "Containers"] },
      { name: "AI Agents", c: C.pink, items: ["Kiro", "Copilot Agent"] },
      { name: "Scripting", c: C.bone, items: ["Python", "Shell", "Linux"] }
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
      whoami: () => `Abdul Matheen: AI-first Cloud &amp; Platform Engineer in Chennai, India.
I build reliable cloud platforms and modern developer workflows, and use AI agents to automate engineering work.`,
      about: () => CMDS.whoami(),
      experience: () => `<pre><span class="t-ok">2026-05 → now</span>    Cloud &amp; Platform Engineer   <span class="t-acc">zeb</span>
                 Argo Cron Workflows on EKS, AWS data-transfer cost optimisation
<span class="t-ok">2025-05 → 2026-04</span> Cloud &amp; DevOps Engineer   <span class="t-acc">Avasoft</span>
                 Logz.io → Grafana OSS (~$250K/yr saved), GitLab → GitHub (2,100 repos)
<span class="t-ok">2024-08 → 2024-11</span> Python Developer Intern    <span class="t-acc">Stellar Innovations</span>
                 ETL pipelines → S3, Python on EC2, MySQL data quality</pre>`,
      work: () => CMDS.experience(),
      skills: () => `<pre><span class="t-acc">aws</span>            EKS ECS EC2 Lambda S3 Kinesis Batch Networking
<span class="t-blue">data</span>           RDS Aurora Elasticsearch MySQL
<span class="t-ok">observability</span>  Grafana Loki Mimir Tempo Alloy Logz.io
<span class="t-acc">ci/cd</span>          GitHub Actions ARC GitLab Argo CD Argo Workflows JFrog
<span class="t-blue">iac</span>            Terraform Kubernetes
<span class="t-ok">ai</span>             Kiro AI agent, GitHub Copilot agent
<span class="t-acc">scripting</span>      Python Shell Linux</pre>`,
      stack: () => CMDS.skills(),
      impact: () => `<pre><span class="t-ok">▲</span> ~$250K/yr   observability cost saved
<span class="t-ok">▲</span> 1,200+      Lambda functions with centralised logs
<span class="t-ok">▲</span> 2,100       repos migrated GitLab → GitHub
<span class="t-ok">▼</span> 80%         CI runner cost
<span class="t-ok">▲</span> 450+        dashboards &amp; alerts migrated by an AI agent</pre>`,
      contact: () => `<pre>email     <a href="mailto:matheenroy@gmail.com">matheenroy@gmail.com</a>
linkedin  <a href="https://linkedin.com/in/abumatheen" target="_blank" rel="noopener">linkedin.com/in/abumatheen</a>
github    <a href="https://github.com/matheen-arena" target="_blank" rel="noopener">github.com/matheen-arena</a></pre>`,
      neofetch: () => `<pre><span class="t-acc">    ▄▄▄▄▄▄▄     </span> <span class="t-ok">matheen</span>@<span class="t-ok">platform</span>
<span class="t-acc">  ▄█▀     ▀█▄   </span> ----------------
<span class="t-acc"> █▀  ▄▄▄▄▄  ▀█  </span> <span class="t-acc">OS</span>       Amazon Linux on EKS
<span class="t-acc"> █  █ ◉ ◉ █  █  </span> <span class="t-acc">Shell</span>    bash + python
<span class="t-acc"> █▄  ▀▀▀▀▀  ▄█  </span> <span class="t-acc">IaC</span>      terraform
<span class="t-acc">  ▀█▄     ▄█▀   </span> <span class="t-acc">GitOps</span>   argo cd
<span class="t-acc">    ▀▀▀▀▀▀▀     </span> <span class="t-acc">Observe</span>  loki · mimir · tempo · alloy
                  <span class="t-acc">AI</span>       kiro · copilot agents
                  <span class="t-acc">Uptime</span>   since 2024, still learning</pre>`,
      ls: () => `about/  experience/  skills/  impact/  contact/  <span class="t-ok">hire-me.sh</span>`,
      "./hire-me.sh": () => CMDS["sudo hire-me"](),
      "kubectl get pods": () => `<pre><span class="t-dim">NAME                               READY   STATUS    RESTARTS   AGE</span>
grafana-7c9f8d-x2k4p               1/1     Running   0          412d
loki-write-0                       1/1     Running   0          412d
mimir-ingester-0                   1/1     Running   0          412d
tempo-distributor-5b8c-q9ztl       1/1     Running   0          412d
alloy-daemonset-hk27m              1/1     Running   0          412d
argo-workflows-server-6d4f-8kd2s   1/1     Running   0          140d
arc-runner-set-ghx7p               1/1     Running   0          3m
<span class="t-ok">career-growth-0                    1/1     Running   0          ∞</span></pre>`,
      "terraform plan": () => `<pre>Terraform will perform the following actions:

  <span class="t-ok">+ resource "team_member" "abdul_matheen"</span> {
      <span class="t-ok">+</span> role        = "Cloud / Platform / DevOps Engineer"
      <span class="t-ok">+</span> cost_impact = "negative (saves you money)"
      <span class="t-ok">+</span> on_call     = "calm and observable"
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
