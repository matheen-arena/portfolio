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

  /* ================= ORIGINAL SOUNDTRACK: "Kaiju Intercept" (cockpit battle theme, 138 BPM, D minor) ================= */
  // Composed for this site and synthesised live; no samples, no licensed audio.
  const BPM = 138, STEP = 60 / BPM / 4;                      // 16th-note length in seconds
  const N = m => 440 * Math.pow(2, (m - 69) / 12);           // MIDI note → Hz
  // Dm – Bb – C – A (harmonic minor turnaround), one bar each.
  const CHORDS = [
    { root: 38, tones: [62, 65, 69, 74] },   // D minor
    { root: 34, tones: [62, 65, 70, 74] },   // Bb major
    { root: 36, tones: [64, 67, 72, 76] },   // C major
    { root: 33, tones: [61, 64, 69, 73] }    // A major
  ];
  // Heroic hook over the 4-bar loop: [step within 64, midi, length in steps].
  const HOOK = [[0, 74, 3], [3, 74, 3], [6, 77, 2], [8, 76, 4], [12, 74, 4],
                [16, 74, 3], [19, 74, 3], [22, 70, 2], [24, 72, 6], [30, 74, 2],
                [32, 76, 3], [35, 76, 3], [38, 79, 2], [40, 77, 4], [44, 76, 4],
                [48, 73, 6], [54, 76, 2], [56, 81, 8]];
  // Galloping bass (octave offsets per 16th; null = rest) and syncopated brass hits.
  const GALLOP = [0, null, 0, 0, 12, null, 0, 0, 0, null, 0, 0, 12, null, 0, 12];
  const STABS = [0, 3, 6, 10];
  const ARP = [0, 1, 2, 3, 2, 1, 0, 2];

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
    musicBus = ctx.createGain(); musicBus.gain.value = .8; musicBus.connect(ambBus);
    duck = ctx.createGain(); duck.gain.value = 1; duck.connect(musicBus);          // sidechained by the kick
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(3, 2.6);
    const rvGain = ctx.createGain(); rvGain.gain.value = .32; reverb.connect(rvGain); rvGain.connect(musicBus);
    // Gritty saturation for the bass and lead.
    drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3.2); }
    drive.curve = curve; drive.oversample = "2x";
    const dg = ctx.createGain(); dg.gain.value = .55; drive.connect(dg); dg.connect(duck);
    delay.delayTime.value = STEP * 3;                                               // dotted-8th echo
    nextTime = ctx.currentTime + .1; step = 0;
    timer = setInterval(schedule, 40);
  }

  function schedule() {
    if (!enabled || document.visibilityState !== "visible") return;
    if (nextTime < ctx.currentTime - 1) nextTime = ctx.currentTime + .05;           // resumed after a long pause
    while (nextTime < ctx.currentTime + .35) { playStep(step, nextTime); nextTime += STEP; step++; }
  }

  // Song form (bars, looping every 36): 4 alert · 4 launch · 16 battle · 4 standoff · 8 final assault.
  function section(bar) {
    const b = bar < 4 ? bar : 4 + ((bar - 4) % 32);
    if (b < 4) return "alert";
    if (b < 8) return "launch";
    if (b < 24) return "battle";
    if (b < 28) return "standoff";
    return "assault";
  }

  function playStep(n, t) {
    const bar = Math.floor(n / 16), s = n % 16, ch = CHORDS[bar % 4], part = section(bar);
    const fight = part === "battle" || part === "assault";

    // red-alert: siren sweeps and war drums before the launch, and again in the standoff
    if ((part === "alert" || part === "standoff") && s === 0) { drone(ch, t); siren(t); }
    if ((part === "alert" || part === "standoff") && [0, 6, 10, 12, 14].includes(s)) tom(t, s === 0 ? .5 : .32, s >= 12 ? 1.3 : 1);
    if (part === "standoff" && bar % 4 === 3 && s === 0) riser(t);

    // drums
    if (part !== "alert" && part !== "standoff" && s % 4 === 0) kick(t);
    if (part === "assault" && (s === 7 || s === 14)) kick(t, .6);
    if (fight && (s === 4 || s === 12)) snare(t);
    if (part === "launch" && s >= 12 && bar % 4 === 3) snare(t, .22);
    if (part !== "alert") hat(t, s % 4 === 2 ? .05 : .022);
    if (fight && bar % 4 === 3 && s >= 12) tom(t, .3, 1 + (s - 12) * .15);

    // galloping distorted bass
    if (part !== "alert" && part !== "standoff" && GALLOP[s] !== null) bass(N(ch.root + GALLOP[s]), t, s % 4 === 0 ? .2 : .13);
    if (part === "standoff" && s === 0) bass(N(ch.root), t, .16, STEP * 14);

    // brass stabs, arps and the hook
    if (fight && STABS.includes(s)) stab(ch, t, s === 0 ? .055 : .04);
    if (part !== "alert") arp(N(ch.tones[ARP[s % 8]] + (part === "assault" && s >= 8 ? 12 : 0)), t, part === "launch" ? .03 : .025);
    if (part === "assault" || (part === "battle" && bar % 8 >= 4)) {
      const k = (bar % 4) * 16 + s;
      HOOK.forEach(([at, m, len]) => { if (at === k) lead(N(m), t, len * STEP); });
    }
  }

  /* ---------- instruments ---------- */
  function env(g, t, a, peak, d, sus, r, len) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.linearRampToValueAtTime(peak * sus, t + a + d);
    g.gain.setValueAtTime(peak * sus, t + Math.max(a + d, len));
    g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(a + d, len) + r);
  }
  function kick(t, vol = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(40, t + .1);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .4);
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(.35, t); duck.gain.linearRampToValueAtTime(1, t + STEP * 3);
  }
  function noiseBuf(dur) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let snareNoise, hatNoise;
  function snare(t, vol = .4) {
    snareNoise = snareNoise || noiseBuf(.35);
    const src = ctx.createBufferSource(); src.buffer = snareNoise;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1600; f.Q.value = .6;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .26);
    src.connect(f); f.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .8; g.connect(rs); rs.connect(reverb);
    src.start(t); src.stop(t + .35);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(150, t + .08);
    og.gain.setValueAtTime(.22, t); og.gain.exponentialRampToValueAtTime(.001, t + .12);
    o.connect(og); og.connect(musicBus); o.start(t); o.stop(t + .14);
  }
  function hat(t, vol) {
    hatNoise = hatNoise || noiseBuf(.06);
    const src = ctx.createBufferSource(); src.buffer = hatNoise;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8500;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .045);
    src.connect(f); f.connect(g); g.connect(musicBus); src.start(t); src.stop(t + .06);
  }
  // Taiko-style war drum: deep pitch-dropping body plus a skin slap, into the hall reverb.
  function tom(t, vol, pitch = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120 * pitch, t); o.frequency.exponentialRampToValueAtTime(48 * pitch, t + .35);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .6);
    o.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .7; g.connect(rs); rs.connect(reverb);
    o.start(t); o.stop(t + .65);
    snareNoise = snareNoise || noiseBuf(.35);
    const src = ctx.createBufferSource(); src.buffer = snareNoise;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * .5, t); ng.gain.exponentialRampToValueAtTime(.001, t + .08);
    src.connect(f); f.connect(ng); ng.connect(musicBus); src.start(t); src.stop(t + .1);
  }
  function bass(freq, t, vol, len = STEP * .85) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = freq; o2.type = "square"; o2.frequency.value = freq / 2;
    f.type = "lowpass"; f.Q.value = 5;
    f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(260, t + .12);
    env(g, t, .004, vol, .07, .6, .04, len);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(drive);
    [o, o2].forEach(x => { x.start(t); x.stop(t + len + .1); });
  }
  // Brass-like stab: detuned saws through a fast-closing filter.
  function stab(ch, t, vol) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.Q.value = 3; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(500, t + .18);
    env(g, t, .006, vol, .12, .25, .12, STEP * 1.2);
    f.connect(g); g.connect(duck);
    const rs = ctx.createGain(); rs.gain.value = .4; g.connect(rs); rs.connect(reverb);
    ch.tones.slice(0, 3).forEach(m => [-12, 12].forEach(det => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = N(m - 12); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + STEP * 1.2 + .2);
    }));
  }
  function arp(freq, t, vol) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = freq;
    f.type = "lowpass"; f.Q.value = 4; f.frequency.setValueAtTime(3600, t); f.frequency.exponentialRampToValueAtTime(600, t + .1);
    env(g, t, .003, vol, .08, .15, .04, STEP * .5);
    o.connect(f); f.connect(g); g.connect(duck);
    const sd = ctx.createGain(); sd.gain.value = .45; g.connect(sd); sd.connect(delay);
    o.start(t); o.stop(t + STEP + .12);
  }
  // Ominous low drone under the alert and standoff sections.
  function drone(ch, t) {
    const len = STEP * 16, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "lowpass"; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(900, t + len * .7);
    env(g, t, .4, .07, .4, .8, .8, len - .2);
    f.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .5; g.connect(rs); rs.connect(reverb);
    [ch.root, ch.root + 7, ch.root + 12].forEach(m => [-10, 10].forEach(det => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = N(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 1);
    }));
  }
  // Red-alert siren: a slow rise and fall, filtered so it sits behind the music.
  function siren(t) {
    const len = STEP * 8, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(440, t); o.frequency.linearRampToValueAtTime(880, t + len * .5); o.frequency.linearRampToValueAtTime(440, t + len);
    f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.035, t + .1); g.gain.setValueAtTime(.035, t + len - .15); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(f); f.connect(g); g.connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = .6; g.connect(rs); rs.connect(reverb);
    o.start(t); o.stop(t + len + .05);
  }
  function lead(freq, t, len) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    const vib = ctx.createOscillator(), vibAmt = ctx.createGain();
    o.type = "sawtooth"; o2.type = "sawtooth"; o.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = -9;
    vib.frequency.value = 6; vibAmt.gain.value = 8; vib.connect(vibAmt); vibAmt.connect(o.detune); vibAmt.connect(o2.detune);
    f.type = "lowpass"; f.frequency.value = 3200; f.Q.value = 2;
    env(g, t, .015, .055, .1, .8, .16, len * .95);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus);
    const sd = ctx.createGain(); sd.gain.value = .4; g.connect(sd); sd.connect(delay);
    const rs = ctx.createGain(); rs.gain.value = .45; g.connect(rs); rs.connect(reverb);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + len + .3); });
  }
  function riser(t) {
    const len = STEP * 16, src = ctx.createBufferSource(); src.buffer = noiseBuf(len);
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + len);
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
