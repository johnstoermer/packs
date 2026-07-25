export function createAudioEngine() {
  let context = null;
  let master = null;
  let compressor = null;
  let echo = null;
  let echoGain = null;
  let enabled = true;

  function ensure() {
    if (typeof window === "undefined") return null;
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();

      master = context.createGain();
      master.gain.value = 0.38;
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 10;
      compressor.ratio.value = 7;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;

      echo = context.createDelay(0.7);
      echo.delayTime.value = 0.19;
      echoGain = context.createGain();
      echoGain.gain.value = 0.12;

      echo.connect(echoGain);
      echoGain.connect(echo);
      echo.connect(compressor);
      master.connect(compressor);
      compressor.connect(context.destination);
    }
    if (context.state === "suspended") context.resume();
    return context;
  }

  function route(node, wet = 0) {
    node.connect(master);
    if (wet > 0) {
      const send = context.createGain();
      send.gain.value = wet;
      node.connect(send);
      send.connect(echo);
    }
  }

  function tone(frequency, duration, options = {}) {
    if (!enabled || !ensure()) return;
    const now = context.currentTime + (options.delay || 0);
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;

    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    if (options.detune) oscillator.detune.setValueAtTime(options.detune, now);
    if (options.to) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.to), now + duration);
    }

    filter.type = options.filter || "lowpass";
    filter.frequency.setValueAtTime(options.cutoff || 12_000, now);
    filter.Q.value = options.q || 0.4;

    const attack = Math.max(0.002, Math.min(options.attack ?? 0.012, duration * 0.45));
    const peak = options.volume ?? 0.1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
    if (options.hold) {
      gain.gain.setValueAtTime(Math.max(0.0002, peak * 0.85), now + Math.min(duration * 0.7, options.hold));
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(filter);
    filter.connect(gain);
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, options.pan || 0));
      gain.connect(pan);
      route(pan, options.wet || 0);
    } else {
      route(gain, options.wet || 0);
    }
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  function noise(duration, options = {}) {
    if (!enabled || !ensure()) return;
    const now = context.currentTime + (options.delay || 0);
    const length = Math.max(32, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    const smooth = options.smooth ?? 0.18;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * smooth + white * (1 - smooth);
      const envelope = options.reverse ? index / length : 1 - index / length;
      data[index] = last * Math.max(0, envelope);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;
    source.buffer = buffer;
    source.playbackRate.value = options.rate || 1;
    filter.type = options.filter || "bandpass";
    filter.frequency.setValueAtTime(options.frequency || 2_400, now);
    if (options.to) filter.frequency.exponentialRampToValueAtTime(Math.max(40, options.to), now + duration);
    filter.Q.value = options.q || 0.8;
    const attack = Math.min(options.attack || 0.003, duration * 0.45);
    const volume = options.volume || 0.08;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, options.pan || 0));
      gain.connect(pan);
      route(pan, options.wet || 0);
    } else {
      route(gain, options.wet || 0);
    }
    source.start(now);
  }

  function chord(notes, duration, options = {}) {
    notes.forEach((note, index) => {
      tone(note, duration + index * (options.spreadDuration || 0), {
        ...options,
        delay: (options.delay || 0) + index * (options.strum || 0),
        volume: (options.volume || 0.07) / Math.max(1, Math.sqrt(notes.length)),
        pan: options.pan === undefined ? (index - (notes.length - 1) / 2) * 0.16 : options.pan,
      });
    });
  }

  function impact(options = {}) {
    const delay = options.delay || 0;
    const power = options.power || 1;
    tone(options.root || 58, 0.27 * power, {
      delay,
      type: "sine",
      to: 31,
      volume: 0.18 * power,
      attack: 0.003,
      cutoff: 900,
    });
    tone((options.root || 58) * 1.9, 0.11 * power, {
      delay,
      type: "triangle",
      to: (options.root || 58) * 0.8,
      volume: 0.08 * power,
      pan: options.pan || 0,
    });
    noise(0.16 * power, {
      delay,
      filter: "lowpass",
      frequency: 700,
      volume: 0.12 * power,
      smooth: 0.42,
      pan: options.pan || 0,
    });
  }

  function foilCrinkle(delay, pan, pitch = 4_800, volume = 0.07) {
    noise(0.075, {
      delay,
      frequency: pitch,
      to: pitch * 0.72,
      q: 2.4,
      smooth: 0.035,
      volume,
      pan,
    });
    noise(0.035, {
      delay: delay + 0.025,
      frequency: pitch * 1.5,
      q: 4,
      smooth: 0.01,
      volume: volume * 0.5,
      pan: -pan,
    });
  }

  function sound(name, amount = 0) {
    if (!enabled) return;
    switch (name) {
      case "start":
        impact({ root: 52, power: 0.65 });
        chord([174.61, 220, 261.63, 349.23], 0.68, {
          delay: 0.04,
          strum: 0.055,
          type: "triangle",
          volume: 0.105,
          wet: 0.22,
          cutoff: 4_800,
        });
        tone(698.46, 0.5, { delay: 0.27, volume: 0.036, wet: 0.42 });
        break;
      case "pack":
        foilCrinkle(0, -0.6, 4_200, 0.09);
        foilCrinkle(0.055, 0.5, 5_500, 0.085);
        foilCrinkle(0.12, -0.2, 3_800, 0.075);
        tone(92, 0.24, { type: "triangle", to: 145, volume: 0.065, cutoff: 1_200 });
        tone(184, 0.16, { delay: 0.08, type: "sine", to: 260, volume: 0.035 });
        break;
      case "tear":
        noise(0.34, {
          frequency: 1_800,
          to: 8_200,
          volume: 0.16,
          smooth: 0.025,
          q: 1.8,
          pan: -0.18,
        });
        noise(0.2, {
          delay: 0.09,
          frequency: 6_800,
          to: 2_200,
          volume: 0.11,
          smooth: 0.055,
          q: 2.2,
          pan: 0.38,
        });
        for (let index = 0; index < 7; index += 1) {
          tone(1_050 + index * 145, 0.035, {
            delay: 0.02 + index * 0.028,
            type: "square",
            volume: 0.022,
            pan: -0.6 + index * 0.2,
            cutoff: 4_500,
          });
        }
        impact({ delay: 0.22, root: 72, power: 0.48 });
        break;
      case "deal":
        noise(0.23, {
          filter: "highpass",
          frequency: 1_100,
          to: 4_400,
          volume: 0.055,
          smooth: 0.3,
          reverse: true,
        });
        for (let index = 0; index < 6; index += 1) {
          noise(0.055, {
            delay: 0.06 + index * 0.055,
            frequency: 1_500 + index * 120,
            q: 1.4,
            smooth: 0.28,
            volume: 0.052,
            pan: -0.7 + index * 0.28,
          });
          tone(162 + index * 12, 0.07, {
            delay: 0.06 + index * 0.055,
            type: "triangle",
            to: 118,
            volume: 0.025,
            pan: -0.7 + index * 0.28,
          });
        }
        break;
      case "signal": {
        const order = Math.max(0, Math.min(17, amount));
        const root = 330 * (2 ** (order / 6));
        tone(root, 0.12 + Math.min(0.14, order * 0.008), {
          type: order > 3 ? "sine" : "triangle",
          to: root * 1.035,
          volume: 0.018 + Math.min(0.035, order * 0.0025),
          wet: Math.min(0.62, 0.12 + order * 0.025),
          pan: (order % 2 ? 1 : -1) * 0.14,
        });
        if (order >= 3) {
          tone(root * 1.5, 0.17, { delay: 0.022, volume: 0.01, wet: 0.28, pan: 0.22 });
        }
        if (order >= 10) {
          tone(root * 0.75, 0.32, { delay: 0.05, volume: 0.012, wet: 0.58, pan: -0.28 });
        }
        break;
      }
      case "reveal": {
        const order = Math.max(0, Math.min(17, amount));
        const root = 196 * (2 ** (order / 7));
        noise(0.065, {
          frequency: Math.min(8_500, 2_200 + order * 320),
          volume: 0.06 + Math.min(0.08, order * 0.007),
          smooth: 0.2,
          q: 1.1,
          pan: -0.15,
        });
        tone(88 + order * 9, 0.15, {
          type: "triangle",
          to: 54,
          volume: 0.07 + Math.min(0.07, order * 0.007),
          cutoff: 1_100,
        });
        chord([root, root * 1.25, root * 1.5], 0.2 + Math.min(0.55, order * 0.045), {
          delay: 0.018,
          strum: 0.018,
          type: order >= 3 ? "sine" : "triangle",
          volume: 0.075 + Math.min(0.075, order * 0.006),
          wet: Math.min(0.72, 0.1 + order * 0.035),
          cutoff: 6_500,
        });
        if (order >= 2) {
          tone(root * 2, 0.4 + Math.min(0.6, order * 0.04), {
            delay: 0.06,
            volume: 0.025 + Math.min(0.04, order * 0.003),
            wet: 0.36,
            pan: 0.38,
          });
        }
        if (order >= 12) {
          chord([root * 0.5, root * 0.75, root], 1.1, {
            delay: 0.09,
            strum: 0.08,
            type: "sine",
            volume: 0.028,
            wet: 0.7,
            pan: -0.2,
          });
        }
        break;
      }
      case "legendary": {
        const order = Math.max(4, Math.min(17, amount || 4));
        const intensity = (order - 4) / 13;
        const root = 49 + order * 2.4;
        impact({ root, power: 0.82 + intensity * 0.18 });
        chord([196, 246.94, 293.66, 392].map((frequency) => frequency * (1 + intensity * 0.28)), 0.92 + intensity * 0.5, {
          delay: 0.04,
          strum: 0.065,
          type: "sine",
          volume: 0.115 + intensity * 0.025,
          wet: 0.46 + intensity * 0.2,
          attack: 0.02,
        });
        const sparkleCount = 7 + Math.round(intensity * 5);
        for (let index = 0; index < sparkleCount; index += 1) {
          tone(784 + index * (84 + intensity * 20), 0.48 + intensity * 0.22, {
            delay: 0.12 + index * 0.07,
            volume: 0.014,
            wet: 0.62,
            pan: -0.75 + index * (1.5 / Math.max(1, sparkleCount - 1)),
          });
        }
        break;
      }
      case "misprint":
        tone(311, 0.17, { type: "sawtooth", to: 279, volume: 0.045, pan: -0.35, cutoff: 2_300 });
        tone(466, 0.19, { delay: 0.025, type: "triangle", to: 510, volume: 0.052, pan: 0.35 });
        chord([932, 1_108, 1_397], 0.55, {
          delay: 0.11,
          strum: 0.075,
          volume: 0.052,
          wet: 0.6,
        });
        noise(0.24, { delay: 0.05, frequency: 6_500, q: 4, volume: 0.035, smooth: 0.06 });
        break;
      case "fusion": {
        const level = Math.max(1, Math.min(5, amount));
        const root = 293.66 * (1 + level * 0.035);
        [1, 1.25, 1.5, 2].forEach((ratio, index) => {
          tone(root * ratio, 0.32 + index * 0.07, {
            delay: index * 0.065,
            type: "sine",
            volume: 0.05,
            wet: 0.42,
            pan: -0.45 + index * 0.3,
          });
        });
        break;
      }
      case "packComplete":
        chord([220, 277.18, 329.63], 0.28, {
          strum: 0.035,
          type: "triangle",
          volume: 0.07,
          wet: 0.18,
        });
        noise(0.08, { delay: 0.03, frequency: 1_300, smooth: 0.34, volume: 0.04 });
        break;
      case "purchase":
      case "buy":
        tone(246.94, 0.075, { type: "square", to: 329.63, volume: 0.035, cutoff: 2_200 });
        tone(493.88, 0.12, { delay: 0.045, type: "triangle", volume: 0.045, wet: 0.12 });
        noise(0.06, { delay: 0.018, frequency: 1_800, smooth: 0.35, volume: 0.035 });
        break;
      case "caseBreak":
        foilCrinkle(0, -0.5, 3_400, 0.08);
        foilCrinkle(0.06, 0.5, 4_100, 0.08);
        impact({ delay: 0.12, root: 62, power: 0.72 });
        chord([164.81, 220], 0.25, { delay: 0.16, strum: 0.04, volume: 0.06 });
        break;
      case "switch":
        tone(330, 0.055, { type: "square", to: 392, volume: 0.025, cutoff: 2_600 });
        noise(0.035, { frequency: 2_000, smooth: 0.42, volume: 0.025 });
        break;
      case "deny":
        tone(123.47, 0.14, { type: "square", to: 92.5, volume: 0.042, cutoff: 1_300 });
        tone(116.54, 0.17, { delay: 0.055, type: "sawtooth", to: 82.41, volume: 0.029, cutoff: 1_000 });
        break;
      case "sealedEntry":
        impact({ root: 54, power: 0.65 });
        for (let index = 0; index < 6; index += 1) {
          tone(174.61 + index * 18, 0.09, {
            delay: 0.07 + index * 0.055,
            type: "triangle",
            volume: 0.032,
            pan: -0.7 + index * 0.28,
          });
        }
        chord([220, 293.66], 0.45, { delay: 0.2, volume: 0.055, wet: 0.28 });
        break;
      case "forge":
        impact({ root: 48, power: 0.8 });
        noise(0.35, { frequency: 480, to: 3_800, filter: "bandpass", smooth: 0.25, volume: 0.075 });
        for (let index = 0; index < 4; index += 1) {
          tone(392 * (1 + index * 0.25), 0.36, {
            delay: 0.08 + index * 0.075,
            type: "triangle",
            volume: 0.043,
            wet: 0.38,
            pan: -0.45 + index * 0.3,
          });
        }
        foilCrinkle(0.35, 0, 5_800, 0.07);
        break;
      case "promotion":
        impact({ root: 43.65, power: 0.9 });
        chord([174.61, 220, 261.63, 349.23], 0.9, {
          delay: 0.06,
          strum: 0.08,
          type: "triangle",
          volume: 0.12,
          wet: 0.48,
        });
        chord([349.23, 440, 523.25, 698.46], 0.8, {
          delay: 0.42,
          strum: 0.055,
          volume: 0.075,
          wet: 0.55,
        });
        break;
      case "duelStart":
        impact({ root: 42, power: 1 });
        noise(0.48, {
          frequency: 180,
          to: 2_600,
          filter: "bandpass",
          smooth: 0.35,
          reverse: true,
          volume: 0.1,
          wet: 0.1,
        });
        chord([110, 146.83, 220], 0.58, {
          delay: 0.11,
          strum: 0.025,
          type: "sawtooth",
          volume: 0.075,
          cutoff: 1_600,
          wet: 0.2,
        });
        tone(440, 0.36, { delay: 0.28, type: "triangle", to: 659.25, volume: 0.045, wet: 0.28 });
        break;
      case "duelRound": {
        const round = Math.max(1, Math.min(3, amount));
        const pan = round % 2 ? -0.38 : 0.38;
        impact({ root: 52 + round * 4, power: 0.85, pan });
        noise(0.22, {
          frequency: 1_100 + round * 430,
          to: 5_200,
          smooth: 0.11,
          volume: 0.1,
          pan: -pan,
        });
        tone(196 * (1 + round * 0.12), 0.28, {
          delay: 0.035,
          type: "triangle",
          to: 293.66 * (1 + round * 0.09),
          volume: 0.055,
          wet: 0.2,
          pan,
        });
        for (let index = 0; index < 3; index += 1) {
          noise(0.045, {
            delay: 0.09 + index * 0.055,
            frequency: 2_200 + index * 480,
            q: 1.6,
            smooth: 0.2,
            volume: 0.04,
            pan: -pan + index * 0.2,
          });
        }
        break;
      }
      case "duelWin":
        impact({ root: 45, power: 1 });
        noise(1.25, {
          delay: 0.03,
          filter: "bandpass",
          frequency: 720,
          to: 1_800,
          smooth: 0.78,
          volume: 0.055,
          wet: 0.18,
        });
        chord([174.61, 220, 261.63, 349.23], 0.8, {
          delay: 0.05,
          strum: 0.07,
          type: "triangle",
          volume: 0.13,
          wet: 0.45,
        });
        chord([349.23, 440, 523.25, 698.46], 1.05, {
          delay: 0.38,
          strum: 0.065,
          type: "sine",
          volume: 0.1,
          wet: 0.58,
        });
        for (let index = 0; index < 8; index += 1) {
          tone(880 + index * 73, 0.46, {
            delay: 0.28 + index * 0.06,
            volume: 0.012,
            wet: 0.65,
            pan: -0.8 + index * 0.22,
          });
        }
        break;
      case "duelLoss":
        impact({ root: 47, power: 0.7 });
        chord([146.83, 138.59, 110], 0.62, {
          delay: 0.05,
          strum: 0.1,
          type: "triangle",
          volume: 0.085,
          cutoff: 1_500,
          wet: 0.24,
        });
        tone(82.41, 0.75, { delay: 0.23, type: "sine", to: 55, volume: 0.055, cutoff: 600 });
        break;
      default:
        tone(261.63, 0.08, { volume: 0.035 });
    }
  }

  return {
    ensure,
    sound,
    setEnabled(value) {
      enabled = Boolean(value);
      if (master && context) {
        master.gain.setTargetAtTime(enabled ? 0.38 : 0.0001, context.currentTime, 0.018);
      }
    },
    get enabled() {
      return enabled;
    },
  };
}
