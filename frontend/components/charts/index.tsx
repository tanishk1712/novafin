'use client';

/**
 * Reusable Recharts components. Colours come from CSS tokens (--series-N for
 * categorical identity, --gain / --loss for polarity) so light & dark themes
 * each use their own validated steps.
 */
import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  type TooltipProps,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatDate, formatNumber, formatUsd } from '@/lib/format';
import { EmptyState } from '@/components/common';

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const AXIS = { stroke: 'var(--color-muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = { stroke: 'var(--chart-grid)', strokeDasharray: '0', vertical: false } as const;

type Fmt = (v: number) => string;

function ChartTooltip({ active, payload, label, valueFormat, labelFormat }: TooltipProps<number, string> & { valueFormat?: Fmt; labelFormat?: (l: unknown) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-medium text-muted-foreground">{labelFormat ? labelFormat(label) : String(label ?? payload[0]?.payload?.name ?? '')}</p>
      {payload.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: (p.color ?? p.payload?.fill) as string }} />
            {p.name}
          </span>
          <span className="font-semibold tabular text-foreground">{valueFormat ? valueFormat(Number(p.value)) : formatNumber(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartEmpty({ title = 'No data yet', description }: { title?: string; description?: string }) {
  return <EmptyState icon={BarChart3} title={title} description={description} />;
}

// ---------------------------------------------------------------------------

export function TimeAreaChart({
  data,
  dataKey,
  xKey = 't',
  name,
  height = 240,
  color = 'var(--series-1)',
  valueFormat = (v) => formatUsd(v),
  xFormat = (t) => formatDate(t, 'MMM d'),
  tooltipLabel = (t) => formatDate(Number(t), 'MMM d, yyyy HH:mm'),
  domainPadding = 0.05,
  baseline,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  xKey?: string;
  name: string;
  height?: number;
  color?: string;
  valueFormat?: Fmt;
  xFormat?: (t: number) => string;
  tooltipLabel?: (t: unknown) => string;
  domainPadding?: number;
  baseline?: number;
}) {
  const id = React.useId().replace(/:/g, '');
  if (!data.length) return <ChartEmpty />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={xKey} {...AXIS} tickFormatter={(t) => xFormat(Number(t))} minTickGap={40} />
          <YAxis
            {...AXIS}
            width={64}
            tickFormatter={(v) => valueFormat(Number(v)).replace(/\.\d+$/, '')}
            domain={[(min: number) => min - Math.abs(min) * domainPadding, (max: number) => max + Math.abs(max) * domainPadding]}
          />
          {baseline !== undefined && <ReferenceLine y={baseline} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />}
          <Tooltip content={<ChartTooltip valueFormat={valueFormat} labelFormat={tooltipLabel} />} cursor={{ stroke: 'var(--color-muted-foreground)', strokeDasharray: '3 3' }} />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#g-${id})`} isAnimationActive={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MultiLineChart({
  data,
  lines,
  xKey = 't',
  height = 260,
  valueFormat = (v) => formatUsd(v),
  xFormat = (t) => formatDate(t, 'MMM d'),
}: {
  data: Record<string, number | string>[];
  lines: { key: string; name: string; color?: string; dashed?: boolean }[];
  xKey?: string;
  height?: number;
  valueFormat?: Fmt;
  xFormat?: (t: number) => string;
}) {
  if (!data.length) return <ChartEmpty />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={xKey} {...AXIS} tickFormatter={(t) => xFormat(Number(t))} minTickGap={40} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => valueFormat(Number(v)).replace(/\.\d+$/, '')} domain={['auto', 'auto']} />
          <Tooltip content={<ChartTooltip valueFormat={valueFormat} labelFormat={(l) => formatDate(Number(l), 'MMM d, yyyy')} />} />
          {lines.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {lines.map((l, i) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color ?? SERIES[i]}
              strokeWidth={2}
              strokeDasharray={l.dashed ? '5 5' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBarChart({
  data,
  bars,
  xKey,
  height = 260,
  valueFormat = (v) => formatUsd(v),
  stacked,
}: {
  data: Record<string, number | string>[];
  bars: { key: string; name: string; color?: string }[];
  xKey: string;
  height?: number;
  valueFormat?: Fmt;
  stacked?: boolean;
}) {
  const empty = !data.length || data.every((d) => bars.every((b) => !Number(d[b.key])));
  if (empty) return <ChartEmpty description="Data appears here once you make demo transactions." />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={xKey} {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => valueFormat(Number(v)).replace(/\.\d+$/, '')} />
          <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }} />
          {bars.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b, i) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name}
              fill={b.color ?? SERIES[i]}
              radius={stacked ? (i === bars.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
              stackId={stacked ? 'a' : undefined}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bars coloured by polarity (gain / loss). */
export function PolarityBarChart({ data, xKey, dataKey, name, height = 240, valueFormat = (v) => formatUsd(v, { sign: true }) }: {
  data: Record<string, number | string>[];
  xKey: string;
  dataKey: string;
  name: string;
  height?: number;
  valueFormat?: Fmt;
}) {
  if (!data.length) return <ChartEmpty description="Sell a position to see realized performance." />;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={xKey} {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => valueFormat(Number(v)).replace(/\.\d+(?=\D*$)/, '')} />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" />
          <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }} />
          <Bar dataKey={dataKey} name={name} radius={[4, 4, 4, 4]} maxBarSize={32} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={Number(d[dataKey]) >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VolumeBars({ data, height = 90 }: { data: { t: number; v: number }[]; height?: number }) {
  if (!data.length) return null;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis {...AXIS} width={64} tickFormatter={(v) => formatNumber(Number(v), { compact: true })} />
          <Tooltip
            content={<ChartTooltip valueFormat={(v) => formatNumber(v, { compact: true })} labelFormat={(l) => formatDate(Number(l), 'MMM d, yyyy HH:mm')} />}
            cursor={{ fill: 'var(--color-muted)', opacity: 0.5 }}
          />
          <Bar dataKey="v" name="Volume" fill="var(--series-7)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({
  data,
  height = 240,
  valueFormat = (v) => formatUsd(v),
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  height?: number;
  valueFormat?: Fmt;
  centerLabel?: string;
  centerValue?: string;
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) return <ChartEmpty title="Nothing to allocate yet" />;
  // fold beyond 7 slices into "Other" so categorical colours never cycle
  const top = filtered.slice(0, 7);
  const rest = filtered.slice(7).reduce((a, d) => a + d.value, 0);
  const slices = rest > 0 ? [...top, { name: 'Other', value: rest }] : top;
  const total = slices.reduce((a, d) => a + d.value, 0);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div style={{ height }} className="relative w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} />
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="var(--color-card)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s, i) => (
                <Cell key={s.name} fill={s.name === 'Other' ? 'var(--color-muted-foreground)' : SERIES[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{centerLabel}</p>
              <p className="text-lg font-semibold tabular">{centerValue}</p>
            </div>
          </div>
        )}
      </div>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.name === 'Other' ? 'var(--color-muted-foreground)' : SERIES[i] }} />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="shrink-0 tabular text-muted-foreground">{((s.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sparkline({ data, positive, height = 36, width = 110 }: { data: number[]; positive?: boolean; height?: number; width?: number }) {
  if (data.length < 2) return <div style={{ height, width }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  const up = positive ?? data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? 'var(--color-gain)' : 'var(--color-loss)'} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
