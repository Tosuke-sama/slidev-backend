FROM node:20-bookworm AS base

WORKDIR /app

# RUN corepack enable
# 直接安装特定版本的 yarn/pnpm
# RUN npm install -g yarn@latest

COPY package.json yarn.lock ./

# 安装完整依赖（含 devDependencies）供构建阶段使用
# 使用单线程模式避免 Docker 构建环境中的线程创建问题
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN node --version && yarn install --frozen-lockfile --network-timeout 100000

FROM base AS build

COPY . .

RUN yarn build

FROM node:20-bookworm AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 安装 Puppeteer 运行所需的系统库
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libappindicator3-1 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libglu1-mesa \
    libgtk-3-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libnspr4 \
    libnss3 \
    libu2f-udev \
    libvulkan1 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxcb1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    libxcursor1 \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# 全局安装 Slidev CLI，避免运行时交互式安装
RUN npm install -g @slidev/cli

ENV SLIDEV_CLI_PATH=/usr/local/bin/slidev

COPY package.json yarn.lock ./

RUN corepack enable \
  && yarn install --frozen-lockfile --production

COPY --from=build /app/dist ./dist

EXPOSE 5310

CMD ["node", "dist/main.js"]
