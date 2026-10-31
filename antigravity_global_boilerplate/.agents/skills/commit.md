# .agents/skills/commit.md

# Skill: commit

**Goal:** Generate a highly descriptive, context-rich Git commit that serves as the "Long-Term Memory" for the agent's future `prime` routines.

---

## Instructions

1. **Analyze Changes:** Run `git diff --cached` (or `git diff` if unstaged, then stage them) to analyze exactly what code was modified, added, or deleted.
2. **Draft the Message:** Create a commit message using the Conventional Commits specification (`type(scope): subject`).
3. **Document the 'Why':** The body of the commit message is critical. It MUST explain:
   * The architectural reasoning behind the changes.
   * Any new patterns introduced (e.g., "Extracted the database connection into a singleton to prevent connection pooling limits").
   * Which specific phase or task from the `plans/` directory this fulfills.
4. **Execute:** Run the `git commit -m "[message]"` command in the terminal.
5. **System Evolution Check:** If this commit was to fix a bug, prompt the user to ask if we should update the global rules (`AGENTS.md` or `.agents/rules/*.md`) to prevent the agent from making the same mistake in the future.