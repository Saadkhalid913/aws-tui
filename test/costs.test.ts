import {beforeEach, describe, expect, it, vi} from 'vitest';
import {GetCostAndUsageCommand} from '@aws-sdk/client-cost-explorer';

vi.mock('../src/aws/clients.js', () => ({
  getClients: vi.fn(),
}));

import {getClients} from '../src/aws/clients.js';
import {fetchCostSummary} from '../src/aws/costs.js';

const mockedGetClients = getClients as vi.MockedFunction<typeof getClients>;
const ceSend = vi.fn();

beforeEach(() => {
  ceSend.mockReset();
  mockedGetClients.mockReturnValue({
    ce: {send: ceSend},
  } as never);
});

describe('fetchCostSummary', () => {
  it('aggregates service totals with children and percentages', async () => {
    ceSend.mockResolvedValueOnce({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ['Amazon EC2', 'BoxUsage:t3.micro'],
              Metrics: {UnblendedCost: {Amount: '1.25', Unit: 'USD'}},
            },
            {
              Keys: ['Amazon S3', 'TimedStorage-ByteHrs'],
              Metrics: {UnblendedCost: {Amount: '0.50', Unit: 'USD'}},
            },
          ],
        },
      ],
    });

    const summary = await fetchCostSummary({range: '7d'});

    expect(ceSend).toHaveBeenCalledTimes(1);
    const command = ceSend.mock.calls[0][0] as GetCostAndUsageCommand;
    expect(command).toBeInstanceOf(GetCostAndUsageCommand);
    expect(command.input?.Granularity).toBe('DAILY');
    expect(command.input?.GroupBy?.[0]?.Key).toBe('SERVICE');
    expect(command.input?.GroupBy?.[1]?.Key).toBe('USAGE_TYPE');

    expect(summary.total).toBeCloseTo(1.75, 2);
    expect(summary.unit).toBe('USD');
    expect(summary.services[0]).toMatchObject({
      name: 'Amazon EC2',
      amount: 1.25,
    });
    expect(summary.services[0].children[0]).toMatchObject({
      name: 'BoxUsage:t3.micro',
      amount: 1.25,
      percentOfService: 100,
    });
    expect(summary.services[0].percentOfTotal).toBeGreaterThan(60);
  });

  it('handles empty responses gracefully', async () => {
    ceSend.mockResolvedValueOnce({});
    const summary = await fetchCostSummary({range: '24h'});
    expect(summary.total).toBe(0);
    expect(summary.services).toHaveLength(0);
  });
});
