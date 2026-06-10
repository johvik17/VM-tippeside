export function outcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "HOME";
  if (homeGoals < awayGoals) return "AWAY";
  return "DRAW";
}

export function calculatePredictionPoints(prediction, match) {
  if (match.home_score === null || match.away_score === null) {
    return 0;
  }

  const actualOutcome = outcomeFromScore(match.home_score, match.away_score);
  const outcomePoints = prediction.outcome === actualOutcome ? 1 : 0;

  const exactPoints =
    prediction.predicted_home_goals === match.home_score &&
    prediction.predicted_away_goals === match.away_score
      ? 2
      : 0;

  return outcomePoints + exactPoints;
}

const xiFields = [
  "goalkeeper",
  "left_back",
  "center_back1",
  "center_back2",
  "right_back",
  "midfielder1",
  "midfielder2",
  "midfielder3",
  "left_wing",
  "striker",
  "right_wing"
];

export function calculateExtraPredictionPoints(prediction, result) {
  if (!prediction || !result) return 0;

  let points = 0;

  if (sameText(prediction.predicted_winner_team, result.winner_team)) {
    points += 10;
  }

  if (
    sameText(prediction.predicted_top_scorer_name, result.top_scorer_name) &&
    sameText(prediction.predicted_top_scorer_team, result.top_scorer_team)
  ) {
    points += 10;
  }

  for (const field of xiFields) {
    if (sameText(prediction[field], result[field])) {
      points += 2;
    }
  }

  return Math.min(points, 42);
}

function sameText(left, right) {
  if (!left || !right) return false;
  return normalizeText(left) === normalizeText(right);
}

function normalizeText(value) {
  return String(value).trim().toLocaleLowerCase("nb-NO");
}
