# Payments and provisioning setup

These endpoints are intentionally disabled until subscription lifecycle automation is complete. Checkout, including Stripe test mode, requires `CHECKOUT_ENABLED=subscription-lifecycle-ready` after the Stripe webhook, the D1 database, and Pterodactyl have all been tested together.

## Stripe test setup

1. Create one recurring monthly Stripe Price for each plan.
2. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the four `STRIPE_PRICE_ID_*_MONTHLY` values, and the three `STRIPE_ZOMBOID_PRICE_ID_*_MONTHLY` values as Cloudflare Pages secrets.
3. In Stripe, add `https://your-domain/api/stripe/webhook` and subscribe it to `checkout.session.completed`.
4. Keep `CHECKOUT_ENABLED` unset or set to any value other than `subscription-lifecycle-ready` on production. Keep `PROVISIONING_ENABLED=false` until both game provisioning paths are tested.

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

Before enabling checkout on a new D1 database, apply `database/schema.sql` and `database/capacity-reservations.sql`. For the existing D1 database, apply `database/add-zomboid-provisioning.sql` once to add the game and secondary-allocation columns. Checkout reserves one free allocation for Palworld or an adjacent allocation pair for Project Zomboid, each for up to 24 hours. Once capacity is assigned or reserved, checkout returns a sold-out response instead of accepting another payment.

The shared game pool uses Node2 (`192.168.0.130`) ports `20000-20010` and Node3 (`192.168.0.140`) ports `30000-30010`. Set `PTERODACTYL_NODE_IDS_JSON=[2,4]` and `PTERODACTYL_ALLOCATION_ALIASES_JSON={"2":"node2.sidequestservers.com","4":"node3.sidequestservers.com"}`. Forward those ranges to their matching node IP addresses in the router. Palworld selects one free allocation; Project Zomboid selects two consecutive free allocations. Checkout only selects allocations with the matching alias, preventing it from using older allocations outside the forwarded ranges.

## Before enabling sales

- Create a Cloudflare D1 database, apply `database/schema.sql`, and bind it to Pages as `DB` for order storage and webhook event de-duplication.
- The verified Stripe webhook records each paid checkout event in D1, claims the order once, then calls `/api/provision` only when `PROVISIONING_ENABLED=true`.
- Project Zomboid tiers allocate 5/8/10 GB RAM, 25 GB disk, one backup, and the existing save-stop-backup-start schedule. Confirm its player-cap setting is written by the egg or a post-provision configuration step before enabling sales.
- Add a verified PayPal webhook handler before enabling PayPal.
- Test with Stripe test mode and PayPal sandbox.
- Confirm Pterodactyl can email account setup links and has available allocations.

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
