function normalizeBasePath(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === '/') {
    return '';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

export const DRIVE_PUBLIC_BASE_PATH = normalizeBasePath(
  process.env.NEXT_PUBLIC_DRIVE_BASE_PATH,
);

export function drivePublicPath(path: string, basePath = DRIVE_PUBLIC_BASE_PATH) {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!normalizedBasePath) {
    return normalizedPath;
  }

  return normalizedPath === '/' ? normalizedBasePath : `${normalizedBasePath}${normalizedPath}`;
}
