/*
 * <pixel-field> — a grid of pixels whose seams lift under the cursor.
 *
 * One full-screen fragment shader does all of it: no framebuffers, no feedback
 * passes, no state carried between frames. Every pixel is a function of the
 * cursor position, so a still cursor costs nothing to draw and an idle field
 * stops drawing altogether.
 *
 * The tile shape is pluggable: see PATTERNS below. A pattern is one GLSL
 * function, `float tileDistance(vec2 gc)`, and optionally a few float uniforms
 * of its own; everything else — the lift, the seam, the highlight — is shared.
 *
 *   • Every pixel is one flat colour. Nothing varies from cell to cell, and
 *     nothing about a pixel changes on hover — the accent cannot land on a tile,
 *     because the mask it is multiplied by is zero there.
 *   • The cursor magnifies the grid around it by sampling a smaller slice of it,
 *     so the pixels there spread apart and the field reads as raised.
 *   • The seams between those pixels take the accent colour and fade out with
 *     distance. That is the whole of the highlight.
 *
 * Dark and light pages are mirror images: near-black tiles under a dark seam on
 * a dark page, paper tiles under a light seam on a light one. Both come from CSS
 * custom properties, so they follow the theme tokens and the theme switch. The
 * highlight is mixed in rather than added, so one number reads correctly on
 * either ground and a light page cannot wash out.
 *
 * Like the solver it replaced, it refuses to start for `prefers-reduced-motion`
 * or a browser without WebGL2, and pauses when scrolled out of view.
 */

import type { PixelPattern } from "../config";

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/*
 * The frame, in two halves with the pattern wedged between them:
 *
 *   · `dome` — a disc under the cursor, 1 at its centre and 0 at its rim. Left
 *              un-squared, so the drop from one to the other stays flat and
 *              soft rather than falling away in the middle.
 *   · `k`    — samples a smaller slice of the grid as the dome rises, which
 *              magnifies the tiles there. That, and only that, is what makes
 *              them read as raised.
 *   · `body` — the tile: 1 inside the shape, 0 out in the seam.
 *   · the last line, where the seam takes the accent by `dome * (1 - body)`.
 *              Because `body` is 1 across a whole tile, the tint is exactly
 *              zero there: the tiles themselves never light up.
 *
 * GLOW caps that tint. The seams approach the accent; they never arrive.
 */
const SHADER_HEAD = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;        // drawing buffer, device px
uniform vec2 uPointer;    // cursor in uv, eased
uniform float uPresence;  // eased pointer strength, 0..1
uniform float uCell;      // tile size, device px
uniform float uGap;       // half the seam, device px
uniform float uRadius;    // reach of the lift, device px
uniform float uZoom;      // magnification at its centre
uniform vec3 uTile;       // every tile is this colour, always
uniform vec3 uSeam;       // what shows between them
uniform vec3 uAccent;     // and what the seams take as they lift

const float GLOW = 0.55;`;

const SHADER_MAIN = `void main() {
  vec2 d = vUv * uRes - uPointer * uRes;
  float r = length(d);
  float t = clamp(r / max(uRadius, 1.0), 0.0, 1.0);

  float dome = uPresence * (1.0 - smoothstep(0.0, 1.0, t));
  float k = 1.0 - uZoom * dome;
  vec2 sp = uPointer * uRes + d * k;

  // Roughly one device px, in cell units; a magnified tile needs less.
  vec2 gc = sp / uCell;
  float seam = tileDistance(gc);
  float gapFrac = uGap / uCell;
  float aa = 1.25 * k / uCell;
  float body = smoothstep(gapFrac, gapFrac + aa, seam);

  vec3 col = mix(uSeam, uTile, body);
  col = mix(col, uAccent, dome * (1.0 - body) * GLOW);

  fragColor = vec4(col, 1.0);
}`;

/**
 * One tile shape.
 *
 * `glsl` must define `float tileDistance(vec2 gc)`: the distance from a point,
 * in cell units, to the edge of the tile that contains it — 0 on the edge and
 * growing inwards. It has to be a true distance (normalised), or the seam width
 * and its anti-aliasing change with the slant of the edge. `uniforms` are this
 * pattern's own float uniforms; they are declared from their names and fed every
 * frame, so a pattern that wants to move can just write to them.
 *
 * To add a shape: add its name to `PixelPattern` in src/config.ts and a function
 * here. Nothing else changes.
 */
interface PatternDef {
  glsl: string;
  uniforms?: Record<string, number>;
}

const PATTERNS: Record<PixelPattern, PatternDef> = {
  /*
   * A honeycomb. Hexagons tile the plane with no gaps at all, so the only seam
   * is the same 1px erosion every other pattern gets — they leave the least
   * ink on the ground of the three shapes, which is also what a honeycomb is
   * for.
   *
   * Centres sit on a*(1, 0) + b*(0.5, sqrt3/2), which makes the rectangular
   * period (1, sqrt3). Taking whichever of the two candidates in that period is
   * nearer gives the local coordinates of the hexagon you are standing in. Its
   * inradius is 0.5, and `max` of two normalised half-planes is the distance to
   * the nearest edge, so `0.5 - that` is the distance inwards — 0 on the edge
   * and 0.5 at the centre, exactly the contract square and triangle keep.
   *
   * Transposing the axes lays the same lattice on its side: flat-topped instead
   * of pointy-topped. `uCell` is the width across flats either way, so a hexagon
   * is √3 times that wide when flat-topped and rows sit one cell apart.
   */
  hexagon: {
    glsl: `float tileDistance(vec2 gc) {
  vec2 g = vec2(gc.y, gc.x);
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(g, r) - h;
  vec2 b = mod(g - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(gv);
  return 0.5 - max(q.x, dot(q, vec2(0.5, 0.8660254)));
}`,
  },

  square: {
    glsl: `float tileDistance(vec2 gc) {
  vec2 gf = fract(gc);
  return min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
}`,
  },

  /*
   * Up and down triangles packed so they interlock and fill the cell, leaving
   * only the seam between them. Rows are offset by half a cell, so the triangle
   * standing on a cell's base meets the one hanging into it from the row above
   * along their slanted sides.
   *
   * Inside a cell the two candidate triangles partition it: `up` is positive
   * below the "V" through the base corners (`1 - 2|gf.x - 0.5| - gf.y`, over
   * sqrt(5) like every other distance here) and `down` above it, so exactly one
   * of them is positive and the larger is the distance to the tile you are in.
   */
  triangle: {
    glsl: `float tileDistance(vec2 gc) {
  float row = floor(gc.y);
  vec2 gf = vec2(fract(gc.x - 0.5 * mod(row, 2.0)), fract(gc.y));
  float u = abs(gf.x - 0.5);
  float up = min(gf.y, (1.0 - 2.0 * u - gf.y) * 0.44721360);
  float down = min(1.0 - gf.y, (2.0 * u + gf.y - 1.0) * 0.44721360);
  return max(up, down);
}`,
  },
};

const DEFAULT_PATTERN: PixelPattern = "triangle";

/** Head, the pattern's uniforms and shape, then main — in that order. */
function fragmentSource(pattern: PatternDef): string {
  const params = Object.keys(pattern.uniforms ?? {})
    .map((name) => `uniform float ${name};`)
    .join("\n");
  return [SHADER_HEAD, params, pattern.glsl, SHADER_MAIN]
    .filter(Boolean)
    .join("\n\n");
}

type Rgb = [number, number, number];

function parseCssColor(value: string, fallback: Rgb): Rgb {
  const match = value.match(/-?[\d.]+(e-?\d+)?/g);
  if (!match || match.length < 3) return fallback;
  const [r, g, b] = match.slice(0, 3).map(Number);
  // getComputedStyle returns rgb() in 0–255 for every browser we target.
  return [r / 255, g / 255, b / 255];
}

/*
 * The autonomous drift, as a slow figure of eight.
 *
 * It is anchored wherever the cursor left and its phase starts at zero there,
 * so the lift carries on from that exact point instead of gliding back to a
 * fixed track. From there the centre eases home to the middle of the canvas and
 * the sweep opens up with it: the amplitude is whatever fits between the centre
 * and the nearest edge, capped at the full size. Leave at a corner and the field
 * circles tightly until it has drifted back in; leave in the middle and it is
 * the same figure of eight it always was.
 */
const DRIFT_SWEEP = { x: 0.3, y: 0.24 };
const DRIFT_RATE = { x: 0.13, y: 0.19 };
/** Seconds for the drift's centre to ease back to the middle of the canvas. */
const DRIFT_RECENTRE = 5;
/** Slack kept between the sweep and the edge, so the lift never leaves. */
const DRIFT_EDGE = 0.85;

function driftPoint(
  time: number,
  anchorX: number,
  anchorY: number,
  start: number,
): [number, number] {
  // 0 the moment the cursor leaves, approaching 1 as the centre heads home.
  const home = 1 - Math.exp(-Math.max(0, time - start) / DRIFT_RECENTRE);
  const centreX = anchorX + (0.5 - anchorX) * home;
  const centreY = anchorY + (0.5 - anchorY) * home;
  const sweepX = Math.min(DRIFT_SWEEP.x, DRIFT_EDGE * Math.min(centreX, 1 - centreX));
  const sweepY = Math.min(DRIFT_SWEEP.y, DRIFT_EDGE * Math.min(centreY, 1 - centreY));
  const away = time - start;
  return [
    centreX + sweepX * Math.sin(away * DRIFT_RATE.x),
    centreY + sweepY * Math.sin(away * DRIFT_RATE.y),
  ];
}

/** Lid height of the autonomous drift, as a fraction of a full hover. */
const AMBIENT_PRESENCE = 0.5;
/** Seconds for the eased pointer to close most of the gap to its target. */
const FOLLOW = 0.16;

class PixelField extends HTMLElement {
  private frameHandle = 0;
  private startHandle = 0;
  private idle = false;
  private booted = false;
  private running = false;
  private observers: { disconnect(): void }[] = [];
  private cleanups: (() => void)[] = [];

  connectedCallback(): void {
    if (this.booted) return;
    this.booted = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Creating the context and compiling the shader is a few tens of
    // milliseconds of main-thread work. On the critical path that lands in the
    // middle of LCP, so wait for the page to settle first — the static fallback
    // underneath is already painted.
    const idle: typeof window.requestIdleCallback | undefined =
      window.requestIdleCallback;

    if (idle) {
      this.idle = true;
      this.startHandle = idle(() => this.boot(), { timeout: 1500 });
    } else {
      this.startHandle = window.setTimeout(() => this.boot(), 250);
    }
  }

  private boot(): void {
    if (!this.isConnected) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });

    // No context: leave the element empty so the static fallback shows through.
    if (!gl) return;

    this.appendChild(canvas);
    this.setAttribute("data-field-active", "");

    // ---- palette -------------------------------------------------------
    // A hidden probe lets the browser resolve light-dark() for us, which is
    // what turns the theme tokens into real colours the shader can use.
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
    this.appendChild(probe);

    const readColor = (property: string, fallback: Rgb): Rgb => {
      probe.style.color = "";
      probe.style.color = `var(${property})`;
      return parseCssColor(getComputedStyle(probe).color, fallback);
    };

    // Dark-page values; readPalette replaces them before the first frame.
    let tile: Rgb = [0.06, 0.07, 0.08];
    let seam: Rgb = [0.2, 0.2, 0.2];
    let accent: Rgb = [0.78, 0.35, 0.32];

    const readPalette = () => {
      tile = readColor("--field-tile", tile);
      seam = readColor("--field-seam", seam);
      accent = readColor("--field-accent", accent);
    };
    readPalette();

    const themeObserver = new MutationObserver(readPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    this.observers.push(themeObserver);

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", readPalette);
    this.cleanups.push(() => scheme.removeEventListener("change", readPalette));

    // ---- gl plumbing ---------------------------------------------------
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const compile = (source: string, type: number): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    // Which tile shape to draw. An unknown name falls back rather than failing
    // to compile, so a stale attribute can never blank the field.
    const pattern =
      (PATTERNS as Record<string, PatternDef | undefined>)[
        this.dataset.pattern ?? DEFAULT_PATTERN
      ] ?? PATTERNS[DEFAULT_PATTERN];

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(VERTEX, gl.VERTEX_SHADER));
    gl.attachShader(program, compile(fragmentSource(pattern), gl.FRAGMENT_SHADER));
    gl.linkProgram(program);

    const position = gl.getAttribLocation(program, "aPos");
    const u = {
      res: gl.getUniformLocation(program, "uRes"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      presence: gl.getUniformLocation(program, "uPresence"),
      cell: gl.getUniformLocation(program, "uCell"),
      gap: gl.getUniformLocation(program, "uGap"),
      radius: gl.getUniformLocation(program, "uRadius"),
      zoom: gl.getUniformLocation(program, "uZoom"),
      tile: gl.getUniformLocation(program, "uTile"),
      seam: gl.getUniformLocation(program, "uSeam"),
      accent: gl.getUniformLocation(program, "uAccent"),
    };

    // The pattern's own uniforms, looked up once and fed from its descriptor on
    // every frame — so a pattern can animate them by writing to them.
    const patternUniforms = Object.keys(pattern.uniforms ?? {}).map((name) => ({
      name,
      location: gl.getUniformLocation(program, name),
    }));

    // ---- setup ---------------------------------------------------------
    const cellCss = Number(this.dataset.cell ?? "28") || 28;
    const zoom = Number(this.dataset.zoom ?? "0.12") || 0.12;
    const radiusCss = Number(this.dataset.radius ?? "260") || 260;
    const auto = this.dataset.auto !== "0";
    const gapCss = Number(this.dataset.gap ?? "1") || 1;

    // Eased cursor state. The pointer lags a little, which reads as weight.
    let presence = 0;
    let posX = 0.5;
    let posY = 0.5;
    let hasPointer = false;
    let targetX = 0.5;
    let targetY = 0.5;
    // Where the drift is anchored, and when. The middle of the canvas until the
    // cursor leaves for the first time.
    let anchorX = 0.5;
    let anchorY = 0.5;
    let anchorTime = 0;

    // ---- input ---------------------------------------------------------
    // Coarse pointers get the ambient drift only; there is no hover to track.
    if (window.matchMedia("(pointer: fine)").matches) {
      const onPointerMove = (event: PointerEvent) => {
        const rect = this.getBoundingClientRect();
        targetX = (event.clientX - rect.left) / rect.width;
        targetY = 1 - (event.clientY - rect.top) / rect.height;
        hasPointer = true;
        this.start();
      };
      const onPointerLeave = () => {
        hasPointer = false;
        // Carry on from where the cursor left, rather than from wherever the
        // drift's track happened to be at that moment.
        anchorX = targetX;
        anchorY = targetY;
        anchorTime = elapsed;
      };

      this.addEventListener("pointermove", onPointerMove);
      this.addEventListener("pointerleave", onPointerLeave);
      this.cleanups.push(() => {
        this.removeEventListener("pointermove", onPointerMove);
        this.removeEventListener("pointerleave", onPointerLeave);
      });
    }

    // ---- frame loop ----------------------------------------------------
    let visible = true;
    const visibility = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) this.start();
    });
    visibility.observe(this);
    this.observers.push(visibility);

    // A resize changes the drawing buffer; pick the loop back up if it had
    // stopped while the field was off-screen or hidden behind a collapsed box.
    const resizeObserver = new ResizeObserver(() => this.start());
    resizeObserver.observe(this);
    this.observers.push(resizeObserver);

    let width = 0;
    let height = 0;
    let dpr = 1;
    // Whether the last `resize()` reallocated the drawing buffer. Resizing the
    // canvas clears it, so that frame has to be drawn whatever the throttle
    // would otherwise say.
    let resized = false;

    const resize = (): boolean => {
      const rect = this.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;

      // Capping the pixel ratio is the single biggest win on phones: at 3× a
      // full-bleed hero is four million fragments for a grid nobody measures.
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const nextWidth = Math.round(rect.width * dpr);
      const nextHeight = Math.round(rect.height * dpr);
      resized = canvas.width !== nextWidth || canvas.height !== nextHeight;
      if (resized) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        width = nextWidth;
        height = nextHeight;
      }
      return true;
    };

    let elapsed = 0;
    let last = 0;
    let lastDraw = 0;

    const draw = () => {
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      gl.viewport(0, 0, width, height);
      gl.uniform2f(u.res, width, height);
      gl.uniform2f(u.pointer, posX, posY);
      gl.uniform1f(u.presence, presence);
      gl.uniform1f(u.cell, Math.max(4, Math.round(cellCss * dpr)));
      gl.uniform1f(u.gap, Math.max(0.5, gapCss * dpr));
      gl.uniform1f(u.radius, Math.max(24, radiusCss * dpr));
      gl.uniform1f(u.zoom, zoom);
      gl.uniform3f(u.tile, tile[0], tile[1], tile[2]);
      gl.uniform3f(u.seam, seam[0], seam[1], seam[2]);
      gl.uniform3f(u.accent, accent[0], accent[1], accent[2]);
      for (const { name, location } of patternUniforms) {
        gl.uniform1f(location, pattern.uniforms![name]);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const tick = (now: number) => {
      this.frameHandle = 0;

      const rect = this.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        this.running = false;
        return;
      }
      if (!resize()) {
        this.running = false;
        return;
      }

      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      elapsed += dt;

      // Ease toward the target. Exponential rather than linear, so the motion
      // is frame-rate independent.
      const follow = 1 - Math.exp(-dt / FOLLOW);
      const targetPresence = hasPointer ? 1 : auto ? AMBIENT_PRESENCE : 0;

      let goalX = posX;
      let goalY = posY;
      if (hasPointer) {
        goalX = targetX;
        goalY = targetY;
      } else if (auto) {
        const [ax, ay] = driftPoint(elapsed, anchorX, anchorY, anchorTime);
        goalX = ax;
        goalY = ay;
      }

      const nextX = posX + (goalX - posX) * follow;
      const nextY = posY + (goalY - posY) * follow;
      const nextPresence = presence + (targetPresence - presence) * follow;

      const settled =
        Math.abs(nextX - posX) < 1e-4 &&
        Math.abs(nextY - posY) < 1e-4 &&
        Math.abs(nextPresence - presence) < 1e-4 &&
        Math.abs(nextPresence - targetPresence) < 1e-4;

      posX = nextX;
      posY = nextY;
      presence = nextPresence;

      // Keep drawing while there is something to animate; otherwise let the
      // loop die and wait for the next pointer move or scroll back into view.
      const keepGoing = auto || hasPointer || !settled;
      // A frame the pointer is driving is worth every frame; the ambient drift
      // is slow enough that thirty a second is indistinguishable, and it halves
      // the work on a battery. The last frame before the loop stops always runs,
      // so the field never freezes mid-lift. A resize also forces the draw: the
      // buffer was just cleared, and a skipped draw would show as a flash.
      const budget = resized || hasPointer || !keepGoing ? 0 : 33;
      if (now - lastDraw >= budget) {
        lastDraw = now;
        draw();
      }

      if (keepGoing) {
        this.frameHandle = requestAnimationFrame(tick);
      } else {
        this.running = false;
      }
    };

    this.start = () => {
      if (this.running || !visible) return;
      this.running = true;
      last = performance.now();
      this.frameHandle = requestAnimationFrame(tick);
    };

    posX = targetX = 0.5;
    posY = targetY = 0.5;
    this.start();
  }

  /** Overwritten during boot; a no-op until the element has a canvas. */
  private start = (): void => {};

  disconnectedCallback(): void {
    cancelAnimationFrame(this.frameHandle);
    if (this.startHandle) {
      if (this.idle) cancelIdleCallback(this.startHandle);
      else clearTimeout(this.startHandle);
      this.startHandle = 0;
    }
    for (const observer of this.observers) observer.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.observers = [];
    this.cleanups = [];
    this.running = false;
    this.booted = false;
  }
}

if (!customElements.get("pixel-field")) {
  customElements.define("pixel-field", PixelField);
}
