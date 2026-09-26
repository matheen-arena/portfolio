# portfolio

Personal site for **Abdul Matheen**, Cloud & Platform Engineer.

Plain HTML, CSS and JavaScript with no build step and no frameworks:

- **Sound toggle**: a small live oscilloscope in the top-right corner. Sound is on by default and starts on the visitor's first click, tap or key press (browsers block audio before that). Turn it off and the line goes flat.
- **Hero (cockpit flight)**: a first-person cockpit (beveled pillars with light tubes, dashboard hoods) looking down over a 3D night city built with three.js (bundled in `js/vendor/`): moon-lit bluish buildings with sparse pink window slits, a dense downtown with a pyramid tower and a lattice radio mast, and sprawl that fades into a black skyline against a deep-blue horizon. Scrolling flies the camera forward through three stages: the intro, "Want to build and maintain secure cloud solutions in the age of AI?", and "Need modern ~~DevOps~~ AIOps / Platform Engineering for your team?". After that the page scrolls normally. Without WebGL, a static sky shows behind the cockpit.
- **Impact**: animated counters with sparklines.
- **Stack graph**: an interactive force graph of skills grouped by domain.
- **Terminal**: a working shell. Try `help`, `kubectl get pods`, `terraform plan` or `sudo hire-me`.
- **Sound**: an original synthwave track, "Night Flight" (100 BPM, A minor: Am–F–C–G), composed for this site and generated live with the Web Audio API: kick, snare, hats, pulsing bass, a 16th-note arpeggio with echo, pads, a lead hook, a breakdown and a riser, with kick-driven ducking. Plus UI blips and key clicks. No audio files. Toggle it from the top-right corner or press `M`.

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

- **Work log** and **Stack graph** content lives in `content/worklog.md` and `content/stack.md`. See [`content/USAGE.md`](content/USAGE.md) for the format.
- Other text (about, impact, contact) is in `index.html`.
- Terminal commands are in `js/main.js` (search for `CMDS`).
- Colours and fonts are CSS variables at the top of `styles.css`.

## Deploying changes

`index.html` loads `styles.css` and the scripts with a `?v=` version tag, so visitors never get a new page with an old cached stylesheet (GitHub Pages caches assets for about 10 minutes). When you change CSS or JS, bump the tag, for example:

```bash
V=$(git rev-parse --short HEAD); sed -i -E "s/\?v=[a-z0-9]+/?v=$V/g" index.html
```
