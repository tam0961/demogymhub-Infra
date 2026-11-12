server_tokens off;
root /usr/share/nginx/html;
index index.html;

add_header Strict-Transport-Security $hsts always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy no-referrer always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://img.vietqr.io; connect-src 'self' https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;

location = /nginx-health {
  access_log off;
  default_type text/plain;
  return 200 "ok";
}

location ~ /\. {
  deny all;
  return 404;
}

location /api/auth/ {
  limit_req zone=auth_zone burst=20 nodelay;
  include /etc/nginx/conf.d/proxy-api.inc;
}

location /api/ {
  include /etc/nginx/conf.d/proxy-api.inc;
}

location /assets/ {
  expires 1y;
  access_log off;
  try_files $uri =404;
}

location = /index.html {
  expires -1;
}

location / {
  expires -1;
  try_files $uri $uri/ /index.html;
}
