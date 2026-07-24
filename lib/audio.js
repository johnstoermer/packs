export function createAudioEngine() {
  let context = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (typeof window === "undefined") return null;
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
    return context;
  }

  function tone(frequency, duration, options = {}) {
    if (!enabled || !ensure()) return;
    const now = context.currentTime + (options.delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.to) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume || 0.12, now + Math.min(0.018, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function noise(duration, options = {}) {
    if (!enabled || !ensure()) return;
    const now = context.currentTime + (options.delay || 0);
    const length = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * (options.smooth || 0.2) + white * (1 - (options.smooth || 0.2));
      data[index] = last * (1 - index / length);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = options.filter || "bandpass";
    filter.frequency.value = options.frequency || 2400;
    filter.Q.value = options.q || 0.8;
    gain.gain.setValueAtTime(options.volume || 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
  }

  function sound(name, rarityOrder = 0) {
    if (!enabled) return;
    switch (name) {
      case "start":
        tone(174, 0.16, { type: "triangle", to: 260, volume: 0.08 });
        tone(348, 0.22, { type: "triangle", delay: 0.07, to: 520, volume: 0.07 });
        break;
      case "pack":
        noise(0.28, { frequency: 3300, volume: 0.1, smooth: 0.08 });
        tone(110, 0.22, { type: "triangle", to: 190, volume: 0.07 });
        break;
      case "tear":
        noise(0.2, { frequency: 5100, volume: 0.16, smooth: 0.04, q: 1.7 });
        noise(0.1, { delay: 0.08, frequency: 1800, volume: 0.07, smooth: 0.45 });
        break;
      case "reveal": {
        const root = [220, 277, 330, 415, 523][Math.min(4, rarityOrder)];
        tone(root, 0.18 + rarityOrder * 0.035, { type: rarityOrder > 2 ? "sine" : "triangle", to: root * 1.5, volume: 0.07 + rarityOrder * 0.015 });
        if (rarityOrder >= 2) tone(root * 2, 0.32, { delay: 0.04, volume: 0.045 });
        if (rarityOrder >= 4) {
          tone(root * 1.25, 0.6, { delay: 0.09, volume: 0.05 });
          tone(root * 1.5, 0.7, { delay: 0.15, volume: 0.05 });
        }
        break;
      }
      case "buy":
        tone(290, 0.08, { type: "square", to: 390, volume: 0.045 });
        tone(580, 0.11, { delay: 0.045, volume: 0.04 });
        break;
      case "deny":
        tone(118, 0.12, { type: "square", to: 91, volume: 0.045 });
        break;
      case "contract":
        tone(262, 0.16, { type: "triangle", to: 392, volume: 0.07 });
        tone(523, 0.24, { delay: 0.08, volume: 0.065 });
        break;
      case "legendary":
        tone(196, 0.7, { volume: 0.055, to: 392 });
        tone(247, 0.75, { delay: 0.06, volume: 0.05, to: 494 });
        tone(294, 0.8, { delay: 0.12, volume: 0.05, to: 588 });
        break;
      default:
        tone(260, 0.08, { volume: 0.04 });
    }
  }

  return {
    ensure,
    sound,
    setEnabled(value) {
      enabled = Boolean(value);
      if (master && context) {
        master.gain.setTargetAtTime(enabled ? 0.32 : 0.0001, context.currentTime, 0.02);
      }
    },
    get enabled() {
      return enabled;
    },
  };
}
