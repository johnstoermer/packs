// Mobile haptics with two backends behind one pattern interface:
//
// - Standard path: the Vibration API (Android Chrome/Firefox/WebViews).
//   Patterns are the usual [vibrate, pause, vibrate, ...] millisecond shape.
// - iOS Safari 17.4+: there is no Vibration API, but flipping a native
//   switch control (<input type="checkbox" switch>) plays the system toggle
//   haptic. We mount one hidden switch and click it — a single fixed tick
//   per flip — and approximate patterns as spaced tick bursts. This is
//   undocumented behavior Apple could remove in any release, so everything
//   feature-detects hard and degrades to silence.
//
// Ticks only fire while the page has had user interaction; every call site
// in the game sits inside tap/click-driven flows, which also satisfies the
// Vibration API's user-activation requirement.
export function createHapticsEngine() {
  let enabled = true;
  let timers = [];

  const hasVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  const isAppleTouch = () => {
    if (typeof navigator === "undefined") return false;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return true;
    // iPadOS masquerades as macOS but reports touch points.
    return /Mac/i.test(navigator.platform || "") && navigator.maxTouchPoints > 1;
  };

  const hasSwitchControl = () => {
    if (typeof document === "undefined") return false;
    return "switch" in document.createElement("input");
  };

  function supported() {
    if (typeof navigator === "undefined" || !(navigator.maxTouchPoints > 0)) return false;
    return hasVibrate() || isAppleTouch() || hasSwitchControl();
  }

  function ensure() {
    // Backends need no persistent setup; kept for call-site symmetry.
  }

  function clearTimers() {
    timers.forEach((timer) => clearTimeout(timer));
    timers = [];
  }

  // iOS Safari 17.4+: toggling a native switch control plays the system
  // haptic. The proven recipe is a fresh hidden label per tick, clicked and
  // discarded immediately — persistent offscreen elements go silent.
  function iosTick() {
    if (typeof document === "undefined" || !document.body) return;
    try {
      const label = document.createElement("label");
      label.ariaHidden = "true";
      label.style.display = "none";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      label.appendChild(input);
      document.body.appendChild(label);
      label.click();
      document.body.removeChild(label);
    } catch {
      // A restricted DOM must never break gameplay.
    }
  }

  // pattern: Vibration API shape — [vibrate, pause, vibrate, ...] in ms.
  function play(pattern) {
    if (!enabled || typeof window === "undefined") return;
    const shape = Array.isArray(pattern) ? pattern : [pattern];
    if (hasVibrate()) {
      try {
        navigator.vibrate(shape);
        return;
      } catch {
        // Fall through to the switch path.
      }
    }
    if (!(isAppleTouch() || hasSwitchControl())) return;
    // One fixed-strength tick per vibrate segment, keeping the pattern's
    // rhythm. The first tick fires synchronously so it stays inside the
    // user gesture's call stack; ticks closer than ~40ms coalesce, so
    // spacing clamps up.
    clearTimers();
    let at = 0;
    shape.forEach((ms, index) => {
      if (index % 2 === 0) {
        if (at === 0) iosTick();
        else timers.push(window.setTimeout(iosTick, at));
      }
      at += Math.max(40, ms);
    });
  }

  const PATTERNS = {
    open: [18],
    reveal: [12],
    rare: [24, 70, 24],
    legendary: [32, 80, 32, 80, 48],
    burst: [45, 70, 20, 70, 20],
    fuse: [16, 60, 16],
  };

  // pulse("reveal", rarityOrder) scales reveals; other kinds map directly.
  function pulse(kind, strength = 0) {
    if (kind === "reveal") {
      if (strength >= 4) return play(PATTERNS.legendary);
      if (strength >= 2) return play(PATTERNS.rare);
      return play(PATTERNS.reveal);
    }
    if (PATTERNS[kind]) play(PATTERNS[kind]);
  }

  function setEnabled(value) {
    const next = !!value;
    if (next === enabled) return;
    enabled = next;
    if (!enabled) {
      clearTimers();
      if (hasVibrate()) {
        try {
          navigator.vibrate(0);
        } catch {
          // Nothing to cancel.
        }
      }
    }
  }

  return { ensure, supported, pulse, setEnabled };
}
