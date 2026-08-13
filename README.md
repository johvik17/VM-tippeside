````markdown
# VM 2026 Tippeapp

A full-stack web application built for a private FIFA World Cup prediction competition with family and friends.

The application lets users create an account, predict match results, compete on a leaderboard and follow the competition as match results are updated.

**Live application:**  
https://johvik17.github.io/VM-tippeside/

## Features

- User registration and login
- Predictions for World Cup matches
- Predictions automatically lock before kick-off
- Automatic points calculation
- Leaderboard with rankings
- Admin interface for managing matches and results
- Automatic match-result updates through an external football API
- Configurable bonus-prediction deadline
- Password reset through the admin interface

## Tech stack

### Frontend
- React
- Vite

### Backend
- Node.js
- Express
- JWT authentication

### Database
- PostgreSQL
- Supabase
- `pg`

### Deployment
- GitHub Pages – frontend
- Render – backend/API
- Supabase – PostgreSQL database

## Why I built it

My family wanted a simple way to predict the results of the 2026 World Cup and compete against each other.

What started as a fairly simple idea developed into a full-stack application with authentication, a database, an API, deployment and automatic result handling.

One of the main things I learned from the project was how different it is to build something that other people will actually use. Requirements and assumptions changed during development, and new problems appeared that I had not considered at the beginning.

The project gave me practical experience with building, deploying and maintaining a complete web application rather than only implementing individual pieces of code.

## Architecture

The production setup is split into three main parts:

```text
React / Vite frontend
        |
        | REST API
        v
Node.js / Express backend
        |
        v
Supabase PostgreSQL
````

The frontend is hosted on GitHub Pages, while the Express API runs on Render and communicates with the PostgreSQL database hosted by Supabase.

## Local development

Create `server/.env` based on `server/.env.example`.

Install dependencies and start the application:

```bash
npm install
npm run dev
```

By default:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
```

The backend requires a PostgreSQL connection through `DATABASE_URL`.

You can use either a Supabase connection string or a local PostgreSQL database.

## Environment variables

Example backend configuration:

```env
NODE_ENV=development
DATABASE_URL=postgresql://...
DB_SSL=false

JWT_SECRET=your-secret

CLIENT_ORIGIN=http://localhost:5173

SEED_ADMIN_PASSWORD=your-admin-password
SEED_DEMO_PASSWORD=your-demo-password

EXTRA_TIPS_DEADLINE=2026-06-14T16:00:00+02:00

FOOTBALL_SCORE_SYNC_ENABLED=false
FOOTBALL_API_PROVIDER=api-football
FOOTBALL_API_KEY=your-api-key
FOOTBALL_API_COMPETITION_ID=1
FOOTBALL_API_SEASON=2026
FOOTBALL_API_BASE_URL=https://v3.football.api-sports.io/fixtures?league=1&season=2026

FOOTBALL_SCORE_IDLE_POLL_MS=300000
FOOTBALL_SCORE_LIVE_POLL_MS=30000
```

Secrets and API keys should only be stored on the backend and must not be exposed in the frontend.

## Automatic score updates

The backend can fetch match status and results from an external football API.

Automatic synchronisation is disabled by default:

```env
FOOTBALL_SCORE_SYNC_ENABLED=false
```

Set it to `true` to enable score polling.

The polling strategy changes depending on match activity:

* No matches today: check once every 60 minutes
* Matches today, but none are live: check every 5 minutes
* At least one match is live: check every 30 seconds

The API is queried only for the current day's matches.

Fixtures are filtered by competition before being matched against local matches.

### Match matching

Fixtures are matched using:

1. `matchNumber` / `match_number`, when available
2. Date + home team + away team as fallback

When a match receives the status `FINISHED`, points are calculated automatically.

Results can still be entered manually through the admin interface if required.

## Supported football API providers

The score-sync implementation supports different authentication methods.

### API-Football / API-Sports

```text
Provider: api-football
FIFA World Cup league ID: 1
Authentication: x-apisports-key
```

### Football-Data.org

```text
Provider: football-data
FIFA World Cup competition code: WC
Authentication: X-Auth-Token
```

Other provider values use:

```text
Authorization: Bearer <token>
```

`FOOTBALL_API_BASE_URL` can either be a standard URL or include the placeholders:

```text
{date}
{competitionId}
{season}
```

These are replaced automatically when requests are made.

## Authentication and passwords

Authentication is JWT-based.

Passwords are not displayed or stored in plaintext.

For local development, seed-user credentials can be configured through environment variables:

```env
SEED_ADMIN_PASSWORD=...
SEED_DEMO_PASSWORD=...
```

An administrator can also assign a temporary password to a user through:

```text
Admin -> Brukere og passord
```

The user can then log in using the temporary password.

## Production deployment

### Frontend – GitHub Pages

The frontend uses the Vite base path:

```text
/VM-tippeside/
```

Build and deploy with the production API URL:

```powershell
$env:VITE_API_URL="https://vm-tippeside.onrender.com/api"
npm run deploy
```

The deploy command:

1. Builds `client/dist`
2. Copies `index.html` to `404.html` for SPA/deep-link fallback
3. Publishes the build to the `gh-pages` branch

GitHub Pages should be configured with:

```text
Source: Deploy from a branch
Branch: gh-pages
Folder: / (root)
```

### Backend – Render

The backend can be deployed using `render.yaml`.

Typical configuration:

```text
Runtime: Node
Build command: npm install
Start command: npm run start --workspace server
Health check: /api/health
```

Health check:

```text
https://vm-tippeside.onrender.com/api/health
```

Expected response:

```json
{
  "ok": true
}
```

### Database – Supabase

1. Create a Supabase project
2. Copy the PostgreSQL connection string
3. Add it as `DATABASE_URL` in Render
4. Enable SSL:

```env
DB_SSL=true
```

The backend creates the required database tables when starting against an empty database.

## Project structure

```text
VM-tippeside/
├── client/          # React / Vite frontend
├── server/          # Express backend
├── scripts/         # Utility scripts
├── render.yaml      # Render deployment configuration
├── package.json
└── README.md
```

## Status

The application was built as a working MVP for the 2026 FIFA World Cup.

Possible future improvements include:

* Improved responsive design and user experience
* More statistics and visualisations
* Improved automated testing
* CI/CD improvements
* Further automation of tournament and match data

```
```
