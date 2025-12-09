import {fromNodeProviderChain} from '@aws-sdk/credential-providers';
import {EC2Client} from '@aws-sdk/client-ec2';
import {S3Client} from '@aws-sdk/client-s3';
import {NodeHttpHandler} from '@aws-sdk/node-http-handler';

const clientCache = new Map<
  string,
  {
    ec2: EC2Client;
    s3: S3Client;
  }
>();

function key(profile?: string, region?: string) {
  return `${profile ?? 'default'}:${region ?? 'default'}`;
}

function createHttpHandler() {
  return new NodeHttpHandler({
    connectionTimeout: 5_000,
    socketTimeout: 10_000,
  });
}

export function getClients(profile?: string, region?: string) {
  const cacheKey = key(profile, region);
  const existing = clientCache.get(cacheKey);
  if (existing) return existing;

  const credentials = fromNodeProviderChain(profile ? {profile} : {});
  const base = {
    region,
    requestHandler: createHttpHandler(),
    credentials,
  };

  const ec2 = new EC2Client(base);
  const s3 = new S3Client(base);
  const entry = {ec2, s3};
  clientCache.set(cacheKey, entry);
  return entry;
}
