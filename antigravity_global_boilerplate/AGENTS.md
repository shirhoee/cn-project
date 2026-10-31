# AGENTS.md (Global Rules)

**Goal:** Establish the absolute invariant rules, core architecture, and operational constraints for the entire codebase. This file is "Always On" and loaded into every context window.

---

## 1. Core Engineering Philosophy
* **Simplicity & Readability:** Write modular, declarative code. Avoid clever but obscure one-liners. Prioritize developer experience (DX) and long-term maintainability.
* **System Evolution Mindset:** When encountering a bug or hallucination, do not just fix the code. We must fix the *AI Layer*. Update the relevant `.agents/rules/` file so the mistake is never repeated.
* **Progressive Disclosure:** Context is our most precious resource. Do not load unnecessary files. Rely on domain-specific rules only when actively working in that domain.

## 2. Tech Stack & Architecture
*(Note: To be dynamically populated by the `create_rules` skill after PRD generation)*
* **Frontend:** [e.g., Next.js 15 App Router, React 19]
* **Backend:** [e.g., Server Actions, FastAPI, Node]
* **Database & ORM:** [e.g., Neon Postgres, Drizzle]
* **Styling:** [e.g., Tailwind CSS v4, shadcn/ui]

## 3. Universal Code Patterns
* **Strict Validation:** All system boundaries (API routes, form submissions, database queries) MUST use strict validation schemas (e.g., Zod, Pydantic). Never trust client input.
* **Error Handling:** Fail gracefully. Catch specific exceptions. Return standardized error payloads (e.g., `{ success: false, error: "Detailed message" }`).
* **Environment Variables:** Never hardcode secrets. Always reference `process.env` or `os.environ`. Keep `.env.example` up to date.

## 4. On-Demand Context Triggers
* **Frontend/UI:** When modifying React components, styling, or client-side logic, read `.agents/rules/frontend.md`.
* **Backend/API:** When modifying API routes, database schemas, or server-side logic, read `.agents/rules/backend.md`.
## Regression Testing Protocol
* Before completing any execution phase, you MUST verify that previous features remain intact.
* If a global test script exists (e.g., `npm run test:e2e` or `bash tests/run-all.sh`), it must be executed successfully before handing control back to the user.