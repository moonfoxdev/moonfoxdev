# JÉEN Villas: the site (jeen-villas/) plus the admin portal API (server/).
# On Railway, attach a volume to keep bookings and uploaded photos across
# redeploys; the server finds it via RAILWAY_VOLUME_MOUNT_PATH.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server ./server
COPY jeen-villas ./jeen-villas
EXPOSE 8080
CMD ["node", "server/server.js"]
