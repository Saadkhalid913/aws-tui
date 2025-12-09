import {
  GetBucketLocationCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {getClients} from './clients.js';
import {createWriteStream, promises as fs} from 'fs';
import {pipeline} from 'stream/promises';
import path from 'path';

export type BucketSummary = {
  name: string;
  createdAt?: Date;
  regionHint?: string;
};

export async function listBuckets(options: {
  profile?: string;
  region?: string;
  signal?: AbortSignal;
} = {}): Promise<BucketSummary[]> {
  const {s3} = getClients(options.profile, options.region);
  const response = await s3.send(new ListBucketsCommand({}), {
    abortSignal: options.signal,
  });
  return (response.Buckets ?? [])
    .map((bucket) => ({
      name: bucket.Name ?? 'unknown',
      createdAt: bucket.CreationDate,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type BucketLocation = {
  name: string;
  region?: string;
};

export async function getBucketLocation(options: {
  profile?: string;
  region?: string;
  bucket: string;
  signal?: AbortSignal;
}): Promise<BucketLocation> {
  const {s3} = getClients(options.profile, options.region);
  const command = new GetBucketLocationCommand({Bucket: options.bucket});
  const response = await s3.send(command, {abortSignal: options.signal});
  let location = response.LocationConstraint || 'us-east-1';
  if (location === 'EU') location = 'eu-west-1';
  return {name: options.bucket, region: location};
}

export type ObjectPage = {
  items: ObjectEntry[];
  nextToken?: string;
};

export type ObjectSummary = {
  key: string;
  size?: number;
  lastModified?: Date;
  storageClass?: string;
};

export type ObjectEntry =
  | (ObjectSummary & {kind: 'file'})
  | {kind: 'folder'; prefix: string};

export async function listObjects(options: {
  profile?: string;
  region?: string;
  bucket: string;
  prefix?: string;
  pageSize?: number;
  nextToken?: string;
  signal?: AbortSignal;
}): Promise<ObjectPage> {
  const {s3} = getClients(options.profile, options.region);
  const command = new ListObjectsV2Command({
    Bucket: options.bucket,
    Prefix: options.prefix,
    ContinuationToken: options.nextToken,
    MaxKeys: options.pageSize ?? 50,
    Delimiter: '/',
  });
  const response = await s3.send(command, {abortSignal: options.signal});
  const folders: ObjectEntry[] = (response.CommonPrefixes ?? []).map((pfx) => ({
    kind: 'folder',
    prefix: pfx.Prefix ?? '',
  }));
  const files: ObjectEntry[] = (response.Contents ?? []).map((obj) => ({
    kind: 'file',
    key: obj.Key ?? '',
    size: obj.Size,
    lastModified: obj.LastModified,
    storageClass: obj.StorageClass,
  }));
  return {
    items: [...folders, ...files],
    nextToken: response.NextContinuationToken,
  };
}

export async function downloadObject(options: {
  profile?: string;
  region?: string;
  bucket: string;
  key: string;
  destination: string;
}): Promise<string> {
  const {s3} = getClients(options.profile, options.region);
  const destination = options.destination;
  await fs.mkdir(path.dirname(destination), {recursive: true});
  const command = new GetObjectCommand({Bucket: options.bucket, Key: options.key});
  const response = await s3.send(command);
  if (!response.Body || typeof (response.Body as any).pipe !== 'function') {
    throw new Error('No object body returned');
  }
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(destination));
  return destination;
}
