export interface StartPreviewRequestBody {
  slideId: number;
  slidesPath: string;
  port?: number;
  remote?: boolean;
}

export interface StartPreviewResult {
  port: number;
  alreadyRunning: boolean;
}

export interface BuildRequestBody {
  slideId: number;
  slidesPath: string;
  outputDir?: string;
  base?: string;
  tempDir?: string;
}

export interface BuildResult {
  outputDir: string;
}

export interface BuildFileEntry {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  modifiedAt: number;
}

export interface BuildFilesResult {
  files: BuildFileEntry[];
}

export type ExportFormat = 'pdf' | 'pptx';

export interface ExportRequestBody {
  slideId: number;
  slidesPath: string;
  format?: ExportFormat;
  outputFile?: string;
  dark?: boolean;
}

export interface ExportResult {
  outputFile: string;
  format: ExportFormat;
}

export interface ScreenshotRequestBody {
  slideId: number;
  slidesPath: string;
  coverPath: string;
  width?: number;
  height?: number;
}

export interface ScreenshotResult {
  coverPath: string;
}

export interface StopPreviewRequestBody {
  slideId: number;
}

export interface SlidevInstanceInfo {
  slideId: number;
  port: number;
  pid: number | undefined;
  startedAt: number;
}
