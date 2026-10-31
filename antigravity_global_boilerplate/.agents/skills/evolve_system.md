# Skill: evolve_system

**Goal:** Perform meta-reasoning on a recent bug, hallucination, or misaligned output to determine how the AI Layer (`AGENTS.md` or `.agents/rules/*.md`) should be updated to prevent the issue in the future.

**Instructions:**
1. Ask the user to describe the bug or the poor code generation outcome that just occurred.
2. Analyze the current project rules and on-demand context files.
3. Perform meta-reasoning: Why did the agent make this mistake? Was a rule missing? Was a convention unclear?
4. Suggest a specific, concise addition or modification to the AI Layer (e.g., adding a new bullet point to `frontend.md` about how to handle CSS classes).
5. **DO NOT change the codebase code during this step.** Only output the proposed changes to the rules. 
6. Once the user approves, update the rule files.