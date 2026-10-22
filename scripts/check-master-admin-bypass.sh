#!/bin/bash
# check-master-admin-bypass.sh: can the master-realm admin (the IT operator's credential) grant
# release rights on the governed realm WITHOUT the council quorum?
#
# The master realm is exempt from IGA. This checks whether that reaches into the SealedExam realm.
# It asks TideCloak to give quang (it-operator) exam-releaser + _tide_decryptor using the master
# admin token from .env, then reports what TideCloak did:
#
#   202  governed: TideCloak filed a change request instead. The script denies it again.
#   204  applied directly: the master admin bypassed IGA. Then sign in as quang, refresh, and try to
#        open the paper. If the Tide network still refuses, the bypass changed a database row but
#        not what the network will release. Revert with: --revert
#
# Usage: bash scripts/check-master-admin-bypass.sh [--revert]
# Run after `npm run init` has finished. Requires curl and jq.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$PROJECT_DIR/.env" ] && { set -a; . "$PROJECT_DIR/.env"; set +a; }
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set it in .env}"
TIDECLOAK_URL="${TIDECLOAK_URL:-http://localhost:8080}"
REALM_NAME="${REALM_NAME:-$(jq -r .realm "$PROJECT_DIR/data/tidecloak.json")}"
TARGET_USER="${TARGET_USER:-quang}"
ROLES=(exam-releaser _tide_decryptor)

get_token() {
  curl -s -X POST "$TIDECLOAK_URL/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" -d "grant_type=password" \
    --data-urlencode "username=${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" \
    --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" | jq -r '.access_token'
}
api() { curl -s -H "Authorization: Bearer $(get_token)" "$@"; }

UID_=$(api "$TIDECLOAK_URL/admin/realms/$REALM_NAME/users?username=$TARGET_USER&exact=true" | jq -r '.[0].id')
[ -n "$UID_" ] && [ "$UID_" != "null" ] || { echo "User $TARGET_USER not found in $REALM_NAME" >&2; exit 1; }

ROLES_JSON="[$(for r in "${ROLES[@]}"; do api "$TIDECLOAK_URL/admin/realms/$REALM_NAME/roles/$r"; echo ,; done | sed '$ s/,$//')]"
MAPPING_URL="$TIDECLOAK_URL/admin/realms/$REALM_NAME/users/$UID_/role-mappings/realm"

if [ "${1:-}" = "--revert" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$MAPPING_URL" \
    -H "Authorization: Bearer $(get_token)" -H "Content-Type: application/json" -d "$ROLES_JSON")
  echo "Revoke ${ROLES[*]} from $TARGET_USER: HTTP $CODE (202 = filed as a change request, needs the council)"
  exit 0
fi

echo "Master admin grants ${ROLES[*]} to $TARGET_USER in realm $REALM_NAME..."
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$MAPPING_URL" \
  -H "Authorization: Bearer $(get_token)" -H "Content-Type: application/json" -d "$ROLES_JSON")
echo "TideCloak answered HTTP $CODE"

case "$CODE" in
  202)
    echo "RESULT: governed. The master admin could not grant release rights alone; a change request was filed."
    CR=$(api "$TIDECLOAK_URL/admin/realms/$REALM_NAME/iga/change-requests?status=PENDING" \
      | jq -r --arg u "$UID_" '[.[] | select(.actionType=="GRANT_ROLES") | select(tostring | contains($u))] | last | .id // empty')
    if [ -n "$CR" ]; then
      DENY=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$TIDECLOAK_URL/admin/realms/$REALM_NAME/iga/change-requests/$CR/deny" \
        -H "Authorization: Bearer $(get_token)" -H "Content-Type: application/json" -d '{"reason":"bypass check"}')
      echo "Denied the test change request ${CR:0:8}: HTTP $DENY"
    fi
    ;;
  204|200)
    echo "RESULT: applied directly. The master admin bypassed the council quorum at the TideCloak layer."
    echo "NEXT: sign in as $TARGET_USER, refresh the session and try to open the paper."
    echo "      Record whether the Tide network refuses, then run: bash $0 --revert"
    ;;
  *)
    echo "RESULT: unexpected answer. Check the TideCloak log: docker logs tidecloak | tail -50"
    ;;
esac
