# VM-TIPPE

Ein fungerande MVP for VM-tipping.

## Teknologi

- React + Vite for frontend
- Express for backend
- SQLite via `better-sqlite3`
- JWT-basert innlogging

## Kom i gang

```bash
npm install
npm run dev
```

Frontend køyrer som standard på `http://localhost:5173`.
Backend køyrer på `http://localhost:4000`.

Etter `npm run build` kan backend også vise den bygde nettsida på
`http://localhost:4000`.

## Testbrukarar

Seed-data blir oppretta automatisk første gong serveren startar.

- Admin: `admin` / `admin123`
- Brukar: `demo` / `demo123`

## GitHub Pages

GitHub Pages kan berre køyre den statiske frontend-delen. Express-backenden må
hostast separat, til dømes på Render, Railway, Fly.io eller ein VPS.

Frontend er konfigurert med Vite-base `/VM-tippeside/`, som passar repoet
`johvik17/VM-tippeside`.

Sett API-adressa før deploy dersom backend ligg ein annan stad enn lokalt:

```bash
$env:VITE_API_URL="https://din-backend.example.com/api"
npm run deploy
```

Deploy-kommandoen byggjer `client/dist`, kopierer `index.html` til `404.html`
for SPA/deeplink-fallback, og publiserer `client/dist` til `gh-pages`-branchen.

## Funksjonar i MVP

- Registrering og innlogging
- Kampoversikt med tipseskjema
- Låsing av tips 10 minutt før kampstart
- Adminside for å legge inn kampar og sluttresultat
- Automatisk poengutrekning
- Leaderboard med rangering
