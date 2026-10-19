FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8790 DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node tools ./tools
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "tools/container-health.mjs"]
CMD ["node", "server/main.mjs"]
