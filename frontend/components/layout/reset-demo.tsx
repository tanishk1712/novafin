'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { demoApi, errorMessage } from '@/lib/api/demo-api';

export function ResetDemoDialog({ open, onOpenChange, redirect = '/welcome' }: { open: boolean; onOpenChange: (o: boolean) => void; redirect?: string }) {
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const reset = async () => {
    setBusy(true);
    try {
      await demoApi.resetDemo();
      toast.success('Demo data reset', { description: 'Your account was restored to the original seed data.' });
      onOpenChange(false);
      router.push(redirect);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset demo data?</DialogTitle>
          <DialogDescription>
            This restores the original demo account: $25,000.00 cash, the seeded portfolio, 3 bank accounts and the sample history. Everything you did in this
            browser (transactions, trades, settings) will be erased from localStorage.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={reset} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset demo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
