import express from 'express';
import { httpLogger, logger } from './utils/logger';
import { slidevRouter } from './routes/slidev.routes';
import { fail } from './utils/response';
import { HttpError, isHttpError } from './utils/http-error';

export const createApp = () => {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(httpLogger);

  app.use('/api', slidevRouter);

  app.use((_req, res) => {
    res.status(404).json(fail('接口不存在'));
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isHttpError(err)) {
      res.status(err.status).json(fail(err.message, err.details));
      return;
    }

    logger.error({ err }, '未处理异常');
    res.status(500).json(fail('服务器内部错误'));
  });

  return app;
};
