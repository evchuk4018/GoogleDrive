'use client';

import { useEffect } from 'react';

import { drivePublicPath } from '@/lib/config/drive-public-path';

function driveScope() {
  const rootPath = drivePublicPath('/');
  return rootPath === '/' ? '/' : `${rootPath}/`;
}

export function DrivePwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    void navigator.serviceWorker.register(drivePublicPath('/sw.js'), {
      scope: driveScope(),
    }).catch(() => undefined);
  }, []);

  return null;
}
