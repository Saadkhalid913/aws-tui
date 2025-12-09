import {
  DescribeInstanceStatusCommand,
  DescribeInstancesCommand,
  DescribeRegionsCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  Instance,
  InstanceStatus,
} from '@aws-sdk/client-ec2';
import {getClients} from './clients.js';

export type InstanceSummary = {
  id: string;
  name?: string;
  state?: string;
  type?: string;
  az?: string;
  launched?: Date;
  publicIp?: string;
  privateIp?: string;
  tags?: Record<string, string>;
};

export type InstancePage = {
  items: InstanceSummary[];
  nextToken?: string;
};

export async function listInstances(options: {
  profile?: string;
  region?: string;
  pageSize?: number;
  nextToken?: string;
  signal?: AbortSignal;
}): Promise<InstancePage> {
  const {ec2} = getClients(options.profile, options.region);
  const command = new DescribeInstancesCommand({
    MaxResults: options.pageSize ?? 50,
    NextToken: options.nextToken,
  });

  const response = await ec2.send(command, {abortSignal: options.signal});

  const items: InstanceSummary[] = [];
  for (const reservation of response.Reservations ?? []) {
    for (const instance of reservation.Instances ?? []) {
      items.push(toSummary(instance));
    }
  }

  return {
    items,
    nextToken: response.NextToken,
  };
}

export type InstanceStatusSummary = {
  id: string;
  instanceStatus?: string;
  systemStatus?: string;
};

export async function fetchInstanceStatuses(options: {
  profile?: string;
  region?: string;
  instanceIds: string[];
  signal?: AbortSignal;
}): Promise<InstanceStatusSummary[]> {
  const {ec2} = getClients(options.profile, options.region);
  const command = new DescribeInstanceStatusCommand({
    InstanceIds: options.instanceIds,
    IncludeAllInstances: true,
  });
  const response = await ec2.send(command, {abortSignal: options.signal});
  return (response.InstanceStatuses ?? []).map(toStatusSummary);
}

export type RegionSummary = {
  name: string;
  endpoint?: string;
};

export async function startInstances(options: {
  profile?: string;
  region?: string;
  instanceIds: string[];
  signal?: AbortSignal;
}) {
  const {ec2} = getClients(options.profile, options.region);
  const command = new StartInstancesCommand({InstanceIds: options.instanceIds});
  await ec2.send(command, {abortSignal: options.signal});
}

export async function stopInstances(options: {
  profile?: string;
  region?: string;
  instanceIds: string[];
  signal?: AbortSignal;
}) {
  const {ec2} = getClients(options.profile, options.region);
  const command = new StopInstancesCommand({InstanceIds: options.instanceIds});
  await ec2.send(command, {abortSignal: options.signal});
}

export async function listRegions(options: {
  profile?: string;
  region?: string;
  signal?: AbortSignal;
} = {}): Promise<RegionSummary[]> {
  const {ec2} = getClients(options.profile, options.region);
  const command = new DescribeRegionsCommand({AllRegions: true});
  const response = await ec2.send(command, {abortSignal: options.signal});
  return (response.Regions ?? [])
    .map((r) => ({name: r.RegionName ?? 'unknown', endpoint: r.Endpoint}))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toSummary(instance: Instance): InstanceSummary {
  const tags = Object.fromEntries(
    (instance.Tags ?? [])
      .filter((t) => t.Key && t.Value)
      .map((t) => [t.Key as string, t.Value as string]),
  );

  return {
    id: instance.InstanceId ?? 'unknown',
    name: tags['Name'],
    state: instance.State?.Name,
    type: instance.InstanceType,
    az: instance.Placement?.AvailabilityZone,
    launched: instance.LaunchTime,
    publicIp: instance.PublicIpAddress,
    privateIp: instance.PrivateIpAddress,
    tags,
  };
}

function toStatusSummary(status: InstanceStatus): InstanceStatusSummary {
  return {
    id: status.InstanceId ?? 'unknown',
    instanceStatus: status.InstanceStatus?.Status,
    systemStatus: status.SystemStatus?.Status,
  };
}
