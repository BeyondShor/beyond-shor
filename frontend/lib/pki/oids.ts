// Object identifiers used by the PKI playground, each with its source.

export const OID = {
  // Names (X.520)
  countryName:          '2.5.4.6',
  organizationName:     '2.5.4.10',
  commonName:           '2.5.4.3',

  // Classical algorithms (RFC 5480, RFC 5758)
  ecPublicKey:          '1.2.840.10045.2.1',
  prime256v1:           '1.2.840.10045.3.1.7',
  ecdsaWithSha256:      '1.2.840.10045.4.3.2',

  // ML-DSA (RFC 9881, NIST sigAlgs arc 2.16.840.1.101.3.4.3)
  mlDsa44:              '2.16.840.1.101.3.4.3.17',
  mlDsa65:              '2.16.840.1.101.3.4.3.18',
  mlDsa87:              '2.16.840.1.101.3.4.3.19',

  // SLH-DSA (RFC 9909)
  slhDsaSha2_128s:      '2.16.840.1.101.3.4.3.20',
  slhDsaSha2_192s:      '2.16.840.1.101.3.4.3.22',

  // Composite ML-DSA (draft-ietf-lamps-pq-composite-sigs-19, §6)
  compMlDsa65EcdsaP256: '1.3.6.1.5.5.7.6.45',

  // Hash algorithms (NIST)
  sha256:               '2.16.840.1.101.3.4.2.1',

  // Certificate extensions (RFC 5280 §4.2)
  subjectKeyIdentifier:   '2.5.29.14',
  keyUsage:               '2.5.29.15',
  subjectAltName:         '2.5.29.17',
  basicConstraints:       '2.5.29.19',
  cRLNumber:              '2.5.29.20',
  reasonCode:             '2.5.29.21',
  nameConstraints:        '2.5.29.30',
  cRLDistributionPoints:  '2.5.29.31',
  authorityKeyIdentifier: '2.5.29.35',
  extKeyUsage:            '2.5.29.37',

  // ITU-T X.509 (10/2019) §9.8 — alternative key and signature ("Catalyst")
  subjectAltPublicKeyInfo: '2.5.29.72',
  altSignatureAlgorithm:   '2.5.29.73',
  altSignatureValue:       '2.5.29.74',

  // RFC 9763 — related certificate (id-pe 36)
  relatedCertificate:   '1.3.6.1.5.5.7.1.36',

  // RFC 6962 — embedded SCT list
  ctSctList:            '1.3.6.1.4.1.11129.2.4.2',

  // Extended key usage (RFC 5280 §4.2.1.12)
  kpServerAuth:         '1.3.6.1.5.5.7.3.1',
  kpClientAuth:         '1.3.6.1.5.5.7.3.2',

  // PKCS #9 extensionRequest (RFC 2985) for PKCS #10 requests
  extensionRequest:     '1.2.840.113549.1.9.14',

  // Merkle Tree Certificates (draft-ietf-plants-merkle-tree-certs-08 §6.2)
  mtcProof:             '1.3.6.1.5.5.7.6.67',
  // draft-ietf-tls-trust-anchor-ids-07 §4.1
  rdnaTrustAnchorId:    '1.3.6.1.5.5.7.25.3',
} as const;

export const OID_NAMES: Record<string, string> = {
  [OID.countryName]: 'countryName',
  [OID.organizationName]: 'organizationName',
  [OID.commonName]: 'commonName',
  [OID.ecPublicKey]: 'id-ecPublicKey',
  [OID.prime256v1]: 'prime256v1 (P-256)',
  [OID.ecdsaWithSha256]: 'ecdsa-with-SHA256',
  [OID.mlDsa44]: 'id-ml-dsa-44',
  [OID.mlDsa65]: 'id-ml-dsa-65',
  [OID.mlDsa87]: 'id-ml-dsa-87',
  [OID.slhDsaSha2_128s]: 'id-slh-dsa-sha2-128s',
  [OID.slhDsaSha2_192s]: 'id-slh-dsa-sha2-192s',
  [OID.compMlDsa65EcdsaP256]: 'id-MLDSA65-ECDSA-P256-SHA512',
  [OID.sha256]: 'id-sha256',
  [OID.subjectKeyIdentifier]: 'subjectKeyIdentifier',
  [OID.keyUsage]: 'keyUsage',
  [OID.subjectAltName]: 'subjectAltName',
  [OID.basicConstraints]: 'basicConstraints',
  [OID.cRLNumber]: 'cRLNumber',
  [OID.reasonCode]: 'reasonCode',
  [OID.nameConstraints]: 'nameConstraints',
  [OID.cRLDistributionPoints]: 'cRLDistributionPoints',
  [OID.authorityKeyIdentifier]: 'authorityKeyIdentifier',
  [OID.extKeyUsage]: 'extendedKeyUsage',
  [OID.subjectAltPublicKeyInfo]: 'subjectAltPublicKeyInfo',
  [OID.altSignatureAlgorithm]: 'altSignatureAlgorithm',
  [OID.altSignatureValue]: 'altSignatureValue',
  [OID.relatedCertificate]: 'relatedCertificate',
  [OID.ctSctList]: 'signedCertificateTimestampList',
  [OID.kpServerAuth]: 'id-kp-serverAuth',
  [OID.kpClientAuth]: 'id-kp-clientAuth',
  [OID.mtcProof]: 'id-alg-mtcProof',
  [OID.rdnaTrustAnchorId]: 'id-rdna-trustAnchorID',
};

export const oidName = (o: string) => OID_NAMES[o] ?? o;
