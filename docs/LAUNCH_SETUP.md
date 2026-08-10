# Payments and provisioning setup

These endpoints are intentionally disabled until you finish the business setup. Checkout, including Stripe test mode, requires `CHECKOUT_ENABLED=launch-ready` after the Stripe webhook, the D1 database, and Pterodactyl have all been tested together.

## Stripe test setup

1. Create one recurring monthly Stripe Price for each plan.
2. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four `STRIPE_PRICE_ID_*_MONTHLY` values as Cloudflare Pages secrets.
3. In Stripe, add `https://your-domain/api/stripe/webhook` and subscribe it to `checkout.session.completed`.
4. Keep `CHECKOUT_ENABLED` unset or set to any value other than `launch-ready` on production. Use `launch-ready` only in an isolated test environment, and keep `PROVISIONING_ENABLED=false` until the Palworld node has capacity.

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
- `PTERODACTYL_ALLOCATION_ID` (one fixed allocation) or `PTERODACTYL_LOCATION_IDS_JSON` (for example `[1]` to let Pterodactyl choose an available allocation across a location)
- `PTERODACTYL_DOCKER_IMAGE`
- `PROVISIONING_SECRET`
- `PROVISIONING_ENABLED=false`

Your confirmed panel values are: Palworld nest `5`, egg `15`, and Docker image `ghcr.io/ptero-eggs/steamcmd:debian`. Provisioning reads the egg startup command and all variable defaults from the Panel API, then sets a unique admin password, server name, and the player limit for the purchased plan. The provision endpoint is server-to-server only and must only be called after a verified payment webhook.

## Before enabling sales

- Create a Cloudflare D1 database, apply `database/schema.sql`, and bind it to Pages as `DB` for order storage and webhook event de-duplication.
- The verified Stripe webhook records each paid checkout event in D1, claims the order once, then calls `/api/provision` only when `PROVISIONING_ENABLED=true`.
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
