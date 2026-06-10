#!/bin/bash
# Create a mock match using the API

API_URL="http://localhost:4000/api"

# You'll need to replace these with your actual admin token
# Log in first as admin, then use the token from localStorage

read -p "Enter your admin JWT token (from browser localStorage vmTippeToken): " TOKEN

# Today's date
DATE=$(date +%Y-%m-%d)

# Create match with kickoff at 20:00 local time (locks at 19:50)
curl -X POST "$API_URL/admin/matches" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"homeTeam\": \"Test Home\",
    \"awayTeam\": \"Test Away\",
    \"date\": \"$DATE\",
    \"localTime\": \"20:00\",
    \"stadium\": \"Test Stadium\",
    \"city\": \"Oslo\",
    \"groupName\": \"Test Group\"
  }"

echo ""
echo "✅ Match created! It will lock at 19:50 (10 minutes before kickoff)"
