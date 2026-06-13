import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Crown,
  Flame,
  LogOut,
  Medal,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  UserRound
} from "lucide-react";
import { apiRequest } from "./api.js";

const emptyMatchForm = {
  matchNumber: "",
  homeTeam: "",
  awayTeam: "",
  date: "",
  localTime: "",
  stadium: "",
  city: "",
  groupName: "",
  stage: "Group Stage"
};

const emptyExtraTip = {
  predictedWinnerTeam: "",
  predictedTopScorerName: "",
  predictedTopScorerTeam: "",
  goalkeeper: "",
  leftBack: "",
  centerBack1: "",
  centerBack2: "",
  rightBack: "",
  midfielder1: "",
  midfielder2: "",
  midfielder3: "",
  leftWing: "",
  striker: "",
  rightWing: ""
};

const emptyExtraResult = {
  winnerTeam: "",
  topScorerName: "",
  topScorerTeam: "",
  goalkeeper: "",
  leftBack: "",
  centerBack1: "",
  centerBack2: "",
  rightBack: "",
  midfielder1: "",
  midfielder2: "",
  midfielder3: "",
  leftWing: "",
  striker: "",
  rightWing: ""
};

const tournamentXiFields = [
  ["goalkeeper", "Keeper"],
  ["leftBack", "Venstreback"],
  ["centerBack1", "Midtstopper 1"],
  ["centerBack2", "Midtstopper 2"],
  ["rightBack", "Høyreback"],
  ["midfielder1", "Midtbane 1"],
  ["midfielder2", "Midtbane 2"],
  ["midfielder3", "Midtbane 3"],
  ["leftWing", "Venstre ving"],
  ["striker", "Spiss"],
  ["rightWing", "Høyre ving"]
];

const teamFlagCodes = {
  Algeria: "DZ",
  Argentina: "AR",
  Australia: "AU",
  Austria: "AT",
  Belgium: "BE",
  "Bosnia and Herzegovina": "BA",
  Brazil: "BR",
  Canada: "CA",
  "Cape Verde": "CV",
  Colombia: "CO",
  "Congo DR": "CD",
  Croatia: "HR",
  "Curaçao": "CW",
  Czechia: "CZ",
  Ecuador: "EC",
  Egypt: "EG",
  England: "GB",
  France: "FR",
  Germany: "DE",
  Ghana: "GH",
  Haiti: "HT",
  Iran: "IR",
  Iraq: "IQ",
  "Ivory Coast": "CI",
  Japan: "JP",
  Jordan: "JO",
  Mexico: "MX",
  Morocco: "MA",
  Netherlands: "NL",
  "New Zealand": "NZ",
  Norway: "NO",
  Panama: "PA",
  Paraguay: "PY",
  Portugal: "PT",
  Qatar: "QA",
  "Saudi Arabia": "SA",
  Scotland: "GB",
  Senegal: "SN",
  "South Africa": "ZA",
  "South Korea": "KR",
  Spain: "ES",
  Sweden: "SE",
  Switzerland: "CH",
  Tunisia: "TN",
  "Türkiye": "TR",
  Uruguay: "UY",
  USA: "US",
  Uzbekistan: "UZ"
};

function flagForTeam(name) {
  const code = teamFlagCodes[name];
  if (!code) return String.fromCodePoint(0x2691);
  return code
    .toUpperCase()
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export function App() {
  const [user, setUser] = useState(readStoredUser);
  const [view, setView] = useState("matches");
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [extraPrediction, setExtraPrediction] = useState(null);
  const [extraResult, setExtraResult] = useState(null);
  const [extraLock, setExtraLock] = useState(null);
  const [publicExtraPredictions, setPublicExtraPredictions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const predictionsByMatch = useMemo(() => {
    return Object.fromEntries(predictions.map((prediction) => [prediction.matchId, prediction]));
  }, [predictions]);

  const nextMatch = useMemo(() => {
    const now = Date.now();
    return matches
      .filter((match) => new Date(match.kickoffAtUtc || match.startTime).getTime() > now)
      .sort((a, b) => new Date(a.kickoffAtUtc || a.startTime) - new Date(b.kickoffAtUtc || b.startTime))[0];
  }, [matches]);

  const hasLiveMatch = useMemo(() => matches.some((match) => match.status === "LIVE"), [matches]);

  const refreshLiveData = useCallback(async () => {
    try {
      const [matchesData, leaderboardData] = await Promise.all([
        apiRequest("/matches"),
        apiRequest("/leaderboard")
      ]);
      setMatches(matchesData.matches);
      setLeaderboard(leaderboardData.leaderboard);
    } catch (error) {
      setMessage(error.message);
    }
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [matchesData, predictionsData, extraData, leaderboardData] = await Promise.all([
        apiRequest("/matches"),
        apiRequest("/predictions/me"),
        apiRequest("/extra-predictions/me"),
        apiRequest("/leaderboard")
      ]);
      setMatches(matchesData.matches);
      setPredictions(predictionsData.predictions);
      setExtraPrediction(extraData.prediction);
      setExtraResult(extraData.result);
      setExtraLock(extraData.lock);
      setLeaderboard(leaderboardData.leaderboard);

      if (extraData.lock?.isLocked) {
        const publicData = await apiRequest("/extra-predictions");
        setPublicExtraPredictions(publicData.predictions);
      } else {
        setPublicExtraPredictions([]);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [refreshData, user]);

  useEffect(() => {
    if (!user) return undefined;

    const intervalMs = hasLiveMatch ? 15000 : matches.length > 0 ? 60000 : 30000;
    const timerId = window.setInterval(() => {
      refreshLiveData();
    }, intervalMs);

    return () => window.clearInterval(timerId);
  }, [hasLiveMatch, matches.length, refreshLiveData, user]);

  function handleAuth({ token, user: nextUser }) {
    localStorage.setItem("vmTippeToken", token);
    localStorage.setItem("vmTippeUser", JSON.stringify(nextUser));
    setUser(nextUser);
    setView("matches");
  }

  function logout() {
    localStorage.removeItem("vmTippeToken");
    localStorage.removeItem("vmTippeUser");
    setUser(null);
    setMatches([]);
    setPredictions([]);
    setExtraPrediction(null);
    setExtraResult(null);
    setExtraLock(null);
    setPublicExtraPredictions([]);
    setLeaderboard([]);
  }

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return (
    <div className="app-shell">
      <Hero user={user} nextMatch={nextMatch} onLogout={logout} />

      <NavBar view={view} setView={setView} isAdmin={user.role === "ADMIN"} />
      <div className="live-update-indicator" role="status">
        <span aria-hidden="true">●</span>
        Live updates enabled
      </div>

      {message && (
        <div className="notice" role="status">
          {message}
          <button onClick={() => setMessage("")}>Lukk</button>
        </div>
      )}

      {loading && <p className="loading-line">Laster VM-data...</p>}

      {view === "matches" && (
        <MatchOverview
          matches={matches}
          predictionsByMatch={predictionsByMatch}
          onSaved={async () => {
            setMessage("Tipset er lagret.");
            await refreshData();
          }}
          onError={setMessage}
        />
      )}
      {view === "leaderboard" && <Leaderboard rows={leaderboard} />}
      {view === "myTips" && <MyTips matches={matches} predictionsByMatch={predictionsByMatch} />}
      {view === "extraTips" && (
        <ExtraTipsPage
          prediction={extraPrediction}
          result={extraResult}
          lock={extraLock}
          publicPredictions={publicExtraPredictions}
          onSaved={async () => {
            setMessage("Ekstra tips er lagret.");
            await refreshData();
          }}
          onError={setMessage}
        />
      )}
      {view === "friends" && <FriendsPanel />}
      {view === "admin" && user.role === "ADMIN" && (
        <AdminPage matches={matches} extraResult={extraResult} onChanged={refreshData} onError={setMessage} />
      )}
    </div>
  );
}

function Hero({ user, nextMatch, onLogout }) {
  return (
    <header className="hero">
      <div className="hero-content">
        <div className="world-cup-mark">
          <Trophy size={28} />
        </div>
        <p className="eyebrow">World Cup 2026</p>
        <h1>VM 2026 Tippekonkurranse</h1>
        <p className="hero-subtitle">Tipp kampene. Konkurrer med vennene dine.</p>
        <div className="hero-stats">
          <div>
            <span>Neste kamp</span>
            <strong>{nextMatch ? `${nextMatch.homeTeam} - ${nextMatch.awayTeam}` : "Ingen kamper"}</strong>
          </div>
          <div>
            <span>Avspark</span>
            <strong>{nextMatch ? formatNorwegianKickoff(nextMatch) : "-"}</strong>
          </div>
        </div>
      </div>
      <div className="hero-user">
        <UserRound size={18} />
        <span>{user.username}</span>
        {user.role === "ADMIN" && <strong>Admin</strong>}
        <button className="icon-button" onClick={onLogout} title="Logg ut">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function NavBar({ view, setView, isAdmin }) {
  const items = [
    ["matches", "Kamper", Trophy],
    ["leaderboard", "Leaderboard", Medal],
    ["myTips", "Mine tips", ClipboardList],
    ["extraTips", "Ekstra tips", Sparkles],
    ["friends", "Info", Users]
  ];

  if (isAdmin) items.push(["admin", "Admin", ShieldCheck]);

  return (
    <nav className="tabs" aria-label="Hovednavigasjon">
      {items.map(([id, label, Icon]) => (
        <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function readStoredUser() {
  const raw = localStorage.getItem("vmTippeUser");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem("vmTippeUser");
    localStorage.removeItem("vmTippeToken");
    return null;
  }
}

function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await apiRequest(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="world-cup-mark">
          <Trophy size={26} />
        </div>
        <p className="eyebrow">Familiens VM-Tippekonkurranse</p>
        <h1>{mode === "login" ? "Logg inn" : "Registrer bruker"}</h1>
        <form onSubmit={submit} className="stack">
          <label>
            Brukernavn
            <input value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label>
            Passord
            <input
              type="password"
              value={password}
              minLength={mode === "register" ? 6 : 1}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Vent litt..." : mode === "login" ? "Logg inn" : "Opprett bruker"}
          </button>
        </form>
        <button className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Ny bruker? Registrer deg" : "Har du bruker? Logg inn"}
        </button>
        {mode === "login" && (
          <p className="auth-help">Glemt passord? Kontakt admin for nytt midlertidig passord.</p>
        )}
      </section>
    </main>
  );
}

function MatchOverview({ matches, predictionsByMatch, onSaved, onError }) {
  const matchDates = useMemo(() => {
    return [...new Set(matches.map(getOsloDate))].sort();
  }, [matches]);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    if (matchDates.length === 0) return;
    setSelectedDate((current) => current || pickDefaultMatchDate(matchDates));
  }, [matchDates]);

  const activeDate = selectedDate || matchDates[0];
  const selectedIndex = Math.max(0, matchDates.indexOf(activeDate));
  const matchesForDate = matches.filter((match) => getOsloDate(match) === activeDate);
  const tippedCount = matchesForDate.filter((match) => predictionsByMatch[match.id]).length;
  const missingCount = matchesForDate.length - tippedCount;
  const liveCount = matchesForDate.filter(isLiveMatch).length;

  function goToDate(offset) {
    const nextIndex = Math.min(matchDates.length - 1, Math.max(0, selectedIndex + offset));
    setSelectedDate(matchDates[nextIndex]);
  }

  function goToToday() {
    setSelectedDate(pickDefaultMatchDate(matchDates));
  }

  if (matchDates.length === 0) {
    return <p className="muted">Ingen kamper er lagt inn enna.</p>;
  }

  return (
    <main className="daily-view">
      <section className="day-toolbar">
        <button className="secondary-button" onClick={() => goToDate(-1)} disabled={selectedIndex === 0}>
          <ChevronLeft size={18} />
          Forrige dag
        </button>
        <div>
          <p className="eyebrow">Dagens kamper</p>
          <h2>{formatDisplayDate(activeDate)}</h2>
        </div>
        <button className="secondary-button" onClick={goToToday}>I dag</button>
        <button className="secondary-button" onClick={() => goToDate(1)} disabled={selectedIndex === matchDates.length - 1}>
          Neste dag
          <ChevronRight size={18} />
        </button>
      </section>

      <div className="date-strip" aria-label="Velg dato">
        {matchDates.map((date) => (
          <button key={date} className={date === activeDate ? "active" : ""} onClick={() => setSelectedDate(date)}>
            {formatShortDate(date)}
          </button>
        ))}
      </div>

      <section className="day-summary">
        <SummaryItem label="Kamper" value={matchesForDate.length} icon={CalendarDays} />
        <SummaryItem label="Tippet" value={tippedCount} icon={Sparkles} />
        <SummaryItem label="Mangler" value={missingCount} icon={Clock3} />
        <SummaryItem label="Live" value={liveCount} icon={Flame} />
      </section>

      <section className="content-grid fade-in">
        {matchesForDate.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            prediction={predictionsByMatch[match.id]}
            onSaved={onSaved}
            onError={onError}
          />
        ))}
      </section>
    </main>
  );
}

function SummaryItem({ label, value, icon: Icon }) {
  return (
    <div>
      {Icon && <Icon size={18} />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function outcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

function MatchCard({ match, prediction, onSaved, onError }) {
  const [homeGoals, setHomeGoals] = useState(prediction?.predictedHomeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(prediction?.predictedAwayGoals ?? 0);
  const [publicPredictions, setPublicPredictions] = useState([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const isLocked = match.isLocked;
  const isFinished = match.status === "FINISHED";
  const isLive = isLiveMatch(match);
  const statusLabel = isFinished ? "Ferdig" : isLive ? "Live" : isLocked ? "Låst" : "Åpen";
  const statusClass = isFinished ? "done" : isLive ? "live" : isLocked ? "locked" : "open";

  useEffect(() => {
    setHomeGoals(prediction?.predictedHomeGoals ?? 0);
    setAwayGoals(prediction?.predictedAwayGoals ?? 0);
  }, [prediction]);

  useEffect(() => {
    if (!isLocked) {
      setPublicPredictions([]);
      return;
    }

    let ignore = false;
    setPublicLoading(true);
    apiRequest(`/matches/${match.id}/predictions`)
      .then((data) => {
        if (!ignore) setPublicPredictions(data.predictions);
      })
      .catch((error) => {
        if (!ignore) onError(error.message);
      })
      .finally(() => {
        if (!ignore) setPublicLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [isLocked, match.id, onError]);

  async function savePrediction(event) {
    event.preventDefault();
    try {
      const calculatedOutcome = outcomeFromScore(Number(homeGoals), Number(awayGoals));
      await apiRequest("/predictions", {
        method: "POST",
        body: JSON.stringify({
          matchId: match.id,
          outcome: calculatedOutcome,
          predictedHomeGoals: Number(homeGoals),
          predictedAwayGoals: Number(awayGoals)
        })
      });
      onSaved();
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <article className={`match-card ${prediction?.points === 3 ? "perfect-score" : ""}`}>
      <div className="match-card-top">
        <span>#{match.matchNumber} - Gruppe {match.groupName || "VM"}</span>
        <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="kickoff-row">
        <Clock3 size={16} />
        <span>{formatNorwegianKickoff(match)}</span>
        <strong>Norsk tid</strong>
      </div>

      <div className="teams-row">
        <TeamBlock name={match.homeTeam} />
        <span className="vs-chip">VS</span>
        <TeamBlock name={match.awayTeam} align="right" />
      </div>

      <p className="venue-line">
        {match.stadium}
        {match.city ? `, ${match.city}` : ""}
      </p>

      <div className="score-line">
        {match.homeScore !== null && match.awayScore !== null && (
          <strong>
            Sluttresultat: {match.homeScore}-{match.awayScore}
          </strong>
        )}
        {prediction && <span>{prediction.points} poeng</span>}
      </div>

      {prediction && (
        <p className="own-prediction">
          Ditt tips: {outcomeLabel(prediction.outcome)} - {prediction.predictedHomeGoals}-{prediction.predictedAwayGoals}
        </p>
      )}

      <form className="prediction-form" onSubmit={savePrediction}>
        <div className="score-inputs">
          <label>
            <span className="score-team-label">
              <span className="score-flag">{flagForTeam(match.homeTeam)}</span>
              <span>{match.homeTeam}</span>
            </span>
            <input type="number" min="0" max="30" value={homeGoals} disabled={isLocked} onChange={(event) => setHomeGoals(event.target.value)} />
          </label>
          <label>
            <span className="score-team-label">
              <span className="score-flag">{flagForTeam(match.awayTeam)}</span>
              <span>{match.awayTeam}</span>
            </span>
            <input type="number" min="0" max="30" value={awayGoals} disabled={isLocked} onChange={(event) => setAwayGoals(event.target.value)} />
          </label>
        </div>
        <button className="primary-button premium-button" disabled={isLocked}>
          {isLocked ? "Se tips" : prediction ? "Endre tips" : "Tipp"}
        </button>
      </form>

      {isLocked && <PublicPredictionsTable predictions={publicPredictions} loading={publicLoading} />}
    </article>
  );
}

function TeamBlock({ name, align }) {
  return (
    <div className={`team-block ${align === "right" ? "right" : ""}`}>
      <span className="flag">{flagForTeam(name)}</span>
      <strong>{name}</strong>
    </div>
  );
}

function PublicPredictionsTable({ predictions, loading }) {
  const totals = predictions.reduce(
    (acc, prediction) => {
      acc[prediction.outcome] = (acc[prediction.outcome] ?? 0) + 1;
      return acc;
    },
    { HOME: 0, DRAW: 0, AWAY: 0 }
  );
  const total = predictions.length || 1;

  if (loading) return <p className="muted">Laster offentlige tips...</p>;

  return (
    <div className="public-predictions">
      <h3>Alle tips</h3>
      <div className="vote-bars">
        {["HOME", "DRAW", "AWAY"].map((key) => (
          <div key={key}>
            <span>{key === "HOME" ? "H" : key === "DRAW" ? "U" : "B"}</span>
            <div><i style={{ width: `${(totals[key] / total) * 100}%` }} /></div>
            <strong>{totals[key]}</strong>
          </div>
        ))}
      </div>
      {predictions.length === 0 ? (
        <p className="muted">Ingen tips ble lagret for denne kampen.</p>
      ) : (
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Bruker</th>
                <th>HUB</th>
                <th>Resultat</th>
                <th>Sist endret</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((prediction) => (
                <tr key={prediction.id}>
                  <td>{prediction.username}</td>
                  <td>{outcomeLabel(prediction.outcome)}</td>
                  <td>{prediction.predictedHomeGoals}-{prediction.predictedAwayGoals}</td>
                  <td>{formatTimestamp(prediction.updatedAt || prediction.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Leaderboard({ rows }) {
  const podium = rows.slice(0, 3);
  const bestBonus = rows.reduce((best, row) => (row.bonusPoints > (best?.bonusPoints ?? -1) ? row : best), null);

  return (
    <main className="leaderboard-view">
      <section className="leaderboard-hero">
        <div>
          <p className="eyebrow">Konkurranse</p>
          <h2>Leaderboard</h2>
        </div>
        <div className="bonus-card">
          <Sparkles size={18} />
          <span>Flest bonuspoeng</span>
          <strong>{bestBonus?.username ?? "-"} - {bestBonus?.bonusPoints ?? 0}</strong>
        </div>
      </section>

      <section className="podium">
        {podium.map((row, index) => (
          <div key={row.userId} className={`podium-card place-${index + 1}`}>
            <span className="avatar">{row.username.slice(0, 1).toUpperCase()}</span>
            {index === 0 ? <Crown size={22} /> : <Medal size={22} />}
            <strong>{row.username}</strong>
            <b>{row.totalPoints} p</b>
            <small>{row.perfectTips ?? 0} perfekte tips</small>
          </div>
        ))}
      </section>

      <section className="table-panel">
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Rang</th>
                <th>Bruker</th>
                <th>Poeng</th>
                <th>Tips</th>
                <th>Perfekte</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>#{row.rank}</td>
                  <td><span className="table-avatar">{row.username.slice(0, 1).toUpperCase()}</span>{row.username}</td>
                  <td>{row.totalPoints}</td>
                  <td>{row.predictionsCount}</td>
                  <td>{row.perfectTips ?? 0}</td>
                  <td><TrendingUp size={16} className="trend-icon" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function MyTips({ matches, predictionsByMatch }) {
  const tippedMatches = matches.filter((match) => predictionsByMatch[match.id]);

  return (
    <main className="table-panel feature-panel">
      <p className="eyebrow">Mine tips</p>
      <h2>Dine lagrede tips</h2>
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Kamp</th>
              <th>Tid</th>
              <th>HUB</th>
              <th>Resultat</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tippedMatches.map((match) => {
              const prediction = predictionsByMatch[match.id];
              return (
                <tr key={match.id}>
                  <td>{flagForTeam(match.homeTeam)} {match.homeTeam} - {flagForTeam(match.awayTeam)} {match.awayTeam}</td>
                  <td>{formatNorwegianKickoff(match)}</td>
                  <td>{outcomeLabel(prediction.outcome)}</td>
                  <td>{prediction.predictedHomeGoals}-{prediction.predictedAwayGoals}</td>
                  <td>{match.isLocked ? "Låst" : "Åpen"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function ExtraTipsPage({ prediction, lock, publicPredictions, onSaved, onError }) {
  const [form, setForm] = useState(emptyExtraTip);
  const isLocked = Boolean(lock?.isLocked);

  useEffect(() => {
    setForm({ ...emptyExtraTip, ...(prediction ?? {}) });
  }, [prediction]);

  async function saveExtraTips(event) {
    event.preventDefault();
    try {
      await apiRequest("/extra-predictions/me", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await onSaved();
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <main className="extra-view">
      <section className="leaderboard-hero">
        <div>
          <p className="eyebrow">Bonusspill</p>
          <h2>Ekstra tips</h2>
          <p className="muted">
            {isLocked
              ? "Ekstra tips er låst. Alle brukeres tips er nå synlige."
              : `Kun for gøy. Teller ikke på leaderboardet. Frist${lock?.deadline ? `: ${formatTimestamp(lock.deadline)}` : "."}`}
          </p>
        </div>
        <div className={`status-pill ${isLocked ? "locked" : "open"}`}>{isLocked ? "Låst" : "Åpen"}</div>
      </section>

      <form className="extra-grid" onSubmit={saveExtraTips}>
        <section className="extra-card">
          <p className="eyebrow">10 moropoeng</p>
          <h3>Hvem vinner VM?</h3>
          <TeamTextInput
            label="VM-vinner"
            value={form.predictedWinnerTeam}
            disabled={isLocked}
            onChange={(value) => setForm({ ...form, predictedWinnerTeam: value })}
          />
        </section>

        <section className="extra-card">
          <p className="eyebrow">10 moropoeng</p>
          <h3>Hvem blir toppscorer?</h3>
          <label>
            Spiller
            <input
              value={form.predictedTopScorerName}
              disabled={isLocked}
              onChange={(event) => setForm({ ...form, predictedTopScorerName: event.target.value })}
              placeholder="F.eks. Erling Haaland"
            />
          </label>
          <TeamTextInput
            label="Landslag"
            value={form.predictedTopScorerTeam}
            disabled={isLocked}
            onChange={(value) => setForm({ ...form, predictedTopScorerTeam: value })}
          />
        </section>

        <section className="extra-card xi-card">
          <p className="eyebrow">2 moropoeng per spiller</p>
          <h3>Sett opp årets lag</h3>
          <p className="muted">Formasjon 4-3-3</p>
          <div className="xi-grid">
            {tournamentXiFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={form[key]}
                  disabled={isLocked}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  placeholder="Spillernavn"
                />
              </label>
            ))}
          </div>
        </section>

        <button className="primary-button premium-button" disabled={isLocked}>
          {prediction ? "Lagre endringer" : "Lagre ekstra tips"}
        </button>
      </form>

      {isLocked && (
        <section className="table-panel extra-public">
          <p className="eyebrow">Se alle tips</p>
          <h2>Alle ekstra tips</h2>
          {publicPredictions.length === 0 ? (
            <p className="muted">Ingen ekstra tips er lagret.</p>
          ) : (
            <div className="extra-public-grid">
              {publicPredictions.map((row) => (
                <article key={row.id} className="extra-public-card">
                  <div className="user-pill">
                    <span className="table-avatar">{row.username.slice(0, 1).toUpperCase()}</span>
                    <strong>{row.username}</strong>
                    <span>{row.points ?? 0} moropoeng</span>
                  </div>
                  <p><b>Vinner:</b> {withFlag(row.predictedWinnerTeam)}</p>
                  <p><b>Toppscorer:</b> {row.predictedTopScorerName || "-"} {row.predictedTopScorerTeam ? `(${withFlag(row.predictedTopScorerTeam)})` : ""}</p>
                  <details>
                    <summary>Årets lag</summary>
                    <div className="xi-list">
                      {tournamentXiFields.map(([key, label]) => (
                        <span key={key}><b>{label}:</b> {row[key] || "-"}</span>
                      ))}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function TeamTextInput({ label, value, disabled, onChange }) {
  return (
    <label>
      {label}
      <div className="team-input-wrap">
        <span>{value ? flagForTeam(value) : String.fromCodePoint(0x2691)}</span>
        <input
          list="team-options"
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Velg eller skriv land"
        />
      </div>
      <datalist id="team-options">
        {Object.keys(teamFlagCodes).map((team) => (
          <option key={team} value={team} />
        ))}
      </datalist>
    </label>
  );
}

function withFlag(team) {
  if (!team) return "-";
  return `${flagForTeam(team)} ${team}`;
}

function FriendsPanel() {
  return (
    <main className="feature-panel friends-panel">
      <div>
        <p className="eyebrow">Info</p>
        <h2>Slik fungerer VM-tippekonkurransen</h2>
      </div>

      <section className="info-section">
        <h3>Hvordan tipper du?</h3>
        <p>Gå til <strong>Kamper</strong> og velg datoen du vil tippe på. På hvert kampkort skriver du inn hvor mange mål du tror hvert lag scorer.</p>
        <ul>
          <li><strong>H</strong> betyr hjemmeseier.</li>
          <li><strong>U</strong> betyr uavgjort.</li>
          <li><strong>B</strong> betyr borteseier.</li>
        </ul>
        <p>Appen regner automatisk ut H, U eller B basert på resultatet du skriver inn.</p>
      </section>

      <section className="info-section">
        <h3>Poeng for kamptips</h3>
        <ul>
          <li><strong>1 poeng</strong> for riktig HUB-tips.</li>
          <li><strong>2 poeng</strong> for helt riktig resultat.</li>
          <li><strong>3 poeng maks</strong> per kamp.</li>
        </ul>
      </section>

      <section className="info-section">
        <h3>Når låses tipsene?</h3>
        <p>Hver kamp låses 10 minutter før kampstart. Etter låsing kan du ikke endre tipset ditt, men du kan se hva andre har tippet på den kampen.</p>
      </section>

      <section className="info-section">
        <h3>Ekstra tips</h3>
        <p><strong>Ekstra tips</strong> er et eget bonusspill for moro skyld. Moropoengene der påvirker ikke leaderboardet for kamptips.</p>
      </section>

      <section className="info-section">
        <h3>Hvor ser du resultatene?</h3>
        <p>I <strong>Mine tips</strong> ser du alle tipsene du har lagret. I <strong>Leaderboard</strong> ser du rangeringen basert på kamppoeng.</p>
      </section>
    </main>
  );
}
function AdminPage({ matches, extraResult, onChanged, onError }) {
  const [form, setForm] = useState(emptyMatchForm);
  const [scoreSyncTest, setScoreSyncTest] = useState(null);
  const [scoreSyncLoading, setScoreSyncLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [passwordsByUser, setPasswordsByUser] = useState({});
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    async function loadUsers() {
      try {
        const data = await apiRequest("/admin/users");
        setUsers(data.users ?? []);
      } catch (error) {
        onError(error.message);
      }
    }

    loadUsers();
  }, [onError]);

  async function refreshUsers() {
    try {
      const data = await apiRequest("/admin/users");
      setUsers(data.users ?? []);
    } catch (error) {
      onError(error.message);
    }
  }

  async function createMatch(event) {
    event.preventDefault();
    try {
      await apiRequest("/admin/matches", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          matchNumber: form.matchNumber ? Number(form.matchNumber) : null
        })
      });
      setForm(emptyMatchForm);
      await onChanged();
    } catch (error) {
      onError(error.message);
    }
  }

  async function testFootballApi(endpoint = "/admin/score-sync/test") {
    setScoreSyncLoading(true);
    try {
      const data = await apiRequest(endpoint);
      setScoreSyncTest(data);
    } catch (error) {
      onError(error.message);
    } finally {
      setScoreSyncLoading(false);
    }
  }

  async function resetUserPassword(userId) {
    setPasswordMessage("");
    try {
      await apiRequest(`/admin/users/${userId}/password`, {
        method: "PUT",
        body: JSON.stringify({ newPassword: passwordsByUser[userId] ?? "" })
      });
      setPasswordsByUser((current) => ({ ...current, [userId]: "" }));
      setPasswordMessage("Passordet er oppdatert.");
      await refreshUsers();
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <main className="admin-layout">
      <section className="admin-panel">
        <h2>
          <CalendarPlus size={20} />
          Ny kamp
        </h2>
        <form className="stack" onSubmit={createMatch}>
          <label>Kampnummer<input type="number" min="1" max="104" value={form.matchNumber} onChange={(event) => setForm({ ...form, matchNumber: event.target.value })} /></label>
          <label>Heimelag<input value={form.homeTeam} onChange={(event) => setForm({ ...form, homeTeam: event.target.value })} required /></label>
          <label>Bortelag<input value={form.awayTeam} onChange={(event) => setForm({ ...form, awayTeam: event.target.value })} required /></label>
          <label>Dato<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
          <label>Lokal tid<input type="time" value={form.localTime} onChange={(event) => setForm({ ...form, localTime: event.target.value })} required /></label>
          <label>Stadion<input value={form.stadium} onChange={(event) => setForm({ ...form, stadium: event.target.value })} /></label>
          <label>By<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
          <label>Gruppe<input value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} /></label>
          <label>Stage<input value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} /></label>
          <button className="primary-button">Legg til kamp</button>
        </form>
      </section>
      <section className="admin-panel">
        <h2>
          <ShieldCheck size={20} />
          Football API
        </h2>
        <p className="muted">Test score-sync uten å eksponere API-nøkkelen.</p>
        <button type="button" className="secondary-button" onClick={() => testFootballApi()} disabled={scoreSyncLoading}>
          {scoreSyncLoading ? "Tester..." : "Test Football API"}
        </button>
        <button type="button" className="secondary-button" onClick={() => testFootballApi("/admin/score-sync/raw-test")} disabled={scoreSyncLoading}>
          Raw API test
        </button>
      </section>
      <section className="admin-panel wide">
        <h2>
          <Users size={20} />
          Brukere og passord
        </h2>
        <p className="muted">Sett et nytt midlertidig passord hvis noen har glemt sitt. Passord vises aldri etter lagring.</p>
        {passwordMessage && <p className="success">{passwordMessage}</p>}
        <div className="user-admin-list">
          {users.map((user) => (
            <div className="user-admin-row" key={user.id}>
              <div>
                <strong>{user.username}</strong>
                <span>{user.role} | Opprettet {formatTimestamp(user.createdAt)}</span>
              </div>
              <input
                type="password"
                minLength={4}
                placeholder="Nytt midlertidig passord"
                value={passwordsByUser[user.id] ?? ""}
                onChange={(event) => setPasswordsByUser((current) => ({ ...current, [user.id]: event.target.value }))}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => resetUserPassword(user.id)}
                disabled={(passwordsByUser[user.id] ?? "").length < 4}
              >
                Sett nytt passord
              </button>
            </div>
          ))}
        </div>
      </section>
      <ExtraResultAdmin extraResult={extraResult} onChanged={onChanged} onError={onError} />
      <section className="admin-panel wide">
        <h2>Alle gruppespillkamper og resultat</h2>
        <div className="admin-match-list">
          {matches.map((match) => (
            <ResultRow key={match.id} match={match} onChanged={onChanged} onError={onError} />
          ))}
        </div>
      </section>
      {scoreSyncTest && (
        <div className="modal-backdrop" role="presentation" onClick={() => setScoreSyncTest(null)}>
          <section className="debug-modal" role="dialog" aria-modal="true" aria-label="Football API test" onClick={(event) => event.stopPropagation()}>
            <div className="debug-modal-header">
              <h2>Football API test</h2>
              <button className="icon-button" onClick={() => setScoreSyncTest(null)} aria-label="Lukk">X</button>
            </div>
            <pre>{JSON.stringify(scoreSyncTest, null, 2)}</pre>
          </section>
        </div>
      )}
    </main>
  );
}

function ExtraResultAdmin({ extraResult, onChanged, onError }) {
  const [form, setForm] = useState(emptyExtraResult);

  useEffect(() => {
    setForm({ ...emptyExtraResult, ...(extraResult ?? {}) });
  }, [extraResult]);

  async function saveExtraResult(event) {
    event.preventDefault();
    try {
      await apiRequest("/admin/extra-results", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      await onChanged();
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <section className="admin-panel">
      <h2>
        <Sparkles size={20} />
        Fasit ekstra tips
      </h2>
      <form className="stack" onSubmit={saveExtraResult}>
        <label>VM-vinner<input value={form.winnerTeam} onChange={(event) => setForm({ ...form, winnerTeam: event.target.value })} /></label>
        <label>Toppscorer<input value={form.topScorerName} onChange={(event) => setForm({ ...form, topScorerName: event.target.value })} /></label>
        <label>Toppscorer landslag<input value={form.topScorerTeam} onChange={(event) => setForm({ ...form, topScorerTeam: event.target.value })} /></label>
        <div className="xi-grid admin-xi-grid">
          {tournamentXiFields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            </label>
          ))}
        </div>
        <button className="primary-button">Lagre fasit</button>
      </form>
    </section>
  );
}

function ResultRow({ match, onChanged, onError }) {
  const [homeScore, setHomeScore] = useState(match.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match.awayScore ?? 0);

  async function saveResult(event) {
    event.preventDefault();
    try {
      await apiRequest(`/admin/matches/${match.id}/result`, {
        method: "PUT",
        body: JSON.stringify({
          homeScore: Number(homeScore),
          awayScore: Number(awayScore)
        })
      });
      await onChanged();
    } catch (error) {
      onError(error.message);
    }
  }

  async function reopenMatch() {
    try {
      await apiRequest(`/admin/matches/${match.id}/reopen`, {
        method: "PUT"
      });
      await onChanged();
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <form className="result-row" onSubmit={saveResult}>
      <div>
        <strong>#{match.matchNumber} {match.homeTeam} - {match.awayTeam}</strong>
        <span>
          Gruppe {match.groupName} - {formatNorwegianKickoff(match)} norsk tid - {match.stadium}{match.city ? `, ${match.city}` : ""} - Status: {match.status}
        </span>
      </div>
      <input type="number" min="0" max="30" value={homeScore} onChange={(event) => setHomeScore(event.target.value)} />
      <input type="number" min="0" max="30" value={awayScore} onChange={(event) => setAwayScore(event.target.value)} />
      <button className="secondary-button">Lagre</button>
      <button type="button" className="secondary-button" onClick={reopenMatch}>
        Apne kamp
      </button>
    </form>
  );
}

function pickDefaultMatchDate(matchDates) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < matchDates[0]) return matchDates[0];
  return matchDates.find((date) => date >= today) ?? matchDates[matchDates.length - 1];
}

function outcomeLabel(outcome) {
  return {
    HOME: "Heimeseier",
    DRAW: "Uavgjort",
    AWAY: "Borteseier"
  }[outcome] ?? outcome;
}

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short"
  }).format(new Date(`${date}T12:00:00`));
}

function getOsloDate(match) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(match.kickoffAtUtc || match.startTime));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatNorwegianKickoff(match) {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(match.kickoffAtUtc || match.startTime));
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function isLiveMatch(match) {
  const kickoff = new Date(match.kickoffAtUtc || match.startTime).getTime();
  const now = Date.now();
  return now >= kickoff && now <= kickoff + 2 * 60 * 60 * 1000 && match.status !== "FINISHED";
}

