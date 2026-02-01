import './globals.css';

import type { Metadata } from 'next';
import React from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export const metadata: Metadata = {
  title: 'AG-UI Chat (Demo)',
  description: 'AG-UI demo chat UI (Control Plane)',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
