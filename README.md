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

Backenden opprettar tabellane automatisk ved oppstart:

- `users`
- `matches`
- `predictions`

Den seedar også admin/demo-brukarar og VM 2026 gruppespelkampar dersom databasen
er tom.

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
- Leaderboard med rangering
