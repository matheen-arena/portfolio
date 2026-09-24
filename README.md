# portfolio

Personal site for **Abdul Matheen**, Cloud & Platform Engineer.

Plain HTML, CSS and JavaScript with no build step and no frameworks:

- **Sound toggle**: a small live oscilloscope in the top-right corner. Sound is off by default; turn it on and the line becomes the real audio waveform.
- **Hero**: a canvas "telemetry" flow field. The cursor acts as a collector that pulls signals in; click to send out a shockwave.
- **Impact**: animated counters with sparklines.
- **Signal path**: an animated SVG of the observability pipeline (Lambda/ECS/Batch → Kinesis → Alloy → Loki/Mimir/Tempo → Grafana).
- **Stack graph**: an interactive force graph of skills grouped by domain.
- **Terminal**: a working shell. Try `help`, `kubectl get pods`, `terraform plan` or `sudo hire-me`.
- **Sound**: generated live with the Web Audio API (ambient pad, UI blips, key clicks), so there are no audio files. Toggle it from the top-right corner or press `M`.

Respects `prefers-reduced-motion`, and works on phones.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish on GitHub Pages

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment**, set *Source* to **Deploy from a branch**.
3. Pick the branch (`main` once this is merged, or `al-site`) and the `/ (root)` folder, then save.
4. The site will be live at `https://<your-username>.github.io/portfolio/` within a minute or two.

## Editing content

- Text content (about, jobs, contact) is in `index.html`.
- The signal-path nodes, skill groups and terminal commands are data arrays in `js/main.js` (search for `NODES`, `GROUPS` and `CMDS`).
- Colours and fonts are CSS variables at the top of `styles.css`.
