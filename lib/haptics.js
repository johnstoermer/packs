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
  let mounted = false;
  let switchInput = null;
  let timers = [];

  const hasVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  const hasSwitchHaptic = () => {
    if (typeof document === "undefined" || typeof navigator === "undefined") return false;
    if (!(navigator.maxTouchPoints > 0)) return false;
    // Safari 17.4+ reflects the proprietary `switch` attribute as an IDL
    // property on input elements; no other engine does.
    return "switch" in document.createElement("input");
  };

  function supported() {
    if (typeof navigator === "undefined" || !(navigator.maxTouchPoints > 0)) return false;
    return hasVibrate() || hasSwitchHaptic();
  }

  function ensure() {
    if (mounted || typeof document === "undefined" || !document.body) return;
    mounted = true;
    if (!hasSwitchHaptic()) return;
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;";
    switchInput = document.createElement("input");
    switchInput.type = "checkbox";
    switchInput.setAttribute("switch", "");
    switchInput.tabIndex = -1;
    label.appendChild(switchInput);
    document.body.appendChild(label);
  }

  function clearTimers() {
    timers.forEach((timer) => clearTimeout(timer));
    timers = [];
  }

  function flipSwitch() {
    if (!switchInput) return;
    try {
      switchInput.click();
    } catch {
      // A detached or sandbox-restricted switch must never break gameplay.
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
    if (!switchInput) return;
    // iOS: one fixed-strength tick per vibrate segment, keeping the
    // pattern's rhythm. Ticks closer than ~40ms coalesce, so clamp spacing.
    clearTimers();
    let at = 0;
    shape.forEach((ms, index) => {
      if (index % 2 === 0) {
        timers.push(window.setTimeout(flipSwitch, at));
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
