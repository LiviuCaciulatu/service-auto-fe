#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.deployment"
export AWS_PAGER=""

COLOR_RED="\033[31m"; COLOR_GRN="\033[32m"; COLOR_YLW="\033[33m"; COLOR_BLU="\033[34m"; COLOR_RST="\033[0m"
ts(){ date +"%Y-%m-%d %H:%M:%S"; }
log(){ echo -e "${COLOR_BLU}[$(ts)]${COLOR_RST} $*"; }
ok(){  echo -e "${COLOR_GRN}[$(ts)] OK${COLOR_RST} $*"; }
warn(){ echo -e "${COLOR_YLW}[$(ts)] WARN${COLOR_RST} $*"; }
fail(){ echo -e "${COLOR_RED}[$(ts)] ERROR${COLOR_RST} $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || fail "Missing dependency: $1"; }

[[ -f "${ENV_FILE}" ]] || fail "Missing .env.deployment"
set -a; # shellcheck disable=SC1091
source "${ENV_FILE}"; set +a

need aws; need node

AWS_REGION="${AWS_REGION:-eu-central-1}"

# Required always
req(){ [[ -n "${!1:-}" ]] || fail "Missing env key: $1"; }
req S3_BUCKET_NAME
req CF_DISTRIBUTION_ID
req CF_OAC_ID
req CF_RESPONSE_HEADERS_POLICY_ID
req CF_CACHE_POLICY_DEFAULT_ID
req CF_CACHE_POLICY_ASSETS_ID

# Custom domain keys are OPTIONAL, but must be consistent (both set or both empty)
if [[ -n "${CUSTOM_DOMAIN:-}" && -z "${ACM_CERT_ARN:-}" ]]; then
  fail "CUSTOM_DOMAIN is set but ACM_CERT_ARN is empty (either set both or neither)."
fi
if [[ -z "${CUSTOM_DOMAIN:-}" && -n "${ACM_CERT_ARN:-}" ]]; then
  fail "ACM_CERT_ARN is set but CUSTOM_DOMAIN is empty (either set both or neither)."
fi

log "Auth: verifying AWS credentials"
aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS auth failed"
ok "Auth OK"

log "CloudFront: reading distribution"
dist_json="$(aws cloudfront get-distribution --id "${CF_DISTRIBUTION_ID}" --output json 2>/dev/null || true)"
[[ -n "${dist_json}" ]] || fail "Cannot read distribution"
ok "CloudFront distribution readable"

cfg="$(node -e "const j=${dist_json}; console.log(JSON.stringify(j.Distribution.DistributionConfig))")"

# Basic invariants
default_root="$(node -e "const c=${cfg}; console.log(c.DefaultRootObject||'')")"
[[ "${default_root}" == "index.html" ]] && ok "DefaultRootObject=index.html" || fail "DefaultRootObject=${default_root}"

origin_expected="${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com"
origin_actual="$(node -e "const c=${cfg}; console.log(c.Origins.Items[0].DomainName)")"
[[ "${origin_actual}" == "${origin_expected}" ]] && ok "Origin matches bucket REST endpoint" || fail "Origin mismatch: ${origin_actual}"

oac_actual="$(node -e "const c=${cfg}; console.log(c.Origins.Items[0].OriginAccessControlId||'')")"
[[ "${oac_actual}" == "${CF_OAC_ID}" ]] && ok "OAC matches env" || fail "OAC mismatch: ${oac_actual}"

vpp="$(node -e "const c=${cfg}; console.log(c.DefaultCacheBehavior.ViewerProtocolPolicy||'')")"
[[ "${vpp}" == "redirect-to-https" ]] && ok "ViewerProtocolPolicy=redirect-to-https" || fail "ViewerProtocolPolicy=${vpp}"

# Domain intent vs applied state
want_domain="no"
if [[ -n "${CUSTOM_DOMAIN:-}" && -n "${ACM_CERT_ARN:-}" ]]; then
  want_domain="yes"
fi

is_default_cert="$(node -e "const c=${cfg}; console.log(c.ViewerCertificate?.CloudFrontDefaultCertificate ? 'yes' : 'no')")"
min_tls="$(node -e "const c=${cfg}; console.log(c.ViewerCertificate?.MinimumProtocolVersion||'')")"
aliases="$(node -e "const c=${cfg}; console.log(JSON.stringify(c.Aliases||{Quantity:0,Items:[]}))")"
acm_arn="$(node -e "const c=${cfg}; console.log(c.ViewerCertificate?.ACMCertificateArn||'')")"

if [[ "${want_domain}" == "yes" ]]; then
  has_alias="$(CUSTOM_DOMAIN="${CUSTOM_DOMAIN}" node -e "const a=${aliases}; const want=process.env.CUSTOM_DOMAIN; console.log((a.Items||[]).includes(want)?'yes':'no')")"

  if [[ "${has_alias}" != "yes" || "${acm_arn}" != "${ACM_CERT_ARN}" || "${is_default_cert}" == "yes" ]]; then
    warn "CUSTOM_DOMAIN + ACM_CERT_ARN are set, but CloudFront is not configured for them."
    warn "Run: ./auto-deploy-domain.sh"
  else
    [[ "${min_tls}" == "TLSv1.2_2021" || "${min_tls}" == TLSv1.2_* || "${min_tls}" == TLSv1.3_* ]] \
      && ok "Minimum TLS policy=${min_tls}" \
      || fail "MinimumProtocolVersion=${min_tls} (expected TLSv1.2_2021+)"
  fi
else
  # No domain configured: acceptable.
  if [[ "${is_default_cert}" == "yes" ]]; then
    warn "No custom domain configured; using default CloudFront cert. This is OK."
  else
    ok "Custom cert detected (TLS policy=${min_tls})"
  fi
fi

ok "VALIDATE complete ✅"