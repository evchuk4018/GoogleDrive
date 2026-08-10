import type { MetadataRoute } from 'next';

import {
  DRIVE_PUBLIC_BASE_PATH,
  drivePublicPath,
} from '@/lib/config/drive-public-path';

function driveScope(basePath: string) {
  const rootPath = drivePublicPath('/', basePath);
  return rootPath === '/' ? '/' : `${rootPath}/`;
}

export function createDriveManifest(basePath = DRIVE_PUBLIC_BASE_PATH): MetadataRoute.Manifest {
  const rootPath = drivePublicPath('/', basePath);

  return {
    id: rootPath,
    name: 'Drive',
    short_name: 'Drive',
    description: 'A private, simple file browser.',
    start_url: rootPath,
    scope: driveScope(basePath),
    display: 'standalone',
    background_color: '#111315',
    theme_color: '#1a1b1f',
    icons: [
      {
        src: drivePublicPath('/drive-icon-192.svg', basePath),
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: drivePublicPath('/drive-icon-512.svg', basePath),
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    share_target: {
      action: drivePublicPath('/share-target', basePath),
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        files: [{
          name: 'files',
          accept: ['*/*'],
        }],
      },
    },
  };
}

export default function manifest(): MetadataRoute.Manifest {
  return createDriveManifest();
}
