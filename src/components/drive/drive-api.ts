import type { DriveApiErrorShape, DriveItem } from './drive-types';
import { drivePublicPath } from '@/lib/config/drive-public-path';

export class DriveApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveApiError';
    this.status = status;
  }
}

export const DRIVE_READ_TIMEOUT_MS = 3_000;

export class DriveRequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Drive did not respond within ${Math.ceil(timeoutMs / 1000)} seconds. Check your connection and try again.`);
    this.name = 'DriveRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class DriveNetworkError extends Error {
  constructor() {
    super('Drive could not be reached. Check your Tailscale connection and try again.');
    this.name = 'DriveNetworkError';
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs, ...init } = options;
  const controller = timeoutMs === undefined ? undefined : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetch(drivePublicPath(path), {
      ...init,
      credentials: 'include',
      ...(controller ? { signal: controller.signal } : {}),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload: unknown = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (!response.ok) {
      const body = payload as DriveApiErrorShape | string | null;
      const nestedError = typeof body === 'object' && body !== null && typeof body.error === 'object' && body.error !== null
        ? body.error.message
        : typeof body === 'object' && body !== null && typeof body.error === 'string' ? body.error : undefined;
      const textMessage = typeof body === 'string' && !contentType.includes('text/html')
        ? body.trim() || undefined
        : undefined;
      const fallbackMessage = response.status === 404
        ? 'The Drive endpoint was not found. Check the configured Drive URL.'
        : response.status >= 500
          ? `Drive returned a server error (${response.status}). Please try again.`
          : `The Drive request failed (${response.status}).`;
      const message = textMessage ?? (typeof body === 'object' && body !== null
        ? body.message ?? nestedError ?? body.detail
        : undefined) ?? fallbackMessage;
      throw new DriveApiError(message, response.status);
    }

    return payload as T;
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new DriveRequestTimeoutError(timeoutMs!);
    }

    if (error instanceof TypeError) {
      throw new DriveNetworkError();
    }

    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function jsonRequest<T>(path: string, method: 'PATCH' | 'POST', body: unknown) {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function login(token: string) {
  return jsonRequest<unknown>('/api/auth/login', 'POST', { token });
}

export function listItems(parentId: string | null, includeTrash = false) {
  return request<unknown>(
    `/api/drive/items${queryString({
      parentId: parentId ?? undefined,
      includeTrash: includeTrash ? 'true' : undefined,
    })}`,
    { timeoutMs: DRIVE_READ_TIMEOUT_MS },
  );
}

export function searchItems(query: string) {
  return request<unknown>(`/api/drive/search${queryString({ q: query })}`, { timeoutMs: DRIVE_READ_TIMEOUT_MS });
}

export function createFolder(name: string, parentId: string | null) {
  return jsonRequest<unknown>('/api/drive/folders', 'POST', {
    name,
    parentId,
  });
}

export function uploadFile(file: File, parentId: string | null) {
  return request<unknown>('/api/drive/upload', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': file.name,
      ...(parentId ? { 'X-Parent-Id': parentId } : {}),
    },
    body: file,
  });
}

export function renameItem(itemId: string, name: string) {
  return jsonRequest<unknown>(`/api/drive/items/${encodeURIComponent(itemId)}`, 'PATCH', {
    name,
  });
}

export function moveItem(itemId: string, parentId: string | null) {
  return jsonRequest<unknown>(`/api/drive/items/${encodeURIComponent(itemId)}`, 'PATCH', {
    parentId,
  });
}

export function trashItem(itemId: string) {
  return request<unknown>(`/api/drive/items/${encodeURIComponent(itemId)}/trash`, {
    method: 'POST',
  });
}

export function restoreItem(itemId: string) {
  return request<unknown>(`/api/drive/items/${encodeURIComponent(itemId)}/restore`, {
    method: 'POST',
  });
}

export function permanentlyDeleteItem(itemId: string) {
  return request<unknown>(`/api/drive/items/${encodeURIComponent(itemId)}/permanent`, {
    method: 'DELETE',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  return null;
}

function numberValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function booleanValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === 'boolean') {
      return record[key] as boolean;
    }
  }

  return false;
}

export function normalizeDriveItem(value: unknown): DriveItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value, 'id', 'item_id');
  const name = stringValue(value, 'name', 'filename', 'file_name');

  if (!id || !name) {
    return null;
  }

  const kindValue = stringValue(value, 'kind', 'type', 'item_type');
  const isFolder =
    kindValue === 'folder' ||
    value.is_folder === true ||
    value.isFolder === true ||
    value.kind === 'directory';

  return {
    id,
    name,
    kind: isFolder ? 'folder' : 'file',
    mimeType: stringValue(value, 'mimeType', 'contentType', 'mime_type', 'content_type'),
    size: numberValue(value, 'size', 'sizeBytes', 'size_bytes', 'bytes'),
    updatedAt: stringValue(value, 'updatedAt', 'updated_at', 'modified_at'),
    parentId: stringValue(value, 'parentId', 'parent_id'),
    trashed: booleanValue(value, 'trashed', 'is_trashed', 'deleted') || value.trashedAt != null,
  };
}

function itemArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['items', 'results', 'data']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (isRecord(value)) {
      const nested = itemArray(value);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

export function normalizeDriveItems(payload: unknown) {
  return itemArray(payload)
    .map(normalizeDriveItem)
    .filter((item): item is DriveItem => item !== null);
}
