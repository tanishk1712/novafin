'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { STOCKS_SEED } from '@novafin/shared';
import { Input } from '@/components/ui/primitives';
import { ChangePill, StockLogo } from '@/components/common';
import { useMarketState } from '@/lib/store/demo-store';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Typeahead over the 150+ symbol seed dataset. */
export function StockSearch({
  onSelect,
  placeholder = 'Search symbol or company…',
  autoFocus,
  exclude,
  className,
}: {
  onSelect: (symbol: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  exclude?: string[];
  className?: string;
}) {
  const market = useMarketState();
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const results = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return STOCKS_SEED.filter((s) => !exclude?.includes(s.symbol))
      .filter((s) => s.symbol.toLowerCase().startsWith(term) || s.name.toLowerCase().includes(term))
      .sort((a, b) => Number(b.symbol.toLowerCase().startsWith(term)) - Number(a.symbol.toLowerCase().startsWith(term)))
      .slice(0, 8);
  }, [q, exclude]);

  const choose = (symbol: string) => {
    onSelect(symbol);
    setQ('');
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, results.length - 1));
          if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
          if (e.key === 'Enter' && results[hi]) {
            e.preventDefault();
            choose(results[hi].symbol);
          }
        }}
        placeholder={placeholder}
        className="pl-9"
        aria-label="Search stocks"
        role="combobox"
        aria-expanded={open && results.length > 0}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl scroll-thin" role="listbox">
          {results.map((s, i) => {
            const quote = market?.quotes[s.symbol];
            return (
              <li key={s.symbol} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s.symbol)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left', i === hi ? 'bg-accent' : 'hover:bg-muted')}
                >
                  <StockLogo symbol={s.symbol} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{s.symbol}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.name}</span>
                  </span>
                  {quote && (
                    <span className="text-right">
                      <span className="block text-sm tabular">{formatPrice(quote.price)}</span>
                      <ChangePill value={quote.changePercent} className="min-w-0" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
