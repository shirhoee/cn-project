---
trigger: model_decision
description: Apply these guidelines whenever working on the frontend, UI components, styling, or client-side React code.
---


## Frontend Architecture & Patterns

### 1. Component Design
* **Separation of Concerns:** Keep components small and focused on a single responsibility.
* **Server vs. Client:** Default to Server Components. Use `"use client";` only when interactivity, hooks (useState, useEffect), or browser APIs are strictly required.
* **Props:** Define explicit TypeScript interfaces/types for all component props.

### 2. Styling & UI
* **Tailwind CSS:** Use utility classes for all styling. Do not use inline styles (`style={{}}`) or external CSS modules unless absolutely necessary.
* **Component Library:** Use the established library (e.g., shadcn/ui). Re-use existing UI primitives (Buttons, Inputs, Dialogs) rather than building bespoke versions.
* **Responsiveness:** Ensure all layouts are mobile-responsive by default using Tailwind's `sm:`, `md:`, and `lg:` prefixes.

### 3. State Management & Data Fetching
* **Local State:** Use `useState` or `useReducer` for localized component state.
* **URL State:** Prefer keeping state in the URL search params (e.g., `?query=foo`) for filterable/shareable views.
* **Mutations:** Use optimistic UI updates where applicable to ensure the interface feels immediately responsive.