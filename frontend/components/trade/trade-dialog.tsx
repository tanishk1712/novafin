'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { LIMITS, STOCKS_BY_SYMBOL, estimateRealizedPnl, quoteTrade, sharesForAmount, type Order } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Input, Label, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { ChangePill, FieldError, SimulatedBadge, StockLogo, SummaryRows } from '@/components/common';
import { StockSearch } from './stock-search';
import { tradeDialog, useTradeDialog } from '@/lib/hooks/use-finance';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatMoney, formatPrice, formatShares, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

type Step = 'form' | 'review' | 'done';

/**
 * Global paper-trading order dialog. All arithmetic comes from the shared
 * engine (`quoteTrade`, `sharesForAmount`) — the UI never re-implements it.
 */
export function TradeDialog() {
  const { open, side: initialSide, symbol: initialSymbol } = useTradeDialog();
  const state = useDemo();
  const market = useMarket();
  const [side, setSide] = React.useState<'buy' | 'sell'>('buy');
  const [symbol, setSymbol] = React.useState<string | undefined>();
  const [mode, setMode] = React.useState<'shares' | 'dollars'>('shares');
  const [input, setInput] = React.useState('');
  const [step, setStep] = React.useState<Step>('form');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [order, setOrder] = React.useState<Order | null>(null);
  const [lockedPrice, setLockedPrice] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (open) {
      setSide(initialSide);
      setSymbol(initialSymbol);
      setInput('');
      setMode('shares');
      setStep('form');
      setError(undefined);
      setOrder(null);
      setLockedPrice(null);
    }
  }, [open, initialSide, initialSymbol]);

  const quote = symbol ? market.quotes[symbol] : undefined;
  const seed = symbol ? STOCKS_BY_SYMBOL[symbol] : undefined;
  const livePrice = quote?.price ?? 0;
  const price = step === 'review' && lockedPrice ? lockedPrice : livePrice;
  const holding = symbol ? state.portfolio.find((h) => h.symbol === symbol) : undefined;
  const cash = state.wallet.balances.USD;
  const raw = Number(input);
  const quantity = mode === 'shares' ? raw : sharesForAmount(raw, price);
  const q = quoteTrade(side, symbol ?? '', quantity, price);

  const validation = React.useMemo(() => {
    if (!symbol) return 'Select a stock.';
    if (!input) return undefined;
    if (!Number.isFinite(raw) || raw <= 0) return 'Enter an amount greater than zero.';
    if (mode === 'shares' && !/^\d*(\.\d{0,6})?$/.test(input)) return 'Up to 6 decimal places for shares.';
    if (mode === 'dollars' && !/^\d*(\.\d{0,2})?$/.test(input)) return 'Up to 2 decimal places.';
    if (q.quantity < LIMITS.minShares) return `Minimum order is ${LIMITS.minShares} shares.`;
    if (side === 'buy' && q.total > cash) return `Insufficient cash: ${formatUsd(q.total)} needed, ${formatUsd(cash)} available.`;
    if (side === 'sell' && (!holding || q.quantity > holding.shares)) return `Insufficient shares: you own ${formatShares(holding?.shares ?? 0)}.`;
    return undefined;
  }, [symbol, input, raw, mode, q.quantity, q.total, side, cash, holding]);

  const canReview = !!symbol && !!input && !validation;

  const submit = async () => {
    if (!symbol || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await demoApi.trade(side, symbol, q.quantity);
      setOrder(res.order);
      setStep('done');
      toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${formatShares(res.order.quantity)} ${symbol}`, {
        description: `Filled at ${formatPrice(res.order.price)} · ${res.order.reference}`,
      });
    } catch (e) {
      setError(errorMessage(e));
      toast.error('Order rejected', { description: errorMessage(e) });
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && tradeDialog.close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{step === 'done' ? 'Order filled' : step === 'review' ? 'Confirm order' : 'Paper trade'}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            Simulated market order using your demo USD wallet. <SimulatedBadge label="Paper trading" />
          </DialogDescription>
        </DialogHeader>

        {step === 'done' && order ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <CheckCircle2 className="size-12 text-gain" />
              <p className="text-lg font-semibold">
                {order.side === 'buy' ? 'Bought' : 'Sold'} {formatShares(order.quantity)} {order.symbol}
              </p>
              <p className="text-sm text-muted-foreground">Order {order.reference} · status filled</p>
            </div>
            <SummaryRows
              rows={[
                { label: 'Fill price', value: formatPrice(order.price) },
                { label: 'Order value', value: formatUsd(order.value) },
                { label: 'Commission', value: formatUsd(order.fee) },
                ...(order.realizedPnl !== undefined
                  ? [{ label: 'Realized P/L', value: <span className={order.realizedPnl >= 0 ? 'text-gain' : 'text-loss'}>{formatUsd(order.realizedPnl, { sign: true })}</span> }]
                  : []),
                { label: 'Cash balance', value: formatUsd(state.wallet.balances.USD), strong: true },
              ]}
            />
            <DialogFooter>
              <Button variant="outline" asChild onClick={() => tradeDialog.close()}>
                <Link href="/orders">View orders</Link>
              </Button>
              <Button onClick={() => tradeDialog.close()}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {step === 'form' && (
              <Tabs value={side} onValueChange={(v) => setSide(v as 'buy' | 'sell')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="buy" className="data-[state=active]:text-gain">
                    Buy
                  </TabsTrigger>
                  <TabsTrigger value="sell" className="data-[state=active]:text-loss">
                    Sell
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {!symbol ? (
              <div className="space-y-2">
                <Label>Stock</Label>
                <StockSearch onSelect={setSymbol} autoFocus />
                {side === 'sell' && state.portfolio.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {state.portfolio.map((h) => (
                      <button key={h.symbol} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => setSymbol(h.symbol)}>
                        {h.symbol} · {formatShares(h.shares)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <StockLogo symbol={symbol} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{symbol}</p>
                  <p className="truncate text-xs text-muted-foreground">{seed?.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular">{formatPrice(price)}</p>
                  {quote && <ChangePill value={quote.changePercent} />}
                </div>
                {step === 'form' && (
                  <Button variant="ghost" size="sm" onClick={() => setSymbol(undefined)}>
                    Change
                  </Button>
                )}
              </div>
            )}

            {symbol && step === 'form' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="trade-amount">{mode === 'shares' ? 'Quantity (shares)' : 'Amount (USD)'}</Label>
                  <div className="flex rounded-md border p-0.5 text-xs">
                    {(['shares', 'dollars'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMode(m);
                          setInput('');
                        }}
                        className={cn('rounded px-2 py-0.5 capitalize', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  id="trade-amount"
                  inputMode="decimal"
                  placeholder={mode === 'shares' ? '0.00' : '$0.00'}
                  value={input}
                  onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ''))}
                  aria-invalid={!!validation && !!input}
                  autoFocus
                />
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {side === 'buy' ? `Cash available: ${formatUsd(cash)}` : `Shares owned: ${formatShares(holding?.shares ?? 0)}`}
                  </span>
                  {side === 'sell' && holding && (
                    <button
                      type="button"
                      className="font-medium text-primary"
                      onClick={() => {
                        setMode('shares');
                        setInput(String(holding.shares));
                      }}
                    >
                      Sell all
                    </button>
                  )}
                  {side === 'buy' && (
                    <button
                      type="button"
                      className="font-medium text-primary"
                      onClick={() => {
                        setMode('dollars');
                        setInput(String(Math.max(0, Math.floor((cash / 1.001) * 100) / 100 - 0.01).toFixed(2)));
                      }}
                    >
                      Max
                    </button>
                  )}
                </div>
                {input && <FieldError message={validation} />}
              </div>
            )}

            {symbol && input && !validation && (
              <SummaryRows
                rows={[
                  { label: 'Order type', value: 'Market (simulated)' },
                  { label: 'Shares', value: formatShares(q.quantity) },
                  { label: 'Est. price', value: formatPrice(price) },
                  { label: 'Order value', value: formatUsd(q.value) },
                  { label: 'Commission (0.1%)', value: formatUsd(q.fee) },
                  { label: side === 'buy' ? 'Total cost' : 'Net proceeds', value: formatUsd(q.total), strong: true },
                  ...(side === 'sell' && holding
                    ? [
                        {
                          label: 'Est. realized P/L',
                          value: (() => {
                            const pnl = estimateRealizedPnl(holding, q.quantity, price);
                            return <span className={pnl >= 0 ? 'text-gain' : 'text-loss'}>{formatMoney(pnl, 'USD', { sign: true })}</span>;
                          })(),
                        },
                      ]
                    : []),
                ]}
              />
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 p-3 text-sm text-loss">
                <XCircle className="mt-0.5 size-4 shrink-0" /> {error}
              </div>
            )}

            {step === 'review' && (
              <p className="text-xs text-muted-foreground">
                Price locked at {formatPrice(price)} for confirmation. The order executes at the simulated price at the moment you confirm.
              </p>
            )}

            <DialogFooter>
              {step === 'form' ? (
                <>
                  <Button variant="outline" onClick={() => tradeDialog.close()}>
                    Cancel
                  </Button>
                  <Button
                    variant={side === 'buy' ? 'gain' : 'loss'}
                    disabled={!canReview}
                    onClick={() => {
                      setLockedPrice(livePrice);
                      setStep('review');
                    }}
                  >
                    Review {side} order
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setStep('form')} disabled={submitting}>
                    Back
                  </Button>
                  <Button variant={side === 'buy' ? 'gain' : 'loss'} disabled={submitting} onClick={submit}>
                    {submitting && <Loader2 className="animate-spin" />}
                    Confirm {side} · {formatUsd(q.total)}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
