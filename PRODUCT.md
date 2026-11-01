# Pencils

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pencils serves its owner for personal use now, with a planned path to small teams of fewer than 100 concurrent users. This audience and scale target were confirmed on 2026-11-01. The expected workload is a few projects with hundreds of files and cards per project, plus visual boards that can contain many more objects.

People move between a desktop browser, iPad and phone. All three are primary working environments. Touch, mouse, keyboard and pen input matter; mobile web is not a separate native app.

## Product Purpose

Bring documents, project cards, planning and visual boards into one workspace. A person can capture an idea, develop it in a document or board, turn it into a card, organise its relationships and dates, and follow the same work through different views.

Success means less time managing the interface and less duplication between notes, cards and plans, while keeping the underlying files accessible outside Pencils.

## Positioning

Pencils combines a portable Markdown vault with a web workspace for structured project work and freeform visual thinking. Markdown and canvas files are authoritative; the SQLite query index is rebuildable. Obsidian interoperability is a product commitment, not an export-only fallback.

This describes the product's mechanism, not a claim that it is unique or superior to another product.

## Operating Context

- The application runs on an owner's server, normally through Docker, with the vault mounted separately from the application image. Devices use the browser to reach it.
- Core local workflows do not require an external cloud service. The main application still needs a reachable server; it must not be described as fully usable offline on every device. The separate offline drawing pad and local checkpoints have their own preparation and recovery workflows.
- Personal use is the immediate priority. Organisation membership and accounts support future shared use; do not treat the current single-user setup as a reason to remove access controls or data boundaries.
- Documents, cards and boards can be linked. Editing a linked card updates its underlying record; removing a board representation is distinct from deleting the card.
- Optional connections include Obsidian, Jira Cloud, SharePoint Excel and Miro imports. Their capabilities, permissions and connection requirements differ.

## Capabilities and Constraints

- Project views include Overview, Documents, List, Tree, Table, Kanban, Board, Calendar, Timeline and Capacity. Projects can disable views and optional card fields without discarding their stored values.
- Documents support live preview, Markdown source and reading, with inline editing of supported rich components. Card descriptions and comments support formatted content while preserving Markdown storage.
- Cards support types, assignees, statuses, priorities, dates, hierarchy, dependencies, attachments and comments. Planning views operate on the same cards.
- Boards combine linked cards, notes, text, shapes, images, frames, connections and drawing. Large selections, copy/paste, pan and zoom are important workflows, including on iPad.
- Preserve the existing vault, revisions, recovery, trash and audit history. Avoid changes that silently discard edits or replace another person's newer work.
- The fewer-than-100-concurrent-users target and large-board ambitions are design goals, not unconditional performance guarantees. Performance claims need a workload, device and measurement. Emulation does not establish physical iPad responsiveness or pen calibration.
- Preserve the existing implementation unless a concrete need justifies a change: browser JavaScript modules, Node.js/Fastify with TypeScript server routes, Markdown/canvas files and a rebuildable SQLite index. Follow `AGENTS.md` for implementation, tests and release rules.

## Brand Commitments

- The product name is Pencils.
- Use direct, concise language and the interface's existing terms. Cards are units of project work; documents and boards are distinct resources. Do not invent new names for established actions.
- The owner has explicitly asked for the compactness and navigation economy of Obsidian. Preserve that usability commitment without copying every interaction or assuming a visual redesign is desired.

## Evidence on Hand

- `AGENTS.md` records the owner's current interaction, consistency, accessibility, storage and release requirements. It takes precedence over stale implementation descriptions.
- `README.md`, `CHANGELOG.md`, `public/` and `server/` describe and implement the existing product. Cross-check older README passages against current code and newer changelog entries before using them as a specification.
- `e2e/` and `test/` contain browser and unit checks. Fixtures use temporary vaults rather than the owner's project data.
- `reports/2026-10-20-backend-board-performance.md` contains historical workload measurements and implementation findings. It is not a benchmark for every later release or physical device.
- `public/icon.svg` and the bundled files under `public/fonts/` provide existing assets. Preserve their licences and source records.

## Product Principles

1. Keep the owner's data portable, recoverable and under their control.
2. Let one record serve multiple views; avoid duplicate content and duplicate homes for actions.
3. Keep routine work compact and discoverable, with consistent behaviour across views and devices.
4. Treat responsiveness and reliable direct manipulation as functionality, especially on touch devices and large boards.
5. Make the smallest complete change that meets the need, reusing established components and preserving validation and recovery.

## Accessibility & Inclusion

Preserve keyboard access, visible focus, accessible names for icon controls, reduced-motion preferences, readable light and dark themes, and 44px touch targets. Compact presentation must not shrink touch targets below the project's rules. On touch screens, opening a page or card must not summon the keyboard; explicit Search is the documented exception. Refer to `AGENTS.md` and the shared control implementation for exact behaviour.

## Open Decisions

- Public distribution, pricing and any service-level commitments have not been established by this initialization.
- A general offline workflow beyond the existing drawing and recovery mechanisms remains a separate product decision.
- Physical-device performance limits must be measured; existing tests do not justify promising a particular frame rate or unrestricted board size.
