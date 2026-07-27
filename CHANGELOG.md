# SideQuest Servers change log

## 2026-07-27 — Baseline preserved

- Created a clean, restorable backup before making any changes.
- Backup location: `C:\Users\Admin\Documents\Codex\2026-07-27\now\work\backups\SideQuestServers_2026-07-27_12-25-21`
- Created a managed working copy for future edits and GitHub uploads.
- No website code has been changed yet.

## 2026-07-27 — Pre-launch checkout safety

- Created a restorable pre-change backup at `C:\Users\Admin\Documents\Codex\2026-07-27\now\work\backups\SideQuestServers_2026-07-27_12-27-03`.
- Reworked the billing page into a plan preview while payments and account provisioning are not live.
- Removed customer password fields and the browser request that sent passwords to a placeholder endpoint.
- Changed the unused order-request endpoint to explicitly reject requests and confirm that no account or order was created.
