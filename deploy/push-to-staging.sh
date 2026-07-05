#!/bin/bash
# SalesOS — deploy to the staging EC2 host (63.184.103.26).
# Run from the salesos/ directory: bash deploy/push-to-staging.sh
set -euo pipefail

HOST=63.184.103.26
KEY=~/.ssh/salesos-key.pem
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ubuntu@$HOST"

echo "==> 1/5 uploading code..."
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude .next --exclude dist --exclude .turbo --exclude .env \
  ./ ubuntu@$HOST:/opt/salesos/app/

echo "==> 2/5 preparing server secrets (/opt/salesos/.env)..."
get() { grep "^$1=" .env | cut -d= -f2-; }
if $SSH 'test -s /opt/salesos/.env'; then
  echo "    server .env exists — upserting provider keys from local .env"
else
  PGPASS=$(openssl rand -hex 16)
  $SSH "cat > /opt/salesos/.env && chmod 600 /opt/salesos/.env" <<EOF
DATABASE_URL=postgresql://salesos:$PGPASS@postgres:5432/salesos
POSTGRES_PASSWORD=$PGPASS
JWT_SECRET=$(openssl rand -hex 32)
SEED_ADMIN_PASSWORD=$(get SEED_ADMIN_PASSWORD)
EOF
fi
# Upsert integration/provider keys from the local .env on every deploy so new
# credentials (Canva, Google, Meta, CEO number) propagate to the host.
for K in ANTHROPIC_API_KEY META_APP_ID META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN \
         WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN CEO_WHATSAPP_NUMBER \
         CANVA_CLIENT_ID CANVA_CLIENT_SECRET CANVA_REDIRECT \
         GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REDIRECT; do
  V=$(get "$K"); [ -z "$V" ] && continue
  $SSH "grep -q '^$K=' /opt/salesos/.env && sed -i 's|^$K=.*|$K=$V|' /opt/salesos/.env || echo '$K=$V' >> /opt/salesos/.env"
done

echo "==> 3/5 building containers (first time takes ~5-10 min)..."
$SSH 'cd /opt/salesos/app && sudo docker compose --env-file /opt/salesos/.env -f deploy/docker-compose.prod.yml build'

echo "==> 4/5 running migrations + seed..."
$SSH 'cd /opt/salesos/app && sudo docker compose --env-file /opt/salesos/.env -f deploy/docker-compose.prod.yml run --rm migrate'

echo "==> 5/5 starting services..."
$SSH 'cd /opt/salesos/app && sudo docker compose --env-file /opt/salesos/.env -f deploy/docker-compose.prod.yml up -d postgres api web caddy'

echo ""
echo "✅ Deploy complete. Check: https://app.secretofsaleschat.org (after DNS)"
$SSH 'cd /opt/salesos/app && sudo docker compose --env-file /opt/salesos/.env -f deploy/docker-compose.prod.yml ps'
