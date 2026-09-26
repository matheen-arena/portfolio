# Editing the portfolio content

The **Work log** and **Stack graph** sections are generated from two Markdown files. Edit those files and commit. You don't need to touch any HTML or JavaScript.

| File | Controls | Also feeds |
| --- | --- | --- |
| `content/worklog.md` | The **Work log** section (roles, projects, bullets) | Terminal command `experience` |
| `content/stack.md` | The **Stack graph** section (clusters and skills) | Terminal command `skills` |

Order matters: things appear on the site in the same order as in the file (top to bottom).

---

## `worklog.md`

### Pattern

```markdown
## <Job title> | <Company>
- when: <Start> – <End>
- where: <City, Country>
- badge: <current | intern | any word>      ← optional

### <Project name>
- domain: <Domain>
- stack: <Tech 1>, <Tech 2>, <Tech 3>

- [<TAG>] <Bullet text, with **bold** where you want emphasis>
- [<TAG>] <Next bullet>
```

### What each line becomes

| Line in the file | Where it shows on the site |
| --- | --- |
| `## Cloud and Platform Engineer \| zeb` | Role heading: "Cloud and Platform Engineer **at zeb**". The `\|` separates title from company. |
| `- when: May 2026 – Present` | Date on the left of the role |
| `- where: Chennai, India` | Location under the date. The terminal uses the part before the comma. |
| `- badge: current` | Green "● current" pill. Any other word (e.g. `intern`) shows a plain pill. Leave the line out for no pill. |
| `### Grafana OTEL` | Project line: "Domain: … · Project: **Grafana OTEL**" |
| `- domain: Retail` | The "Domain:" part of the project line |
| `- stack: AWS, Amazon EKS, Terraform` | Green tech-stack line under the project. Separate with commas (or `·`). |
| `- [OBSERVABILITY] Designed and …` | One bullet. The word in `[ ]` is the small tag on the left; the rest is the text. |
| `**Grafana Alloy**` inside a bullet | Bold text |

### Rules

- `when`, `where` and `badge` belong to the role, so put them right under the `##` line, before the first `###`.
- `domain` and `stack` belong to a project, so put them right under its `###` line.
- A role can have any number of projects; a project can have any number of bullets.
- Tags are shown in capitals. These tags have their own colour, and any other tag is green:
  - amber: `COST`, `OBSERVABILITY & COST`
  - orange: `SECURITY`, `AI`, `AI AGENTS`
  - blue: `DEPLOY`, `MIGRATE`, `ARGO`, `SCM`, `AWS`, `AWS NETWORKING`
- Blank lines are optional. `<!-- comments -->` are ignored.

### Common edits

**Add a bullet:** add a `- [TAG] text` line under the project.

**Add a project** to a role: add a new block under that role, above or below the other projects:

```markdown
### New Project Name
- domain: Retail
- stack: AWS, Terraform

- [AWS] What you did.
```

**Add a new role** (e.g. a new job): add a new `##` block at the top of the file, and remove `- badge: current` from the previous role.

**Remove** anything by deleting its lines. A `###` block removes one project, and a `##` block (with everything under it, up to the next `##`) removes a role.

---

## `stack.md`

### Pattern

```markdown
## <Cluster name>
color: <orange | blue | green | amber | purple | pink | grey>
- <Skill>
- <Skill>
```

### What each line becomes

| Line in the file | Where it shows on the site |
| --- | --- |
| `## Observability` | A cluster (hub) on the graph, its caption, and a button in the legend below it |
| `color: green` | Colour of the hub, its lines, dots and legend button. You can also use a hex code like `#7cf7c1`. |
| `- Grafana Loki` | One skill (dot and label) in that cluster |

### Rules

- Clusters appear in file order (left to right, top to bottom), and skills fan out in file order.
- The graph lays itself out automatically, so there are no positions to set. Clusters of up to about 11 skills look best. Split a bigger one into two clusters.
- A cluster with no skills is skipped.

### Common edits

**Add a skill:** add a `- Skill` line under the right cluster. **Remove** one by deleting its line.

**Add a cluster:**

```markdown
## Messaging
color: purple
- Kafka
- SQS
```

---

## After editing

1. Preview locally. The page loads these files, so it must be served, not double-clicked. Double-clicking `index.html` shows a note in place of the work log.
   - **Windows:** double-click `preview.bat`
   - **macOS / Linux:** run `./preview.sh`

   Either one starts a local server and opens http://localhost:8000. Refresh after each edit. This needs Python installed.
2. Commit and push. GitHub Pages publishes the change within a minute or two.

The files are fetched fresh on every visit, so content edits don't need the `?v=` cache tag in `index.html` to be bumped. That tag is only needed when you change CSS or JavaScript.
