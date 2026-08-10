import { describe, expect, it } from 'vitest';

import { createDriveManifest } from '@/app/manifest';

describe('Drive PWA manifest', () => {
  it('keeps the root-hosted manifest paths unchanged', () => {
    const manifest = createDriveManifest('');

    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.share_target?.action).toBe('/share-target');
    expect(manifest.icons?.[0]?.src).toBe('/drive-icon-192.svg');
  });

  it('prefixes the install and share paths for the /drive mount', () => {
    const manifest = createDriveManifest('/drive');
    const files = manifest.share_target?.params.files;

    expect(manifest.start_url).toBe('/drive');
    expect(manifest.scope).toBe('/drive/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.share_target).toMatchObject({
      action: '/drive/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
    });
    expect(files).toEqual([{ name: 'files', accept: ['*/*'] }]);
    expect(manifest.icons).toContainEqual({
      src: '/drive/drive-icon-192.svg',
      sizes: '192x192',
      type: 'image/svg+xml',
      purpose: 'any',
    });
    expect(manifest.icons).toContainEqual({
      src: '/drive/drive-icon-512.svg',
      sizes: '512x512',
      type: 'image/svg+xml',
      purpose: 'maskable',
    });
  });
});
