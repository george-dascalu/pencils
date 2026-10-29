# Every release bumps the version in package.json and package-lock.json. Blank it here so
# the dependency installs below stay cached until the dependencies themselves change.
FROM node:22-alpine AS manifest
WORKDIR /app
COPY package.json package-lock.json ./
RUN node -e 'const fs = require("fs"); for (const f of ["package.json", "package-lock.json"]) { const j = JSON.parse(fs.readFileSync(f)); j.version = "0.0.0"; if (j.packages?.[""]) j.packages[""].version = "0.0.0"; fs.writeFileSync(f, JSON.stringify(j)); }'

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=manifest /app/package.json /app/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY public ./public
COPY scripts ./scripts
COPY server ./server
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 VAULT_PATH=/data
COPY --from=manifest /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY package.json package-lock.json ./
COPY server ./server
COPY --from=build /app/server/http ./server/http
COPY public ./public
COPY --from=build /app/dist ./dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
# Probe every second while starting so a new release reports healthy within seconds.
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --start-interval=1s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
