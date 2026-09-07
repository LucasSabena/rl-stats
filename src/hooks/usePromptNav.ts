import { useCallback, useEffect, useRef, useState } from "react";

export interface PromptNavOptions {
  /** Number of selectable options in a horizontal row. */
  count: number;
  onAccept: (index: number) => void;
  onDismiss: () => void;
  disabled?: boolean;
  initialIndex?: number;
  /** Stick deflection (0-1) that counts as a direction. Defaults to 0.55. */
  axisThreshold?: number;
  /** Hold-to-repeat: first repeat after this long. Defaults to 380ms. */
  repeatDelayMs?: number;
  /** Hold-to-repeat: subsequent repeats at this rate. Defaults to 130ms. */
  repeatRateMs?: number;
  /** Gamepad poll interval. Defaults to 50ms. */
  pollMs?: number;
}

interface DirState {
  pressed: boolean;
  nextRepeat: number;
}

function newDirState(): DirState {
  return { pressed: false, nextRepeat: 0 };
}

/**
 * Unified prompt navigation: gamepad + keyboard + mouse, all live at once,
 * last input wins.
 *
 * - Gamepad: D-pad left/right and both sticks (X axis) move; A/X (button 0)
 *   and Start (9) accept; B/O (button 1) dismisses. Directions auto-repeat
 *   while held; buttons fire on the rising edge only. Pads are picked by
 *   recent activity so a second idle controller never hijacks navigation,
 *   and disconnects degrade silently to keyboard/mouse.
 * - Keyboard: arrows move (Up/Down double as Left/Right), Enter accepts,
 *   Escape dismisses. OS key repeat works naturally; Enter/Escape ignore
 *   auto-repeat.
 * - Mouse: the component wires `onMouseEnter -> setIndex(i)` and
 *   `onClick -> accept()` per option — hover and click just work alongside
 *   the other two sources because they share the same index state.
 */
export function usePromptNav({
  count,
  onAccept,
  onDismiss,
  disabled = false,
  initialIndex = 0,
  axisThreshold = 0.55,
  repeatDelayMs = 380,
  repeatRateMs = 130,
  pollMs = 50,
}: PromptNavOptions) {
  const [index, setIndexState] = useState(initialIndex);
  const indexRef = useRef(initialIndex);
  const countRef = useRef(count);
  countRef.current = count;

  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const setIndex = useCallback((i: number) => {
    const n = countRef.current;
    if (n <= 0) return;
    const wrapped = ((i % n) + n) % n;
    indexRef.current = wrapped;
    setIndexState(wrapped);
  }, []);

  const move = useCallback(
    (dir: -1 | 1) => {
      setIndex(indexRef.current + dir);
    },
    [setIndex],
  );

  const accept = useCallback(() => {
    if (!disabledRef.current) onAcceptRef.current(indexRef.current);
  }, []);

  const dismiss = useCallback(() => {
    if (!disabledRef.current) onDismissRef.current();
  }, []);

  // ─── Keyboard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "Enter":
          if (!e.repeat) {
            e.preventDefault();
            accept();
          }
          break;
        case "Escape":
          if (!e.repeat) {
            e.preventDefault();
            dismiss();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, move, accept, dismiss]);

  // ─── Gamepad ───────────────────────────────────────────────────────────
  const padState = useRef({
    activePad: -1,
    left: newDirState(),
    right: newDirState(),
    buttons: new Map<number, boolean>(),
  });

  useEffect(() => {
    if (disabled) {
      padState.current.left = newDirState();
      padState.current.right = newDirState();
      padState.current.buttons.clear();
      return;
    }

    const readPads = (): (Gamepad | null)[] => {
      try {
        if (typeof navigator === "undefined") return [];
        const pads = navigator.getGamepads?.();
        return pads ? Array.from(pads) : [];
      } catch {
        // Gamepad API unavailable (or blocked) — keyboard/mouse carry on.
        return [];
      }
    };

    const isDown = (pad: Gamepad, i: number): boolean =>
      pad.buttons[i]?.pressed ?? false;

    const tick = () => {
      const pads = readPads();
      const connected = pads.filter(
        (p): p is Gamepad => p !== null && !!p.connected,
      );
      if (connected.length === 0) {
        padState.current.activePad = -1;
        return;
      }

      // Active pad = most recently touched, else the previous one if it is
      // still connected, else the first connected pad.
      const st = padState.current;
      let active = connected.find((p) => p.index === st.activePad) ?? null;
      let touched: Gamepad | null = null;
      for (const pad of connected) {
        const anyButton = pad.buttons.some((b) => b.pressed);
        const ax = pad.axes[0] ?? 0;
        if (anyButton || Math.abs(ax) > axisThreshold) {
          touched = pad;
          break;
        }
      }
      if (touched) {
        active = touched;
        st.activePad = touched.index;
      } else if (!active) {
        active = connected[0];
        st.activePad = connected[0].index;
      }
      if (!active) return;

      const now = Date.now();
      const axisX = active.axes[0] ?? 0;
      const wantLeft = isDown(active, 14) || axisX < -axisThreshold;
      const wantRight = isDown(active, 15) || axisX > axisThreshold;

      const step = (dir: -1 | 1, state: DirState, want: boolean) => {
        if (!want) {
          state.pressed = false;
          return;
        }
        if (!state.pressed) {
          state.pressed = true;
          state.nextRepeat = now + repeatDelayMs;
          move(dir);
        } else if (now >= state.nextRepeat) {
          state.nextRepeat = now + repeatRateMs;
          move(dir);
        }
      };
      step(-1, st.left, wantLeft);
      step(1, st.right, wantRight);

      // Buttons fire on the rising edge only — holding A must not save twice.
      const edge = (i: number): boolean => {
        const was = st.buttons.get(i) ?? false;
        const is = isDown(active, i);
        st.buttons.set(i, is);
        return is && !was;
      };
      if (edge(0) || edge(9)) accept();
      else if (edge(1)) dismiss();
    };

    const timer = setInterval(tick, pollMs);
    return () => clearInterval(timer);
  }, [disabled, axisThreshold, repeatDelayMs, repeatRateMs, pollMs, move, accept, dismiss]);

  return { index, setIndex, accept, dismiss };
}
