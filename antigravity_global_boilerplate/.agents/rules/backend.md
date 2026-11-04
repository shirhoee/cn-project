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

### 4. Networking & SDN Emulation (Mininet & OpenFlow)
* **Explicit Switch Port Binding:** Always assign explicit port numbers (`port1` and `port2`) in `addLink(...)` calls for Mininet topologies. Never rely on implicit sequential port numbering when controllers enforce static or priority-based OpenFlow port routing.
* **Broadcast Storm & Loop Guards:** On topologies containing redundant links or cycles, enforce `net.staticArp()` on startup to prevent broadcast storms. Ensure controllers explicitly isolate backup links from standard flood domains until failover is triggered.
* **SDN Controller Frameworks:** When developing with `os-ken`, inherit from `app_manager.OSKenApp` (not `RyuApp`). For Northbound REST APIs, prefer Python standard library HTTP servers (`http.server.ThreadingHTTPServer`) over legacy framework WSGI layers.

### 5. Local Development Cache Invariant
* **No Immutable Assets in Dev:** Never serve local dashboard frontend assets with `immutable` or long `max-age` caching headers. Always enforce `Cache-Control: no-cache, must-revalidate` alongside strong ETags so browser refreshes immediately load updated source files without manual cache-clearing workarounds.
