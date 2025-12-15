# Strava Dashboard

Public dashboard displaying John's Strava activities at strava.johnhpower.com.

## Architecture

```
Browser (GitHub Pages) → Cloudflare Worker → Strava API
```

- **Frontend**: Static HTML/CSS/JS hosted on GitHub Pages
- **Backend**: Cloudflare Worker proxies Strava API calls
- **Auth**: Worker stores refresh token as secret, handles token refresh automatically

## URLs

| Resource | URL |
|----------|-----|
| Dashboard | https://strava.johnhpower.com |
| GitHub Repo | https://github.com/johnhenrypower/strava-dashboard |
| Worker | https://strava-auth.johnhenry-pwr.workers.dev |
| Worker Dashboard | https://dash.cloudflare.com → Workers → strava-auth |

## Files

| File | Purpose |
|------|---------|
| `index.html` | Dashboard page |
| `css/styles.css` | Styling (dark theme matching johnhpower.com) |
| `js/dashboard.js` | Fetches and renders activities |
| `worker/index.js` | Cloudflare Worker - proxies Strava API |
| `worker/.dev.vars` | Local dev secrets (git-ignored) |

## Secrets (stored in Cloudflare, not in repo)

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

Set via: `wrangler secret put SECRET_NAME`

## Worker API Endpoints

- `GET /api/athlete` - Returns athlete profile
- `GET /api/activities` - Returns recent activities
- `GET /api/stats` - Returns athlete stats

## Deployment

**Dashboard:**
```bash
git push  # GitHub Pages auto-deploys
```

**Worker:**
```bash
cd worker && wrangler deploy
```
