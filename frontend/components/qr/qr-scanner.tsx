'use client';

import * as React from 'react';
import { Camera, CameraOff, ImageUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ScannerInstance = {
  start: (camera: { facingMode: string }, config: { fps: number; qrbox: { width: number; height: number } }, onSuccess: (text: string) => void, onError: () => void) => Promise<null>;
  stop: () => Promise<void>;
  clear: () => void;
  scanFile: (file: File, showImage?: boolean) => Promise<string>;
  isScanning: boolean;
};

const READER_ID = 'novafin-qr-reader';

/**
 * Camera + image-upload QR scanner built on html5-qrcode. Camera permission is
 * requested ONLY after the user clicks "Start camera". Decoded text is handed to
 * the parent — the scanner itself never triggers a payment.
 */
export function QrScanner({ onDecoded }: { onDecoded: (text: string) => void }) {
  const scannerRef = React.useRef<ScannerInstance | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'starting' | 'scanning'>('idle');
  const [error, setError] = React.useState<string>();
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const getScanner = async (): Promise<ScannerInstance> => {
    if (!scannerRef.current) {
      const { Html5Qrcode } = await import('html5-qrcode');
      scannerRef.current = new Html5Qrcode(READER_ID, { verbose: false }) as unknown as ScannerInstance;
    }
    return scannerRef.current;
  };

  const stop = React.useCallback(async () => {
    const s = scannerRef.current;
    if (s?.isScanning) {
      try {
        await s.stop();
      } catch {
        /* ignore */
      }
    }
    setStatus('idle');
  }, []);

  React.useEffect(() => () => void stop(), [stop]);

  const start = async () => {
    setError(undefined);
    if (!window.isSecureContext) {
      setError('Camera access requires HTTPS or http://localhost. Use “Upload image” instead.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Use “Upload image” instead.');
      return;
    }
    setStatus('starting');
    try {
      const scanner = await getScanner();
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          void stop();
          onDecoded(text);
        },
        () => {
          /* per-frame decode misses are expected */
        },
      );
      setStatus('scanning');
    } catch (e) {
      setStatus('idle');
      const msg = String((e as Error)?.message ?? e);
      if (/NotAllowed|Permission/i.test(msg)) setError('Camera permission was denied. Allow camera access in your browser settings, or upload an image.');
      else if (/NotFound|Requested device not found|no camera/i.test(msg)) setError('No camera was found on this device. Upload a QR image instead.');
      else if (/NotReadable|in use/i.test(msg)) setError('The camera is in use by another application.');
      else setError(`Could not start the camera: ${msg}`);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    setUploading(true);
    try {
      await stop();
      const scanner = await getScanner();
      const text = await scanner.scanFile(file, false);
      onDecoded(text);
    } catch {
      setError('No QR code could be read from that image. Try a clearer, uncropped image.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl border bg-black/80">
        <div id={READER_ID} className="size-full" />
        {status !== 'scanning' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/70">
            {status === 'starting' ? (
              <Loader2 className="size-8 animate-spin" />
            ) : (
              <div className="space-y-2">
                <Camera className="mx-auto size-10" />
                <p>Camera is off. Permission is only requested when you press Start camera.</p>
              </div>
            )}
          </div>
        )}
        {status === 'scanning' && <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-teal shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {status === 'scanning' ? (
          <Button variant="outline" onClick={() => void stop()}>
            <CameraOff /> Stop camera
          </Button>
        ) : (
          <Button onClick={start} disabled={status === 'starting'}>
            <Camera /> Start camera
          </Button>
        )}
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <ImageUp />} Upload image
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
