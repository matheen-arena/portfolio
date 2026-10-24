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

  /* ================= ORIGINAL SOUNDTRACK: "Core Breach" (dark cinematic tech, 120 BPM half-time, D minor) ================= */
  // Composed for this site and synthesised live; no samples, no licensed audio.
  // Half-time drums, a growling reese bass, power-fifth "braams", a gated synth pulse, sonar pings and data blips.
  const BPM = 120, STEP = 60 / BPM / 4;                      // 16th-note length in seconds
  const N = m => 440 * Math.pow(2, (m - 69) / 12);           // MIDI note → Hz
  const ROOTS = [38, 38, 34, 36];                             // D · D · Bb · C, one bar each (power fifths only, no bright thirds)
  const PULSE = [0, 12, 7, 12, 0, 12, 10, 7, 0, 12, 7, 15, 0, 12, 10, 12];   // gated 16th sequence over the root
  const BASS = [[0, 0, 5], [6, 0, 2], [8, -12, 3], [11, 0, 1], [12, 3, 2], [14, -2, 2]];  // [step, semitones, length]
  const KICKS = [0, 3, 10], ACCENT = [1, .3, .55, .3, .8, .3, .55, .3, 1, .3, .55, .3, .8, .3, .55, .45];

  let musicBus, duck, reverb, drive, songStarted = false, timer = null, nextTime = 0, step = 0;

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
    musicBus = ctx.createGain(); musicBus.gain.value = .85; musicBus.connect(ambBus);
    duck = ctx.createGain(); duck.gain.value = 1; duck.connect(musicBus);          // sidechained by the kick
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(3.4, 2.4);
    const rvGain = ctx.createGain(); rvGain.gain.value = .3; reverb.connect(rvGain); rvGain.connect(musicBus);
    drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    drive.curve = curve; drive.oversample = "2x";
    const dg = ctx.createGain(); dg.gain.value = .6; drive.connect(dg); dg.connect(duck);
    delay.delayTime.value = STEP * 3;                                               // dotted-8th echo
    nextTime = ctx.currentTime + .1; step = 0;
    timer = setInterval(schedule, 40);
  }

  function schedule() {
    if (!enabled || document.visibilityState !== "visible") return;
    if (nextTime < ctx.currentTime - 1) nextTime = ctx.currentTime + .05;           // resumed after a long pause
    while (nextTime < ctx.currentTime + .35) { playStep(step, nextTime); nextTime += STEP; step++; }
  }

  // Song form (bars, looping every 32): 4 boot · 8 engage · 12 core · 4 breach · 4 core.
  function section(bar) {
    const b = bar < 4 ? bar : 4 + ((bar - 4) % 28);
    if (b < 4) return "boot";
    if (b < 12) return "engage";
    if (b < 24) return "core";
    if (b < 28) return "breach";
    return "core";
  }

  function playStep(n, t) {
    const bar = Math.floor(n / 16), s = n % 16, root = ROOTS[bar % 4], part = section(bar);
    const beat = part === "engage" || part === "core", quiet = part === "boot" || part === "breach";

    // atmosphere: drone, sonar, clock tick, data blips
    if (quiet && s === 0) drone(root, t);
    if (quiet && s === 0 && bar % 2 === 0) sonar(t);
    if (s % 2 === 0) tick(t, quiet ? .025 : .018);
    if (Math.random() < (quiet ? .12 : .18)) blip(t);

    // braam on the downbeat every two bars once the beat is in, and every bar in the breach
    if ((beat && s === 0 && bar % 2 === 0) || (part === "breach" && s === 0)) braam(root, t, part === "breach" ? .09 : .06);
    if (part === "breach" && bar % 4 === 3 && s === 0) riser(t);

    // half-time drums
    if (beat && KICKS.includes(s)) kick(t, s === 0 ? 1 : .75);
    if (beat && s === 8) snare(t);
    if (part === "core") metal(t, .03 * ACCENT[s]);
    else if (part === "engage" && s % 2 === 0) metal(t, .025 * ACCENT[s]);

    // reese bass groove
    if (beat) BASS.forEach(([at, semi, len]) => { if (at === s) bass(N(root + semi), t, at === 0 ? .2 : .14, len * STEP); });
    if (quiet && s === 0) bass(N(root - 12), t, .12, STEP * 15);

    // gated synth pulse, opening up as the core section goes on
    if (part === "core" || (part === "engage" && bar % 8 >= 4)) pulse(N(root + 24 + PULSE[s]), t, part === "core" ? .028 : .02, 500 + ((bar % 4) * 16 + s) * 40);

    // glitch stutter at the end of every 4th bar
    if (beat && bar % 4 === 3 && s >= 12) stutter(t);
  }

  /* ---------- instruments ---------- */
  function env(g, t, a, peak, d, sus, r, len) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * sus, t + a + d);
    g.gain.setValueAtTime(peak * sus, t + Math.max(a + d, len));
    g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(a + d, len) + r);
  }
  function noiseBuf(dur) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let snareNoise, hatNoise;
  function kick(t, vol = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(36, t + .16);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .55);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .6);
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(.3, t); duck.gain.linearRampToValueAtTime(1, t + STEP * 3);
  }
  // Big half-time snare: noise crack plus body, drenched in the hall.
  function snare(t) {
    snareNoise = snareNoise || noiseBuf(.4);
    const src = ctx.createBufferSource(); src.buffer = snareNoise;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = .5;
    const g = ctx.createGain(); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .32);
    src.connect(f); f.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = 1.1; g.connect(rs); rs.connect(reverb);
    src.start(t); src.stop(t + .4);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(120, t + .1);
    og.gain.setValueAtTime(.3, t); og.gain.exponentialRampToValueAtTime(.001, t + .16);
    o.connect(og); og.connect(musicBus); o.start(t); o.stop(t + .18);
  }
  // Metallic 16th hats: inharmonic square partials through a narrow high band.
  function metal(t, vol) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = 9500; f.Q.value = 1.4;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + .05);
    f.connect(g); g.connect(musicBus);
    [317, 449, 541, 673].forEach(fr => { const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = fr * 2; o.connect(f); o.start(t); o.stop(t + .06); });
  }
  function tick(t, vol) {
    hatNoise = hatNoise || noiseBuf(.02);
    const src = ctx.createBufferSource(); src.buffer = hatNoise;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 6000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + .015);
    src.connect(f); f.connect(g); g.connect(musicBus); src.start(t); src.stop(t + .02);
  }
  // Data blip: short high sine at a random pitch from the scale, panned somewhere in the field.
  const BLIPS = [74, 77, 79, 81, 84, 86, 89, 91];
  function blip(t) {
    const o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.type = "sine"; o.frequency.value = N(BLIPS[Math.floor(Math.random() * BLIPS.length)] + 12);
    g.gain.setValueAtTime(.018, t); g.gain.exponentialRampToValueAtTime(.0005, t + .05);
    o.connect(g);
    if (pan) { pan.pan.value = Math.random() * 1.6 - .8; g.connect(pan); pan.connect(musicBus); } else g.connect(musicBus);
    const sd = ctx.createGain(); sd.gain.value = .5; g.connect(sd); sd.connect(delay);
    o.start(t); o.stop(t + .06);
  }
  function sonar(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(1180, t); o.frequency.exponentialRampToValueAtTime(1120, t + 1.2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + 1.4);
    o.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .9; g.connect(rs); rs.connect(reverb);
    const sd = ctx.createGain(); sd.gain.value = .4; g.connect(sd); sd.connect(delay);
    o.start(t); o.stop(t + 1.5);
  }
  // Reese bass: two detuned saws plus a sub sine, slowly wobbling filter, through the saturator.
  function bass(freq, t, vol, len) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    f.type = "lowpass"; f.Q.value = 4; f.frequency.setValueAtTime(420, t);
    lfo.frequency.value = BPM / 60 / 2; lfoAmt.gain.value = 260; lfo.connect(lfoAmt); lfoAmt.connect(f.frequency);
    env(g, t, .01, vol, .1, .8, .08, len);
    f.connect(g); g.connect(drive);
    const oscs = [-14, 14].map(det => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq; o.detune.value = det; o.connect(f); return o; });
    const sub = ctx.createOscillator(), sg = ctx.createGain(); sub.type = "sine"; sub.frequency.value = freq / 2; sg.gain.value = .9; sub.connect(sg); sg.connect(f);
    [...oscs, sub, lfo].forEach(x => { x.start(t); x.stop(t + len + .2); });
  }
  // Braam: a huge low power-fifth with a slow filter swell, like a cinematic horn hit.
  function braam(root, t, vol) {
    const len = STEP * 14, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.Q.value = 2;
    f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1600, t + .35); f.frequency.exponentialRampToValueAtTime(260, t + len);
    env(g, t, .06, vol, .5, .6, 1.2, len * .7);
    f.connect(g); g.connect(drive);
    const rs = ctx.createGain(); rs.gain.value = .6; g.connect(rs); rs.connect(reverb);
    [root - 12, root - 5, root].forEach(m => [-8, 8].forEach(det => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = N(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 1.4);
    }));
  }
  function drone(root, t) {
    const len = STEP * 16, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(700, t + len * .7);
    env(g, t, .5, .06, .4, .8, .8, len - .2);
    f.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .5; g.connect(rs); rs.connect(reverb);
    [root, root + 7].forEach(m => [-10, 10].forEach(det => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = N(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 1);
    }));
  }
  // Gated pulse: tight square 16ths with a filter that opens across the phrase.
  function pulse(freq, t, vol, cutoff) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = freq;
    f.type = "lowpass"; f.Q.value = 6; f.frequency.value = cutoff;
    env(g, t, .002, vol, .04, .3, .02, STEP * .45);
    o.connect(f); f.connect(g); g.connect(duck);
    const sd = ctx.createGain(); sd.gain.value = .35; g.connect(sd); sd.connect(delay);
    o.start(t); o.stop(t + STEP);
  }
  // Glitch stutter: 32nd-note bursts of filtered noise sweeping up.
  function stutter(t) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * STEP / 2, src = ctx.createBufferSource(); src.buffer = noiseBuf(.03);
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 6; f.frequency.value = 1200 + Math.random() * 3000;
      const g = ctx.createGain(); g.gain.setValueAtTime(.06, tt); g.gain.exponentialRampToValueAtTime(.0005, tt + .03);
      src.connect(f); f.connect(g); g.connect(musicBus); src.start(tt); src.stop(tt + .035);
    }
  }
  function riser(t) {
    const len = STEP * 16, src = ctx.createBufferSource(); src.buffer = noiseBuf(len);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(6500, t + len);
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
