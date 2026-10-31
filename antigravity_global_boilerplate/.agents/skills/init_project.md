# .agents/skills/init_project.md

# Skill: init_project

**Goal:** Bootstrap a greenfield project environment, configure tooling, and initialize version control, serving as Step 1 of the development lifecycle.

---

## Instructions

1. **Information Gathering:** Ask the user for the project name and their preferred core tech stack (e.g., Next.js + Tailwind, Python + FastAPI + React).
2. **Project Scaffolding:** Execute the terminal commands to create the foundational structure.
   * *Example:* `npx create-next-app@latest . --typescript --tailwind --biome`
3. **Tooling Configuration:**
   * Create standard configuration files (e.g., `.gitignore`, `tsconfig.json`, `biome.json` or `eslint.config.js`).
   * Create environment templates (`.env.example`).
4. **Initial Verification:** Run the default build or dev server command to verify the scaffolded project compiles without errors.
5. **Version Control:**
   * Run `git init`.
   * Run `git add .`.
   * Run `git commit -m "chore: initial project scaffolding"`.
6. **Next Steps:** Output a success message and instruct the user to provide a brain dump of their idea so you can run the `create_prd` skill.