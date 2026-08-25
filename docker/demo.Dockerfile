FROM nginx:alpine

# Copy the static demo files to nginx's default web root
COPY client/demo/ /usr/share/nginx/html/

# Copy the nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
