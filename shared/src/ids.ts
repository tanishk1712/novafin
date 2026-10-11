import type { TxCategory } from './types';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let counter = 0;

function randomChars(len: number, rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

export interface IdGenerator {
  id(prefix: string): string;
  reference(category: TxCategory | 'ORD' | 'QR'): string;
}

const REF_PREFIX: Record<TxCategory | 'ORD' | 'QR', string> = {
  deposit: 'DEP',
  withdrawal: 'WDL',
  exchange: 'FXC',
  transfer: 'TRF',
  qr_payment: 'QRP',
  stock_buy: 'BUY',
  stock_sell: 'SEL',
  fee: 'FEE',
  ORD: 'ORD',
  QR: 'QRQ',
};

/** Creates an id generator. Pass a deterministic `rand` for reproducible seed data. */
export function createIdGenerator(rand: () => number = Math.random): IdGenerator {
  return {
    id(prefix: string) {
      counter = (counter + 1) % 1_000_000;
      return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${randomChars(6, rand)}`.toLowerCase();
    },
    reference(category) {
      return `NVF-${REF_PREFIX[category]}-${randomChars(8, rand)}`;
    },
  };
}

export const defaultIds = createIdGenerator();
