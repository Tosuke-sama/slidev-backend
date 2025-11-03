import { ChildProcess, exec, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import fs from 'fs-extra';
import waitOn from 'wait-on';
import puppeteer from 'puppeteer';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  BuildFileEntry,
  BuildRequestBody,
  BuildResult,
  ExportFormat,
  ExportRequestBody,
  ExportResult,
  ScreenshotRequestBody,
  ScreenshotResult,
  StartPreviewRequestBody,
  StartPreviewResult,
  StopPreviewRequestBody,
  SlidevInstanceInfo
} from '../types/api';

const execAsync = promisify(exec);

type SlidevInstance = {
  slideId: number;
  port: number;
  process: ChildProcess;
  startedAt: number;
};

export class SlidevManager {
  private readonly instances = new Map<number, SlidevInstance>();
  private readonly usedPorts = new Set<number>();
  private readonly buildOutputs = new Map<number, string>();
  private readonly exportOutputs = new Map<string, string>();

  async startPreview(body: StartPreviewRequestBody): Promise<StartPreviewResult> {
    const slideId = body.slideId;
    if (typeof slideId !== 'number' || Number.isNaN(slideId)) {
      throw new HttpError(400, 'slideId 参数无效');
    }

    const slidesPath = body.slidesPath;
    if (typeof slidesPath !== 'string' || slidesPath.trim().length === 0) {
      throw new HttpError(400, 'slidesPath 参数无效');
    }

    if (!(await fs.pathExists(slidesPath))) {
      throw new HttpError(400, `slidesPath 不存在: ${slidesPath}`);
    }

    const existing = this.instances.get(slideId);
    if (existing) {
      if (this.isProcessAlive(existing.process)) {
        return { port: existing.port, alreadyRunning: true };
      }
      this.instances.delete(slideId);
      this.usedPorts.delete(existing.port);
    }

    const port = await this.findAvailablePort(body.port);
    const instance = await this.spawnSlidevProcess(slideId, slidesPath, port, body.remote ?? true);

    this.instances.set(slideId, instance);
    this.usedPorts.add(instance.port);

    return { port: instance.port, alreadyRunning: false };
  }

  async stopPreview(body: StopPreviewRequestBody): Promise<{ success: boolean }> {
    const slideId = body.slideId;
    const instance = this.instances.get(slideId);
    if (!instance) {
      return { success: true };
    }
    this.terminateInstance(instance);
    return { success: true };
  }

  listInstances(): SlidevInstanceInfo[] {
    return Array.from(this.instances.values()).map((instance) => ({
      slideId: instance.slideId,
      port: instance.port,
      pid: instance.process.pid ?? undefined,
      startedAt: instance.startedAt
    }));
  }

  async captureScreenshot(body: ScreenshotRequestBody): Promise<ScreenshotResult> {
    const { slideId, slidesPath, coverPath } = body;

    if (!(await fs.pathExists(slidesPath))) {
      throw new HttpError(400, `slidesPath 不存在: ${slidesPath}`);
    }

    await fs.ensureDir(path.dirname(coverPath));

    const { port } = await this.startPreview({ slideId, slidesPath });
    const targetUrl = `http://localhost:${port}`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: body.width ?? config.screenshot.width,
        height: body.height ?? config.screenshot.height,
        deviceScaleFactor: 1
      });

      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: 'dark' }
      ]);

      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 0 });
      await page.screenshot({ path: coverPath as `${string}.png` | `${string}.jpeg` | `${string}.webp` | undefined, fullPage: true });
    } catch (error) {
      logger.error({ error }, '截图失败');
      throw error;
    } finally {
      await browser.close();
    }

    return { coverPath };
  }

  async buildProject(body: BuildRequestBody): Promise<BuildResult> {
    const { slideId, slidesPath } = body;

    if (!(await fs.pathExists(slidesPath))) {
      throw new HttpError(400, `slidesPath 不存在: ${slidesPath}`);
    }

    const base = body.base ?? `/api/build/${slideId}/`;
    const tempDir = body.tempDir ?? path.join(process.cwd(), '.slidev-temp-build', `${slideId}-${Date.now()}`);
    await fs.ensureDir(path.dirname(tempDir));

    const bin = this.resolveSlidevBinary();
    const command = this.buildCommand(bin, slidesPath, base, tempDir);

    logger.info({ bin, command }, '执行 slidev build');

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: path.dirname(slidesPath),
        timeout: config.build.timeoutMs
      });
      if (stdout) {
        logger.debug({ stdout }, 'slidev build stdout');
      }
      if (stderr) {
        logger.warn({ stderr }, 'slidev build stderr');
      }
    } catch (error) {
      logger.error({ error }, 'slidev build 失败');
      throw error;
    }

    const targetOutputDir = this.resolveOutputDir(slideId, body.outputDir);

    await fs.ensureDir(path.dirname(targetOutputDir));
    if (await fs.pathExists(targetOutputDir)) {
      await fs.remove(targetOutputDir);
    }

    await fs.move(tempDir, targetOutputDir, { overwrite: true });
    this.buildOutputs.set(slideId, targetOutputDir);

    return { outputDir: targetOutputDir };
  }

  async exportPresentation(body: ExportRequestBody): Promise<ExportResult> {
    const { slideId, slidesPath } = body;
    if (!(await fs.pathExists(slidesPath))) {
      throw new HttpError(400, `slidesPath 不存在: ${slidesPath}`);
    }

    const format: ExportFormat = (body.format ?? 'pdf').toLowerCase() as ExportFormat;
    if (!['pdf', 'pptx'].includes(format)) {
      throw new HttpError(400, `不支持的导出格式: ${format}`);
    }

    const outputFile = this.resolveExportPath(slideId, format, body.outputFile);
    await fs.ensureDir(path.dirname(outputFile));
    if (await fs.pathExists(outputFile)) {
      await fs.remove(outputFile);
    }

    const bin = this.resolveSlidevBinary();
    const command = this.exportCommand(bin, slidesPath, outputFile, format, body.dark ?? false);

    logger.info({ bin, command, format, outputFile }, '执行 slidev export');

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: path.dirname(slidesPath),
        timeout: config.build.timeoutMs
      });
      if (stdout) {
        logger.debug({ stdout }, 'slidev export stdout');
      }
      if (stderr) {
        logger.warn({ stderr }, 'slidev export stderr');
      }
    } catch (error) {
      logger.error({ error }, 'slidev export 失败');
      throw error;
    }

    if (!(await fs.pathExists(outputFile))) {
      throw new HttpError(500, `导出文件未生成: ${outputFile}`);
    }

    this.exportOutputs.set(this.exportKey(slideId, format), outputFile);

    return { outputFile, format };
  }

  private resolveOutputDir(slideId: number, explicit?: string): string {
    if (explicit) {
      return explicit;
    }
    return path.join(process.cwd(), 'output', `${slideId}`);
  }

  async listBuildEntries(slideId: number, relativePath = ''): Promise<BuildFileEntry[]> {
    const baseDir = await this.getOutputDir(slideId);
    if (!baseDir) {
      throw new HttpError(404, `未找到 slideId ${slideId} 的构建产物`);
    }

    const safeRelative = relativePath.replace(/^\//, '');
    const baseResolved = path.resolve(baseDir);
    const targetResolved = relativePath ? path.resolve(baseResolved, safeRelative) : baseResolved;

    if (!targetResolved.startsWith(baseResolved)) {
      throw new HttpError(400, `非法目录路径: ${relativePath}`);
    }

    if (!(await fs.pathExists(targetResolved))) {
      throw new HttpError(404, `目录不存在: ${relativePath || '.'}`);
    }
    const entries = await fs.readdir(targetResolved);

    const results: BuildFileEntry[] = await Promise.all(
      entries.map(async (name) => {
        const fullPath = path.join(targetResolved, name);
        const stats = await fs.stat(fullPath);
        const normalized = path
          .relative(baseResolved, path.resolve(fullPath))
          .split(path.sep)
          .join('/');
        return {
          name,
          path: normalized,
          directory: stats.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtimeMs
        };
      })
    );

    return results;
  }

  async readBuildAsset(slideId: number, assetPath: string): Promise<Buffer> {
    const baseDir = await this.getOutputDir(slideId);
    if (!baseDir) {
      throw new HttpError(404, `未找到 slideId ${slideId} 的构建产物`);
    }

    const safeRelative = assetPath.replace(/^\//, '');
    const baseResolved = path.resolve(baseDir);
    const targetResolved = path.resolve(baseResolved, safeRelative);
    if (!targetResolved.startsWith(baseResolved)) {
      throw new HttpError(400, `非法路径: ${assetPath}`);
    }

    const exists = await fs.pathExists(targetResolved);
    if (!exists) {
      throw new HttpError(404, `文件不存在: ${assetPath}`);
    }

    const stats = await fs.stat(targetResolved);
    if (stats.isDirectory()) {
      throw new HttpError(400, `请求路径是目录: ${assetPath}`);
    }

    return fs.readFile(targetResolved);
  }

  private async getOutputDir(slideId: number): Promise<string | undefined> {
    const existing = this.buildOutputs.get(slideId);
    if (existing && (await fs.pathExists(existing))) {
      return existing;
    }
    const fallback = this.resolveOutputDir(slideId);
    if (await fs.pathExists(fallback)) {
      this.buildOutputs.set(slideId, fallback);
      return fallback;
    }
    return undefined;
  }

  async readExportFile(slideId: number, format: ExportFormat): Promise<Buffer> {
    const filePath = await this.getExportFile(slideId, format);
    if (!filePath) {
      throw new HttpError(404, `未找到 slideId ${slideId} 的 ${format} 导出文件`);
    }

    if (!(await fs.pathExists(filePath))) {
      throw new HttpError(404, `导出文件不存在: ${filePath}`);
    }

    return fs.readFile(filePath);
  }

  private resolveExportPath(slideId: number, format: ExportFormat, explicit?: string): string {
    if (explicit) {
      return explicit;
    }
    const filename = `presentation.${format}`;
    return path.join(process.cwd(), 'output', `${slideId}`, 'exports', filename);
  }

  private exportCommand(bin: string, slidesPath: string, outputFile: string, format: ExportFormat, dark: boolean): string {
    const quoted = (value: string) => `"${value}"`;
    const darkFlag = dark ? ' --dark' : '';
    if (bin === 'npx') {
      return `${bin} -y @slidev/cli export ${quoted(slidesPath)} --format ${format} --output ${quoted(outputFile)}${darkFlag}`;
    }
    return `${bin} export ${quoted(slidesPath)} --format ${format} --output ${quoted(outputFile)}${darkFlag}`;
  }

  private exportKey(slideId: number, format: ExportFormat): string {
    return `${slideId}:${format}`;
  }

  private async getExportFile(slideId: number, format: ExportFormat): Promise<string | undefined> {
    const key = this.exportKey(slideId, format);
    const cached = this.exportOutputs.get(key);
    if (cached && (await fs.pathExists(cached))) {
      return cached;
    }
    const fallback = this.resolveExportPath(slideId, format);
    if (await fs.pathExists(fallback)) {
      this.exportOutputs.set(key, fallback);
      return fallback;
    }
    return undefined;
  }

  shutdownAll(): void {
    for (const instance of this.instances.values()) {
      this.terminateInstance(instance);
    }
    this.instances.clear();
    this.usedPorts.clear();
    this.buildOutputs.clear();
    this.exportOutputs.clear();
  }

  private terminateInstance(instance: SlidevInstance) {
    if (!instance) return;

    try {
      instance.process.removeAllListeners('exit');
      if (!instance.process.killed) {
        instance.process.kill();
      }
    } catch (error) {
      logger.warn({ error }, '终止 Slidev 进程失败');
    }

    this.instances.delete(instance.slideId);
    this.usedPorts.delete(instance.port);
  }

  private isProcessAlive(child: ChildProcess): boolean {
    if (!child.pid) return false;
    try {
      process.kill(child.pid, 0);
      return true;
    } catch (err) {
      return false;
    }
  }

  private async spawnSlidevProcess(slideId: number, slidesPath: string, port: number, remote = true): Promise<SlidevInstance> {
    const bin = this.resolveSlidevBinary();
    const args = this.previewArgs(bin, slidesPath, port, remote);

    logger.info({ slideId, port, bin, args }, '启动 Slidev 预览');

    const proc = spawn(bin, args, {
      cwd: path.dirname(slidesPath),
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: bin === 'npx'
    });

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('do you want to install it now')) {
        proc.stdin?.write('y\n');
      }
      logger.debug({ slideId, text }, 'slidev stdout');
    });

    proc.stderr?.on('data', (data) => {
      logger.error({ slideId, text: data.toString() }, 'slidev stderr');
    });

    proc.on('exit', (code, signal) => {
      logger.info({ slideId, code, signal }, 'Slidev 进程退出');
      this.instances.delete(slideId);
      this.usedPorts.delete(port);
    });

    try {
      await waitOn({
        resources: [`tcp:localhost:${port}`],
        timeout: 30_000
      });
    } catch (error) {
      this.terminateInstance({ slideId, port, process: proc, startedAt: Date.now() });
      throw new HttpError(500, `Slidev 在端口 ${port} 启动失败`);
    }

    return { slideId, port, process: proc, startedAt: Date.now() };
  }

  private resolveSlidevBinary(): string {
    const binName = process.platform === 'win32' ? 'slidev.cmd' : 'slidev';
    const envBin = process.env.SLIDEV_CLI_PATH;
    if (envBin && fs.existsSync(envBin)) {
      return envBin;
    }

    const localBin = path.join(process.cwd(), 'node_modules', '.bin', binName);
    if (fs.existsSync(localBin)) {
      return localBin;
    }

    const siblingBin = path.join(process.cwd(), '..', 'node_modules', '.bin', binName);
    if (fs.existsSync(siblingBin)) {
      return siblingBin;
    }

    return 'npx';
  }

  private previewArgs(bin: string, slidesPath: string, port: number, remote: boolean): string[] {
    const args = [slidesPath, '--port', port.toString()];
    if (remote) {
      args.push('--remote');
    }
    return bin === 'npx' ? ['-y', '@slidev/cli', ...args] : args;
  }

  private buildCommand(bin: string, slidesPath: string, base: string, outDir: string): string {
    const quoted = (value: string) => `"${value}"`;
    if (bin === 'npx') {
      return `${bin} -y @slidev/cli build ${quoted(slidesPath)} --base ${quoted(base)} --out ${quoted(outDir)}`;
    }
    return `${bin} build ${quoted(slidesPath)} --base ${quoted(base)} --out ${quoted(outDir)}`;
  }

  private async findAvailablePort(preferred?: number): Promise<number> {
    if (preferred) {
      const available = await this.isPortAvailable(preferred);
      if (available) {
        return preferred;
      }
    }

    for (let port = config.preview.basePort; port <= config.preview.maxPort; port++) {
      if (this.usedPorts.has(port)) continue;
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    throw new HttpError(500, '没有可用端口');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => {
        resolve(false);
      });
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '0.0.0.0');
    });
  }
}

export const slidevManager = new SlidevManager();
