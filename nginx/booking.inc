server_tokens off;
root /usr/share/nginx/html;
index index.html;

add_header Strict-Transport-Security $hsts always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy no-referrer always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;

location = /nginx-health {
  access_log off;
  default_type text/plain;
  return 200 "ok";
}

location ~ /\. {
  deny all;
  return 404;
}

location /api/public/ {
  include /etc/nginx/conf.d/proxy-api.inc;
}

location = / {
  return 302 /dang-ky-lop;
}

location = /dang-ky-lop {
  add_header Cache-Control "no-store" always;
  try_files /index.html =404;
}

location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable" always;
  try_files $uri =404;
}

location / {
  try_files $uri @booking_home;
}

location @booking_home {
  return 302 /dang-ky-lop;
}
