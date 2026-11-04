# Feature Plan: Phase 8 — Dashboard Recovery, Parser Invariant & Visual Responsiveness Fix

## CONTEXT REFERENCES
- PRD Section: Phase 8 (Dashboard Recovery & Visual Fix)
- Problem: User reported frozen UI, black canvas, and outdated styling due to a SyntaxError in `app.js` and immutable browser cache headers.
- User Decision: 1A (Pure dev `no-cache` + version bump), 2A (In-app error banner), 3A (Immediate static canvas baseline render).

## New Files to Create
- `tests/validate_frontend_syntax.py` — Automated JavaScript block/parenthesis balance & syntax validator.

## Files to Modify
- `src/dashboard/js/app.js` — Remove extra closing brace on line 336; wire up global error banner listener.
- `src/controller/telemetry_handler.py` — Replace `immutable` caching with `Cache-Control: no-cache, must-revalidate` for dev dashboard assets.
- `src/dashboard/index.html` — Add `#appErrorBanner` element and bump script/link query strings to `?v=2.1.0`.
- `src/dashboard/styles.css` — Style `#appErrorBanner` as a floating Apple-styled warning pill.
- `src/dashboard/js/topology_canvas.js` — Call `this.updateNodePositions()`, `this.cacheGradients()`, and `this.renderStatic()` immediately on initialization.

## STEP-BY-STEP TASKS

### Task 1: Fix `app.js` Syntax Error
- Remove the orphaned closing brace `}` on line 336 in `src/dashboard/js/app.js` that prematurely ended `class DashboardApp`.
- **VALIDATE**: `python3 -c "with open('src/dashboard/js/app.js') as f: c=f.read(); assert c.count('{') == c.count('}')"`

### Task 2: Create Automated Frontend Syntax Validator Test
- Create `tests/validate_frontend_syntax.py` to assert that all files in `src/dashboard/js/*.js` have 0 brace/paren/bracket balance diff and no unclosed string literals.
- Integrate into the test suite.
- **VALIDATE**: `python3 tests/validate_frontend_syntax.py`

### Task 3: Local Dev Cache Invariant in `telemetry_handler.py`
- Modify `DashboardHttpHandler.do_GET` in `src/controller/telemetry_handler.py` so that all static dashboard assets are served with `Cache-Control: no-cache, must-revalidate` alongside `ETag`. Remove `immutable` and `max-age=31536000`.
- **VALIDATE**: `curl -s -i http://localhost:8080/styles.css?v=2.1.0 | grep -i "cache-control"`

### Task 4: In-App Error Banner in `index.html` and `styles.css`
- Add `<div id="appErrorBanner" class="app-error-banner hidden" role="alert"></div>` right below the navbar in `src/dashboard/index.html`.
- Style it in `src/dashboard/styles.css` with smoked glass red material, floating pill layout, and close button.
- Hook `window.addEventListener('error')` and `window.addEventListener('unhandledrejection')` in `src/dashboard/js/app.js` to surface any runtime error immediately.
- **VALIDATE**: Check DOM element existence and CSS definition.

### Task 5: Instant Static Canvas Baseline Paint
- In `TopologyCanvas` constructor (`src/dashboard/js/topology_canvas.js`), execute `this.updateNodePositions()`, `this.cacheGradients()`, and `this.renderStatic()` immediately so the topology switches, links, port badges, and hosts render as soon as the DOM is ready.
- **VALIDATE**: Verify static canvas renders without waiting for telemetry packets.

### Task 6: Bump Asset Versions to `?v=2.1.0`
- In `src/dashboard/index.html`, bump all `<link>` and `<script>` version tags from `?v=2.0.0` to `?v=2.1.0` to force immediate browser cache invalidation.
- **VALIDATE**: `curl -s http://localhost:8080/ | grep "v=2.1.0"`

## ACCEPTANCE CRITERIA
- [ ] No syntax errors in any JavaScript file (`tests/validate_frontend_syntax.py` passes).
- [ ] `http://localhost:8080/` loads with `v=2.1.0` query parameters and `Cache-Control: no-cache, must-revalidate`.
- [ ] Topology canvas immediately displays network topology (switches, links, servers, clients) on load without blank screens.
- [ ] Real-time telemetry, flow table, latency waveforms, and live packet streams animate cleanly at 60 fps.
- [ ] In-app error banner is present and ready to catch any unhandled exception.
- [ ] All 16+ unit and integration tests pass.
