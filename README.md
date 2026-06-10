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

## Funksjonar i MVP

- Registrering og innlogging
- Kampoversikt med tipseskjema
- Låsing av tips etter kampstart
- Adminside for å legge inn kampar og sluttresultat
- Automatisk poengutrekning
- Leaderboard med rangering
