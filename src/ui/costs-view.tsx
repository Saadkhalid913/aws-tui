import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {CostRangePreset, CostSummary, fetchCostSummary} from '../aws/costs.js';
import {Banner, ErrorBox, InfoBox, StatusLine, palette} from './components/common.js';

const rangePresets: CostRangePreset[] = ['24h', '7d', '30d'];

type DisplayRow = {
  id: string;
  type: 'service' | 'resource';
  name: string;
  amount: number;
  unit: string;
  percent?: number;
  parentId?: string;
  level: number;
};

export function CostsView({
  profile,
  region,
  onBack,
}: {
  profile?: string;
  region?: string;
  onBack: () => void;
}) {
  const [rangeIndex, setRangeIndex] = useState(1); // default 7d
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  const range = rangePresets[rangeIndex];

  const rows: DisplayRow[] = useMemo(() => {
    if (!summary) return [];
    const list: DisplayRow[] = [];
    for (const svc of summary.services) {
      list.push({
        id: svc.id,
        type: 'service',
        name: svc.name,
        amount: svc.amount,
        unit: svc.unit,
        percent: svc.percentOfTotal,
        level: 0,
      });
      if (expanded.has(svc.id)) {
        for (const child of svc.children) {
          list.push({
            id: child.id,
            type: 'resource',
            name: child.name,
            amount: child.amount,
            unit: child.unit,
            percent: child.percentOfService,
            parentId: svc.id,
            level: 1,
          });
        }
      }
    }
    return list;
  }, [expanded, summary]);

  useEffect(() => {
    refresh();
    return () => {
      inFlight.current?.abort();
    };
  }, [range, profile, region]);

  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(rows.length - 1, c)));
  }, [rows.length]);

  useInput((input, key) => {
    if (key.escape || input === 'h') {
      onBack();
      return;
    }

    if (input === 'g') {
      setRangeIndex((prev) => (prev + 1) % rangePresets.length);
      return;
    }

    if (input === 'r') {
      refresh();
      return;
    }

    if (input === 'a') {
      toggleAll();
      return;
    }

    if (!rows.length) return;

    if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.rightArrow || input === 'l' || key.return) {
      const row = rows[cursor];
      if (row.type === 'service') {
        setExpanded((prev) => new Set(prev).add(row.id));
      }
    } else if (key.leftArrow) {
      const row = rows[cursor];
      if (row.type === 'service') {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      } else if (row.parentId) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(row.parentId as string);
          return next;
        });
      }
    }
  });

  const refresh = () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(undefined);
    fetchCostSummary({profile, region, range, signal: controller.signal})
      .then((data) => {
        setSummary(data);
        setCursor(0);
        setExpanded(new Set(data.services.slice(0, 5).map((s) => s.id)));
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message);
      })
      .finally(() => setLoading(false));
  };

  const toggleAll = () => {
    if (!summary) return;
    if (expanded.size < summary.services.length) {
      setExpanded(new Set(summary.services.map((s) => s.id)));
    } else {
      setExpanded(new Set());
    }
  };

  const formatRow = (row: DisplayRow, selected: boolean) => {
    const prefix = row.type === 'service' ? (expanded.has(row.id) ? '▼' : '►') : '•';
    const indent = '  '.repeat(row.level);
    const percent = row.percent !== undefined ? `${row.percent.toFixed(1)}%` : '';
    const amount = `${row.amount.toFixed(2)} ${row.unit}`;
    return (
      <Text key={row.id} color={selected ? palette.accent : undefined}>
        {selected ? '› ' : '  '}
        {indent}
        {prefix} {row.name.padEnd(32).slice(0, 32)} {amount.padStart(12)}{' '}
        {percent ? ` (${percent})` : ''}
      </Text>
    );
  };

  const rightStatus =
    'Keys: g range • r refresh • arrows/jk move • → expand • a all • esc back';

  return (
    <Box flexDirection="column">
      <Banner title="AWS Costs (beta)" subtitle="Read-only Cost Explorer totals" />
      <StatusLine
        left={`Profile: ${profile ?? 'default'}    Region: ${region ?? 'not set'}    Range: ${
          range === '24h' ? 'Past 24h' : range === '7d' ? 'Past 7 days' : 'Past 30 days'
        }`}
        right={rightStatus}
      />
      {error ? <ErrorBox message={error} /> : null}
      {loading && <InfoBox message="Fetching cost data…" />}
      {!loading && summary && (
        <Box marginY={1}>
          <Text>
            Total: {summary.total.toFixed(2)} {summary.unit} • Updated: {summary.lastUpdated.toISOString()}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 && !loading ? (
          <Text color={palette.muted}>No cost data available.</Text>
        ) : (
          rows.map((row, idx) => formatRow(row, idx === cursor))
        )}
      </Box>
      <Box marginTop={1}>
        <InfoBox message="Costs are fetched via AWS Cost Explorer (UnblendedCost). Rates may lag up to 24h." />
      </Box>
    </Box>
  );
}
