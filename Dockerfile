# Serves the JÉEN Villas static site (jeen-villas/) with Caddy on Railway.
FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY jeen-villas /srv
