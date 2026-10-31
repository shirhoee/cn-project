---
trigger: model_decision
description: Apply these guidelines whenever working on the backend, API routes, database schemas, or server-side logic.
---


## Backend Architecture & Patterns

### 1. API Design
* **RESTful Principles:** Use appropriate HTTP methods (`GET` for reading, `POST` for creation, `PUT/PATCH` for updates, `DELETE` for removal).
* **Response Formatting:** Standardize all responses.
  * Success: `HTTP 200/201`, `{ data: { ... } }`
  * Error: `HTTP 400/401/404/500`, `{ error: "Message", code: "ERR_CODE" }`
* **Rate Limiting:** Ensure all mutating endpoints have basic rate-limiting to prevent abuse.

### 2. Database Interactions
* **ORM Usage:** Always use the designated ORM (e.g., Drizzle, Prisma, SQLAlchemy). Avoid raw SQL to prevent injection vulnerabilities.
* **Schema Definitions:** Keep table definitions, relations, and enums strictly synchronized with the application types.
* **Indexing:** Add indexes to columns frequently used in `WHERE`, `JOIN`, or `ORDER BY` clauses.

### 3. Authentication & Security
* **Session Verification:** Every protected route MUST independently verify the user's session/token before executing logic.
* **Ownership Checks:** When modifying or deleting a resource, verify that the `userId` of the resource matches the authenticated user. Never trust the client-provided ID blindly.