'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initStores, getDemoState } from '@/lib/store/demo-store';
import { LogoMark } from '@/components/layout/logo';

/** Entry point: first-time visitors see the welcome screen, returning visitors go to the dashboard. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    initStores();
    const s = getDemoState();
    router.replace(s?.user.onboarded ? '/overview' : '/welcome');
  }, [router]);
  return (
    <div className="grid min-h-dvh place-items-center">
      <LogoMark className="size-12 animate-pulse" />
    </div>
  );
}
