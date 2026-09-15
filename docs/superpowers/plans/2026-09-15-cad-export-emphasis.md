# CAD Export Emphasis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CAD-ready XYZ mirror profile export and its curve-driving parameters visually prominent.

**Architecture:** Add semantic markers in the existing files-page renderer and contained teal styles in the existing stylesheet. Rebuild the generated single-file application.

**Tech Stack:** Vanilla JavaScript, CSS, Node.js built-in test runner.

## Global Constraints

- Do not alter optical calculations, XYZ contents, schemas, or persistence.
- Keep `index.html` a deterministic build from `src/`.
- Curve-driving keys are `scale`, `a0`, `b0`, `lo`, `hi`, `rin0`, and `rout0`.

---

### Task 1: Define and verify the visual contract

**Files:**

- Create: `tests/cad-export-emphasis.test.cjs`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `index.html` through `npm run build`

**Interfaces:**

- Produces: `.cad-export` on `#exportXYZ` and `.cad-core-row` on all seven curve-driving rows.

- [ ] Write a failing Node test that reads `src/app.js` and `src/styles.css` and asserts `cad-export`, `cad-core-row`, and the exact `CAD_CORE_KEYS` set exist.
- [ ] Run `node --test tests/cad-export-emphasis.test.cjs` and observe the expected failure before implementation.
- [ ] Add `CAD_CORE_KEYS`, apply `cad-export` plus a visible `CAD 曲线` label to `#exportXYZ`, and apply `cad-core-row` plus a visible `曲线核心` badge to matching rows.
- [ ] Add teal, non-gradient styles with keyboard-focus and narrow-screen wrapping support.
- [ ] Re-run `node --test tests/cad-export-emphasis.test.cjs`; expect one passing test.
- [ ] Run `npm run build && npm run check`; expect deterministic build verification and the full test suite to pass.
- [ ] Inspect the built files page at desktop and narrow widths, then commit and push to `main`.
