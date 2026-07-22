FROM node:22.17.0-alpine3.22 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22.17.0-alpine3.22
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3023
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node states ./states
USER node
EXPOSE 3023
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3023/api/live >/dev/null || exit 1
CMD ["node", "server.js"]
