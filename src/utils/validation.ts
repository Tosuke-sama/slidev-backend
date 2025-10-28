import path from 'node:path';
import fs from 'fs-extra';
import { HttpError } from './http-error';

export const assertPositiveInt = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `${field} 必须为正整数`);
  }
  return value;
};

export const assertString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} 必须为非空字符串`);
  }
  return value;
};

export const assertAbsolutePath = (value: string, field: string): string => {
  if (!path.isAbsolute(value)) {
    throw new HttpError(400, `${field} 必须为绝对路径`);
  }
  return value;
};

export const ensureFileExists = async (filePath: string, field: string): Promise<void> => {

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    throw new HttpError(400, `${field} 不存在: ${filePath}`);
  }
};

export const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.ensureDir(dirPath);
};
