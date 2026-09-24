# portfolio

Personal site for **Abdul Matheen**, Cloud & Platform Engineer.

Plain HTML, CSS and JavaScript with no build step and no frameworks:

- **Sound toggle**: a small live oscilloscope in the top-right corner. Sound is on by default and starts on the visitor's first click, tap or key press (browsers block audio before that). Turn it off and the line goes flat.
- **Hero (cockpit)**: a spaceship control view: a warp-speed starfield, a rotating wireframe globe with orbiting skill satellites and traffic arcs, and a targeting reticle that follows the cursor. HUD panels show a mission strip, a radar that sweeps across the skill domains, impact gauges, a heading tape and a thrust meter. Click to warp; with sound on, the scene reacts to the audio.
- **Impact**: animated counters with sparklines.
- **Stack sphere**: a 3D sphere of skills, colour-coded by domain. Drag to spin it, hover a skill, or pick a domain to turn it to the front.
- **Motion details**: a live `tail -f` career log in About, a work timeline that fills as you scroll, a marquee driven by scroll speed, scrambled heading reveals, hero letters that react to the cursor, magnetic buttons, and a cursor spotlight on a faint grid. With sound on, the hero particles and the skills sphere react to the audio.
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
