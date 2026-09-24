/* Generative sound engine — everything is synthesised with Web Audio, no files. */
(function () {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, analyser = null, waveBuf = null, sfxBus = null, ambBus = null, delay = null;
  // Sound is on by default, but browsers only allow audio after the visitor
  // interacts with the page, so the engine starts on the first gesture.
  let enabled = true, unlocked = false;
  const listeners = [];

  // A-minor pentatonic across a few octaves for the "data pings".
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];

  function setup() {
    if (ctx || !Ctx) return;
    ctx = new Ctx();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; master.connect(analyser);
    waveBuf = new Float32Array(analyser.fftSize);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    comp.connect(master);

    sfxBus = ctx.createGain(); sfxBus.gain.value = .55; sfxBus.connect(comp);
    ambBus = ctx.createGain(); ambBus.gain.value = .5; ambBus.connect(comp);

    // Feedback delay for a spacious tail on pings.
    delay = ctx.createDelay(1.5); delay.delayTime.value = .38;
    const fb = ctx.createGain(); fb.gain.value = .38;
    const damp = ctx.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 2400;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    const wet = ctx.createGain(); wet.gain.value = .5;
    damp.connect(wet); wet.connect(comp);
  }

  /* ================= ORIGINAL SOUNDTRACK: "Night Flight" (synthwave, 100 BPM, A minor) ================= */
  // Everything below is composed for this site and synthesised live; no samples, no licensed audio.
  const BPM = 100, STEP = 60 / BPM / 4;                      // 16th-note length in seconds
  const N = m => 440 * Math.pow(2, (m - 69) / 12);           // MIDI note → Hz
  // Am – F – C – G, one bar each (roots in MIDI, then chord tones for pads and arps).
  const CHORDS = [
    { root: 45, tones: [57, 60, 64, 69, 72] },   // A minor
    { root: 41, tones: [57, 60, 65, 69, 72] },   // F major
    { root: 48, tones: [55, 60, 64, 67, 72] },   // C major
    { root: 43, tones: [55, 59, 62, 67, 71] }    // G major
  ];
  // Lead hook over the 4-bar progression: [step within 64 steps, midi, length in steps].
  const HOOK = [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 69, 4], [16, 72, 6], [22, 74, 2], [24, 76, 8],
                [32, 79, 6], [38, 77, 2], [40, 76, 4], [44, 72, 4], [48, 74, 6], [54, 72, 2], [56, 71, 8]];
  const ARP = [0, 2, 1, 3, 2, 4, 3, 1];                       // index pattern into chord tones

  let musicBus, duck, reverb, songStarted = false, timer = null, nextTime = 0, step = 0;

  function makeImpulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function startAmbient() {
    if (songStarted) return;
    songStarted = true;
    musicBus = ctx.createGain(); musicBus.gain.value = .8; musicBus.connect(ambBus);
    duck = ctx.createGain(); duck.gain.value = 1; duck.connect(musicBus);          // sidechained by the kick
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(2.6, 3);
    const rvGain = ctx.createGain(); rvGain.gain.value = .35; reverb.connect(rvGain); rvGain.connect(musicBus);
    delay.delayTime.value = STEP * 3;                                               // dotted-8th echo
    nextTime = ctx.currentTime + .1; step = 0;
    timer = setInterval(schedule, 40);
  }

  function schedule() {
    if (!enabled || document.visibilityState !== "visible") return;
    if (nextTime < ctx.currentTime - 1) nextTime = ctx.currentTime + .05;           // resumed after a long pause
    while (nextTime < ctx.currentTime + .35) { playStep(step, nextTime); nextTime += STEP; step++; }
  }

  // Song form (in bars, looping every 36): 4 intro · 16 full · 4 breakdown · 12 full with hook.
  function section(bar) {
    const b = bar < 4 ? bar : 4 + ((bar - 4) % 32);
    if (b < 4) return "intro";
    if (b >= 20 && b < 24) return "break";
    return b >= 24 ? "peak" : "full";
  }

  function playStep(n, t) {
    const bar = Math.floor(n / 16), s = n % 16, ch = CHORDS[bar % 4], part = section(bar);
    const drums = part === "full" || part === "peak";

    if (s === 0) pad(ch, t, part === "intro" || part === "break" ? .07 : .04);
    if (drums && s % 4 === 0) kick(t);
    if (drums && (s === 4 || s === 12)) snare(t);
    if (part !== "intro" && s % 2 === 0) hat(t, s % 4 === 2 ? .05 : .025);
    if (part === "peak" && s % 2 === 1) hat(t, .015);
    if (part !== "break" && part !== "intro") bass(N(ch.root - (s % 4 === 2 ? 0 : 12)), t, s % 2 === 0 ? .16 : .1);
    if ((part === "break" || part === "intro") && s === 0) bass(N(ch.root - 12), t, .14, STEP * 14);
    if (part === "intro" && s % 4 === 0) hat(t, .02);
    arp(N(ch.tones[ARP[s % 8]] + (s >= 8 && part === "peak" ? 12 : 0)), t, part === "intro" ? .06 : .04);
    if (part === "peak" || (part === "full" && bar % 8 >= 4)) {
      const k = (bar % 4) * 16 + s;
      HOOK.forEach(([at, m, len]) => { if (at === k) lead(N(m), t, len * STEP); });
    }
    if (part === "break" && s === 0 && bar % 4 === 3) riser(t);
  }

  /* ---------- instruments ---------- */
  function env(g, t, a, peak, d, sus, r, len) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * sus, t + a + d);
    g.gain.setValueAtTime(peak * sus, t + Math.max(a + d, len));
    g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(a + d, len) + r);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .4);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .45);
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(.3, t); duck.gain.linearRampToValueAtTime(1, t + STEP * 3);
  }
  function noiseBuf(dur) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let snareNoise, hatNoise;
  function snare(t) {
    snareNoise = snareNoise || noiseBuf(.3);
    const src = ctx.createBufferSource(); src.buffer = snareNoise;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = .7;
    const g = ctx.createGain(); g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.001, t + .22);
    src.connect(f); f.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .6; g.connect(rs); rs.connect(reverb);
    src.start(t); src.stop(t + .3);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(160, t + .08);
    og.gain.setValueAtTime(.18, t); og.gain.exponentialRampToValueAtTime(.001, t + .1);
    o.connect(og); og.connect(musicBus); o.start(t); o.stop(t + .12);
  }
  function hat(t, vol) {
    hatNoise = hatNoise || noiseBuf(.06);
    const src = ctx.createBufferSource(); src.buffer = hatNoise;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .05);
    src.connect(f); f.connect(g); g.connect(musicBus); src.start(t); src.stop(t + .06);
  }
  function bass(freq, t, vol, len = STEP * .9) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = freq;
    f.type = "lowpass"; f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(220, t + .14);
    env(g, t, .005, vol, .08, .6, .05, len);
    o.connect(f); f.connect(g); g.connect(duck); o.start(t); o.stop(t + len + .1);
  }
  function arp(freq, t, vol) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = freq;
    f.type = "lowpass"; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + .12);
    env(g, t, .003, vol, .1, .2, .05, STEP * .6);
    o.connect(f); f.connect(g); g.connect(duck);
    const sd = ctx.createGain(); sd.gain.value = .5; g.connect(sd); sd.connect(delay);
    o.start(t); o.stop(t + STEP + .15);
  }
  function pad(ch, t, vol) {
    const len = STEP * 16, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1400, t + len * .6);
    env(g, t, .6, vol, .4, .8, .9, len - .3);
    f.connect(g); g.connect(duck);
    const rs = ctx.createGain(); rs.gain.value = .5; g.connect(rs); rs.connect(reverb);
    ch.tones.slice(0, 4).forEach(m => [-9, 9].forEach(det => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = N(m - 12); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 1);
    }));
  }
  function lead(freq, t, len) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    const vib = ctx.createOscillator(), vibAmt = ctx.createGain();
    o.type = "sawtooth"; o2.type = "square"; o.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = 7;
    vib.frequency.value = 5.5; vibAmt.gain.value = 6; vib.connect(vibAmt); vibAmt.connect(o.detune); vibAmt.connect(o2.detune);
    f.type = "lowpass"; f.frequency.value = 2600; f.Q.value = 2;
    env(g, t, .02, .06, .1, .75, .18, len * .95);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus);
    const sd = ctx.createGain(); sd.gain.value = .45; g.connect(sd); sd.connect(delay);
    const rs = ctx.createGain(); rs.gain.value = .4; g.connect(rs); rs.connect(reverb);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + len + .3); });
  }
  function riser(t) {
    const len = STEP * 16, src = ctx.createBufferSource(); src.buffer = noiseBuf(len);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.08, t + len);
    src.connect(f); f.connect(g); g.connect(musicBus); src.start(t); src.stop(t + len);
  }

  function tone(freq, o = {}) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + (o.dur || .15));
    const vol = o.vol ?? .08, atk = o.attack ?? .004, dur = o.dur ?? .15;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(delay); }
    osc.start(t); osc.stop(t + dur + .05);
  }

  function noise(o = {}) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime, dur = o.dur || .06;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = o.filter || "highpass"; f.frequency.value = o.freq || 3000;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    const g = ctx.createGain(); g.gain.value = o.vol || .08;
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t);
  }

  // Fade the master bus to match `enabled`. Only called once audio is allowed.
  function apply() {
    setup();
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(enabled ? .9 : 0, t + (enabled ? 1.2 : .4));
    if (enabled) startAmbient();
  }

  const GESTURES = ["pointerdown", "keydown", "touchend"];
  function unlock(e) {
    if (!Ctx) return;
    unlocked = true;
    GESTURES.forEach(ev => window.removeEventListener(ev, unlock, true));
    // A first click on the toggle (or pressing M) means "mute", so don't start audio for it.
    const muting = (e.target.closest && e.target.closest("#sound-toggle")) || (e.type === "keydown" && e.key && e.key.toLowerCase() === "m");
    if (enabled && !muting) apply();
  }
  GESTURES.forEach(ev => window.addEventListener(ev, unlock, true));

  let lastHover = 0;
  const SFX = {
    get enabled() { return enabled; },
    get playing() { return enabled && unlocked && !!ctx && ctx.state === "running"; },
    supported: !!Ctx,
    setEnabled(on) {
      if (!Ctx) return;
      enabled = !!on;
      listeners.forEach(fn => fn(enabled));
      if (unlocked) apply();
    },
    toggle() { this.setEnabled(!enabled); },
    onChange(fn) { listeners.push(fn); },
    hover() {
      const now = performance.now();
      if (now - lastHover < 60) return;
      lastHover = now;
      tone(1800 + Math.random() * 400, { type: "sine", dur: .05, vol: .025 });
    },
    click() { tone(660, { type: "triangle", dur: .12, vol: .08, slide: 990 }); noise({ dur: .03, vol: .04 }); },
    toggleOn() { tone(440, { dur: .12, vol: .08 }); tone(660, { dur: .14, vol: .08, at: .08 }); tone(880, { dur: .3, vol: .07, at: .16, send: .6 }); },
    key() { noise({ dur: .018, vol: .05, freq: 2000 + Math.random() * 2500 }); },
    enter() { tone(520, { type: "square", dur: .06, vol: .03 }); tone(780, { type: "square", dur: .08, vol: .03, at: .05 }); },
    error() { tone(180, { type: "sawtooth", dur: .2, vol: .05, slide: 120 }); },
    whoosh() { noise({ dur: .5, vol: .05, filter: "bandpass", freq: 300, sweep: 3000 }); },
    note(i, vol = .05) { tone(SCALE[i % SCALE.length], { dur: .6, vol, send: .7 }); },
    // Current output waveform (Float32Array, -1..1), or null before audio has started.
    wave() { if (!analyser) return null; analyser.getFloatTimeDomainData(waveBuf); return waveBuf; }
  };

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.visibilityState === "hidden") ctx.suspend(); else if (enabled) ctx.resume();
  });

  window.SFX = SFX;
})();
