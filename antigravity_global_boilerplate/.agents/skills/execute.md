# Skill: execute

**Goal:** Autonomously execute an approved, structured feature plan document from a fresh context window, write all implementation code, execute the full validation pyramid, and verify functionality via end-to-end tests before handing off for human verification.

---

## Operating Principles & Golden Rules

1. **The Plan is Sovereign:** The feature plan file (`plans/phase-X-*.md`) is the single source of truth. Implement only what is explicitly specified in the plan. Do not add out-of-scope features or alter documented architectural patterns.
2. **Context Freshness:** Run execution in a dedicated context window containing only the feature plan, project rules, and required code. Do not carry unstructured brainstorming history into this phase.
3. **No Mock Validation Shortcuts:** Ensure real environment variables and database connections are ready before beginning. Do not replace integration/E2E tests with mocks to bypass errors.
4. **Subagents for Research Only:** If syntax, library nuances, or external documentation must be looked up during execution, delegate that to a temporary research subagent to keep the main implementation context lean and focused.
5. **Trust but Verify:** Code is not complete until every automated test passes and visual proof (screenshots) has been generated for human inspection.

---

## Instructions

### Step 1: Input & Environment Sanity Check
1. **Load the Plan:** Accept the target plan file path as an argument (e.g., `plans/phase-1-profile-editor-live-preview.md`). If not provided, inspect the `plans/` directory and prompt the user to specify one.
2. **Read the Reference Context:** Review the plan's `CONTEXT REFERENCES`, `New Files to Create`, and `Patterns to Follow` sections to ensure exact adherence to naming conventions, casing, and folder hierarchies.
3. **Environment & Secrets Check:** Check `.env.example` against `.env.local` (or `.env`). Ensure all required database URLs, API keys, and auth secrets are configured so integration and migration commands will not fail mid-flight.

---

### Step 2: Atomic Task-by-Task Implementation
Iterate sequentially through each entry under **STEP-BY-STEP TASKS**:

1. **Execute Task:**
   * Create or update the exact files designated for the current task.
   * Write clean, type-safe, production-ready code matching the defined patterns.
   * Run any necessary package installs, migrations, or setup scripts.
2. **Run Task Validation:**
   * Execute the exact `- **VALIDATE**:` terminal command for that task.
   * If the command fails, analyze the error output, fix the code immediately, and rerun the command until it exits with code `0`.
3. **Advance:** Proceed to the next task only after the current task's validation passes cleanly.

---

### Step 3: Run the Full Validation Pyramid
Once all individual tasks are completed, execute the project-wide validation pyramid in strict sequence:

1. **Level 1 — Syntax, Linting & Type Checking:**
   ```bash
   npm run lint
   npx tsc --noEmit
   ```
   *(Or framework equivalent: `biome check .`, `ruff check .`, `mypy`)*

2. **Level 2 — Unit & Integration Tests:**
   ```bash
   npm run test:run
   ```
   *(Or `vitest run`, `pytest`)* Verify that all validation schemas, utilities, and isolated components pass.

3. **Level 3 — Production Build:**
   ```bash
   npm run build
   ```
   Verify that bundling, minification, tree-shaking, and server routes compile without warnings or errors.

4. **Level 4 — Automated Browser E2E Tests (`agent-browser` CLI):**
   * Ensure the local dev server is running (`npm run dev &`).
   * Run the end-to-end test suite (e.g., `bash tests/e2e/run-all.sh` or `npm run test:e2e`).
   * Automate user journeys using the `agent-browser` CLI (`open`, `snapshot -i`, `fill`, `click`, `wait`, `screenshot`).
   * Capture and save visual proof screenshots into `tests/e2e/screenshots/`.
   * Ensure all test assertions and flow checks pass.

---

### Step 4: Acceptance Criteria Verification
Verify each checkbox under the plan's **ACCEPTANCE CRITERIA** against the running application and codebase. Every criterion must be satisfied.

---

### Step 5: Completion Report & Human Handoff
Present a structured final handoff summary:

* **Tasks Completed:** Itemized list of all implemented tasks and created/modified files.
* **Automated Validation Results:** Terminal output summary showing passing linting, unit tests, build, and E2E runs.
* **Visual Proof:** File paths to all captured screenshots in `tests/e2e/screenshots/`.
* **Manual Human Verification Steps:** 3–5 concrete manual verification steps for the user (e.g., "1. Navigate to http://localhost:3000/editor, 2. Add two links and test drag-and-drop reorder, 3. Refresh the page to verify database persistence").
* **Next Action:** Instruct the user to review the changes and run the `commit` skill to capture the work in the Git history as long-term memory.

---

## Constraints

* Do not mark a feature complete if any validation command or test fails.
* Do not perform `git commit` or `git push` inside this skill; commits are handled separately via the `commit` skill after human review.
* Keep all file edits and dependencies strictly scoped to the current feature phase.