import * as THREE from "three";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texSize() {
  if (typeof navigator === "undefined") return 384;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory ?? 8) <= 4 ? 256 : 512;
}

/** Flat color used until the detailed maps finish. */
export function solidColor(hex: string) {
  return canvasTexture(4, 4, (ctx) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 4, 4);
  });
}

function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts?: { color?: boolean; repeat?: [number, number] },
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = opts?.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (opts?.repeat) texture.repeat.set(opts.repeat[0], opts.repeat[1]);
  return texture;
}

export function makePlankFloor() {
  return canvasTexture(texSize(), texSize(), (ctx, w, h) => {
    const rand = rng(11);
    ctx.fillStyle = "#8a5a36";
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const plankH = h / rows;
    for (let y = 0; y < rows; y += 1) {
      const shade = 148 + Math.floor(rand() * 42);
      ctx.fillStyle = `rgb(${shade + 36}, ${Math.floor(shade * 0.62)}, ${Math.floor(shade * 0.32)})`;
      ctx.fillRect(0, y * plankH + 2, w, plankH - 4);
      let x = (y % 2) * 80;
      while (x < w) {
        const len = 140 + rand() * 180;
        ctx.strokeStyle = `rgba(62, 32, 14, ${0.28 + rand() * 0.25})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y * plankH + 3, Math.min(len, w - x) - 3, plankH - 7);
        for (let g = 0; g < 5; g += 1) {
          ctx.strokeStyle = `rgba(92, 52, 24, ${0.15 + rand() * 0.25})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          const gy = y * plankH + 10 + rand() * (plankH - 20);
          ctx.moveTo(x + 8, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + rand() * 6 - 3, x + len * 0.6, gy + rand() * 6 - 3, x + len - 8, gy + rand() * 4 - 2);
          ctx.stroke();
        }
        if (rand() > 0.55) {
          ctx.fillStyle = `rgba(70, 38, 16, ${0.18 + rand() * 0.2})`;
          ctx.beginPath();
          ctx.ellipse(x + 30 + rand() * 60, y * plankH + plankH * 0.5, 8 + rand() * 10, 4 + rand() * 3, rand(), 0, Math.PI * 2);
          ctx.fill();
        }
        x += len;
      }
    }
  }, { repeat: [2, 2] });
}

export function makePlankBump() {
  return canvasTexture(
    texSize(),
    texSize(),
    (ctx, w, h) => {
      const rand = rng(19);
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);
      const rows = 8;
      const plankH = h / rows;
      for (let y = 0; y < rows; y += 1) {
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(0, y * plankH, w, 3);
        let x = (y % 2) * 40;
        while (x < w) {
          const len = 70 + rand() * 90;
          ctx.fillStyle = "#2a2a2a";
          ctx.fillRect(x, y * plankH, 2, plankH);
          x += len;
        }
      }
    },
    { color: false },
  );
}

export function makePlaster(kind: "warm" | "stripe" | "bedroom" = "warm") {
  return canvasTexture(texSize(), texSize(), (ctx, w, h) => {
    const rand = rng(kind === "stripe" ? 3 : kind === "bedroom" ? 5 : 8);
    const base = kind === "bedroom" ? [236, 214, 196] : kind === "stripe" ? [232, 224, 210] : [228, 214, 196];
    ctx.fillStyle = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i += 1) {
      const n = Math.floor(rand() * 28) - 14;
      ctx.fillStyle = `rgba(${120 + n}, ${96 + n}, ${72 + n}, ${0.03 + rand() * 0.05})`;
      ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 3, 1 + rand() * 2);
    }
    if (kind === "stripe") {
      for (let x = 0; x < w; x += 36) {
        ctx.fillStyle = x % 72 === 0 ? "rgba(120, 146, 132, 0.16)" : "rgba(255, 250, 244, 0.18)";
        ctx.fillRect(x, 0, 18, h);
      }
    }
    if (kind === "bedroom") {
      ctx.strokeStyle = "rgba(176, 132, 108, 0.18)";
      ctx.lineWidth = 2;
      for (let y = 40; y < h; y += 48) {
        ctx.beginPath();
        ctx.moveTo(24, y);
        ctx.lineTo(w - 24, y);
        ctx.stroke();
      }
    }
  }, { repeat: [2, 1] });
}

export function makeKitchenTile() {
  return canvasTexture(texSize(), texSize(), (ctx, w, h) => {
    const rand = rng(21);
    ctx.fillStyle = "#cfc4b6";
    ctx.fillRect(0, 0, w, h);
    const cols = 8;
    const rows = 10;
    const gw = w / cols;
    const gh = h / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const shift = y % 2 ? gw / 2 : 0;
        const n = Math.floor(rand() * 16) - 8;
        ctx.fillStyle = `rgb(${236 + n}, ${232 + n}, ${224 + n})`;
        ctx.fillRect(x * gw + shift + 2, y * gh + 2, gw - 4, gh - 4);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(x * gw + shift + 4, y * gh + 4, gw * 0.35, 2);
      }
    }
  }, { repeat: [2, 2] });
}

export function makeFabric(a: [number, number, number], b: [number, number, number]) {
  return canvasTexture(texSize(), texSize(), (ctx, w, h) => {
    const rand = rng(a[0] + b[2]);
    ctx.fillStyle = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = `rgba(${b[0]}, ${b[1]}, ${b[2]}, ${y % 8 === 0 ? 0.35 : 0.12})`;
      ctx.fillRect(0, y, w, 2);
    }
    for (let x = 0; x < w; x += 4) {
      ctx.fillStyle = `rgba(255,255,255,${x % 8 === 0 ? 0.08 : 0.03})`;
      ctx.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < 80; i += 1) {
      ctx.fillStyle = `rgba(40, 24, 16, ${0.04 + rand() * 0.05})`;
      ctx.fillRect(rand() * w, rand() * h, 6 + rand() * 14, 2);
    }
  }, { repeat: [2, 2] });
}

export function makeWoodTexture() {
  return canvasTexture(texSize(), texSize(), (ctx, w, h) => {
    const rand = rng(7);
    ctx.fillStyle = "#7a4e2e";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) {
      const n = Math.sin(y * 0.08) * 10 + rand() * 8;
      ctx.fillStyle = `rgba(${120 + n}, ${72 + n * 0.4}, ${36}, 0.35)`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let k = 0; k < 14; k += 1) {
      ctx.strokeStyle = `rgba(48, 24, 10, ${0.15 + rand() * 0.2})`;
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      const y = rand() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 12, w * 0.6, y - 10, w, y + 4);
      ctx.stroke();
    }
  }, { repeat: [2, 2] });
}

export function makeTileTexture() {
  return makePlankFloor();
}

export function makeRugTexture(tone: "rust" | "sage" | "gold" = "rust") {
  const palette =
    tone === "sage"
      ? { bg: "#3f6154", line: "#e7d7c3", motif: "#d7e4da" }
      : tone === "gold"
        ? { bg: "#8d6232", line: "#f3e6cf", motif: "#e7c27a" }
        : { bg: "#7c3d36", line: "#f4e7d6", motif: "#e7cbb0" };
  return canvasTexture(texSize(), texSize(), (ctx, w, h) => {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 14;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    for (let y = 78; y < h - 70; y += 46) {
      for (let x = 78; x < w - 70; x += 46) {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = palette.motif;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(8, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-8, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
  });
}

export function makeEnamel() {
  return canvasTexture(Math.round(texSize() * 0.5), texSize(), (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#d5ddd8");
    g.addColorStop(0.18, "#f7fbf8");
    g.addColorStop(0.5, "#e7eeea");
    g.addColorStop(1, "#c5d0cb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(18, 0, 16, h);
  });
}

export function makeSkyTexture() {
  return canvasTexture(texSize(), Math.round(texSize() * 0.625), (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#f2c08a");
    sky.addColorStop(0.42, "#f6d7b4");
    sky.addColorStop(1, "#8eabbf");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(86, 104, 122, 0.55)";
    for (let i = 0; i < 7; i += 1) {
      const bh = 30 + (i % 3) * 18;
      ctx.fillRect(40 + i * 62, h - bh - 8, 40, bh);
    }
    ctx.fillStyle = "rgba(255,244,220,0.9)";
    ctx.beginPath();
    ctx.arc(400, 64, 26, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function makeArtTexture() {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = "#f4ecdf";
    ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, "#e7b07a");
    sky.addColorStop(1, "#f6e2c4");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.62);
    ctx.fillStyle = "#355e4c";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(70, h * 0.4);
    ctx.lineTo(140, h * 0.66);
    ctx.lineTo(0, h);
    ctx.fill();
    ctx.fillStyle = "#2a4a3c";
    ctx.beginPath();
    ctx.moveTo(90, h);
    ctx.lineTo(160, h * 0.46);
    ctx.lineTo(w, h * 0.7);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.fillStyle = "#f2d7a2";
    ctx.beginPath();
    ctx.arc(188, 78, 28, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function makeScreenTexture(power: boolean, name: string, color: string, accent: string, tape = "") {
  const texture = canvasTexture(texSize(), Math.round(texSize() * 0.56), (ctx, w, h) => {
    if (!power) {
      ctx.fillStyle = "#121418";
      ctx.fillRect(0, 0, w, h);
      const glow = ctx.createLinearGradient(0, 0, w, h);
      glow.addColorStop(0, "rgba(255,255,255,0.06)");
      glow.addColorStop(0.5, "rgba(255,255,255,0)");
      glow.addColorStop(1, "rgba(255,255,255,0.05)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, color);
    wash.addColorStop(1, "#1c1814");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    if (tape) {
      ctx.fillStyle = "#102033";
      ctx.fillRect(0, 0, w, 36);
      ctx.fillStyle = "#f6f1e8";
      ctx.font = "600 18px ui-sans-serif, sans-serif";
      ctx.fillText(tape.slice(0, 64), 12, 24);
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.38, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(36, 40, 168, 16);
    ctx.fillRect(36, 68, 96, 8);
    ctx.fillStyle = "rgba(16,12,10,0.72)";
    ctx.fillRect(0, h - 62, w, 62);
    ctx.fillStyle = "#fffaf3";
    ctx.font = "600 34px Georgia, serif";
    ctx.fillText(name, 28, h - 22);
  });
  return texture;
}

export function makeBrick() {
  return canvasTexture(texSize(), Math.round(texSize() * 0.5), (ctx, w, h) => {
    const rand = rng(31);
    ctx.fillStyle = "#8d5a48";
    ctx.fillRect(0, 0, w, h);
    const rows = 6;
    const rh = h / rows;
    const bw = w / 8;
    for (let y = 0; y < rows; y += 1) {
      const shift = y % 2 ? bw / 2 : 0;
      for (let x = -1; x < 9; x += 1) {
        const n = Math.floor(rand() * 28) - 10;
        ctx.fillStyle = `rgb(${168 + n}, ${86 + Math.floor(n * 0.4)}, ${64 + Math.floor(n * 0.2)})`;
        ctx.fillRect(x * bw + shift + 3, y * rh + 3, bw - 6, rh - 6);
      }
    }
  }, { repeat: [2, 2] });
}
