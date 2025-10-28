任务理解：
- 目标是为 slidev-backend 项目提供 Docker 容器化部署方案，确保服务在容器内可启动并支持现有功能（Slidev 预览、构建、截图等）。
- 交付物应包含 Dockerfile、相关配置（例如 docker-compose.yml 或脚本）、文档说明，以及确保容器内环境满足 puppeteer 与 slidev CLI 的依赖。

技术方案评估：
- 基于 Node.js 18+ 环境，需要安装 Chromium 依赖以支持 puppeteer。采用官方 node 镜像（如 node:18-bullseye 或 node:20-bullseye）可获得 Debian 环境，方便安装依赖。
- 服务运行时以 npm/yarn 脚本 `start` 启动（编译后 `node dist/main.js`）。构建阶段需运行 `yarn install` 与 `yarn build`。
- Slidev CLI 需在容器内提前安装（在 package.json 中未声明），可以在镜像构建时通过 `yarn global add @slidev/cli` 或 `yarn add --dev` 安装，并在启动脚本中导出。
- 需要准备 `.dockerignore` 减少上下文。

风险识别：
- puppeteer 在容器中启动 Chromium 时，需要额外系统库，如 `libnss3`, `fonts`, `libatk`, `libgtk` 等，需确认官方文档列表。
- Slidev CLI 的安装方式可能影响体积与稳定性——选择在 package.json 中添加依赖（推荐）并在容器构建时 `yarn install`。
- 端口暴露：默认 HTTP 5310，同时 Slidev 预览使用动态端口（5500-6500 范围），容器需要允许访问这些端口或提供代理策略。
- 为避免容器内 npx 交互提示，需要在构建时安装 @slidev/cli。

实现步骤规划：
1. 梳理项目运行流程，确认构建与启动命令。
2. 更新 package.json 添加 @slidev/cli 依赖（如必要）并调整脚本。
3. 创建 Dockerfile：使用多阶段构建（依赖安装 + 构建 + 运行），安装系统依赖与 Chrome。
4. 创建 `.dockerignore`。
5.（可选）提供 docker-compose.yml 方便本地调试，映射端口区间。
6. 更新 README 文档添加容器使用说明。
7. 运行容器构建脚本或本地验证（若环境允许），记录测试。

边界条件分析：
- 容器默认暴露 5310；动态端口范围可能无法预先暴露全部，需在文档中说明或改为单端口策略（可能需代码改动）。
- 文件系统：Slidev 需要访问 slidesPath，需通过卷挂载实现；需要在文档中说明。
- 资源消耗：Puppeteer 需较多内存，容器运行时需分配足够。

