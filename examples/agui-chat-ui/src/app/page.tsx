'use client';

import React from 'react';
import { Toaster } from 'sonner';

import { DemoApp } from '@/components/demo-app';

export default function Page(): React.ReactNode {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Toaster richColors closeButton />
      <DemoApp />
    </React.Suspense>
  );
}
