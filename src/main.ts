import { config } from './config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { slidevManager } from './slidev/slidev-manager';

const app = createApp();

const server = app.listen(config.serverPort, () => {
  logger.info({ port: config.serverPort }, 'Slidev backend 服务已启动');
});

const shutdown = () => {
  logger.info('收到退出信号，准备关闭');
  server.close(() => {
    logger.info('HTTP 服务器已关闭');
    slidevManager.shutdownAll();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
