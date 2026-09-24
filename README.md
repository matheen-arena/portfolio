# portfolio

Personal site for **Abdul Matheen**, Cloud & Platform Engineer.

Plain HTML, CSS and JavaScript with no build step and no frameworks:

- **Sound toggle**: a small live oscilloscope in the top-right corner. Sound is on by default and starts on the visitor's first click, tap or key press (browsers block audio before that). Turn it off and the line goes flat.
- **Hero (cockpit flight)**: a first-person spaceship cockpit flying over a 3D night city (three.js, bundled in `js/vendor/`). Scrolling flies the camera forward through three stages: the intro, "Want to build and maintain secure cloud solutions in the age of AI?", and "Need modern ~~DevOps~~ AIOps / Platform Engineering for your team?" with a contact button. After that the page scrolls normally. The dashboard has a radar, a skills log and a "scroll down" console that jumps to the next stage. Without WebGL, a static sky shows behind the cockpit.
- **Impact**: animated counters with sparklines.
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
