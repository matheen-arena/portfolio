/* Loads the editable content files (content/worklog.md, content/stack.md, content/missions.md) and turns them
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

  function renderWorklog(jobs) {
    return jobs.map(j => {
      const badge = !j.badge ? "" : j.badge.toLowerCase() === "current"
        ? `\n            <span class="pill pill-live">● current</span>`
        : `\n            <span class="pill">${esc(j.badge)}</span>`;
      const projects = j.projects.map(p => `
            <p class="job-proj"><span class="muted">Domain: ${esc(p.domain)} · Project:</span> ${esc(p.name)}</p>
            <p class="job-env">${p.stack.map(esc).join(" · ")}</p>
            <ul class="log">
${p.items.map(it => `              <li data-lvl="${esc(it.tag)}">${inline(it.text)}</li>`).join("\n")}
            </ul>`).join("");
      return `
        <article class="job reveal">
          <div class="job-meta">
            <span class="job-when">${esc(j.when)}</span>
            <span class="job-where">${esc(j.where)}</span>${badge}
          </div>
          <div class="job-body">
            <h3>${esc(j.title)} <span class="at">at ${esc(j.company)}</span></h3>${projects}
          </div>
        </article>`;
    }).join("\n");
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

  /* ---------- missions.md ---------- */
  function parseMissions(text) {
    const out = [];
    let m0 = null;
    for (const line of lines(text)) {
      let m;
      if ((m = line.match(/^##\s+(.+)$/)) && !line.startsWith("###")) {
        m0 = { code: m[1], title: m[1], org: "", stat: "", label: "", c: COLORS.orange, points: [] };
        out.push(m0);
      } else if (m0 && (m = meta(line)) && ["title", "org", "stat", "label", "color", "colour"].includes(m[0])) {
        const [k, v] = m;
        if (k === "color" || k === "colour") m0.c = COLORS[v.toLowerCase()] || (/^#[0-9a-f]{3,8}$/i.test(v) ? v : COLORS.orange);
        else m0[k] = v;
      } else if (m0 && (m = line.match(/^-\s+(.+)$/))) {
        m0.points.push(m[1]);
      }
    }
    return out;
  }

  // One round patch per mission: stitched rim, curved title/org text, big stat in the middle.
  // The back (shown on hover/tap) lists the mission's outcomes.
  function renderMissions(list) {
    return list.map((m, i) => {
      const id = "mp" + i;
      return `
        <li class="patch reveal" style="--c:${esc(m.c)}; --i:${i}" tabindex="0" role="button" aria-pressed="false"
            aria-label="${esc(m.title)}: ${esc(m.stat)} ${esc(m.label)}. ${esc(m.points.join(". "))}">
          <div class="patch-inner">
            <div class="patch-face patch-front" aria-hidden="true">
              <svg viewBox="0 0 200 200">
                <defs>
                  <radialGradient id="${id}g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#23262e"/><stop offset="1" stop-color="#0c0d10"/></radialGradient>
                  <path id="${id}t" d="M 34 100 A 66 66 0 0 1 166 100" /><path id="${id}b" d="M 30 100 A 70 70 0 0 0 170 100" />
                </defs>
                <circle cx="100" cy="100" r="97" class="p-rim" />
                <circle cx="100" cy="100" r="90" class="p-stitch" />
                <circle cx="100" cy="100" r="82" fill="url(#${id}g)" class="p-disc" />
                <circle cx="100" cy="100" r="56" class="p-inner-ring" />
                <text class="p-arc"><textPath href="#${id}t" startOffset="50%">${esc(m.title.toUpperCase())}</textPath></text>
                <text class="p-arc p-arc-b"><textPath href="#${id}b" startOffset="50%">${esc(m.org.toUpperCase())}</textPath></text>
                <text x="100" y="80" class="p-code">✦ ${esc(m.code)} ✦</text>
                <text x="100" y="112" class="p-stat">${esc(m.stat)}</text>
                <text x="100" y="130" class="p-label">${esc(m.label)}</text>
              </svg>
            </div>
            <div class="patch-face patch-back" aria-hidden="true">
              <p class="pb-title">${esc(m.title)}</p>
              <ul>${m.points.map(p => `<li>${inline(p)}</li>`).join("")}</ul>
              <p class="pb-org">${esc(m.org)}</p>
            </div>
          </div>
        </li>`;
    }).join("");
  }

  const get = url => fetch(url, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(url + " " + r.status); return r.text(); });

  // Resolves to { jobs, groups }. A file that fails to load gives an empty list, so the rest of the page still works.
  window.loadContent = () => Promise.all([
    get("content/worklog.md").then(parseWorklog).catch(e => { console.error(e); return []; }),
    get("content/stack.md").then(parseStack).catch(e => { console.error(e); return []; }),
    get("content/missions.md").then(parseMissions).catch(e => { console.error(e); return []; })
  ]).then(([jobs, groups, missions]) => ({ jobs, groups, missions, renderWorklog, renderMissions }));
})();
