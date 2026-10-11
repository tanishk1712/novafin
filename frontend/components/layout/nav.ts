import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  BarChart3,
  Building2,
  CandlestickChart,
  History,
  LayoutDashboard,
  ListOrdered,
  PieChart,
  QrCode,
  Send,
  Settings,
  Star,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: 'Money' | 'Invest' | 'Activity' | 'Account';
}

export const NAV: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard, group: 'Money' },
  { href: '/wallet', label: 'Wallet', icon: Wallet, group: 'Money' },
  { href: '/add-money', label: 'Add Money', icon: ArrowDownToLine, group: 'Money' },
  { href: '/withdraw', label: 'Withdraw', icon: ArrowUpFromLine, group: 'Money' },
  { href: '/bank-accounts', label: 'Bank Accounts', icon: Building2, group: 'Money' },
  { href: '/send-money', label: 'Send Money', icon: Send, group: 'Money' },
  { href: '/exchange', label: 'Currency Exchange', icon: ArrowLeftRight, group: 'Money' },
  { href: '/qr-payments', label: 'QR Payments', icon: QrCode, group: 'Money' },
  { href: '/market', label: 'US Stock Market', icon: CandlestickChart, group: 'Invest' },
  { href: '/portfolio', label: 'My Portfolio', icon: PieChart, group: 'Invest' },
  { href: '/watchlist', label: 'Watchlist', icon: Star, group: 'Invest' },
  { href: '/orders', label: 'Orders & Trades', icon: ListOrdered, group: 'Invest' },
  { href: '/transactions', label: 'Transactions', icon: History, group: 'Activity' },
  { href: '/notifications', label: 'Notifications', icon: Bell, group: 'Activity' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, group: 'Activity' },
  { href: '/settings', label: 'Settings', icon: Settings, group: 'Account' },
];

export const MOBILE_NAV = ['/overview', '/wallet', '/market', '/portfolio'];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
