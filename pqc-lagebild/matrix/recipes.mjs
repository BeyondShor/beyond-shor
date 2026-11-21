// Shell recipes run inside a release container. They install the distribution's own
// packages and change only what is needed to run a TLS server at all (a certificate,
// a port that does not collide) — never groups, ciphers or protocol versions, because
// the distribution defaults are what we measure.
//
// Output protocol (stdout): lines "STATUS <component> ok|fail <reason>",
// "VER <component> <text>" and "SSH <client|server> <kexalgorithms>".

const PORTS = { nginx: 4431, apache: 443, postfix: 25, sink: 9443 };
export { PORTS };

const install = {
  deb: `
export DEBIAN_FRONTEND=noninteractive
echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections
echo "postfix postfix/mailname string pqm.test" | debconf-set-selections
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends nginx apache2 ssl-cert postfix openssh-server openssh-client \\
  openssl curl python3 ca-certificates >/tmp/install.log 2>&1 || { tail -5 /tmp/install.log; echo "STATUS install fail apt-get"; exit 1; }
`,
  rpm: `
dnf -y -q install nginx httpd mod_ssl postfix openssh-server openssh-clients openssl python3 >/tmp/install.log 2>&1 \\
  || { tail -5 /tmp/install.log; echo "STATUS install fail dnf"; exit 1; }
command -v curl >/dev/null || dnf -y -q install curl >>/tmp/install.log 2>&1
`,
  apk: `
apk add -q --no-cache nginx apache2 apache2-ssl postfix openssh-server openssh-client openssl curl python3 \\
  >/tmp/install.log 2>&1 || { tail -5 /tmp/install.log; echo "STATUS install fail apk"; exit 1; }
`,
};

const nginxConfDir = { deb: '/etc/nginx/conf.d', rpm: '/etc/nginx/conf.d', apk: '/etc/nginx/http.d' };

const apache = {
  deb: `
make-ssl-cert generate-default-snakeoil --force-overwrite >/dev/null 2>&1 || true
a2enmod -q ssl >/dev/null && a2ensite -q default-ssl >/dev/null
apache2ctl start >/tmp/apache.log 2>&1 && echo "STATUS apache ok" || echo "STATUS apache fail $(tail -1 /tmp/apache.log)"
echo "VER apache $(apache2 -v 2>/dev/null | head -1 | sed 's/^Server version: //')"
`,
  rpm: `
[ -s /etc/pki/tls/certs/localhost.crt ] || { cp /etc/pqm/cert.pem /etc/pki/tls/certs/localhost.crt; cp /etc/pqm/key.pem /etc/pki/tls/private/localhost.key; }
httpd -k start >/tmp/apache.log 2>&1 && echo "STATUS apache ok" || echo "STATUS apache fail $(tail -1 /tmp/apache.log)"
echo "VER apache $(httpd -v 2>/dev/null | head -1 | sed 's/^Server version: //')"
`,
  apk: `
mkdir -p /etc/ssl/apache2
[ -s /etc/ssl/apache2/server.pem ] || { cp /etc/pqm/cert.pem /etc/ssl/apache2/server.pem; cp /etc/pqm/key.pem /etc/ssl/apache2/server.key; }
httpd -k start >/tmp/apache.log 2>&1 && echo "STATUS apache ok" || echo "STATUS apache fail $(tail -1 /tmp/apache.log)"
echo "VER apache $(httpd -v 2>/dev/null | head -1 | sed 's/^Server version: //')"
`,
};

/** Install, configure and start everything; print versions and SSH defaults. */
export function setupScript(family) {
  return `
set -u
${install[family]}
echo "STATUS install ok"
mkdir -p /etc/pqm
openssl req -x509 -newkey rsa:2048 -nodes -days 3 -subj /CN=pqm.test \\
  -keyout /etc/pqm/key.pem -out /etc/pqm/cert.pem >/dev/null 2>&1

echo "VER openssl $(openssl version)"
[ -x /usr/bin/update-crypto-policies ] && echo "VER crypto-policy $(update-crypto-policies --show)"

# nginx: one extra TLS server block; move any default port-80 listener out of Apache's way
for f in /etc/nginx/nginx.conf /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf /etc/nginx/http.d/*.conf; do
  [ -f "$f" ] && sed -ri 's/(listen[[:space:]]+(\\[::\\]:)?)80([[:space:]]|;)/\\18080\\3/' "$f"
done
mkdir -p ${nginxConfDir[family]}
cat > ${nginxConfDir[family]}/pqm.conf <<'EOF'
server {
    listen ${PORTS.nginx} ssl;
    server_name pqm.test;
    ssl_certificate /etc/pqm/cert.pem;
    ssl_certificate_key /etc/pqm/key.pem;
    location / { return 200 "ok\\n"; }
}
EOF
mkdir -p /run/nginx /var/log/nginx
nginx >/tmp/nginx.log 2>&1 && echo "STATUS nginx ok" || echo "STATUS nginx fail $(tail -1 /tmp/nginx.log)"
echo "VER nginx $(nginx -v 2>&1 | sed 's/^nginx version: //')"
${apache[family]}
# postfix: record whether STARTTLS is on out of the box, then enable it minimally if not
echo "VER postfix $(postconf -h mail_version 2>/dev/null)"
LEVEL=$(postconf -h smtpd_tls_security_level 2>/dev/null)
echo "VER postfix-tls-default \${LEVEL:-none}"
echo "VER postfix-curves $(postconf -h tls_eecdh_auto_curves 2>/dev/null | tr -s ' ,' ',')"
if [ "\${LEVEL:-none}" = "none" ] || [ -z "$(postconf -h smtpd_tls_cert_file 2>/dev/null)" ]; then
  postconf -e "smtpd_tls_cert_file=/etc/pqm/cert.pem" "smtpd_tls_key_file=/etc/pqm/key.pem" "smtpd_tls_security_level=may"
fi
CERT=$(postconf -h smtpd_tls_cert_file); [ -s "$CERT" ] || { cp /etc/pqm/cert.pem "$CERT"; cp /etc/pqm/key.pem "$(postconf -h smtpd_tls_key_file)"; }
postconf -e "myhostname=pqm.test" "inet_interfaces=loopback-only"
# some packages leave the queue to systemd-tmpfiles, which does not run in a container
command -v systemd-tmpfiles >/dev/null && systemd-tmpfiles --create >/dev/null 2>&1
QD=$(postconf -h queue_directory); [ -d "$QD" ] || mkdir -p "$QD"
newaliases >/dev/null 2>&1 || true
postfix start >/tmp/postfix.log 2>&1 && echo "STATUS postfix ok" || echo "STATUS postfix fail $(tail -1 /tmp/postfix.log)"

# OpenSSH: effective defaults, no daemon needed
mkdir -p /run/sshd
ssh-keygen -A >/dev/null 2>&1
echo "SSH server $(sshd -T 2>/dev/null | awk 'tolower($1)=="kexalgorithms"{print $2}')"
echo "SSH client $(ssh -G pqm.test 2>/dev/null | awk 'tolower($1)=="kexalgorithms"{print $2}')"
echo "VER openssh $(ssh -V 2>&1)"
echo "VER curl $(curl --version 2>/dev/null | head -1)"
echo "VER python $(python3 -c 'import ssl,sys;print(sys.version.split()[0], ssl.OPENSSL_VERSION)' 2>/dev/null)"
true
`;
}

/** Let each TLS client open one connection to the ClientHello sink, tagged by SNI. */
export function clientsScript() {
  const p = PORTS.sink;
  return `
set -u
echo | timeout 15 openssl s_client -connect 127.0.0.1:${p} -servername openssl.pqm.test >/dev/null 2>&1
timeout 15 curl -s -o /dev/null --max-time 10 --resolve curl.pqm.test:${p}:127.0.0.1 https://curl.pqm.test:${p}/ >/dev/null 2>&1
timeout 15 python3 - <<'EOF' >/dev/null 2>&1
import socket, ssl
ctx = ssl.create_default_context()  # what urllib, requests & co. use by default
s = socket.create_connection(("127.0.0.1", ${p}), timeout=10)
try:
    ctx.wrap_socket(s, server_hostname="python.pqm.test")
except Exception:
    pass
EOF
true
`;
}
