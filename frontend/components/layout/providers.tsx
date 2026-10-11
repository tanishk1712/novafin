'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useTheme } from 'next-themes';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster richColors closeButton position="top-right" theme={resolvedTheme === 'light' ? 'light' : 'dark'} toastOptions={{ duration: 4500 }} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="novafin_theme" disableTransitionOnChange>
      {children}
      <ThemedToaster />
    </ThemeProvider>
  );
}
