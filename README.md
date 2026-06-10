# VM-TIPPE

Ein fungerande MVP for VM-tipping.

## Teknologi

- React + Vite for frontend
- Express for backend
- Supabase PostgreSQL via `pg`
- JWT-basert innlogging

## Lokal utvikling

Lag `server/.env` basert på `server/.env.example`.

```bash
npm install
npm run dev
```

Frontend køyrer som standard på `http://localhost:5173`.
Backend køyrer på `http://localhost:4000`.

Backenden krev `DATABASE_URL`. Bruk Supabase connection string, eller ein lokal
PostgreSQL-database dersom du vil teste utan Supabase.

## Automatisk resultatoppdatering

Backenden kan hente kampstatus og resultat frå ein fotball-API-provider. API-nøkkel
skal berre ligge på backend, aldri i frontend.

Miljøvariablar:

```bash
FOOTBALL_API_PROVIDER=api-football
FOOTBALL_API_KEY=your-football-api-key
FOOTBALL_API_BASE_URL=https://v3.football.api-sports.io/fixtures?league=1&season=2026
FOOTBALL_SCORE_POLL_MS=300000
```

Polling skjer kvart femte minutt som standard. Dersom desse variablane manglar,
starter serveren utan automatisk score-sync og admin kan framleis legge inn
resultat manuelt.

Støtta provider-modusar:

- `api-football` / `apisports`: sender nøkkel i `x-apisports-key`
- `football-data` / `football-data.org`: sender nøkkel i `X-Auth-Token`
- anna verdi: sender nøkkel som `Authorization: Bearer ...`

Fixtures blir matchet mot lokale kampar slik:

1. `matchNumber` / `match_number` dersom API-et sender det.
2. Dato + heimelag + bortelag dersom kampnummer manglar.

Når ein kamp blir `FINISHED`, blir poenga for kampen rekna ut automatisk.

## Testbrukarar

Seed-data blir oppretta automatisk første gong serveren startar mot ein tom
database.

- Admin: `admin` / verdien i `SEED_ADMIN_PASSWORD`, eller `admin123` lokalt
- Brukar: `demo` / verdien i `SEED_DEMO_PASSWORD`, eller `demo123` lokalt

## Produksjon

Produksjonsoppsettet er delt i tre:

- GitHub Pages: statisk frontend
- Render: Express API
- Supabase: PostgreSQL database

GitHub Pages kan ikkje køyre Express-backenden. Frontend må derfor byggjast med
`VITE_API_URL` som peikar på Render-API-et.

## Supabase

1. Opprett eit gratis Supabase-prosjekt.
2. Gå til database connection settings.
3. Kopier PostgreSQL connection string.
4. Bruk connection string som `DATABASE_URL` i Render.
5. Set `DB_SSL=true`.

Backenden opprettar tabellane automatisk ved oppstart.

## Render

Du kan bruke `render.yaml` i repoet, eller setje opp manuelt:

- Service type: Web Service
- Runtime: Node
- Build command: `npm install`
- Start command: `npm run start --workspace server`
- Health check path: `/api/health`

Miljøvariablar på Render:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=ein-lang-tilfeldig-hemmelighet
CLIENT_ORIGIN=https://johvik17.github.io
SEED_ADMIN_PASSWORD=vel-eit-sterkt-passord
SEED_DEMO_PASSWORD=vel-eit-sterkt-passord
FOOTBALL_API_PROVIDER=api-football
FOOTBALL_API_KEY=din-api-nokkel
FOOTBALL_API_BASE_URL=https://v3.football.api-sports.io/fixtures?league=1&season=2026
FOOTBALL_SCORE_POLL_MS=300000
```

Når Render er deploya, test:

```bash
https://vm-tippeside-api.onrender.com/api/health
```

Du skal få:

```json
{ "ok": true }
```

## GitHub Pages

Frontend er konfigurert med Vite-base `/VM-tippeside/`, som passar repoet
`johvik17/VM-tippeside`.

Bygg og deploy frontend med Render API-URL:

```powershell
$env:VITE_API_URL="https://vm-tippeside-api.onrender.com/api"
npm run deploy
```

Deploy-kommandoen byggjer `client/dist`, kopierer `index.html` til `404.html`
for SPA/deeplink-fallback, og publiserer `client/dist` til `gh-pages`-branchen.

Etterpå må GitHub Pages vere sett til:

- Source: Deploy from a branch
- Branch: `gh-pages`
- Folder: `/ (root)`

Frontend-URL:

```text
https://johvik17.github.io/VM-tippeside/
```

## Funksjonar i MVP

- Registrering og innlogging
- Kampoversikt med tipseskjema
- Låsing av tips 10 minutt før kampstart
- Adminside for å legge inn kampar og sluttresultat
- Automatisk poengutrekning
- Automatisk resultatoppdatering via backend-jobb
- Leaderboard med rangering
