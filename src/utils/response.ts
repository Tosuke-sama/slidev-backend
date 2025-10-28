export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  details?: unknown;
}

export const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

export const fail = (message: string, details?: unknown): ApiError => ({
  success: false,
  message,
  details
});
