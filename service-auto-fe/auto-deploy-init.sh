#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env.deployment"
export AWS_PAGER=""

COLOR_RED="\033[31m"; COLOR_GRN="\033[32m"; COLOR_YLW="\033[33m"; COLOR_BLU="\033[34m"; COLOR_DIM="\033[2m"; COLOR_RST="\033[0m"
ts(){ date +"%Y-%m-%d %H:%M:%S"; }
log(){ echo -e "${COLOR_BLU}[$(ts)]${COLOR_RST} $*"; }
ok(){ echo -e "${COLOR_GRN}[$(ts)] OK${COLOR_RST} $*"; }
warn(){ echo -e "${COLOR_YLW}[$(ts)] WARN${COLOR_RST} $*"; }
die(){ echo -e "${COLOR_RED}[$(ts)] ERROR${COLOR_RST} $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }

[[ -f "${ENV_FILE}" ]] || die "Missing .env.deployment in repo root."
set -a; # shellcheck disable=SC1091
source "${ENV_FILE}"; set +a

need aws; need node; need pnpm

AWS_REGION="${AWS_REGION:-eu-central-1}"
APPLICATION_TAG="${APPLICATION_TAG:-elearning}"
ASSETS_PREFIX="${ASSETS_PREFIX:-assets}"
DIST_DIR="${DIST_DIR:-dist}"

[[ -n "${AWS_ACCOUNT_ID:-}" ]] || die "AWS_ACCOUNT_ID is required."
[[ -n "${PROJECT_SLUG:-}" ]] || die "PROJECT_SLUG is required."

sanitize() {
  echo "$1" | tr "[:upper:]" "[:lower:]" \
    | sed -E "s/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//; s/-+/-/g"
}
PROJECT_SLUG="$(sanitize "${PROJECT_SLUG}")"
CF_COMMENT="${CF_COMMENT:-${PROJECT_SLUG} SPA (${AWS_REGION})}"

aws_region_arg=(--region "${AWS_REGION}")

S3_BUCKET_NAME="${S3_BUCKET_NAME:-}"
if [[ -z "${S3_BUCKET_NAME}" ]]; then
  S3_BUCKET_NAME="$(sanitize "${PROJECT_SLUG}-${AWS_ACCOUNT_ID}-${AWS_REGION}-spa")"
fi

bucket_exists() { aws s3api head-bucket --bucket "${S3_BUCKET_NAME}" >/dev/null 2>&1; }

CREATED_BUCKET=""
CREATED_OAC_ID=""
cleanup_hint() {
  warn ""
  warn "Init failed after creating some resources."
  warn "Cleanup commands:"
  if [[ -n "${CREATED_BUCKET}" ]]; then
    cat <<EOF
aws s3 rm "s3://${CREATED_BUCKET}" --recursive
aws s3api delete-bucket --bucket "${CREATED_BUCKET}" --region ${AWS_REGION}
EOF
  fi
  if [[ -n "${CREATED_OAC_ID}" ]]; then
    cat <<EOF
OAC_ID="${CREATED_OAC_ID}"
ETAG="\$(aws cloudfront get-origin-access-control --id "\$OAC_ID" --query ETag --output text)"
aws cloudfront delete-origin-access-control --id "\$OAC_ID" --if-match "\$ETAG"
EOF
  fi
}
trap 'cleanup_hint' ERR

log "Sanity: verifying AWS credentials"
aws sts get-caller-identity >/dev/null 2>&1 || die "AWS auth failed."
ok "AWS auth OK"

if bucket_exists; then
  die "Bucket already exists: ${S3_BUCKET_NAME}
Refusing init. Delete bucket or change PROJECT_SLUG."
fi

# ---- S3 create + harden ------------------------------------------------------
log "S3: creating bucket ${COLOR_DIM}${S3_BUCKET_NAME}${COLOR_RST} in ${AWS_REGION}"
if [[ "${AWS_REGION}" == "us-east-1" ]]; then
  aws s3api create-bucket --bucket "${S3_BUCKET_NAME}" >/dev/null
else
  aws s3api create-bucket --bucket "${S3_BUCKET_NAME}" \
    --create-bucket-configuration "LocationConstraint=${AWS_REGION}" \
    "${aws_region_arg[@]}" >/dev/null
fi
CREATED_BUCKET="${S3_BUCKET_NAME}"
ok "S3: bucket created"

log "S3: hardening bucket (private, ACLs off, encryption, versioning, no website hosting)"
aws s3api put-public-access-block --bucket "${S3_BUCKET_NAME}" --public-access-block-configuration \
'{"BlockPublicAcls":true,"IgnorePublicAcls":true,"BlockPublicPolicy":true,"RestrictPublicBuckets":true}' \
  "${aws_region_arg[@]}" >/dev/null

aws s3api put-bucket-ownership-controls --bucket "${S3_BUCKET_NAME}" --ownership-controls \
'{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}' \
  "${aws_region_arg[@]}" >/dev/null

aws s3api put-bucket-encryption --bucket "${S3_BUCKET_NAME}" --server-side-encryption-configuration \
'{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' \
  "${aws_region_arg[@]}" >/dev/null

aws s3api put-bucket-versioning --bucket "${S3_BUCKET_NAME}" --versioning-configuration Status=Enabled \
  "${aws_region_arg[@]}" >/dev/null

aws s3api delete-bucket-website --bucket "${S3_BUCKET_NAME}" "${aws_region_arg[@]}" >/dev/null 2>&1 || true
ok "S3: hardened"

log "Tagging: S3 bucket application=${APPLICATION_TAG}"
aws s3api put-bucket-tagging --bucket "${S3_BUCKET_NAME}" --tagging \
"{\"TagSet\":[{\"Key\":\"application\",\"Value\":\"${APPLICATION_TAG}\"}]}" \
  "${aws_region_arg[@]}" >/dev/null
ok "Tagging: S3 done"

# ---- CloudFront: OAC + policies ----------------------------------------------
oac_name="${PROJECT_SLUG}-${AWS_REGION}-oac"
rh_name="${PROJECT_SLUG}-${AWS_REGION}-security-headers"
cp_default_name="${PROJECT_SLUG}-${AWS_REGION}-cache-default-short"
cp_assets_name="${PROJECT_SLUG}-${AWS_REGION}-cache-assets-long"

log "CloudFront: creating OAC ${COLOR_DIM}${oac_name}${COLOR_RST}"
CF_OAC_ID="$(
  aws cloudfront create-origin-access-control --origin-access-control-config \
"{\"Name\":\"${oac_name}\",\"Description\":\"OAC for ${S3_BUCKET_NAME}\",\"SigningProtocol\":\"sigv4\",\"SigningBehavior\":\"always\",\"OriginAccessControlOriginType\":\"s3\"}" \
  --query "OriginAccessControl.Id" --output text
)"
CREATED_OAC_ID="${CF_OAC_ID}"
ok "CloudFront: OAC created (${CF_OAC_ID})"

# Optional CSP only if provided
if [[ -n "${CSP:-}" ]]; then
  CSP_ESCAPED="$(node -e 'console.log(JSON.stringify(process.env.CSP))')"
  CSP_BLOCK=",
    \"ContentSecurityPolicy\": { \"Override\": true, \"ContentSecurityPolicy\": ${CSP_ESCAPED} }"
  warn "CSP enabled from env."
else
  CSP_BLOCK=""
fi

log "CloudFront: creating Response Headers Policy ${COLOR_DIM}${rh_name}${COLOR_RST}"
CF_RESPONSE_HEADERS_POLICY_ID="$(
  aws cloudfront create-response-headers-policy \
    --response-headers-policy-config "$(
      cat <<JSON
{
  "Name": "${rh_name}",
  "Comment": "Security headers for SPA via CloudFront",
  "SecurityHeadersConfig": {
    "ContentTypeOptions": { "Override": true },
    "FrameOptions": { "FrameOption": "DENY", "Override": true },
    "ReferrerPolicy": { "ReferrerPolicy": "strict-origin-when-cross-origin", "Override": true },
    "StrictTransportSecurity": {
      "AccessControlMaxAgeSec": 31536000,
      "IncludeSubdomains": true,
      "Preload": false,
      "Override": true
    },
    "XSSProtection": { "Protection": true, "ModeBlock": true, "Override": true }${CSP_BLOCK}
  },
  "CustomHeadersConfig": {
    "Quantity": 1,
    "Items": [
      { "Header": "Permissions-Policy", "Value": "geolocation=(), microphone=(), camera=()", "Override": true }
    ]
  }
}
JSON
    )" --query "ResponseHeadersPolicy.Id" --output text
)"
ok "CloudFront: Response Headers Policy created (${CF_RESPONSE_HEADERS_POLICY_ID})"

log "CloudFront: creating Cache Policy (default short) ${COLOR_DIM}${cp_default_name}${COLOR_RST}"
CF_CACHE_POLICY_DEFAULT_ID="$(
  aws cloudfront create-cache-policy --cache-policy-config \
'{
  "Name": "'"${cp_default_name}"'",
  "Comment": "Short TTL for SPA shell (index.html).",
  "DefaultTTL": 0,
  "MaxTTL": 60,
  "MinTTL": 0,
  "ParametersInCacheKeyAndForwardedToOrigin": {
    "EnableAcceptEncodingGzip": true,
    "EnableAcceptEncodingBrotli": true,
    "CookiesConfig": { "CookieBehavior": "none" },
    "HeadersConfig": { "HeaderBehavior": "none" },
    "QueryStringsConfig": { "QueryStringBehavior": "none" }
  }
}' --query "CachePolicy.Id" --output text
)"
ok "CloudFront: Cache Policy default created (${CF_CACHE_POLICY_DEFAULT_ID})"

log "CloudFront: creating Cache Policy (assets long) ${COLOR_DIM}${cp_assets_name}${COLOR_RST}"
CF_CACHE_POLICY_ASSETS_ID="$(
  aws cloudfront create-cache-policy --cache-policy-config \
'{
  "Name": "'"${cp_assets_name}"'",
  "Comment": "Long TTL for hashed assets.",
  "DefaultTTL": 31536000,
  "MaxTTL": 31536000,
  "MinTTL": 0,
  "ParametersInCacheKeyAndForwardedToOrigin": {
    "EnableAcceptEncodingGzip": true,
    "EnableAcceptEncodingBrotli": true,
    "CookiesConfig": { "CookieBehavior": "none" },
    "HeadersConfig": { "HeaderBehavior": "none" },
    "QueryStringsConfig": { "QueryStringBehavior": "none" }
  }
}' --query "CachePolicy.Id" --output text
)"
ok "CloudFront: Cache Policy assets created (${CF_CACHE_POLICY_ASSETS_ID})"

# ---- Viewer cert mode: domain+cert if both envs present, else default cert ----
USE_CUSTOM_CERT="no"
if [[ -n "${CUSTOM_DOMAIN:-}" || -n "${ACM_CERT_ARN:-}" ]]; then
  [[ -n "${CUSTOM_DOMAIN:-}" ]] || die "CUSTOM_DOMAIN set but ACM_CERT_ARN missing."
  [[ -n "${ACM_CERT_ARN:-}" ]] || die "ACM_CERT_ARN set but CUSTOM_DOMAIN missing."
  USE_CUSTOM_CERT="yes"
  warn "Custom domain requested: ${CUSTOM_DOMAIN}"
  warn "ACM cert must be in us-east-1 for CloudFront."
fi

if [[ "${USE_CUSTOM_CERT}" == "yes" ]]; then
  ALIASES_JSON="$(node -e 'console.log(JSON.stringify({Quantity:1,Items:[process.env.CUSTOM_DOMAIN]}))')"
  VIEWER_CERT_JSON="$(node -e '
    console.log(JSON.stringify({
      ACMCertificateArn: process.env.ACM_CERT_ARN,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021"
    }));
  ')"
else
  ALIASES_JSON='{"Quantity":0}'
  VIEWER_CERT_JSON='{"CloudFrontDefaultCertificate":true}'
fi

log "CloudFront: creating distribution (OAC + SPA routing + caching + headers)"
origin_domain="${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com"
caller_ref="$(date +%s)-$RANDOM"

CF_DISTRIBUTION_ID="$(
  aws cloudfront create-distribution --distribution-config "$(
    cat <<JSON
{
  "CallerReference": "${caller_ref}",
  "Comment": "${CF_COMMENT}",
  "Enabled": true,
  "Aliases": ${ALIASES_JSON},
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-origin",
      "DomainName": "${origin_domain}",
      "OriginAccessControlId": "${CF_OAC_ID}",
      "S3OriginConfig": { "OriginAccessIdentity": "" }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 3,
      "Items": ["GET","HEAD","OPTIONS"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "Compress": true,
    "CachePolicyId": "${CF_CACHE_POLICY_DEFAULT_ID}",
    "ResponseHeadersPolicyId": "${CF_RESPONSE_HEADERS_POLICY_ID}"
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [{
      "PathPattern": "${ASSETS_PREFIX}/*",
      "TargetOriginId": "s3-origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "AllowedMethods": {
        "Quantity": 3,
        "Items": ["GET","HEAD","OPTIONS"],
        "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
      },
      "Compress": true,
      "CachePolicyId": "${CF_CACHE_POLICY_ASSETS_ID}",
      "ResponseHeadersPolicyId": "${CF_RESPONSE_HEADERS_POLICY_ID}"
    }]
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      { "ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0 },
      { "ErrorCode": 404, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 0 }
    ]
  },
  "ViewerCertificate": ${VIEWER_CERT_JSON}
}
JSON
  )" --query "Distribution.Id" --output text
)"
ok "CloudFront: distribution created (${CF_DISTRIBUTION_ID})"

log "S3: applying bucket policy (CloudFront-only read, locked to distribution ARN)"
dist_arn="$(aws cloudfront get-distribution --id "${CF_DISTRIBUTION_ID}" --query "Distribution.ARN" --output text)"
aws s3api put-bucket-policy --bucket "${S3_BUCKET_NAME}" --policy "$(
  cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontReadOnlyWithOAC",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${S3_BUCKET_NAME}/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "${dist_arn}" } }
    }
  ]
}
JSON
)" "${aws_region_arg[@]}" >/dev/null
ok "S3: bucket policy applied"

log "Tagging: CloudFront distribution application=${APPLICATION_TAG}"
aws cloudfront tag-resource --resource "${dist_arn}" --tags "Items=[{Key=application,Value=${APPLICATION_TAG}}]" >/dev/null
ok "Tagging: CloudFront done"

log "CloudFront: waiting for distribution deploy"
aws cloudfront wait distribution-deployed --id "${CF_DISTRIBUTION_ID}"
ok "CloudFront: deployed"

cf_domain="$(aws cloudfront get-distribution --id "${CF_DISTRIBUTION_ID}" --query "Distribution.DomainName" --output text)"
if [[ "${USE_CUSTOM_CERT}" == "yes" ]]; then
  ok "INIT complete ✅  https://${CUSTOM_DOMAIN}"
  warn "DNS: create CNAME/ALIAS ${CUSTOM_DOMAIN} -> ${cf_domain}"
  warn "After DNS works, run: ./auto-deploy-domain.sh (to block *.cloudfront.net access)"
else
  ok "INIT complete ✅  https://${cf_domain}"
fi

echo
echo "Paste these into .env.deployment (Required for deploy):"
cat <<EOF
S3_BUCKET_NAME=${S3_BUCKET_NAME}
CF_DISTRIBUTION_ID=${CF_DISTRIBUTION_ID}
CF_OAC_ID=${CF_OAC_ID}
CF_RESPONSE_HEADERS_POLICY_ID=${CF_RESPONSE_HEADERS_POLICY_ID}
CF_CACHE_POLICY_DEFAULT_ID=${CF_CACHE_POLICY_DEFAULT_ID}
CF_CACHE_POLICY_ASSETS_ID=${CF_CACHE_POLICY_ASSETS_ID}
EOF
