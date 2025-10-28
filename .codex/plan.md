# 容器化实施计划

## 验收契约
- **接口规格**：
  - HTTP 服务暴露端口 `PORT`（默认 5310），通过 `docker run -p PORT:PORT` 映射。
  - Slidev 预览实例使用 `PREVIEW_BASE_PORT`-`PREVIEW_MAX_PORT` 区间，文档中说明如需外部访问需映射端口范围或配置反向代理。
  - 容器需支持挂载宿主机目录以提供 `slidesPath`、`outputDir` 等绝对路径。
- **边界条件**：
  - 不额外实现安全特性（如认证、TLS）。
  - 若容器内部无网络，需提前构建镜像并安装依赖，避免运行时下载。
- **性能要求**：
  - 使用官方 Node 镜像与系统依赖，保证 puppeteer 与 Slidev CLI 能正常运行。
  - 运行阶段镜像应基于精简镜像（如 node:20-slim/bullseye）并仅保留生产依赖。
- **测试标准**：
  - `yarn test`（单元测试）需通过。
  - 尝试执行 `docker build`（如受限则记录原因），在 `.codex/testing.md` 与 `verification.md` 记录结果。

## 实现细节
1. **依赖管理**：
   - 在 `package.json` 的 `dependencies` 中添加 `@slidev/cli`。
   - 如需 puppeteer 额外参数（`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` 等），在 Dockerfile 中设置。
2. **Dockerfile**：
   - 阶段一：安装依赖、构建 TypeScript。
   - 阶段二：复制构建产物与生产依赖，安装运行所需系统库（Chromium 依赖、字体等）。
   - 设置默认 `CMD ["node", "dist/main.js"]`。
   - EXPOSE 5310。
3. **.dockerignore**：忽略 `node_modules`, `dist`, `.codex`, `__tests__`, `.git`, `*.log` 等。
4. **docker-compose.yml**：
   - 定义 `slidev-backend` 服务。
   - 映射 `5310:5310`，并示例 `5500-5510` 小范围映射或说明如何扩展。
   - 可配置环境变量示例与卷挂载（如 `./examples:/workspace/presentations`）。
5. **文档更新**：
   - README 中新增容器部分，描述构建、运行、卷挂载与端口说明。
   - 提示 Slidev 预览端口策略。
6. **验证**：
   - 在受限环境下尽量执行 `yarn test` 与 `docker build`（若失败记录）。
   - 更新 `.codex/testing.md`、`verification.md`、`.codex/review-report.md`。
