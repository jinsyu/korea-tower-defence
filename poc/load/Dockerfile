# Server only. Dependencies are installed inside the image (native modules from the Mac do not run here).
FROM node:22-slim
WORKDIR /app
RUN npm install -g pnpm@10.11.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY tsconfig.json server.ts ./
COPY lib ./lib
COPY data/seed.db ./data/seed.db
ENV DB_PATH=/data/ktd.db LOAD_TEST_REVEAL=1
VOLUME /data
EXPOSE 4100
CMD ["node", "--import", "tsx", "server.ts"]
