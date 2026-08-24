# Payments and provisioning setup

These endpoints are intentionally disabled until subscription lifecycle automation is complete. Checkout, including Stripe test mode, requires both `CHECKOUT_ENABLED=subscription-lifecycle-ready` and `PUBLIC_CHECKOUT_ENABLED=true` after the Stripe webhook, the D1 database, and Pterodactyl have all been tested together. `PUBLIC_CHECKOUT_ENABLED` must be exactly `true` with no surrounding whitespace and should be returned to `false` immediately after isolated test checkouts before launch.

## Stripe test setup

1. Create one recurring monthly Stripe Price for each plan.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Cloudflare Pages encrypted secrets. Add these Stripe Price IDs as regular text variables: `STRIPE_PALWORLD_PRICE_ID_STARTER_4_MONTHLY`, `STRIPE_PALWORLD_PRICE_ID_EXPLORER_6_MONTHLY`, `STRIPE_PALWORLD_PRICE_ID_FRONTIER_8_MONTHLY`, `STRIPE_PALWORLD_PRICE_ID_GUILD_12_MONTHLY`, `STRIPE_ZOMBOID_PRICE_ID_SAFEHOUSE_5_MONTHLY`, `STRIPE_ZOMBOID_PRICE_ID_SURVIVOR_10_MONTHLY`, and `STRIPE_ZOMBOID_PRICE_ID_OUTBREAK_15_MONTHLY`.
3. In Stripe, add `https://your-domain/api/stripe/webhook` and subscribe it to `checkout.session.completed`, `checkout.session.expired`, `invoice.payment_failed`, `invoice.paid`, `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Keep `CHECKOUT_ENABLED` unset or set to any value other than `subscription-lifecycle-ready` on production. Keep `PUBLIC_CHECKOUT_ENABLED` unset or set to any value other than `true` until public sales are approved. Keep `PROVISIONING_ENABLED=false` until both game provisioning paths are tested.
5. When using a Stripe `sk_test_` key on the public site, set `TEST_CHECKOUT_EMAIL_ALLOWLIST` to the comma-separated billing emails approved to create test servers. Test checkout rejects every other email.

## PayPal sandbox setup

1. Create a sandbox REST app and one monthly PayPal subscription plan per hosting package.
2. Add `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=sandbox`, and the four `PAYPAL_PLAN_ID_*_MONTHLY` secrets.
3. Change `PAYPAL_MODE` to `live` only after your business account is approved.

## Pterodactyl configuration

Create an Application API key in the Pterodactyl admin panel. Never place it in browser code. Add these Cloudflare Pages secrets:

- `PTERODACTYL_PANEL_URL`
- `PTERODACTYL_APPLICATION_API_KEY`
- `PTERODACTYL_NEST_ID`
- `PTERODACTYL_EGG_ID`
- `PTERODACTYL_NODE_IDS_JSON` (for example `[2,4]` for the Palworld capacity pool)
- `PTERODACTYL_ALLOCATION_ALIASES_JSON` (for example `{"2":"node2.sidequestservers.com","4":"node3.sidequestservers.com"}`)
- `PTERODACTYL_DOCKER_IMAGE`
- `PTERODACTYL_ZOMBOID_NEST_ID=6`
- `PTERODACTYL_ZOMBOID_EGG_ID=16`
- `PTERODACTYL_ZOMBOID_DOCKER_IMAGE=ghcr.io/ptero-eggs/steamcmd:debian`
- `PROVISIONING_SECRET`
- `PROVISIONING_ENABLED=false`

Your confirmed panel values are: Palworld nest `5`, egg `15`, and Docker image `ghcr.io/ptero-eggs/steamcmd:debian`; Project Zomboid nest `6`, egg `16`, and the same Docker image. Provisioning reads egg startup commands and variable defaults from the Panel API. Palworld provisions one allocation; Project Zomboid provisions an adjacent game/Steam allocation pair. The provision endpoint is server-to-server only and must only be called after a verified payment webhook.

Before enabling checkout on a new D1 database, apply `database/schema.sql` and `database/capacity-reservations.sql`. For an existing D1 database, apply `database/add-zomboid-provisioning.sql` if needed, then apply `database/subscription-lifecycle.sql` once. Checkout reserves one free allocation for Palworld or an adjacent allocation pair for Project Zomboid for up to 30 minutes. `checkout.session.expired` also releases an abandoned Stripe Checkout reservation immediately. Once capacity is assigned or reserved, checkout returns a sold-out response instead of accepting another payment.

The shared game pool uses Node2 (`192.168.0.130`) ports `20000-20010` and Node3 (`192.168.0.140`) ports `30000-30010`. Set `PTERODACTYL_NODE_IDS_JSON=[2,4]` and `PTERODACTYL_ALLOCATION_ALIASES_JSON={"2":"node2.sidequestservers.com","4":"node3.sidequestservers.com"}`. Forward those ranges to their matching node IP addresses in the router. Palworld selects one free allocation; Project Zomboid selects two consecutive free allocations. Checkout only selects allocations with the matching alias, preventing it from using older allocations outside the forwarded ranges.

### Panel schedule bridge

Pterodactyl's Application API cannot create server schedules. Install the signed-in Application API extension in `panel-bridge/` on the Panel host before enabling provisioning:

```bash
sudo bash /tmp/sidequest-panel-bridge/install.sh
```

The installer adds `POST /api/application/sidequest/schedules`, which uses the existing Application API key to create the canonical backup/restart schedule locally after every Palworld or Project Zomboid server is created. Re-run the installer after each Pterodactyl Panel upgrade because it extends the Panel's route provider.

## Before enabling sales

- Create a Cloudflare D1 database, apply `database/schema.sql`, and bind it to Pages as `DB` for order storage and webhook event de-duplication.
- The verified Stripe webhook records each paid checkout event in D1, claims the order once, then calls `/api/provision` only when `PROVISIONING_ENABLED=true`.
- Project Zomboid tiers allocate 5/8/10 GB RAM, 25 GB disk, one backup, and the existing save-stop-backup-start schedule. Player counts are plan-sizing guidance; customers can adjust `MaxPlayers` through their server configuration while Pterodactyl enforces the resource limits.
- Add a verified PayPal webhook handler before enabling PayPal.
- Test with Stripe test mode and PayPal sandbox.
- Confirm Pterodactyl can email account setup links and has available allocations.
- Keep `CHECKOUT_ENABLED` unset until Stripe test events, the lifecycle Cron, and Pterodactyl suspend/unsuspend/build updates have been exercised together. Public checkout is enabled only when `CHECKOUT_ENABLED=subscription-lifecycle-ready` and `PUBLIC_CHECKOUT_ENABLED=true`.

## Subscription lifecycle and Panel billing

`invoice.payment_failed` starts a three-day D1 grace period for the matching Stripe subscription. `invoice.paid` clears grace and unsuspends that order's recorded Pterodactyl server. A subscription deletion suspends that recorded server and marks its order cancelled. Subscription update events map configured Stripe Price IDs to the matching game plan and update only that recorded server's Pterodactyl build limits.

Deploy `workers/subscription-lifecycle-cron` separately only after setting its real D1 database name/ID, setting `PTERODACTYL_PANEL_URL` as a Worker variable, binding `PTERODACTYL_APPLICATION_API_KEY` as a Worker secret, and testing it with Stripe test data. Its hourly Cron suspends only orders whose recorded grace period has expired. The production Worker binds the `sidequest-orders` D1 database and runs at `:15` each hour.

Customer billing is available in the Pterodactyl Panel's `/account/billing` tab. The Panel calls the Pages Worker with a signed user ID, and the Worker returns only that user's recorded subscriptions or a direct management session. Configure the same random value as `PANEL_BILLING_BRIDGE_SECRET` in Cloudflare Pages and `SIDEQUEST_BILLING_BRIDGE_SECRET` in `/var/www/pterodactyl/.env`. Set `SIDEQUEST_BILLING_BRIDGE_URL=https://sidequestservers.com` in the Panel `.env`, and set `PANEL_BILLING_RETURN_URL=https://panel.sidequestservers.com/account/billing` in Cloudflare Pages. Re-run `panel-bridge/install.sh` after every Panel upgrade to restore the Billing tab and bridge routes.

The first Panel billing action for each game automatically creates a Stripe Customer Portal configuration containing only that game's configured monthly Prices. It enables subscription price changes, cancellation at period end, invoice history, payment-method updates, and Stripe's standard prorations. The Panel opens the matching Stripe-hosted portal for each game, so customers see upgrades and downgrades only for that game alongside cancellation. Optionally set `STRIPE_PALWORLD_PORTAL_CONFIGURATION_ID` and `STRIPE_ZOMBOID_PORTAL_CONFIGURATION_ID` to use pre-created configurations instead.

## Cancellation archive retention

When Stripe cancels a subscription, the lifecycle Worker creates one Pterodactyl backup, streams it to the private `sidequest-server-archives` R2 bucket, and emails the customer a signed download link. The server remains suspended for 72 hours and is deleted only after the R2 archive is ready. The R2 object and its download link expire after 30 days. A failed archive intentionally blocks automatic server deletion, preserving the data for support recovery.

Apply `database/cancellation-archives.sql` once to the existing `sidequest-orders` D1 database. The migration marks pre-rollout cancelled orders as already purged because their servers may no longer exist. Re-run `panel-bridge/install.sh` to install the signed Application API archive endpoints.

Create the private R2 bucket named `sidequest-server-archives`, then deploy `workers/subscription-lifecycle-cron` with its `CANCELLATION_ARCHIVES` binding. Set these Worker secrets:

- `PTERODACTYL_APPLICATION_API_KEY`
- `ARCHIVE_DOWNLOAD_SIGNING_KEY`: a random, high-entropy secret used to sign customer archive links.

Set these Worker variables:

- `PTERODACTYL_PANEL_URL=https://panel.sidequestservers.com`
- `ARCHIVE_DOWNLOAD_BASE_URL`: the public Worker archive route without a trailing slash, for example `https://sidequest-subscription-lifecycle-cron.<your-workers-subdomain>.workers.dev/archives`.

Archive emails use the Panel's existing SMTP configuration, which is already configured for Resend.

R2 Standard is the intended storage class: it has no retention minimum, includes the first 10 GB-month per month, costs $0.015 per GB-month after that, and has free Internet egress. R2 Infrequent Access has a 30-day minimum and a $0.01 per GB retrieval charge, so it is not economical for a 30-day archive that may be downloaded once.

## Transactional email

Resend sends website lifecycle emails from `SideQuest Servers <noreply@sidequestservers.com>` and sets `support@sidequestservers.com` as the reply address. Add these Cloudflare Pages secrets:

- `RESEND_API_KEY`: a Resend key with Sending access for `sidequestservers.com`.
- `RESEND_FROM=SideQuest Servers <noreply@sidequestservers.com>`
- `RESEND_REPLY_TO=support@sidequestservers.com`

The Stripe webhook sends the server-ready email only after Pterodactyl provisioning has completed. A Resend delivery failure is logged but never changes a successfully paid order to failed.

Configure Pterodactyl separately to send password reset and account setup emails through Resend SMTP:

```dotenv
MAIL_MAILER=smtp
MAIL_HOST=smtp.resend.com
MAIL_PORT=587
MAIL_USERNAME=resend
MAIL_PASSWORD=<Resend API key>
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@sidequestservers.com
MAIL_FROM_NAME="SideQuest Servers"
```
