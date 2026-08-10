import type { Metadata } from "next";
import "@/styles/global.css";

import { DrivePwaRegistration } from "@/components/drive/drive-pwa-registration";
import { drivePublicPath } from "@/lib/config/drive-public-path";

export const metadata: Metadata = {
  title: "Local Drive",
  description: "Private local file browser",
  manifest: drivePublicPath("/manifest.webmanifest"),
  icons: {
    icon: drivePublicPath("/drive-icon.svg"),
  },
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
