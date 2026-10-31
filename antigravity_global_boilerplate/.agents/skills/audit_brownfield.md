# Skill: audit_brownfield

**Goal:** Analyze an existing, undocumented, or messy codebase to map its current state and generate a Refactoring PRD.

**Instructions:**
1. Autonomously explore the repository. Analyze `package.json` (or equivalent dependency files), directory structures, and core entry points to determine the actual tech stack and architecture in use.
2. Identify major areas of technical debt (e.g., lack of typing, massive files, missing validation, inconsistent styling).
3. Generate a `CURRENT_STATE.md` file detailing exactly how the app works right now, including a mapped directory tree.
4. Generate a `PRD.md` file focused entirely on stabilization. The "Phases of Work" MUST follow this structure:
   * **Phase 1: Linting & Type Safety** (Enforcing strict rules).
   * **Phase 2: File Restructuring** (Moving files into a logical folder structure).
   * **Phase 3: Component/Logic Extraction** (Breaking down massive files into smaller, single-responsibility modules).
   * **Phase 4: Feature X** (The actual new feature the user wants to build eventually).