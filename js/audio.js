/* Generative sound engine — everything is synthesised with Web Audio, no files. */
(function () {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, analyser = null, waveBuf = null, sfxBus = null, ambBus = null, delay = null;
  // Sound is on by default, but browsers only allow audio after the visitor
  // interacts with the page, so the engine starts on the first gesture.
  let enabled = true, unlocked = false, ambientStarted = false, pingTimer = null;
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

  function startAmbient() {
    if (ambientStarted) return;
    ambientStarted = true;
    const t = ctx.currentTime;

    // Warm pad: detuned saws through a slowly breathing low-pass.
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .05;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
    lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency); lfo.start(t);

    const padGain = ctx.createGain(); padGain.gain.value = .045;
    lp.connect(padGain); padGain.connect(ambBus);

    [55, 110, 164.81, 196, 246.94].forEach((f, i) => {
      [-7, 7].forEach(det => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? "sawtooth" : "triangle";
        o.frequency.value = f; o.detune.value = det + (Math.random() * 4 - 2);
        o.connect(lp); o.start(t);
      });
    });

    // Gentle sub-bass pulse, like a server room hum.
    const sub = ctx.createOscillator(); sub.frequency.value = 55; sub.type = "sine";
    const subG = ctx.createGain(); subG.gain.value = .03;
    const subLfo = ctx.createOscillator(); subLfo.frequency.value = .25;
    const subLfoAmt = ctx.createGain(); subLfoAmt.gain.value = .02;
    subLfo.connect(subLfoAmt); subLfoAmt.connect(subG.gain);
    sub.connect(subG); subG.connect(ambBus); sub.start(t); subLfo.start(t);

    schedulePing();
  }

  function schedulePing() {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => {
      if (enabled && document.visibilityState === "visible") {
        const f = SCALE[(Math.random() * SCALE.length) | 0] * (Math.random() < .3 ? 2 : 1);
        tone(f, { type: "sine", dur: 1.2, vol: .05, attack: .01, send: .9, bus: ambBus });
      }
      schedulePing();
    }, 1400 + Math.random() * 3200);
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
