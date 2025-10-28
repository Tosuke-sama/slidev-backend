import 'dotenv/config';

const parseIntWithDefault = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  serverPort: parseIntWithDefault(process.env.PORT, 5310),
  preview: {
    basePort: parseIntWithDefault(process.env.PREVIEW_BASE_PORT, 5500),
    maxPort: parseIntWithDefault(process.env.PREVIEW_MAX_PORT, 6500)
  },
  build: {
    timeoutMs: parseIntWithDefault(process.env.SLIDEV_BUILD_TIMEOUT, 120_000)
  },
  screenshot: {
    width: parseIntWithDefault(process.env.SCREENSHOT_WIDTH, 1280),
    height: parseIntWithDefault(process.env.SCREENSHOT_HEIGHT, 720)
  }
};
