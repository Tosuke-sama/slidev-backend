import request from 'supertest';
import { createApp } from '../app';
import { slidevManager } from '../slidev/slidev-manager';
import fs from 'fs-extra';

jest.mock('fs-extra', () => ({
  pathExists: jest.fn().mockResolvedValue(true),
  ensureDir: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  move: jest.fn().mockResolvedValue(undefined)
}));

describe('Slidev routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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
});
