# Multi-Game Homepage Rollback

The former Palworld-only homepage is preserved intact as `palworld.html`.

To restore it as the production homepage, replace `index.html` with `palworld.html` in a new Git commit, then push `main`:

```powershell
Copy-Item -LiteralPath "palworld.html" -Destination "index.html"
git add index.html
git commit -m "Restore Palworld homepage"
git push origin main
```

Cloudflare Pages deploys the pushed `main` commit automatically. Verify `https://sidequestservers.com` after the deployment completes.

The new catalog styling lives in `game-catalog.css`. The current homepage links to `palworld.html`, `project-zomboid.html`, and `windrose.html`.
