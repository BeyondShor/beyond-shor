#!/usr/bin/env bash
# Independent check of the PKI playground's output with OpenSSL 3.5 (container).
# Usage: scripts/pki-interop.sh   (from frontend/; needs Docker)
set -euo pipefail
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
PKI_INTEROP_DIR="$OUT" npx vitest run __tests__/pki-interop-export.test.ts >/dev/null
docker run --rm -v "$OUT":/w:ro alpine:3.22 sh -c '
  apk add --no-cache openssl >/dev/null 2>&1
  openssl version
  fail=0
  check() { if eval "$2" >/tmp/o 2>&1; then echo "ok    $1"; else echo "FAIL  $1"; sed "s/^/      /" /tmp/o; fail=1; fi; }
  expect_fail() { if eval "$2" >/tmp/o 2>&1; then echo "FAIL  $1 (unexpectedly accepted)"; fail=1; else echo "ok    $1 → $(grep -o "error [0-9]*.*" /tmp/o | head -1)"; fi; }
  for p in classical mldsa44 mldsa65 mixed web-classical; do
    d=/w/$p; h=$(cat $d/host.txt)
    check "$p: parse root/int/leaf"      "openssl x509 -in $d/root.pem -noout && openssl x509 -in $d/int.pem -noout && openssl x509 -in $d/leaf.pem -noout"
    check "$p: verify chain (strict, hostname, sslserver)" "openssl verify -x509_strict -purpose sslserver -verify_hostname $h -CAfile $d/root.pem -untrusted $d/int.pem $d/leaf.pem | grep -q \"leaf.pem: OK\""
    check "$p: CSR self-signature (PoP)" "openssl req -in $d/csr.pem -verify -noout"
    check "$p: CRL signature"            "openssl crl -in $d/crl.pem -CAfile $d/int.pem -noout"
    check "$p: root CRL for CAs (ARL) signature" "openssl crl -in $d/arl.pem -CAfile $d/root.pem -noout"
    check "$p: whole chain with CRLs (crl_check_all)" "openssl verify -x509_strict -crl_check_all -CRLfile $d/crl.pem -CRLfile $d/arl.pem -CAfile $d/root.pem -untrusted $d/int.pem $d/leaf.pem | grep -q OK"
    expect_fail "$p: revoked leaf rejected" "openssl verify -x509_strict -crl_check_all -CRLfile $d/crl.pem -CRLfile $d/arl.pem -CAfile $d/root.pem -untrusted $d/int.pem $d/revoked.pem"
    expect_fail "$p: leaf under revoked intermediate rejected" "openssl verify -x509_strict -crl_check_all -CRLfile $d/revoked-ca.crl.pem -CRLfile $d/arl.pem -CAfile $d/root.pem -untrusted $d/revoked-ca.pem $d/revoked-ca-leaf.pem"
  done
  # Composite is not in OpenSSL 3.5: the structure must still parse
  check "composite: parse root/int/leaf/CSR/CRLs" "openssl x509 -in /w/composite/root.pem -noout && openssl x509 -in /w/composite/leaf.pem -noout && openssl req -in /w/composite/csr.pem -noout && openssl crl -in /w/composite/crl.pem -noout && openssl crl -in /w/composite/arl.pem -noout"
  check "MTC: parse landmark-relative + standalone" "openssl x509 -in /w/web-mtc/leaf.pem -noout -text >/dev/null && openssl x509 -in /w/web-mtc/standalone.pem -noout"
  check "catalyst: parse" "openssl x509 -in /w/catalyst/leaf.pem -noout -text >/dev/null"
  check "web: SCT list decodes" "openssl x509 -in /w/web-classical/leaf.pem -noout -text | grep -q \"Signed Certificate Timestamp\""
  exit $fail
'
