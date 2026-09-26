/* Loads the editable content files (content/worklog.md, content/stack.md) and turns them
   into the data the page uses. The file format is documented in content/USAGE.md. */
(function () {
  "use strict";

  const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Escape, then turn **bold** into <b>bold</b>.
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // Drop <!-- comments --> (they may span lines) and split into trimmed lines.
  const lines = text => text.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).map(l => l.trim());
  const meta = line => { const m = line.match(/^-\s*([a-z]+)\s*:\s*(.*)$/i); return m ? [m[1].toLowerCase(), m[2].trim()] : null; };

  /* ---------- worklog.md ---------- */
  function parseWorklog(text) {
    const jobs = [];
    let job = null, project = null;
    for (const line of lines(text)) {
      let m;
      if ((m = line.match(/^##\s+(.+?)\s*\|\s*(.+)$/)) && !line.startsWith("###")) {
        job = { title: m[1], company: m[2], when: "", where: "", badge: "", projects: [] };
        jobs.push(job); project = null;
      } else if ((m = line.match(/^###\s+(.+)$/)) && job) {
        project = { name: m[1], domain: "", stack: [], items: [] };
        job.projects.push(project);
      } else if ((m = line.match(/^-\s*\[(.+?)\]\s*(.+)$/)) && project) {
        project.items.push({ tag: m[1].trim().toUpperCase(), text: m[2] });
      } else if ((m = meta(line))) {
        const [k, v] = m;
        if (project && k === "domain") project.domain = v;
        else if (project && k === "stack") project.stack = v.split(/\s*[,·]\s*/).filter(Boolean);
        else if (job && !project && ["when", "where", "badge"].includes(k)) job[k] = v;
      }
    }
    return jobs;
  }

  // Plain-text version of a bullet (no **), cut to about `n` characters at a word boundary.
  const plain = t => t.replace(/\*\*(.+?)\*\*/g, "$1");
  const clip = (t, n) => t.length <= n ? t : t.slice(0, t.lastIndexOf(" ", n)).replace(/[,;:.\s]+$/, "") + "…";

  /* ---- card screen overlays: one design per theme, picked to fit each project ---- */
  const OVERLAYS = {
    obs:    /OBSERV|GRAFANA|LOKI|MIMIR|OTEL|ALLOY|TELEMETRY/g,
    gov:    /SECURITY|WAFR|CONTROL TOWER|GOVERN|IAM|SCP/g,
    deploy: /BLUE\/GREEN|ECS|DEPLOY|CDN|API GATEWAY/g,
    dag:    /ARGO|WORKFLOW|CRON/g,
    cost:   /COST|\$\d/g,
    git:    /SCM|GITHUB|GITLAB|JENKINS|CODECOMMIT/g,
    term:   /PYTHON|LINUX|MYSQL|SCRIPT/g,
    code:   /TERRAFORM|DOCKER|CONTAINER/g,
    chart:  /DATA|ENGINEERING/g,
    wire:   /AWS/g
  };
  const GENERIC = new Set(["code", "chart", "wire"]);
  // Greedy: each project takes the best-matching overlay not used yet, so no two cards share a design.
  function pickOverlays(projects) {
    const used = new Set();
    return projects.map(p => {
      const hay = [p.name, p.domain, ...p.stack, ...p.items.map(it => it.tag + " " + plain(it.text))].join(" ").toUpperCase();
      let best = null, bestScore = -1;
      for (const [k, re] of Object.entries(OVERLAYS)) {
        if (used.has(k)) continue;
        const score = (hay.match(re) || []).length * (GENERIC.has(k) ? .2 : 1);   // themed designs beat the generic ones
        if (score > bestScore) { best = k; bestScore = score; }
      }
      best = best || Object.keys(OVERLAYS)[used.size % Object.keys(OVERLAYS).length];
      used.add(best); if (used.size === Object.keys(OVERLAYS).length) used.clear();
      return best;
    });
  }
  // First bold number in a project's bullets (e.g. "$250K", "80%", "2,100+"), for the cost overlay.
  const figure = p => { for (const it of p.items) { const m = it.text.match(/\*\*[^*]*?(\$?\d[\d,.]*\s?(?:K|TB|%|\+)?)[^*]*\*\*/); if (m) return m[1]; } return ""; };

  function overlay(kind, p, j) {
    const tags = p.items.map(it => it.tag), st = p.stack, short = t => esc(t.split(/[ &/]/)[0]);
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    switch (kind) {
      case "obs": return `
        <div class="ovl-panel ovl-logs"><div class="ol-head">{job="${esc(slug)}"} <em>live</em></div>
          ${st.slice(1, 6).map((x, k) => `<div><b class="${k === 3 ? "warn" : ""}">${k === 3 ? "WARN" : "INFO"}</b>${esc(x.toLowerCase())} · ingest ok</div>`).join("")}</div>
        <div class="ovl-panel ovl-spark"><span>p99</span><svg viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,22 12,20 22,24 32,14 42,18 52,6 62,16 72,12 82,19 100,10"/></svg></div>`;
      case "gov": {
        const kids = st.filter(x => /AWS|Amazon/.test(x)).slice(1, 5);
        return `<svg class="ovl-tree" viewBox="0 0 200 110"><rect x="78" y="6" width="44" height="16" rx="2"/><text x="100" y="17">ROOT</text>
          ${kids.map((_, k) => { const x = 14 + k * 46; return `<path d="M100 22 V36 H${x + 18} V52"/><rect x="${x}" y="52" width="36" height="16" rx="2"/><text x="${x + 18}" y="63">OU-${k + 1}</text><path d="M${x + 18} 68 V82"/><circle cx="${x + 18}" cy="88" r="5"/>`; }).join("")}</svg>
          <div class="ovl-panel ovl-policy">${tags.slice(0, 3).map(t => `<div><i>🔒</i>${esc(t)}</div>`).join("")}</div>`;
      }
      case "deploy": return `
        <div class="ovl-bg"><div class="bg-slot blue"><b>BLUE</b><span>${esc(st[1] || "v1")}</span></div><div class="bg-slot green"><b>GREEN</b><span>${esc(st[2] || "v2")}</span></div>
          <div class="bg-traffic"><i></i></div><div class="bg-label">traffic shift → green</div></div>`;
      case "dag": {
        const nodes = tags.slice(0, 4);
        return `<svg class="ovl-dag" viewBox="0 0 200 110">${nodes.map((_, k) => k ? `<path d="M${22 + (k - 1) * 52} ${k % 2 ? 40 : 72} C ${48 + (k - 1) * 52} ${k % 2 ? 40 : 72}, ${22 + (k - 1) * 52} ${k % 2 ? 72 : 40}, ${22 + k * 52} ${k % 2 ? 72 : 40}"/>` : "").join("")}
          ${nodes.map((t, k) => `<g transform="translate(${22 + k * 52} ${k % 2 ? 72 : 40})"><circle r="9"/><text y="22">${short(t)}</text></g>`).join("")}</svg>
          <div class="ovl-chip">⏱ <b>scheduled</b> · ${esc(st[2] || st[1] || "")}</div>`;
      }
      case "cost": {
        const f = figure(p);
        return `<div class="ovl-panel ovl-cost"><div class="oc-title">spend / month</div><div class="bars">${[92, 88, 90, 84, 40, 22, 20].map((h, k) => `<i style="height:${h}%" class="${k > 3 ? "low" : ""}"></i>`).join("")}</div>
          <div class="oc-mark">▼ ${esc(f || "cost")}</div></div>`;
      }
      case "git": {
        const from = st[0] || "legacy", to = st[1] || "new";
        return `<svg class="ovl-git" viewBox="0 0 200 110"><path d="M10 34 H190" class="main"/><path d="M40 34 C70 34 60 76 90 76 H170" class="mig"/>
          ${[10, 40, 70, 110, 150, 190].map(x => `<circle cx="${x}" cy="34" r="4"/>`).join("")}${[90, 130, 170].map(x => `<circle cx="${x}" cy="76" r="4" class="m"/>`).join("")}
          <text x="10" y="24">${esc(from)}</text><text x="100" y="96">${esc(to)}</text></svg>`;
      }
      case "term": return `
        <div class="ovl-panel ovl-term"><div class="ot-bar"><i></i><i></i><i></i> etl.py</div>
          <div>$ python etl.py</div>${st.slice(1, 4).map(x => `<div><span>→</span> ${esc(x)} <b>✓</b></div>`).join("")}<div>$ <u>_</u></div></div>`;
      case "code": return `
        <div class="ovl-alert"><i></i>${esc(tags[0] || "LIVE")}</div>
        <div class="ovl-code"><div class="oc-head">⌃ ${esc(slug)}/stack.tf</div>${st.slice(0, 5).map((x, k) =>
          `<div class="oc-line${k === 2 ? " is-hl" : ""}"><span>${k + 1}</span>uses = "${esc(x)}"</div>`).join("")}</div>`;
      case "chart": {
        const pts = tags.slice(0, 5), X = k => 10 + k * (140 / Math.max(1, pts.length - 1)), Y = [42, 30, 12, 34, 22];
        return `<div class="ovl-chip"><b>${esc(j.company)}</b> ${esc(p.domain)} · ${esc(tags[0] || "")}</div>
          <div class="ovl-chart"><svg viewBox="0 0 160 60" preserveAspectRatio="none"><polyline points="${pts.map((_, k) => `${X(k)},${Y[k]}`).join(" ")}"/></svg>
          ${pts.map((t, k) => `<span style="left:${X(k) / 1.6}%;top:${Y[k] / .6}%">${short(t)}</span>`).join("")}</div><div class="ovl-target"></div>`;
      }
      default: return `
        <svg class="ovl-wire" viewBox="0 0 200 120"><polygon points="100,8 138,40 170,26 150,70 100,56 50,70 30,26 62,40"/><polyline points="100,8 100,56 62,40 150,70 138,40 50,70 30,26 170,26"/></svg>
        <div class="ovl-events">${p.items.slice(0, 3).map(it => `<div><em>${esc(it.tag.split(" ")[0])}</em>${esc(clip(plain(it.text).toUpperCase(), 44))}</div>`).join("")}</div>`;
    }
  }
  const SCENES = 7;

  // Work log as monitor-style project cards, grouped under each role. Every card gets its own scene
  // (drawn in js/main.js) and its own overlay, both chosen from the project's content.
  function renderWorklog(jobs) {
    const all = jobs.flatMap(j => j.projects);
    const kinds = pickOverlays(all);
    let n = 0;
    return jobs.map((j, ji) => {
      const badge = !j.badge ? "" : j.badge.toLowerCase() === "current"
        ? `<span class="pill pill-live">● current</span>` : `<span class="pill">${esc(j.badge)}</span>`;
      const cards = j.projects.map((p, pi) => {
        n++;
        const kind = kinds[n - 1], first = p.items[0] ? plain(p.items[0].text) : "";
        return `
          <article class="pcard reveal" style="--i:${pi}">
            <div class="pcard-frame">
              <div class="pcard-screen"><canvas class="pcard-canvas" data-seed="${esc(p.name)}" data-scene="${(n - 1) % SCENES}" aria-hidden="true"></canvas><div class="pcard-ovl ovl-${kind}" aria-hidden="true">${overlay(kind, p, j)}</div></div>
              <h3>${esc(p.name)}</h3>
              <p class="pcard-meta">${esc(j.company)} · ${esc(p.domain)}</p>
              <p class="pcard-desc">${esc(clip(first, 150))}</p>
            </div>
            <div class="pcard-foot">
              <span class="pf-chip">Project</span><span class="pf-num">${n}</span>
              <button type="button" class="pf-more" data-job="${ji}" data-proj="${pi}" data-n="${n}" data-sfx>Read more <span aria-hidden="true">›</span></button>
            </div>
          </article>`;
      }).join("");
      return `
        <div class="role reveal">
          <div class="role-head">
            <h3 class="role-title">${esc(j.title)} <span class="at">at ${esc(j.company)}</span></h3>
            <p class="role-meta"><span>${esc(j.when)}</span><span>${esc(j.where)}</span>${badge}</p>
          </div>
        </div>
        <div class="pcards">${cards}
        </div>`;
    }).join("\n");
  }

  // Full details for one project, shown in the "Read more" panel.
  function renderProject(j, p, n) {
    return `
      <p class="pd-kicker">Project ${n} · ${esc(j.company)}</p>
      <h3 class="pd-title">${esc(p.name)}</h3>
      <dl class="pd-meta">
        <div><dt>role</dt><dd>${esc(j.title)}</dd></div>
        <div><dt>when</dt><dd>${esc(j.when)}</dd></div>
        <div><dt>where</dt><dd>${esc(j.where)}</dd></div>
        <div><dt>domain</dt><dd>${esc(p.domain)}</dd></div>
      </dl>
      <p class="pd-stack">${p.stack.map(s2 => `<span>${esc(s2)}</span>`).join("")}</p>
      <ul class="log">
${p.items.map(it => `        <li data-lvl="${esc(it.tag)}">${inline(it.text)}</li>`).join("\n")}
      </ul>`;
  }

  /* ---------- stack.md ---------- */
  const COLORS = { orange: "#ff5b2e", blue: "#8ab4ff", green: "#7cf7c1", amber: "#f5c542", purple: "#c79bff", pink: "#ff7ab6", grey: "#c9c4ba", gray: "#c9c4ba", bone: "#c9c4ba" };

  function parseStack(text) {
    const groups = [];
    let g = null;
    for (const line of lines(text)) {
      let m;
      if ((m = line.match(/^##\s+(.+)$/)) && !line.startsWith("###")) {
        g = { name: m[1], c: COLORS.grey, items: [] };
        groups.push(g);
      } else if ((m = line.match(/^colou?r\s*:\s*(\S+)/i)) && g) {
        const v = m[1].toLowerCase();
        g.c = COLORS[v] || (/^#[0-9a-f]{3,8}$/i.test(v) ? v : COLORS.grey);
      } else if ((m = line.match(/^-\s+(.+)$/)) && g) {
        g.items.push(m[1]);
      }
    }
    return groups.filter(x => x.items.length);
  }

  const get = url => fetch(url, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(url + " " + r.status); return r.text(); });

  // Resolves to { jobs, groups }. A file that fails to load gives an empty list, so the rest of the page still works.
  window.loadContent = () => Promise.all([
    get("content/worklog.md").then(parseWorklog).catch(e => { console.error(e); return []; }),
    get("content/stack.md").then(parseStack).catch(e => { console.error(e); return []; })
  ]).then(([jobs, groups]) => ({ jobs, groups, renderWorklog, renderProject }));
})();
