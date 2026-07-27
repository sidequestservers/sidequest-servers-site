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

## 2026-07-27 — Payment and provisioning foundation

- Created a restorable pre-change backup at `C:\Users\Admin\Documents\Codex\2026-07-27\now\work\backups\SideQuestServers_2026-07-27_12-42-24`.
- Removed region selection from the billing-page plan preview.
- Added disabled-by-default Stripe Checkout and PayPal subscription starter endpoints.
- Added a protected Pterodactyl Application API provisioning endpoint and a launch configuration guide.
- Left checkout and provisioning disabled until payment webhooks, business accounts, and Pterodactyl settings are configured.

## 2026-07-27 — Multi-node provisioning preparation

- Created a restorable pre-change backup at `C:\Users\Admin\Documents\Codex\2026-07-27\now\work\backups\SideQuestServers_2026-07-27_13-04-36`.
- Updated provisioning to support either one fixed allocation or automatic placement across configured Pterodactyl locations.
- Confirmed the current panel uses Palworld nest `5`, egg `15`, and the SteamCMD Debian image.
- Kept provisioning disabled because the current Homelab node is fully allocated.

## 2026-07-27 — Order and webhook safety

- Created a restorable pre-change backup at `C:\Users\Admin\Documents\Codex\2026-07-27\now\work\backups\SideQuestServers_2026-07-27_13-05-40`.
- Added a Cloudflare D1 schema for orders and de-duplicated payment webhook events.
