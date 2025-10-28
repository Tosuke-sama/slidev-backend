import { Router } from 'express';
import path from 'node:path';
import { slidevManager } from '../slidev/slidev-manager';
import { ok } from '../utils/response';
import {
  assertAbsolutePath,
  assertPositiveInt,
  assertString,
  ensureDirectory,
  ensureFileExists
} from '../utils/validation';

const router = Router();

const wrap = <T>(handler: (req: any, res: any, next: any) => Promise<T>) => {
  return (req: any, res: any, next: any) => {
    handler(req, res, next).catch(next);
  };
};

router.post(
  '/preview/start',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(req.body?.slideId, 'slideId');
    const slidesPath = assertAbsolutePath(assertString(req.body?.slidesPath, 'slidesPath'), 'slidesPath');
    await ensureFileExists(slidesPath, 'slidesPath');

    const port = typeof req.body?.port === 'number' ? req.body.port : undefined;
    const remote = req.body?.remote !== undefined ? Boolean(req.body.remote) : true;

    const result = await slidevManager.startPreview({ slideId, slidesPath, port, remote });
    res.json(ok(result));
  })
);

router.post(
  '/preview/stop',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(req.body?.slideId, 'slideId');
    const result = await slidevManager.stopPreview({ slideId });
    res.json(ok(result));
  })
);

router.post(
  '/build',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(req.body?.slideId, 'slideId');
    const slidesPath = assertAbsolutePath(assertString(req.body?.slidesPath, 'slidesPath'), 'slidesPath');
    const outputDir = assertAbsolutePath(assertString(req.body?.outputDir, 'outputDir'), 'outputDir');
    const base = req.body?.base ? assertString(req.body.base, 'base') : undefined;
    const tempDir = req.body?.tempDir
      ? assertAbsolutePath(assertString(req.body.tempDir, 'tempDir'), 'tempDir')
      : undefined;

    await ensureFileExists(slidesPath, 'slidesPath');
    await ensureDirectory(outputDir);

    const result = await slidevManager.buildProject({ slideId, slidesPath, outputDir, base, tempDir });
    res.json(ok(result));
  })
);

router.post(
  '/screenshot',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(req.body?.slideId, 'slideId');
    const slidesPath = assertAbsolutePath(assertString(req.body?.slidesPath, 'slidesPath'), 'slidesPath');
    const coverPath = assertAbsolutePath(assertString(req.body?.coverPath, 'coverPath'), 'coverPath');
    const width = req.body?.width ? assertPositiveInt(req.body.width, 'width') : undefined;
    const height = req.body?.height ? assertPositiveInt(req.body.height, 'height') : undefined;

    await ensureFileExists(slidesPath, 'slidesPath');
    await ensureDirectory(path.dirname(coverPath));

    const result = await slidevManager.captureScreenshot({ slideId, slidesPath, coverPath, width, height });
    res.json(ok(result));
  })
);

router.get(
  '/processes',
  wrap(async (_req, res) => {
    const processes = slidevManager.listInstances();
    res.json(ok({ processes }));
  })
);

export const slidevRouter = router;
