import type { Request, Response } from 'express';
import { z } from 'zod';
import { STOCKS_BY_SYMBOL, STOCKS_SEED, getHistory, type LiveQuote, type StockSeed } from '@novafin/shared';
import { marketService } from '../services/market.service';
import { notFound } from '../utils/http-error';
import { ok } from '../utils/response';
import { optionalQueryNumber, orderSchema, pageSchema, pageSizeSchema } from '../utils/schemas';

export const stocksQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  sector: z.string().trim().max(60).optional(),
  type: z.enum(['stock', 'etf']).optional(),
  sort: z.enum(['symbol', 'price', 'changePercent', 'volume', 'marketCap', 'name']).default('symbol'),
  order: orderSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema(25, 200),
  minChange: optionalQueryNumber,
  maxChange: optionalQueryNumber,
});

export const historyQuerySchema = z.object({
  range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y']).default('1M'),
});

type StockListItem = Omit<StockSeed, 'history' | 'volumeHistory'> & { updatedAt: string; simulated: true };

/** Seed metadata (without the large history arrays) merged with the live simulated quote. */
function toListItem(seed: StockSeed, q: LiveQuote | undefined): StockListItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { history, volumeHistory, ...meta } = seed;
  return {
    ...meta,
    ...(q
      ? {
          price: q.price,
          previousClose: q.previousClose,
          open: q.open,
          high: q.high,
          low: q.low,
          volume: q.volume,
          change: q.change,
          changePercent: q.changePercent,
          updatedAt: new Date(q.updatedAt).toISOString(),
        }
      : {}),
    simulated: true,
  };
}

function findSeed(raw: string): StockSeed {
  const symbol = raw.toUpperCase();
  const seed = STOCKS_BY_SYMBOL[symbol];
  if (!seed) throw notFound(`Unknown symbol ${symbol}.`);
  return seed;
}

export function listStocks(_req: Request, res: Response) {
  const q = res.locals.query as z.infer<typeof stocksQuerySchema>;
  const market = marketService.getMarket();
  let items = STOCKS_SEED.map((s) => toListItem(s, market.quotes[s.symbol]));

  if (q.search) {
    const term = q.search.toLowerCase();
    items = items.filter((s) => s.symbol.toLowerCase().includes(term) || s.name.toLowerCase().includes(term));
  }
  if (q.sector) {
    const sector = q.sector.toLowerCase();
    items = items.filter((s) => s.sector.toLowerCase() === sector);
  }
  if (q.type) items = items.filter((s) => s.type === q.type);
  if (q.minChange !== undefined) items = items.filter((s) => s.changePercent >= q.minChange!);
  if (q.maxChange !== undefined) items = items.filter((s) => s.changePercent <= q.maxChange!);

  const order = q.order ?? (q.sort === 'symbol' || q.sort === 'name' ? 'asc' : 'desc');
  const dir = order === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    const av = a[q.sort];
    const bv = b[q.sort];
    const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number);
    return cmp * dir || a.symbol.localeCompare(b.symbol);
  });

  const total = items.length;
  const start = (q.page - 1) * q.pageSize;
  const page = items.slice(start, start + q.pageSize);
  return ok(res, page, 200, {
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    sort: q.sort,
    order,
    lastTick: market.lastTick,
    simulated: true,
  });
}

export function getStock(req: Request, res: Response) {
  const seed = findSeed(req.params.symbol);
  const quote = marketService.getQuote(seed.symbol);
  return ok(res, { ...toListItem(seed, quote), quote: quote ?? null });
}

export function getStockHistory(req: Request, res: Response) {
  const seed = findSeed(req.params.symbol);
  const { range } = res.locals.query as z.infer<typeof historyQuerySchema>;
  const history = getHistory(marketService.getMarket(), seed.symbol, range);
  if (!history) throw notFound(`No history for ${seed.symbol}.`);
  return ok(res, { symbol: seed.symbol, ...history, simulated: true });
}
