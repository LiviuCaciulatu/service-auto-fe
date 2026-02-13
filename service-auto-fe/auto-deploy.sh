#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.deployment"
export AWS_PAGER=""

COLOR_RED="\033[31m"; COLOR_GRN="\033[32m"; COLOR_BLU="\033[34m"; COLOR_RST="\033[0m"
ts(){ date +"%Y-%m-%d %H:%M:%S"; }
log(){ echo -e "${COLOR_BLU}[$(ts)]${COLOR_RST} $*"; }
ok(){ echo -e "${COLOR_GRN}[$(ts)] OK${COLOR_RST} $*"; }
die(){ echo -e "${COLOR_RED}[$(ts)] ERROR${COLOR_RST} $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }

[[ -f "${ENV_FILE}" ]] || die "Missing .env.deployment."
set -a; # shellcheck disable=SC1091
source "${ENV_FILE}"; set +a

need aws; need pnpm

AWS_REGION="${AWS_REGION:-eu-central-1}"
MODE="${MODE:-production}"
DIST_DIR="${DIST_DIR:-dist}"
ASSETS_PREFIX="${ASSETS_PREFIX:-assets}"
aws_region_arg=(--region "${AWS_REGION}")

req(){ [[ -n "${!1:-}" ]] || die "Missing required env key: $1 (paste init outputs into .env.deployment)."; }
req S3_BUCKET_NAME
req CF_DISTRIBUTION_ID
req CF_OAC_ID
req CF_RESPONSE_HEADERS_POLICY_ID
req CF_CACHE_POLICY_DEFAULT_ID
req CF_CACHE_POLICY_ASSETS_ID

log "Gate: running validate"
# IMPORTANT: run via bash so it works even if validate is not chmod +x
/usr/bin/env bash "${ROOT_DIR}/auto-deploy-validate.sh"

log "Build: pnpm run build:${MODE}"
pnpm -s run "build:${MODE}"
[[ -d "${ROOT_DIR}/${DIST_DIR}" ]] || die "Build output not found: ${DIST_DIR}/"
ok "Build: complete (${DIST_DIR}/)"

log "Deploy: upload hashed assets (${ASSETS_PREFIX}/*) long cache immutable"
aws s3 sync "${DIST_DIR}" "s3://${S3_BUCKET_NAME}" --delete \
  --exclude "*" --include "${ASSETS_PREFIX}/*" \
  --cache-control "public,max-age=31536000,immutable" \
  "${aws_region_arg[@]}" >/dev/null
ok "Deploy: assets uploaded"

log "Deploy: upload non-assets short cache"
aws s3 sync "${DIST_DIR}" "s3://${S3_BUCKET_NAME}" --delete \
  --exclude "${ASSETS_PREFIX}/*" \
  --cache-control "public,max-age=60" \
  "${aws_region_arg[@]}" >/dev/null
ok "Deploy: non-assets uploaded"

log "Deploy: force index.html no-cache"
aws s3 cp "${DIST_DIR}/index.html" "s3://${S3_BUCKET_NAME}/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html; charset=utf-8" \
  "${aws_region_arg[@]}" >/dev/null
ok "Deploy: index.html updated"

log "CloudFront: invalidate /index.html and /"
aws cloudfront create-invalidation --distribution-id "${CF_DISTRIBUTION_ID}" \
  --paths "/index.html" "/" >/dev/null
ok "CloudFront: invalidation created"

domain="$(aws cloudfront get-distribution --id "${CF_DISTRIBUTION_ID}" --query "Distribution.DomainName" --output text)"
ok "DEPLOY complete ✅  https://${domain}"