import { Router } from 'express';
import path from 'node:path';
import { slidevManager } from '../slidev/slidev-manager';
import { ok } from '../utils/response';
import { HttpError } from '../utils/http-error';
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
    const outputDir = req.body?.outputDir
      ? assertAbsolutePath(assertString(req.body.outputDir, 'outputDir'), 'outputDir')
      : undefined;
    const base = req.body?.base ? assertString(req.body.base, 'base') : undefined;
    const tempDir = req.body?.tempDir
      ? assertAbsolutePath(assertString(req.body.tempDir, 'tempDir'), 'tempDir')
      : undefined;

    await ensureFileExists(slidesPath, 'slidesPath');
    if (outputDir) {
      await ensureDirectory(outputDir);
    }

    const result = await slidevManager.buildProject({ slideId, slidesPath, outputDir, base, tempDir });
    res.json(ok(result));
  })
);

const supportedExportFormats = new Set(['pdf', 'pptx']);

router.post(
  '/export',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(req.body?.slideId, 'slideId');
    const slidesPath = assertAbsolutePath(assertString(req.body?.slidesPath, 'slidesPath'), 'slidesPath');
    await ensureFileExists(slidesPath, 'slidesPath');

    const formatRaw = req.body?.format ? assertString(req.body.format, 'format').toLowerCase() : undefined;
    if (formatRaw && !supportedExportFormats.has(formatRaw)) {
      throw new HttpError(400, `format 必须为 ${Array.from(supportedExportFormats).join(', ')}`);
    }

    const outputFile = req.body?.outputFile
      ? assertAbsolutePath(assertString(req.body.outputFile, 'outputFile'), 'outputFile')
      : undefined;

    if (outputFile) {
      await ensureDirectory(path.dirname(outputFile));
    }

    const dark = req.body?.dark !== undefined ? Boolean(req.body.dark) : false;

    const result = await slidevManager.exportPresentation({
      slideId,
      slidesPath,
      format: formatRaw as 'pdf' | 'pptx' | undefined,
      outputFile,
      dark
    });

    res.json(ok(result));
  })
);

router.get(
  '/build/:slideId/files',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(Number.parseInt(req.params.slideId, 10), 'slideId');
    const requested = req.query?.path ? assertString(req.query.path, 'path') : '';
    const assetPath = requested && requested.trim().length > 0 ? requested : 'index.html';
    const data = await slidevManager.readBuildAsset(slideId, assetPath);
    res.setHeader('Content-Type', resolveContentType(assetPath));
    res.send(data);
  })
);

const resolveContentType = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
};

router.get(
  '/build/:slideId/assets/*',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(Number.parseInt(req.params.slideId, 10), 'slideId');
    const assetSegment = req.params[0] ?? '';
    const assetPath = assetSegment.length > 0 ? `assets/${assetSegment}` : 'assets/index.html';
    const data = await slidevManager.readBuildAsset(slideId, assetPath);
    res.setHeader('Content-Type', resolveContentType(assetPath));
    res.send(data);
  })
);

router.get(
  '/build/:slideId/entries',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(Number.parseInt(req.params.slideId, 10), 'slideId');
    const relativePath = req.query?.path ? assertString(req.query.path, 'path') : '';
    const files = await slidevManager.listBuildEntries(slideId, relativePath);
    res.json(ok({ files }));
  })
);

const resolveExportContentType = (format: string) => {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    default:
      return 'application/octet-stream';
  }
};

router.get(
  '/export/:slideId/:format',
  wrap(async (req, res) => {
    const slideId = assertPositiveInt(Number.parseInt(req.params.slideId, 10), 'slideId');
    const format = assertString(req.params.format, 'format').toLowerCase();
    if (!supportedExportFormats.has(format)) {
      throw new HttpError(400, `format 必须为 ${Array.from(supportedExportFormats).join(', ')}`);
    }

    const data = await slidevManager.readExportFile(slideId, format as 'pdf' | 'pptx');
    res.setHeader('Content-Type', resolveExportContentType(format));
    res.setHeader('Content-Disposition', `inline; filename="slide-${slideId}.${format}"`);
    res.send(data);
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
