import type { Metadata, Viewport } from "next";
import "@/styles/global.css";

import { DrivePwaRegistration } from "@/components/drive/drive-pwa-registration";
import { drivePublicPath } from "@/lib/config/drive-public-path";

export const metadata: Metadata = {
  title: "Local Drive",
  description: "Private local file browser",
  manifest: drivePublicPath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Drive",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: drivePublicPath("/drive-icon.svg"),
    apple: {
      url: drivePublicPath("/apple-touch-icon.png"),
      sizes: "180x180",
      type: "image/png",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1a1b1f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <DrivePwaRegistration />
        {children}
      </body>
    </html>
  );
}
