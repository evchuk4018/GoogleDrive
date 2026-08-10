import type { ReactNode, SVGProps } from 'react';

export type DriveIconName =
  | 'archive'
  | 'arrow-down'
  | 'arrow-up'
  | 'chevron-down'
  | 'chevron-right'
  | 'clock'
  | 'close'
  | 'copy'
  | 'file'
  | 'folder'
  | 'grid'
  | 'home'
  | 'menu'
  | 'more'
  | 'plus'
  | 'search'
  | 'settings'
  | 'share'
  | 'sparkle'
  | 'star'
  | 'trash'
  | 'upload'
  | 'view-list';

const paths: Record<DriveIconName, ReactNode> = {
  archive: <path d="M4 7h16M5 7l1 13h12l1-13M8 4h8l1 3H7l1-3Zm3 7h2" />,
  'arrow-down': <path d="M12 4v13m0 0 5-5m-5 5-5-5M5 21h14" />,
  'arrow-up': <path d="M12 20V7m0 0-5 5m5-5 5 5M5 3h14" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: <><rect x="8" y="8" width="10" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /></>,
  folder: <path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2Z" />,
  grid: <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></>,
  home: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 6.2 12a1.7 1.7 0 0 0-1.2-2.9h-.2a1.7 1.7 0 0 1 0-3.4H5A1.7 1.7 0 0 0 6.2 3.8l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1A1.7 1.7 0 0 0 11.5 0h.2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1A1.7 1.7 0 0 0 21.8 7h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9l.1.1" transform="translate(-1.5 1.5) scale(.87)" /></>,
  share: <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="16" r="2.5" /><path d="m10 9.5 4 4M16 5v4h-4" /></>,
  sparkle: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm6 11 .6 2.4L21 17l-2.4.6L18 20l-.6-2.4L15 17l2.4-.6L18 14Z" />,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
  trash: <><path d="M5 7h14M10 11v5m4-5v5M8 7l1 13h6l1-13M9 4h6l1 3H8l1-3Z" /></>,
  upload: <><path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v5h14v-5" /></>,
  'view-list': <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
};

export function DriveIcon({ name, size = 20, ...props }: { name: DriveIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size} {...props}>
      {paths[name]}
    </svg>
  );
}
