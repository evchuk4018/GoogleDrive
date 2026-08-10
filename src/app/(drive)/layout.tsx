import type { ReactNode } from 'react';

export const metadata = {
  title: 'Drive',
  description: 'A private, simple file browser.',
};

export default function DriveLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
