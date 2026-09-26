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

  // Work log as monitor-style project cards, grouped under each role. Each card's screen has a
  // procedurally drawn night-city canvas (js/main.js) and one of three red overlays built from the
  // project's own tags and stack. "Read more" opens the full details.
  function renderWorklog(jobs) {
    let n = 0;
    return jobs.map((j, ji) => {
      const badge = !j.badge ? "" : j.badge.toLowerCase() === "current"
        ? `<span class="pill pill-live">● current</span>` : `<span class="pill">${esc(j.badge)}</span>`;
      const cards = j.projects.map((p, pi) => {
        n++;
        const v = (n - 1) % 3, tags = p.items.map(it => it.tag), first = p.items[0] ? plain(p.items[0].text) : "";
        let ovl;
        if (v === 0) {
          const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          ovl = `<div class="ovl-alert"><i></i>${esc(tags[0] || "LIVE")}</div>
                 <div class="ovl-code"><div class="oc-head">⌃ ${esc(slug)}/stack.tf</div>${p.stack.slice(0, 5).map((s2, k) =>
                   `<div class="oc-line${k === 2 ? " is-hl" : ""}"><span>${k + 1}</span>uses = "${esc(s2)}"</div>`).join("")}</div>`;
        } else if (v === 1) {
          const pts = tags.slice(0, 5);
          ovl = `<div class="ovl-chip"><b>${esc(j.company)}</b> ${esc(p.domain)} · ${esc(tags[1] || tags[0] || "")}</div>
                 <div class="ovl-chart"><svg viewBox="0 0 160 60" preserveAspectRatio="none"><polyline points="${pts.map((_, k) => `${10 + k * (140 / Math.max(1, pts.length - 1))},${[42, 30, 12, 34, 22][k]}`).join(" ")}" /></svg>
                   ${pts.map((t, k) => `<span style="left:${(10 + k * (140 / Math.max(1, pts.length - 1))) / 1.6}%;top:${[42, 30, 12, 34, 22][k] / .6}%">${esc(t.split(/[ &/]/)[0])}</span>`).join("")}</div>
                 <div class="ovl-target"></div>`;
        } else {
          ovl = `<svg class="ovl-wire" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet"><polygon points="100,8 138,40 170,26 150,70 100,56 50,70 30,26 62,40" /><polyline points="100,8 100,56 62,40 150,70 138,40 50,70 30,26 170,26" /></svg>
                 <div class="ovl-events">${p.items.slice(0, 3).map(it => `<div><em>${esc(it.tag.split(" ")[0])}</em>${esc(clip(plain(it.text).toUpperCase(), 44))}</div>`).join("")}</div>`;
        }
        return `
          <article class="pcard reveal" style="--i:${pi}">
            <div class="pcard-frame">
              <div class="pcard-screen"><canvas class="pcard-canvas" data-seed="${esc(p.name)}" data-mech="${v === 1 ? 1 : 0}" aria-hidden="true"></canvas><div class="pcard-ovl" aria-hidden="true">${ovl}</div></div>
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
