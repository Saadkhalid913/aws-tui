import {describe, expect, it, vi, beforeEach} from 'vitest';
import {PassThrough} from 'stream';
import {mkdtemp, readFile, rm} from 'fs/promises';
import {tmpdir} from 'os';
import path from 'path';
import {
  DescribeInstanceStatusCommand,
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  StartInstancesCommand,
  StopInstancesCommand,
} from '@aws-sdk/client-ec2';
import {
  GetBucketLocationCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

vi.mock('../src/aws/clients.js', () => ({
  getClients: vi.fn(),
}));

import {getClients} from '../src/aws/clients.js';
import {
  fetchInstanceStatuses,
  listInstances,
  listRegions,
  startInstances,
  stopInstances,
} from '../src/aws/ec2.js';
import {
  downloadObject,
  getBucketLocation,
  listBuckets,
  listObjects,
  ObjectEntry,
} from '../src/aws/s3.js';

const mockedGetClients = getClients as vi.MockedFunction<typeof getClients>;
const ec2Send = vi.fn();
const s3Send = vi.fn();

beforeEach(() => {
  ec2Send.mockReset();
  s3Send.mockReset();
  mockedGetClients.mockReturnValue({
    ec2: {send: ec2Send},
    s3: {send: s3Send},
  } as never);
});

describe('EC2 helpers', () => {
  it('maps instance pages and forwards paging options', async () => {
    const launch = new Date('2024-01-01T00:00:00Z');
    ec2Send.mockResolvedValueOnce({
      Reservations: [
        {
          Instances: [
            {
              InstanceId: 'i-123',
              Tags: [
                {Key: 'Name', Value: 'web'},
                {Key: 'Owner', Value: 'dev'},
              ],
              State: {Name: 'running'},
              InstanceType: 't3.micro',
              Placement: {AvailabilityZone: 'us-east-1a'},
              LaunchTime: launch,
              PublicIpAddress: '1.2.3.4',
              PrivateIpAddress: '10.0.0.1',
            },
          ],
        },
      ],
      NextToken: 'next-token',
    });

    const result = await listInstances({
      profile: 'dev',
      region: 'us-east-1',
      pageSize: 5,
      nextToken: 'prev-token',
    });

    expect(ec2Send).toHaveBeenCalledTimes(1);
    const command = ec2Send.mock.calls[0][0] as DescribeInstancesCommand;
    expect(command.input?.MaxResults).toBe(5);
    expect(command.input?.NextToken).toBe('prev-token');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'i-123',
      name: 'web',
      state: 'running',
      type: 't3.micro',
      az: 'us-east-1a',
      publicIp: '1.2.3.4',
      privateIp: '10.0.0.1',
      tags: {Name: 'web', Owner: 'dev'},
    });
    expect(result.items[0].launched?.toISOString()).toBe(launch.toISOString());
    expect(result.nextToken).toBe('next-token');
  });

  it('maps instance status checks', async () => {
    ec2Send.mockResolvedValueOnce({
      InstanceStatuses: [
        {
          InstanceId: 'i-123',
          InstanceStatus: {Status: 'ok'},
          SystemStatus: {Status: 'impaired'},
        },
      ],
    });

    const result = await fetchInstanceStatuses({instanceIds: ['i-123']});

    const command = ec2Send.mock.calls[0][0] as DescribeInstanceStatusCommand;
    expect(command.input?.InstanceIds).toEqual(['i-123']);
    expect(command.input?.IncludeAllInstances).toBe(true);
    expect(result).toEqual([
      {id: 'i-123', instanceStatus: 'ok', systemStatus: 'impaired'},
    ]);
  });

  it('starts instances', async () => {
    ec2Send.mockResolvedValueOnce({});

    await startInstances({instanceIds: ['i-123']});

    const command = ec2Send.mock.calls[0][0] as StartInstancesCommand;
    expect(command).toBeInstanceOf(StartInstancesCommand);
    expect(command.input?.InstanceIds).toEqual(['i-123']);
  });

  it('stops instances', async () => {
    ec2Send.mockResolvedValueOnce({});

    await stopInstances({instanceIds: ['i-123', 'i-456']});

    const command = ec2Send.mock.calls[0][0] as StopInstancesCommand;
    expect(command).toBeInstanceOf(StopInstancesCommand);
    expect(command.input?.InstanceIds).toEqual(['i-123', 'i-456']);
  });

  it('sorts regions alphabetically', async () => {
    ec2Send.mockResolvedValueOnce({
      Regions: [
        {RegionName: 'us-west-2', Endpoint: 'us-west-2.amazonaws.com'},
        {RegionName: 'ap-south-1', Endpoint: 'ap-south-1.amazonaws.com'},
      ],
    });

    const result = await listRegions();

    expect(ec2Send.mock.calls[0][0]).toBeInstanceOf(DescribeRegionsCommand);
    expect(result.map((r) => r.name)).toEqual(['ap-south-1', 'us-west-2']);
  });
});

describe('S3 helpers', () => {
  it('sorts buckets alphabetically', async () => {
    s3Send.mockResolvedValueOnce({
      Buckets: [
        {Name: 'b-two', CreationDate: new Date('2023-02-01T00:00:00Z')},
        {Name: 'a-one'},
      ],
    });

    const result = await listBuckets();

    expect(s3Send.mock.calls[0][0]).toBeInstanceOf(ListBucketsCommand);
    expect(result.map((b) => b.name)).toEqual(['a-one', 'b-two']);
    expect(result[0].createdAt).toBeUndefined();
    expect(result[1].createdAt?.toISOString()).toBe('2023-02-01T00:00:00.000Z');
  });

  it('translates EU location codes and defaults region', async () => {
    s3Send.mockResolvedValueOnce({LocationConstraint: 'EU'});
    const location = await getBucketLocation({bucket: 'demo'});

    const command = s3Send.mock.calls[0][0] as GetBucketLocationCommand;
    expect(command.input?.Bucket).toBe('demo');
    expect(location).toEqual({name: 'demo', region: 'eu-west-1'});
  });

  it('maps object pages with folders and pagination tokens', async () => {
    s3Send.mockResolvedValueOnce({
      CommonPrefixes: [{Prefix: 'logs/'}],
      Contents: [
        {
          Key: 'logs/2024-01-01.log',
          Size: 123,
          LastModified: new Date('2024-01-02T00:00:00Z'),
          StorageClass: 'STANDARD',
        },
      ],
      NextContinuationToken: 'next-token',
    });

    const result = await listObjects({
      bucket: 'demo',
      prefix: 'logs/',
      pageSize: 10,
      nextToken: 'prev-token',
    });

    const command = s3Send.mock.calls[0][0] as ListObjectsV2Command;
    expect(command.input?.Bucket).toBe('demo');
    expect(command.input?.Prefix).toBe('logs/');
    expect(command.input?.MaxKeys).toBe(10);
    expect(command.input?.ContinuationToken).toBe('prev-token');
    expect(result.items).toHaveLength(2);
    const folder = result.items[0] as ObjectEntry;
    expect(folder.kind).toBe('folder');
    expect(folder.prefix).toBe('logs/');
    const file = result.items[1] as ObjectEntry;
    expect(file.kind).toBe('file');
    expect(file).toMatchObject({
      key: 'logs/2024-01-01.log',
      size: 123,
      storageClass: 'STANDARD',
    });
    expect((file as any).lastModified?.toISOString()).toBe('2024-01-02T00:00:00.000Z');
    expect(result.nextToken).toBe('next-token');
  });

  it('downloads objects to a destination path', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'aws-tui-'));
    const dest = path.join(dir, 'file.txt');
    const body = new PassThrough();

    s3Send.mockResolvedValueOnce({
      Body: body,
    });

    const downloadPromise = downloadObject({
      bucket: 'demo',
      key: 'file.txt',
      destination: dest,
    });

    body.end('hello-world');
    await downloadPromise;

    const contents = await readFile(dest, 'utf8');
    expect(contents).toBe('hello-world');

    await rm(dir, {recursive: true, force: true});
  });
});
