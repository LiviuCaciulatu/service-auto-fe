#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.deployment"
export AWS_PAGER=""

COLOR_RED="\033[31m"; COLOR_GRN="\033[32m"; COLOR_YLW="\033[33m"; COLOR_BLU="\033[34m"; COLOR_RST="\033[0m"
ts(){ date +"%Y-%m-%d %H:%M:%S"; }
log(){ echo -e "${COLOR_BLU}[$(ts)]${COLOR_RST} $*"; }
ok(){ echo -e "${COLOR_GRN}[$(ts)] OK${COLOR_RST} $*"; }
warn(){ echo -e "${COLOR_YLW}[$(ts)] WARN${COLOR_RST} $*"; }
die(){ echo -e "${COLOR_RED}[$(ts)] ERROR${COLOR_RST} $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }

[[ -f "${ENV_FILE}" ]] || die "Missing .env.deployment."
set -a; # shellcheck disable=SC1091
source "${ENV_FILE}"; set +a

need aws; need node

# Required
[[ -n "${CF_DISTRIBUTION_ID:-}" ]] || die "Missing CF_DISTRIBUTION_ID"
[[ -n "${PROJECT_SLUG:-}" ]] || die "Missing PROJECT_SLUG"
[[ -n "${CUSTOM_DOMAIN:-}" ]] || die "Missing CUSTOM_DOMAIN"
[[ -n "${ACM_CERT_ARN:-}" ]] || die "Missing ACM_CERT_ARN"
AWS_REGION="${AWS_REGION:-eu-central-1}"

AUTO_DNS="${AUTO_DNS:-no}"
AUTO_ACM_VALIDATE="${AUTO_ACM_VALIDATE:-no}"
ROUTE53_HOSTED_ZONE_ID="${ROUTE53_HOSTED_ZONE_ID:-}"
BLOCK_ORIGINAL_HOST="${BLOCK_ORIGINAL_HOST:-no}"

ACM_REGION="us-east-1" # CloudFront requires ACM certs in us-east-1

log "Auth: verifying AWS credentials"
aws sts get-caller-identity >/dev/null 2>&1 || die "AWS auth failed"
ok "Auth OK"

# ---- 1) Ensure ACM cert is ISSUED (or print validation records) --------------
log "ACM: checking certificate status (region ${ACM_REGION})"
cert_json="$(aws acm describe-certificate --region "${ACM_REGION}" --certificate-arn "${ACM_CERT_ARN}" --output json 2>/dev/null || true)"
[[ -n "${cert_json}" ]] || die "Cannot read ACM cert. Ensure ACM_CERT_ARN is correct and in us-east-1."

status="$(node -e "const j=${cert_json}; console.log(j.Certificate.Status||'')")"
ok "ACM status=${status}"

if [[ "${status}" != "ISSUED" ]]; then
  # Extract validation records
  records="$(node -e "
    const j=${cert_json};
    const opts=j.Certificate.DomainValidationOptions||[];
    const rr=opts.map(o=>o.ResourceRecord).filter(Boolean);
    console.log(JSON.stringify(rr));
  ")"
  if [[ "${AUTO_ACM_VALIDATE}" == "yes" ]]; then
    [[ -n "${ROUTE53_HOSTED_ZONE_ID}" ]] || die "AUTO_ACM_VALIDATE=yes requires ROUTE53_HOSTED_ZONE_ID"
    log "Route53: upserting ACM validation records (HOSTED_ZONE=${ROUTE53_HOSTED_ZONE_ID})"

    change_batch="$(CUSTOM_DOMAIN="${CUSTOM_DOMAIN}" node -e "
      const rr=${records};
      const Changes = rr.map(r => ({
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: r.Name,
          Type: r.Type,
          TTL: 60,
          ResourceRecords: [{ Value: r.Value }]
        }
      }));
      console.log(JSON.stringify({ Comment: 'ACM validation', Changes }));
    ")"

    aws route53 change-resource-record-sets \
      --hosted-zone-id "${ROUTE53_HOSTED_ZONE_ID}" \
      --change-batch "${change_batch}" >/dev/null
    ok "Route53: ACM validation records upserted"

    log "ACM: waiting for certificate to be ISSUED (can take minutes)"
    aws acm wait certificate-validated --region "${ACM_REGION}" --certificate-arn "${ACM_CERT_ARN}"
    ok "ACM: certificate validated (ISSUED)"
  else
    warn "ACM cert is not ISSUED yet. Create these DNS validation records, then rerun:"
    echo
    echo "=== ACM DNS validation records ==="
    node -e "const rr=${records}; rr.forEach(r=>console.log(`${r.Type}  ${r.Name}  ${r.Value}`));"
    echo "=================================="
    echo
    warn "If your DNS is in Route53, set AUTO_ACM_VALIDATE=yes and ROUTE53_HOSTED_ZONE_ID, then rerun."
    exit 0
  fi
fi

# ---- 2) Patch distribution: attach alias + cert + TLS ------------------------
log "CloudFront: attaching CUSTOM_DOMAIN + ACM cert + TLS policy"
ETAG="$(aws cloudfront get-distribution-config --id "${CF_DISTRIBUTION_ID}" --query ETag --output text)"
CFG="$(aws cloudfront get-distribution-config --id "${CF_DISTRIBUTION_ID}" --query DistributionConfig --output json)"

PATCHED_CFG="$(
  printf '%s' "$CFG" | node -e '
    const fs = require("fs");
    const cfg = JSON.parse(fs.readFileSync(0,"utf8"));

    const domain = process.env.CUSTOM_DOMAIN;
    const certArn = process.env.ACM_CERT_ARN;

    // Ensure alias present
    cfg.Aliases = cfg.Aliases || { Quantity: 0, Items: [] };
    const items = Array.isArray(cfg.Aliases.Items) ? cfg.Aliases.Items : [];
    if (!items.includes(domain)) items.push(domain);
    cfg.Aliases = { Quantity: items.length, Items: items };

    // Attach cert + TLS enforcement
    cfg.ViewerCertificate = {
      ACMCertificateArn: certArn,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021"
    };

    process.stdout.write(JSON.stringify(cfg));
  ' CUSTOM_DOMAIN="${CUSTOM_DOMAIN}" ACM_CERT_ARN="${ACM_CERT_ARN}"
)"
[[ -n "${PATCHED_CFG}" ]] || die "Patched distribution config is empty"

aws cloudfront update-distribution \
  --id "${CF_DISTRIBUTION_ID}" \
  --if-match "${ETAG}" \
  --distribution-config "${PATCHED_CFG}" >/dev/null

aws cloudfront wait distribution-deployed --id "${CF_DISTRIBUTION_ID}"
ok "CloudFront: domain/cert applied"

cf_domain="$(aws cloudfront get-distribution --id "${CF_DISTRIBUTION_ID}" --query "Distribution.DomainName" --output text)"
ok "CloudFront domain: ${cf_domain}"

# ---- 3) DNS automation (optional) --------------------------------------------
# CloudFront alias hosted zone id is fixed: Z2FDTNDATAQYW2 :contentReference[oaicite:1]{index=1}
CF_ALIAS_ZONE_ID="Z2FDTNDATAQYW2"

if [[ "${AUTO_DNS}" == "yes" ]]; then
  [[ -n "${ROUTE53_HOSTED_ZONE_ID}" ]] || die "AUTO_DNS=yes requires ROUTE53_HOSTED_ZONE_ID"

  log "Route53: upserting A/AAAA ALIAS ${CUSTOM_DOMAIN} -> ${cf_domain}"
  change_batch="$(CUSTOM_DOMAIN="${CUSTOM_DOMAIN}" CF_DOMAIN="${cf_domain}" CF_ALIAS_ZONE_ID="${CF_ALIAS_ZONE_ID}" node -e '
    const domain = process.env.CUSTOM_DOMAIN.endsWith(".") ? process.env.CUSTOM_DOMAIN : process.env.CUSTOM_DOMAIN + ".";
    const target = process.env.CF_DOMAIN.endsWith(".") ? process.env.CF_DOMAIN : process.env.CF_DOMAIN + ".";
    const hz = process.env.CF_ALIAS_ZONE_ID;

    const alias = {
      DNSName: target,
      HostedZoneId: hz,
      EvaluateTargetHealth: false
    };

    const Changes = [
      { Action: "UPSERT", ResourceRecordSet: { Name: domain, Type: "A",   AliasTarget: alias } },
      { Action: "UPSERT", ResourceRecordSet: { Name: domain, Type: "AAAA", AliasTarget: alias } }
    ];

    console.log(JSON.stringify({ Comment: "Alias to CloudFront", Changes }));
  ')"

  aws route53 change-resource-record-sets \
    --hosted-zone-id "${ROUTE53_HOSTED_ZONE_ID}" \
    --change-batch "${change_batch}" >/dev/null
  ok "Route53: ALIAS records upserted"
else
  warn "DNS not modified (AUTO_DNS!=yes). Create this record in your DNS:"
  echo
  echo "=== DNS instructions ==="
  echo "For Route53 (recommended): create ALIAS A + AAAA"
  echo "Name:  ${CUSTOM_DOMAIN}"
  echo "Target:${cf_domain}"
  echo "Alias HostedZoneId: ${CF_ALIAS_ZONE_ID}  (CloudFront) :contentReference[oaicite:2]{index=2}"
  echo
  echo "For non-Route53 providers:"
  echo "- If CUSTOM_DOMAIN is a subdomain: create CNAME ${CUSTOM_DOMAIN} -> ${cf_domain}"
  echo "- If it is the apex (example.com): use ALIAS/ANAME support in your DNS provider"
  echo "========================"
  echo
  warn "Rerun with AUTO_DNS=yes + ROUTE53_HOSTED_ZONE_ID to automate this."
  warn "Blocking the original *.cloudfront.net host is NOT safe until DNS is live."
fi

# ---- 4) Optional: block original *.cloudfront.net host -----------------------
if [[ "${BLOCK_ORIGINAL_HOST}" != "yes" ]]; then
  warn "Not blocking original *.cloudfront.net (BLOCK_ORIGINAL_HOST!=yes)."
  warn "After DNS is confirmed working, run:"
  warn "  BLOCK_ORIGINAL_HOST=yes ./auto-deploy-domain.sh"
  ok "DOMAIN step complete ✅ (domain/cert applied)"
  exit 0
fi

# Create/Update CloudFront Function (runtime temp file; deleted on exit)
FUNC_NAME="$(echo "${PROJECT_SLUG}" | tr "[:upper:]" "[:lower:]" | sed -E "s/[^a-z0-9-]+/-/g")-host-allowlist"
log "CloudFront Function: ensuring host allowlist function exists (${FUNC_NAME})"

tmp_js="$(mktemp)"
cleanup(){ rm -f "$tmp_js"; }
trap cleanup EXIT

cat > "$tmp_js" <<JS
function handler(event) {
  var req = event.request;
  var host = (req.headers && req.headers.host && req.headers.host.value) ? req.headers.host.value : "";
  var allowed = "${CUSTOM_DOMAIN}";

  if (host !== allowed) {
    return {
      statusCode: 403,
      statusDescription: "Forbidden",
      headers: { "content-type": { "value": "text/plain; charset=utf-8" } },
      body: "Forbidden"
    };
  }
  return req;
}
JS

if aws cloudfront describe-function --name "${FUNC_NAME}" --stage LIVE >/dev/null 2>&1; then
  ok "Function exists (LIVE). Updating code..."
  dev_etag="$(aws cloudfront describe-function --name "${FUNC_NAME}" --stage DEVELOPMENT --query ETag --output text 2>/dev/null || true)"
  if [[ -z "${dev_etag}" ]]; then
    # If no dev stage yet, we still can update by creating dev via update-function
    dev_etag="$(aws cloudfront describe-function --name "${FUNC_NAME}" --stage LIVE --query ETag --output text)"
  fi
  aws cloudfront update-function \
    --name "${FUNC_NAME}" \
    --if-match "${dev_etag}" \
    --function-config "{\"Comment\":\"Allow only Host=${CUSTOM_DOMAIN}\",\"Runtime\":\"cloudfront-js-2.0\"}" \
    --function-code "fileb://${tmp_js}" >/dev/null
else
  warn "Function not found. Creating..."
  aws cloudfront create-function \
    --name "${FUNC_NAME}" \
    --function-config "{\"Comment\":\"Allow only Host=${CUSTOM_DOMAIN}\",\"Runtime\":\"cloudfront-js-2.0\"}" \
    --function-code "fileb://${tmp_js}" >/dev/null
  ok "Function created (DEVELOPMENT)"
fi

dev_etag2="$(aws cloudfront describe-function --name "${FUNC_NAME}" --stage DEVELOPMENT --query ETag --output text)"
aws cloudfront publish-function --name "${FUNC_NAME}" --if-match "${dev_etag2}" >/dev/null
ok "Function published (LIVE)"

func_live_arn="$(aws cloudfront describe-function --name "${FUNC_NAME}" --stage LIVE --query "FunctionSummary.FunctionMetadata.FunctionARN" --output text)"

log "CloudFront: attaching function to behaviors (blocks *.cloudfront.net)"
ETAG2="$(aws cloudfront get-distribution-config --id "${CF_DISTRIBUTION_ID}" --query ETag --output text)"
CFG2="$(aws cloudfront get-distribution-config --id "${CF_DISTRIBUTION_ID}" --query DistributionConfig --output json)"

PATCHED2="$(
  printf '%s' "$CFG2" | node -e '
    const fs = require("fs");
    const cfg = JSON.parse(fs.readFileSync(0,"utf8"));
    const funcArn = process.env.FUNC_ARN;

    const assoc = () => ({
      Quantity: 1,
      Items: [{ EventType: "viewer-request", FunctionARN: funcArn }]
    });

    cfg.DefaultCacheBehavior.FunctionAssociations = assoc();

    if (cfg.CacheBehaviors && Array.isArray(cfg.CacheBehaviors.Items)) {
      cfg.CacheBehaviors.Items = cfg.CacheBehaviors.Items.map(b => ({
        ...b,
        FunctionAssociations: assoc()
      }));
      cfg.CacheBehaviors.Quantity = cfg.CacheBehaviors.Items.length;
    }

    process.stdout.write(JSON.stringify(cfg));
  ' FUNC_ARN="${func_live_arn}"
)"

aws cloudfront update-distribution \
  --id "${CF_DISTRIBUTION_ID}" \
  --if-match "${ETAG2}" \
  --distribution-config "${PATCHED2}" >/dev/null

aws cloudfront wait distribution-deployed --id "${CF_DISTRIBUTION_ID}"
ok "Blocked *.cloudfront.net access (Host allowlist enforced)"

ok "DOMAIN complete ✅  https://${CUSTOM_DOMAIN}"
warn "Direct https://${cf_domain} now returns 403 (expected)."