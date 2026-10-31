# .agents/skills/plan_feature.md

# Skill: plan_feature

**Goal:** Create a hyper-detailed, atomic execution plan for a specific feature or phase, breaking complex tasks down into a sequential checklist that the `execute` skill can process flawlessly.

---

## Instructions

1. **Context Intake:** Analyze the requested feature from the PRD. If necessary, spawn a `research` subagent to look up exact API implementations or library syntax for the required task.
2. **Generate the Plan Document:** Create a markdown file named `plans/phase-[X]-[feature-name].md`.
3. **Enforce the Structure:** The plan MUST contain the following sections verbatim:
   * **Feature Description & User Stories:** Clear narrative of what is being built.
   * **Problem & Solution Statement:** The technical approach to fulfilling the stories.
   * **CONTEXT REFERENCES:** A bulleted list of URLs to official documentation or specific files within the codebase to reference.
   * **New Files to Create:** A categorized list (Components, API, Utils, Tests) of all new files required.
   * **STEP-BY-STEP TASKS:** The core execution engine. Break the work into sequential, atomic tasks. 
     * *CRITICAL:* Every single task MUST end with a `- **VALIDATE**:` line containing the exact terminal command required to prove the task succeeded (e.g., `npm run lint`, `npx vitest run src/utils.test.ts`).
   * **TESTING STRATEGY:** Define what unit and E2E tests need to be written.
   * **ACCEPTANCE CRITERIA:** A final checklist of business requirements.
4. **Review:** Ensure the plan does not contain actual source code, only the architectural blueprint and task sequences.