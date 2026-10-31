# Phase 5 Plan: Documentation Overhaul, Directory Cleanup, and Repository Verification

## Feature Description & User Stories
As a reviewer, student, or evaluator inspecting or running the Dynamic SDN Mininet Application, I want comprehensive, accurate, and up-to-date documentation along with a tidy, organized repository structure so that I can reproduce all demonstrations and benchmarks without encountering legacy Ryu references, missing dependencies, or path errors.

* **User Story 1:** As an evaluator reading `README.md`, I want a clear, step-by-step setup guide for WSL2/Ubuntu, including exact dependency installations, service startups, and command-line execution sequences for both viva demonstrations.
* **User Story 2:** As a developer inspecting `PRD.md` and `PROJECT_PLAN.md`, I want the architecture specifications to reflect the actual implementation (`os-ken`, `ThreadingHTTPServer`, explicit switch port allocations, loop guard policies).
* **User Story 3:** As a user browsing the repository root, I want a clean, minimal workspace free from redundant or stale scripts, cache artifacts, and inconsistent line endings.

---

## Problem & Solution Statement
* **Problem:** 
  The codebase underwent critical bug fixes and modernization (migrating from legacy Ryu to `os-ken<=3.1.1`, replacing `os_ken.app.wsgi` with standard library `ThreadingHTTPServer`, adding loop guards, and explicitly fixing switch port bindings). However, `README.md`, `PRD.md`, and helper scripts still carry legacy remnants (e.g., mentions of Ryu manager, missing WSL service startup requirements, hardcoded paths in shell scripts, and untracked cache artifacts).
* **Solution:**
  1. Standardize and expand documentation across `README.md`, `PRD.md`, and `PROJECT_PLAN.md` with verified commands, architecture diagrams, and viva runbooks.
  2. Normalize and improve helper scripts (`src/network/start_network.sh` and `tests/evaluate_performance.sh`) to work reliably regardless of the current working directory.
  3. Clean up stale build/cache artifacts, ensure `.gitignore` catches all temporary files, and convert text files to clean LF line terminators.

---

## CONTEXT REFERENCES
* [README.md](file:///mnt/e/cn%20project/README.md) - Project overview, architecture, and demonstration guides.
* [PRD.md](file:///mnt/e/cn%20project/PRD.md) - Product Requirements Document and phase definitions.
* [PROJECT_PLAN.md](file:///mnt/e/cn%20project/PROJECT_PLAN.md) - Team role distribution and project aims.
* [src/network/topology.py](file:///mnt/e/cn%20project/src/network/topology.py) - Verified Mininet topology with explicit port bindings and `net.staticArp()`.
* [src/controller/dynamic_router.py](file:///mnt/e/cn%20project/src/controller/dynamic_router.py) - Dynamic OpenFlow controller with `ThreadingHTTPServer` REST API.
* [src/controller/static_router.py](file:///mnt/e/cn%20project/src/controller/static_router.py) - Baseline static OpenFlow controller.
* [antigravity_global_boilerplate/.agents/rules/backend.md](file:///mnt/e/cn%20project/antigravity_global_boilerplate/.agents/rules/backend.md) - Updated system rules for SDN emulation and controller compatibility.

---

## New Files to Create
* **Components:** None (Architecture is complete).
* **API:** None.
* **Utils:** None.
* **Tests:** `tests/test_sanity.py` (A lightweight sanity check script verifying file integrity, controller imports, and requirements).

---

## STEP-BY-STEP TASKS

### Task 1: Clean Up Working Directory and Cache Artifacts
* Purge all `__pycache__` directories across `src/` and `tests/`.
* Remove or modernize `src/network/start_network.sh` to handle absolute and relative paths robustly.
* Verify `.gitignore` ignores all bytecode, test outputs, and editor artifacts.
* **VALIDATE:** `python3 -c "import os; assert not any('__pycache__' in r for r, _, _ in os.walk('.'))"`

### Task 2: Overhaul README.md with Full Viva Runbook
* Update Prerequisites to clearly list WSL2/Ubuntu requirements (`mininet`, `openvswitch-switch`, `python3-pip`).
* Add the essential `sudo service openvswitch-switch start` step.
* Update controller installation instructions to `os-ken<=3.1.1` and `osken-manager`.
* Detail the exact port mapping architecture and both demonstration scenarios (Server Overload NAT Redirection and Link Failure PortStatus Failover) with expected console outputs.
* Normalize line endings to standard LF.
* **VALIDATE:** `grep -q "os-ken<=3.1.1" README.md && grep -q "openvswitch-switch start" README.md`

### Task 3: Align PRD.md with Modernized Tech Stack & Phase 5
* Update Section 4 (Tech Stack & Architecture) in `PRD.md` to reflect `os-ken` and standard library `ThreadingHTTPServer`.
* Update Section 5 (Directory Structure) to remove stale references.
* Update Section 6 (Phases of Work) to document the completed Phase 5 milestone.
* **VALIDATE:** `grep -q "os-ken" PRD.md && grep -q "Phase 5" PRD.md`

### Task 4: Modernize Helper Shell Scripts
* Update `src/network/start_network.sh` so it resolves the repository root dynamically before invoking `sudo python3 src/network/topology.py`.
* Ensure executable permissions (`chmod +x`) on all shell scripts.
* **VALIDATE:** `bash -n src/network/start_network.sh && bash -n tests/evaluate_performance.sh`

### Task 5: Implement Lightweight Repository Sanity Test
* Create `tests/test_sanity.py` to assert that:
  1. `dynamic_router.py` and `static_router.py` can be imported without syntax or import errors.
  2. `DynamicAppTopo` initializes with the correct port bindings (`s1:1 <-> s2:1`, `s1:2 <-> s3:1`, `s2:2 <-> server1`, `s2:3 <-> server2`, `s3:2 <-> client1`, `s2:4 <-> s3:5`).
  3. `requirements.txt` contains `os-ken<=3.1.1`.
* **VALIDATE:** `python3 -m unittest tests/test_sanity.py`

---

## TESTING STRATEGY
* **Unit/Sanity Testing:** Run `python3 -m unittest tests/test_sanity.py` to programmatically verify that all topology port links, controller classes, and package dependencies are sound.
* **Shell Syntax Validation:** Use `bash -n` to verify syntax validity of all shell scripts.
* **Controller Dry-Run:** Launch both `osken-manager src/controller/static_router.py` and `osken-manager src/controller/dynamic_router.py` under a 2-second timeout to confirm error-free instantiation.

---

## ACCEPTANCE CRITERIA
* [ ] All repository documentation (`README.md`, `PRD.md`, `PROJECT_PLAN.md`) accurately reflects `os-ken` and current network behavior.
* [ ] Directory is clean: no stray pycache files, no redundant obsolete files.
* [ ] Shell scripts execute reliably from any directory.
* [ ] `tests/test_sanity.py` passes 100% of assertions.
* [ ] All files formatted with clean LF line endings.
