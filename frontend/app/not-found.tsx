import Link from 'next/link';
import { LogoMark } from '@/components/layout/logo';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-3">
        <LogoMark className="mx-auto size-12" />
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">This page does not exist in the NovaFin demo.</p>
        <Link href="/overview" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
