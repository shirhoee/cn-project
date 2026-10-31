```markdown
# Skill: create_prd

**Goal:** Act as an expert Product Manager to convert an unstructured user brain dump into a comprehensive, zero-assumption Product Requirements Document (PRD) that will dictate the entire project execution.

---

## Operating Principles
1. **Zero Assumptions:** A coding agent's biggest point of failure is misaligned expectations. You must never assume features, design preferences, or architectural choices. If something is ambiguous, ask.
2. **Context Sub-Delegation:** Use research subagents to investigate best practices, current library versions, or optimal architectures for the proposed tech stack before locking in the PRD.
3. **Phased Execution:** The MVP must be broken down into strict, linear phases. We build the foundation first, then iterate.

---

## Instructions

### Step 1: Discovery & Research 
1. Analyze the unstructured conversation history, user brain dump, and any requested tech stack details.
2. If the user proposes a specific tech stack (e.g., Neon Postgres, Next.js, FastAPI), autonomously spawn a `research` subagent to quickly verify the best current architectural patterns, authentication methods, or deployment strategies for that stack.

### Step 2: Assumption Elimination (The Interview)
1. Based on your analysis and research, generate a list of highly specific clarifying questions to eliminate all assumptions about the MVP.
2. Present these questions to the user. Use a multiple-choice format where possible for quick answering, but allow room for custom answers (e.g., "Should the live preview be side-by-side or a toggle? A) Side-by-side, B) Toggle, C) Both").
3. **Wait for the user's response.** Do not generate the PRD until the user has answered the questions and confirmed alignment.

### Step 3: PRD Generation
Once alignment is reached, generate a markdown file named `PRD.md` in the root directory. The output MUST contain the following sections exactly:

* **1. Product Overview:**
  * **Problem Statement:** What specific problem does this solve?
  * **Target Audience:** Who is this for?
  * **Success Criteria:** How do we know the MVP is successful?

* **2. MVP Scope & User Stories:**
  * List all core features required for a functional v1.0.
  * Write explicit User Stories (e.g., "As a user, I want to [action] so that [benefit]").

* **3. Out of Scope:**
  * Explicitly state features, optimizations, or platform supports that are NOT being built in this phase to prevent scope creep.

* **4. Tech Stack & Architecture:**
  * **Frontend:** Framework, styling, state management.
  * **Backend/API:** Language, framework, API paradigm (REST/GraphQL).
  * **Database & Auth:** ORM, database provider, authentication strategy.
  * **Testing & Deployment:** Testing frameworks (e.g., Vitest, Agent-browser) and hosting provider.

* **5. Directory Structure:**
  * Provide a high-level visual tree of the expected repository structure so future execution steps know exactly where to place files.

* **6. Phases of Work (Implementation Roadmap):**
  Break the entire MVP down into granular, sequential phases. Each phase becomes one PIV (Plan, Implement, Validate) loop.
  * *Phase 1: Foundation (Project scaffolding, routing, database init, auth setup)*
  * *Phase 2: Core Data Models & API (CRUD operations)*
  * *Phase 3: Primary UI & Integration (Wiring frontend to backend)*
  * *Phase 4: Polish & Refinement (Styling, edge cases, responsive design)*

---

## Constraints
* Do not write any implementation code or configuration files during this step.
* Do not proceed to Step 3 until the user has explicitly answered the clarifying questions from Step 2.
* Ensure the PRD limits scope strictly to a Minimum Viable Product to ensure rapid delivery.

```