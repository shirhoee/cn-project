---
trigger: model_decision
description: Invariant rules for Vanilla HTML5, CSS Grid, and Canvas 2D telemetry dashboards.
---

## Frontend Architecture & Patterns (SDN Telemetry & Canvas)

### 1. Zero External Dependencies & CDN Invariant
- **Vanilla Only:** Strictly vanilla HTML5, native CSS (custom properties), and ES6+ JavaScript.
- **No CDNs:** No external scripts, styling CDNs, or third-party chart/UI libraries. Use system font fallbacks (`system-ui`, monospace) or locally committed assets.

### 2. Canvas 2D & DPR Sizing Rules (Feedback Loop Prevention)
- **Deterministic Wrappers:** Every `<canvas>` MUST live inside a parent wrapper with deterministic CSS sizing (`position: relative; overflow: hidden; min-width: 0; min-height: 0;`).
- **Decoupled Layout:** Canvas elements MUST be styled with `position: absolute; inset: 0; width: 100% !important; height: 100% !important; display: block;`.
- **No Inline Style Width/Height:** NEVER mutate `canvas.style.width` or `canvas.style.height` in JavaScript. JavaScript is strictly responsible for setting backing pixel buffer dimensions (`canvas.width = Math.round(w * dpr)` and `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`).
- **ResizeObserver Invariant:**
  - Observe the wrapper container (`this.container`), never the canvas element itself.
  - Guard observer callbacks against identical width/height/DPR to eliminate redundant renders.
  - Coalesce and defer buffer resizing via `requestAnimationFrame` (`_resizePending` guard) so layout is never mutated synchronously inside an observer dispatch.

### 3. CSS Grid & Overflow Invariants
- **Column Sizing:** NEVER use bare `1fr` for grid columns holding flexible or canvas content. Always use `minmax(0, Xfr)` to prevent `min-content` blowouts.
- **Child Protection:** Explicitly declare `min-width: 0;` on all grid items, flex containers, and card wrappers.
- **Root Protection:** Always enforce `html, body { overflow-x: hidden; max-width: 100vw; }`.
- **Card-Level Scrolling:** Tables, logs, and telemetry lists must be scoped to their card containers (`overflow: auto`) with explicit word-breaking (`word-break: break-word;`).

### 4. Telemetry Visualization & Outlier Rejection
- **Dynamic Time-Series Ceilings:** Never calculate chart Y-axis ceilings with bare `Math.max()` over raw telemetry data.
- **Outlier Filtering:** Always calculate rolling statistics ($p_{95}$ and rolling median). Clamp the display ceiling to $\max(\text{median} \times 3.5, p_{95}, \text{minCeiling})$ so transient network timeout spikes (e.g. 2000+ ms) do not permanently flatten healthy millisecond waveforms.

### 5. Backend Asset Route Synchronization
- Whenever adding or refactoring a frontend asset (`<script src="...">` or `<link href="...">`), verify that the backend server's static file handler / whitelist explicitly serves that exact path and Content-Type before testing.

### 6. Zero-Dependency Script Syntax & Balance Validation
- In environments without Node.js linters, before completing any frontend task, you MUST run an automated bracket, parentheses, and syntax balance validator (`python3 tests/validate_frontend_syntax.py`) across all modified `.js` files to eliminate fatal top-level `SyntaxError` regressions.
