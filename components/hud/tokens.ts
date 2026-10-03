/** Shared HUD tokens. Positions in CSS read these variables; do not hard-code them. */
/**
 * Shared HUD layout tokens. Positions in CSS read these variables; do not hard-code them.
 * Colours are NOT here: they live in app/hud.css (.room-root and .room-root.is-night), because inline colour
 * variables on .room-root used to override the night theme (the night "N here" button stayed light).
 */
export const hudTokens: Record<string, string> = {
  "--hud-button": "44px",
  "--hud-edge": "max(14px, env(safe-area-inset-right))",
  "--hud-edge-bottom": "max(14px, env(safe-area-inset-bottom))",
  "--hud-gap": "10px",
  "--hud-pad": "16px",
  "--hud-radius": "4px",
  "--hud-card-w": "340px",
  "--hud-card-max": "min(62dvh, 520px)",
  "--hud-z-whisper": "16",
  "--hud-z-fab": "30",
  "--hud-z-card": "34",
  "--hud-whisper-gap": "26px",
};

export const WHISPER_MS = 3000;
export const WHISPER_CAP = 3;
export const LONG_PRESS_MS = 520;
export const ACTIVITY_LIMIT = 10;
