# .agents/skills/create_rules.md

# Skill: create_rules

**Goal:** Dynamically generate or update the project's AI Layer (`AGENTS.md` and `.agents/rules/*.md`) by extracting technical decisions from the PRD, creating a hyper-specific coding manual for the agent.

---

## Instructions

1. **Analyze the PRD:** Read `PRD.md` in the root directory. Extract the chosen frameworks, database, testing strategies, and architectural patterns.
2. **Update `AGENTS.md`:** 
   * Replace the placeholder tech stack list with the actual selections from the PRD.
   * Define the specific terminal commands to run the app, run tests, and build the project.
3. **Update Domain Rules:**
   * Modify `.agents/rules/frontend.md` to include specific guidelines for the chosen frontend framework (e.g., routing paradigms, state management libraries).
   * Modify `.agents/rules/backend.md` to include specific guidelines for the chosen ORM, API structure, and database.
4. **System Evolution Verification:** Ensure that the `trigger` and `description` frontmatter blocks remain intact at the top of the `.agents/rules/*.md` files so Antigravity correctly applies progressive disclosure.
5. **Next Steps:** Instruct the user to run the `prime` skill to begin the first PIV loop.