# Slidev Backend

独立的 Node.js 服务，用于管理 Slidev 幻灯片的预览、构建与截图流程。

## 快速开始

```bash
# 安装依赖
yarn install  # 或 npm install

# 开发模式
yarn dev

# 运行测试
yarn test
```

## Docker 部署

### 构建镜像

```bash
docker build -t slidev-backend .
```

镜像构建过程中会安装项目依赖、Chromium 所需系统库以及 `@slidev/cli`，首次构建耗时会略长。

### 运行容器

```bash
docker run -it \
  -p 5310:5310 \
  -p 5500-5510:5500-5510 \
  -e PORT=5310 \
  -e PREVIEW_BASE_PORT=5500 \
  -e PREVIEW_MAX_PORT=5510 \
  -v $(pwd)/workspace:/workspace \
  --name slidev-backend \
  slidev-backend
```

- `-v` 选项用于将宿主机目录挂载到容器内，便于传递 `slidesPath`、`outputDir` 等绝对路径。可按需替换为真实路径。
- 预览服务默认在 `5500-6500` 之间分配端口。示例中通过调小区间（5500-5510）并映射对应端口，便于外部访问；如需更多端口，可调整环境变量与端口映射。
- 容器内已设置 `SLIDEV_CLI_PATH=/usr/local/bin/slidev`，无需额外安装 Slidev CLI。

### 使用 docker-compose

本仓库提供 `docker-compose.yml` 示例，便于在本地开发环境中启动服务：

```bash
docker compose up --build -d
```

修改 `docker-compose.yml` 中的卷挂载与端口映射，即可匹配真实部署场景。

服务默认监听 `5310` 端口，可通过环境变量覆盖：

- `PORT`：HTTP 服务端口，默认 5310
- `PREVIEW_BASE_PORT` / `PREVIEW_MAX_PORT`：预览实例分配端口范围，默认 5500-6500
- `SLIDEV_BUILD_TIMEOUT`：build 命令超时时间（毫秒），默认 120000
- `SCREENSHOT_WIDTH` / `SCREENSHOT_HEIGHT`：截图宽高，默认 1280x720

## API 概览

- `POST /api/preview/start`：启动或复用 Slidev 预览
- `POST /api/preview/stop`：停止指定 slideId 的预览实例
- `POST /api/screenshot`：对指定 slideId 截图
- `POST /api/build`：执行 Slidev build 输出静态资源
- `GET /api/processes`：查看当前所有预览实例

请求字段需提供绝对路径，例如 `slidesPath`、`outputDir`、`coverPath` 等，建议由调用方（slidev-ai backend）统一计算。

## 与 slidev-ai 集成

1. 在 `slidev-ai/backend` 中新增远程客户端，通过 HTTP 调用上述接口。
2. 复用原仓库的 `SsoLite` 等工具计算封面、静态资源目录，将路径作为参数传给本服务。
3. 两个项目共享文件系统（uploads/presentation 目录），即可完成生成和访问。
