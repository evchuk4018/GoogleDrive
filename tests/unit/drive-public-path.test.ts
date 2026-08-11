import { describe, expect, it } from 'vitest';

import { drivePublicPath } from '@/lib/config/drive-public-path';

describe('Drive public paths', () => {
  it('keeps root-hosted development paths unchanged', () => {
    expect(drivePublicPath('/api/drive/items', '')).toBe('/api/drive/items');
  });

  it('prefixes production assets, routes, and API endpoints', () => {
    expect(drivePublicPath('/_next/static/app.js', '/drive/')).toBe('/drive/_next/static/app.js');
    expect(drivePublicPath('/api/drive/items', 'drive')).toBe('/drive/api/drive/items');
    expect(drivePublicPath('/', '/drive')).toBe('/drive');
  });
});
