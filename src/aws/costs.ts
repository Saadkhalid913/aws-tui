import {GetCostAndUsageCommand, GroupDefinition} from '@aws-sdk/client-cost-explorer';
import {getClients} from './clients.js';

export type CostRangePreset = '24h' | '7d' | '30d';

export type ResourceCost = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  usageType?: string;
  operation?: string;
  percentOfService?: number;
};

export type ServiceCost = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  percentOfTotal?: number;
  children: ResourceCost[];
};

export type CostSummary = {
  total: number;
  unit: string;
  services: ServiceCost[];
  lastUpdated: Date;
};

export async function fetchCostSummary(options: {
  profile?: string;
  region?: string;
  range: CostRangePreset;
  signal?: AbortSignal;
}): Promise<CostSummary> {
  const {ce} = getClients(options.profile, options.region);
  const timeRange = toTimeRange(options.range);
  const groupBy: GroupDefinition[] = [
    {Type: 'DIMENSION', Key: 'SERVICE'},
    {Type: 'DIMENSION', Key: 'USAGE_TYPE'},
  ];

  const command = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: timeRange.start,
      End: timeRange.end,
    },
    Granularity: timeRange.granularity,
    Metrics: ['UnblendedCost'],
    GroupBy: groupBy,
  });

  const response = await ce.send(command, {abortSignal: options.signal});

  const services = new Map<string, ServiceCost>();
  let currencyUnit = 'USD';

  for (const bucket of response.ResultsByTime ?? []) {
    for (const group of bucket.Groups ?? []) {
      const [serviceName, usageType] = group.Keys ?? [];
      if (!serviceName) continue;

      const cost = group.Metrics?.UnblendedCost;
      const amount = parseAmount(cost?.Amount);
      const unit = cost?.Unit ?? currencyUnit;
      currencyUnit = unit;

      const service = services.get(serviceName) ?? {
        id: serviceName,
        name: serviceName,
        amount: 0,
        unit,
        percentOfTotal: 0,
        children: [],
      };

      service.amount += amount;
      service.children.push({
        id: `${serviceName}:${usageType ?? 'unknown'}`,
        name: usageType ?? 'unknown usage',
        amount,
        unit,
        usageType: usageType || undefined,
      });
      services.set(serviceName, service);
    }
  }

  const serviceList = Array.from(services.values()).sort((a, b) => b.amount - a.amount);
  const total = serviceList.reduce((sum, svc) => sum + svc.amount, 0);

  for (const svc of serviceList) {
    svc.percentOfTotal = total > 0 ? (svc.amount / total) * 100 : 0;
    svc.children = svc.children
      .sort((a, b) => b.amount - a.amount)
      .map((child) => ({
        ...child,
        percentOfService: svc.amount > 0 ? (child.amount / svc.amount) * 100 : 0,
      }));
  }

  return {
    total,
    unit: currencyUnit,
    services: serviceList,
    lastUpdated: new Date(timeRange.end),
  };
}

function parseAmount(raw?: string) {
  if (!raw) return 0;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTimeRange(range: CostRangePreset): {
  start: string;
  end: string;
  granularity: 'HOURLY' | 'DAILY';
} {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const end = addDays(now, 1); // End is exclusive
  const start = addDays(end, range === '24h' ? -1 : range === '7d' ? -7 : -30);
  return {
    start: formatDate(start),
    end: formatDate(end),
    granularity: range === '24h' ? 'HOURLY' : 'DAILY',
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
