import request from 'supertest';
import fs from 'fs-extra';
import { createApp } from '../app';
import { slidevManager } from '../slidev/slidev-manager';

describe('Slidev routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (jest.spyOn(fs, 'pathExists') as unknown as jest.Mock).mockResolvedValue(true);
    (jest.spyOn(fs, 'ensureDir') as unknown as jest.Mock).mockResolvedValue(undefined);
  });

  it('starts preview successfully', async () => {
    jest.spyOn(slidevManager, 'startPreview').mockResolvedValue({ port: 6000, alreadyRunning: false });

    const app = createApp();
    const response = await request(app)
      .post('/api/preview/start')
      .send({ slideId: 1, slidesPath: '/tmp/demo/slides.md' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.port).toBe(6000);
  });

  it('returns 400 when slidesPath missing', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/preview/start')
      .send({ slideId: 1 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('build route delegates to slidevManager', async () => {
    jest.spyOn(slidevManager, 'buildProject').mockResolvedValue({ outputDir: '/tmp/out' });

    const app = createApp();
    const response = await request(app)
      .post('/api/build')
      .send({
        slideId: 1,
        slidesPath: '/tmp/demo/slides.md',
        outputDir: '/tmp/demo/output'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.outputDir).toBe('/tmp/out');
  });

  it('build route uses default output directory when missing', async () => {
    const buildSpy = jest
      .spyOn(slidevManager, 'buildProject')
      .mockResolvedValue({ outputDir: `${process.cwd()}/output/2` });

    const app = createApp();
    const response = await request(app)
      .post('/api/build')
      .send({
        slideId: 2,
        slidesPath: '/tmp/demo/slides.md'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.outputDir).toBe(`${process.cwd()}/output/2`);
    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        slideId: 2,
        slidesPath: '/tmp/demo/slides.md',
        outputDir: undefined
      })
    );
  });

  it('export route delegates to slidevManager', async () => {
    jest
      .spyOn(slidevManager, 'exportPresentation')
      .mockResolvedValue({ outputFile: '/tmp/export/slide-3.pdf', format: 'pdf' });

    const app = createApp();
    const response = await request(app)
      .post('/api/export')
      .send({
        slideId: 3,
        slidesPath: '/tmp/demo/slides.md',
        format: 'pdf'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.outputFile).toBe('/tmp/export/slide-3.pdf');
    expect(response.body.data.format).toBe('pdf');
  });

  it('serves index file for files route', async () => {
    const readSpy = jest
      .spyOn(slidevManager, 'readBuildAsset')
      .mockResolvedValue(Buffer.from('<html>demo</html>'));

    const app = createApp();
    const response = await request(app).get('/api/build/1/files');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toBe('<html>demo</html>');
    expect(readSpy).toHaveBeenCalledWith(1, 'index.html');
  });

  it('lists build files by slideId', async () => {
    jest.spyOn(slidevManager, 'listBuildEntries').mockResolvedValue([
      { name: 'index.html', path: 'index.html', directory: false, size: 100, modifiedAt: 1 }
    ]);

    const app = createApp();
    const response = await request(app).get('/api/build/1/entries');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.files).toHaveLength(1);
    expect(response.body.data.files[0].name).toBe('index.html');
  });

  it('returns built asset content', async () => {
    const readSpy = jest.spyOn(slidevManager, 'readBuildAsset').mockResolvedValue(Buffer.from('mock-content'));

    const app = createApp();
    const response = await request(app).get('/api/build/1/assets/index.html');

    expect(response.status).toBe(200);
    expect(response.text).toBe('mock-content');
    expect(readSpy).toHaveBeenCalledWith(1, 'assets/index.html');
  });

  it('returns exported file content', async () => {
    jest.spyOn(slidevManager, 'readExportFile').mockResolvedValue(Buffer.from('pdf-data'));

    const app = createApp();
    const response = await request(app).get('/api/export/3/pdf');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.text).toBe('pdf-data');
  });
});
