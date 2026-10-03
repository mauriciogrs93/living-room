/** Shared HUD tokens. Positions in CSS read these variables; do not hard-code them. */
export const hudTokens: Record<string, string> = {
  "--hud-button": "44px",
  "--hud-edge": "max(12px, env(safe-area-inset-right))",
  "--hud-edge-bottom": "max(12px, env(safe-area-inset-bottom))",
  "--hud-gap": "10px",
  "--hud-pad": "12px",
  "--hud-radius": "22px",
  "--hud-blur": "16px",
  "--hud-ink": "#3A2A1E",
  "--hud-muted": "#6d5648",
  "--hud-paper": "#F6EEDC",
  "--hud-paper-solid": "#F6EEDC",
  "--hud-live": "#7E9C76",
  "--hud-idle": "#9a9188",
  "--hud-mail": "#C8553D",
  "--hud-tomato": "#C8553D",
  "--hud-honey": "#E3A857",
  "--hud-sage": "#7E9C76",
  "--hud-dusk": "#4F6D8A",
  "--hud-card-w": "340px",
  "--hud-card-max": "min(55dvh, 480px)",
  "--hud-z-whisper": "16",
  "--hud-z-fab": "30",
  "--hud-z-card": "34",
  "--hud-night": "0.62",
  "--hud-whisper-gap": "26px",
};

export const WHISPER_MS = 3000;
export const WHISPER_CAP = 3;
export const LONG_PRESS_MS = 520;
export const ACTIVITY_LIMIT = 10;
