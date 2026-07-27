# Revamp rollback

The former landing page is preserved as `index-classic.html`. Checkout code remains in `billing.html`
and is not part of the landing-page replacement.

To return to the former landing page, replace `index.html` with `index-classic.html` and redeploy.
Keep the current `index.html` under another name if you want to retain the new version for later use.

The shared `revamp.css` styling layer remains in use for `billing.html` and `policies.html`. Removing
its link from either page restores that page's prior visual presentation without changing its behavior.
