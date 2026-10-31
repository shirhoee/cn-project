# .agents/skills/prime.md

# Skill: prime

**Goal:** Establish the current context and "Mental Model" of the codebase at the start of a new coding session. This command catches the agent up on past work without requiring the user to explain it.

---

## Instructions

1. **Read Long-Term Memory (Git):** Run `git log -n 5` to read the recent commit history. Analyze these commits to understand what features or bug fixes were just completed.
2. **Read the Roadmap (PRD):** Read the `PRD.md` file. Cross-reference the "Phases of Work" section with the Git history to determine the project's current progress.
3. **Read Recent Plans:** Check the `plans/` directory for the most recently executed feature plan to understand the immediate past context.
4. **Generate the Prime Report:** Output a concise, formatted report to the user:
   * **Current State:** A 2-3 sentence summary of what is currently built and functioning.
   * **Next Phase:** Explicitly name the next phase from the PRD that needs to be tackled.
   * **Action Prompt:** Ask the user if they are ready to run the `plan_feature` skill for the identified Next Phase.