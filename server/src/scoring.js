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
  const outcomePoints = prediction.outcome === actualOutcome ? 3 : 0;

  const exactPoints =
    prediction.predicted_home_goals === match.home_score &&
    prediction.predicted_away_goals === match.away_score
      ? 2
      : 0;

  return outcomePoints + exactPoints;
}
