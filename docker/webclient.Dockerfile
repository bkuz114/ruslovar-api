FROM nginx:alpine

# Copy the static web client files to nginx's default web root
COPY client/web-client/ /usr/share/nginx/html/

# Copy the nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
