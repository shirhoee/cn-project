# Phase 10: Interactive Static vs. Dynamic Comparison, Member Spotlight & UI Elevation Plan

## 1. Executive Summary & Design Decisions

Based on user feedback, the 5 review screenshots, and our interactive design alignment, Phase 10 resolves all visual and structural layout defects while introducing two standout presentation features:
1. **Prominent Frosted Glass Team & Problem Statement Banner:** Positioned below the titlebar, featuring Team 17 members (Shashidhar, Shreyansh Raj, Shaun Joe Soares) with interactive hover popups and **Canvas Spotlight Glow** that dynamically highlights their individual architectural contributions.
2. **Top-Level View Switcher ("Live Operations" vs. "Static vs. Dynamic Deep-Dive"):** An animated before/after split slider comparing Static routing failure mechanics (packet drops, 2000ms timeouts) against Dynamic SDN recovery (<2.5ms failover, 100% uptime).
3. **Right-Column Decongestion (Segmented Deck Switcher):** Replaces the vertical stack with a smooth tabbed deck (`Metrics & Health`, `OpenFlow Rules`, `Event Stream`) to give each tool full height and breathing room.
4. **Visual Bug Fixes:** Adaptive unit formatting for Throughput (`Mbps`/`kbps`), crisp integer-snapped hi-DPI canvas Y-axis rendering, and elimination of dead bottom-left space.

---

## 2. Detailed Technical Breakdown & Architecture

### Feature 1: Prominent Glass Team Dossier & Canvas Spotlight Glow
* **Banner Component (`#teamDossierBanner`):**
  * Positioned immediately below `.navbar`.
  * Smoked glass pill layout displaying project title, Team 17 badge, and three member interactive avatar chips.
  * Clickable "Problem Statement" pill revealing an inline glass accordion explaining the core problem and solution.
* **Member Hover Tooltip Popup:**
  * Rich macOS-style popover card displaying:
    * Member Name & Academic Role.
    * Specific Codebase Ownership ([`server.py`](file:///mnt/e/cn%20project/src/app/server.py), [`dynamic_router.py`](file:///mnt/e/cn%20project/src/controller/dynamic_router.py), [`topology.py`](file:///mnt/e/cn%20project/src/network/topology.py), etc.).
    * Key Accomplishments & Deliverables.
* **Canvas Spotlight Glow Interaction:**
  * When hovering over **Shashidhar**: Canvas dims switches/links to 25% opacity; illuminates `server1`, `server2`, `client1`, `client2`, `client3` with a pulsating cyan/emerald neon halo; displays socket conns and port 9000 badges.
  * When hovering over **Shreyansh Raj**: Canvas dims hosts/links; illuminates `s1` Core switch and Controller with an amber/blue aura; highlights OpenFlow 1.3 control channel (Port 6653) and REST API (Port 8080).
  * When hovering over **Shaun Joe Soares**: Canvas dims controller/hosts; illuminates physical conduits `s1-s2`, `s1-s3`, and the backup link `s2-s3`, pulsing packet throughput and metrics.

### Feature 2: Static vs. Dynamic Deep-Dive (Interactive Before/After Slider + Dual Animations)
* **Top-Level Navigation Switcher:**
  * Added to `.navbar`: Segmented pill toggle between **`Live Operations`** and **`Static vs Dynamic Deep-Dive`**.
* **Dual Animated Canvas Engine:**
  * **Left Pane (Static Router):**
    * Simulates link failure: `s1-s2` breaks into red severed state.
    * Packets travel from `s3` to `s1`, arrive at severed port, turn red, and dissipate into void with an animated "Packet Dropped (ETIMEDOUT)" indicator.
    * Server 1 overload: Packets keep piling up into an overloaded queue; requests rejected.
  * **Right Pane (Dynamic SDN):**
    * Simulates link failure: `s1-s2` breaks -> PortStatus caught in 0.8ms -> backup link `s2-s3` glows cyan -> packets smoothly curve across backup link with 0% loss.
    * Server 1 overload: REST POST alert -> Core switch rewrites headers to Server 2 (amber comets) -> 0ms downtime.
* **Interactive Drag Slider (`#comparisonSlider`):**
  * Examiner can drag a vertical dividing divider left or right to inspect the contrasting behavior in real-time, accompanied by a quantitative comparison table.

### Feature 3: Right-Column Master Deck Switcher & Decongestion
* **Segmented Deck Controller (`#diagnosticsDeckSwitch`):**
  * **Tab 1: Performance & Health:** Displays Real-Time Socket Performance metrics, Activity Ring gauge, and the RTT Latency Waveform.
  * **Tab 2: OpenFlow Flow Tables:** Displays full-height macOS Console.app table for `s1`, `s2`, `s3` with dynamic rule diff badges and filtering.
  * **Tab 3: Telemetry Event Stream:** Displays live terminal log with filter chips, auto-scroll, and JSON export.
* **Elimination of Congestion:** Each diagnostic view gets dedicated vertical height with balanced 1.25rem padding and no vertical squishing.

### Feature 4: Visual Bug Remediations
1. **Throughput Card Spilling Out:**
   * In `src/dashboard/js/app.js`: Format values >= 10,000 kbps as `(val / 1000).toFixed(2)` with `<small>Mbps</small>`.
   * In `src/dashboard/styles.css`: Reduce `.metric-value strong` to `clamp(1.35rem, 1.9cqi, 1.75rem);`, apply `white-space: nowrap;`, and set `.metric-box` to `min-width: 0`.
2. **Blurry Canvas Y-Axis Text:**
   * In `src/dashboard/js/charts.js`:
     * Round Y-axis coordinates to integer boundaries: `Math.round(y)`.
     * Increase label font size from `9px` to `11px`.
     * Increase font opacity from `0.4` to `0.85` (`rgba(255, 255, 255, 0.85)` or `#98989d`).
     * Use crisp system typography: `500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
     * Ensure canvas CSS `.style.width` and `.style.height` match pixel bounds.
3. **Bottom-Left Unused Space:**
   * Position an interactive "Viva Quick Reference & Architecture Guide" card directly below the topology legend, filling the space with clickable architecture summaries, flow paths, and test instructions.

---

## 3. Verification & Testing Strategy
* **Automated Unit Tests:** Discover existing 16 tests in `tests/test_sanity.py` and `tests/test_dashboard_api.py`.
* **Frontend Syntax Validation:** Run `tests/validate_frontend_syntax.py` on all modified JS files.
* **Visual Verification:** Check responsive layout under DPR 1.0, 1.25, 1.5, and 2.0.
