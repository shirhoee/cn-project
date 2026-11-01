# AGENTS.md (Global Rules)

**Goal:** Establish the absolute invariant rules, core architecture, and operational constraints for the entire codebase. This file is "Always On" and loaded into every context window.

---

## 1. Core Engineering Philosophy
* **Simplicity & Readability:** Write modular, declarative code. Avoid clever but obscure one-liners. Prioritize developer experience (DX) and long-term maintainability.
* **System Evolution Mindset:** When encountering a bug or hallucination, do not just fix the code. We must fix the *AI Layer*. Update the relevant `.agents/rules/` file so the mistake is never repeated.
* **Progressive Disclosure:** Context is our most precious resource. Do not load unnecessary files. Rely on domain-specific rules only when actively working in that domain.

## 2. Tech Stack & Architecture
* **Network & Controller:** Mininet, OpenFlow 1.3, OS-Ken 3.1.1 (Python eventlet)
* **Backend / Telemetry:** Python stdlib (`ThreadingHTTPServer`, `urllib`, `json`, SSE via `/api/stream`)
* **Frontend:** Vanilla HTML5, Modern CSS (custom properties, CSS Grid/Flexbox), Canvas 2D, EventSource (SSE)
* **Testing:** Python `unittest` (`tests/test_sanity.py`, `tests/test_dashboard_api.py`)
* **Constraints:** Zero third-party frontend dependencies, zero external CDNs, deterministic layout bounding.

## 3. Universal Code Patterns
* **Strict Validation:** All system boundaries (API routes, form submissions, database queries) MUST use strict validation schemas. Never trust unverified client input.
* **Error Handling:** Fail gracefully. Catch specific exceptions. Return standardized error payloads (e.g., `{"status": "error", "error": "Detailed message"}`).
* **Environment Variables:** Never hardcode secrets. Always reference `process.env` or `os.environ`. Keep `.env.example` up to date.

## 4. On-Demand Context Triggers
* **Frontend/UI:** When modifying UI components, styling, canvas rendering, or client-side telemetry handling, read `.agents/rules/frontend.md`.
* **Backend/API:** When modifying API routes, controller logic, or server-side telemetry streaming, read `.agents/rules/backend.md`.

## 5. Regression Testing Protocol
* Before completing any execution phase, you MUST verify that previous features remain intact.
* Global test suite (`python3 -m unittest discover tests -v`) must be executed successfully before handing control back to the user.
