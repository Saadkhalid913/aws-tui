import React, {useEffect, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import path from 'path';
import os from 'os';
import {promises as fs} from 'fs';
import {
  downloadObject,
  getBucketLocation,
  listBuckets,
  listObjects,
  ObjectSummary,
  ObjectEntry,
} from '../aws/s3.js';
import {Banner, ErrorBox, InfoBox, StatusLine, palette} from './components/common.js';

export function S3View({
  profile,
  region,
  pageSize,
  onBack,
  setNavLock,
}: {
  profile?: string;
  region?: string;
  pageSize: number;
  onBack: () => void;
  setNavLock?: (locked: boolean) => void;
}) {
  const [buckets, setBuckets] = useState<{name: string; createdAt?: Date; regionHint?: string}[]>([]);
  const [bucketRegions, setBucketRegions] = useState<Record<string, string>>({});
  const [selectedBucket, setSelectedBucket] = useState(0);
  const [objects, setObjects] = useState<{items: ObjectEntry[]; nextToken?: string}>({items: []});
  const [objectTokens, setObjectTokens] = useState<(string | undefined)[]>([undefined]);
  const [objectPageIndex, setObjectPageIndex] = useState(0);
  const [selectedObject, setSelectedObject] = useState(0);
  const [prefixStack, setPrefixStack] = useState<string[]>(['']);
  const [currentBucket, setCurrentBucket] = useState<string>();
  const [detailObject, setDetailObject] = useState<ObjectSummary | null>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [error, setError] = useState<string>();
  const objectAbort = useRef<AbortController | null>(null);

  const currentPrefix = prefixStack[prefixStack.length - 1] ?? '';

  useEffect(() => {
    setNavLock?.(true);
    return () => setNavLock?.(false);
  }, [setNavLock]);

  useEffect(() => {
    setLoadingBuckets(true);
    setError(undefined);
    listBuckets({profile, region})
      .then((list) => {
        setBuckets(list);
        setSelectedBucket(0);
        setPrefixStack(['']);
        setObjectTokens([undefined]);
        setObjectPageIndex(0);
        setCurrentBucket(undefined);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingBuckets(false));
  }, [profile, region]);

  useEffect(() => {
    if (!currentBucket) {
      setObjects({items: [], nextToken: undefined});
      return;
    }
    loadObjects(currentBucket, objectTokens[objectPageIndex], currentPrefix);
    ensureBucketRegion(currentBucket);
  }, [currentBucket, objectPageIndex, currentPrefix]);

  useEffect(() => {
    setSelectedObject((s) => Math.max(0, Math.min(objects.items.length - 1, s)));
  }, [objects.items]);

  const ensureBucketRegion = (bucket: string) => {
    if (bucketRegions[bucket]) return;
    getBucketLocation({profile, region, bucket})
      .then((loc) => setBucketRegions((prev) => ({...prev, [bucket]: loc.region ?? 'unknown'})))
      .catch(() => {});
  };

  const loadObjects = (bucket: string, token?: string, prefix?: string) => {
    objectAbort.current?.abort();
    const controller = new AbortController();
    objectAbort.current = controller;
    setLoadingObjects(true);
    listObjects({profile, region, bucket, prefix, nextToken: token, pageSize})
      .then((page) => {
        setObjects(page);
        setSelectedObject(0);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingObjects(false));
  };

  useInput((input, key) => {
    if (detailObject) {
      if (key.escape || key.leftArrow || input === 'h' || key.backspace) {
        setDetailObject(null);
      } else if (key.tab) {
        // allow tab handling in detail view
      }
      return;
    }

    if (key.escape || input === 'h') {
      onBack();
      return;
    }

    if (input === 'r') {
      setObjectTokens([undefined]);
      setObjectPageIndex(0);
      setPrefixStack(['']);
      if (currentBucket) {
        loadObjects(currentBucket, undefined, '');
      }
      return;
    }

    if (!currentBucket) {
      // bucket list navigation
      if (key.downArrow || input === 'j') {
        setSelectedBucket((s) => Math.min(buckets.length - 1, s + 1));
      } else if (key.upArrow || input === 'k') {
        setSelectedBucket((s) => Math.max(0, s - 1));
      } else if (key.rightArrow || key.return) {
        const bucket = buckets[selectedBucket]?.name;
        if (bucket) {
          setCurrentBucket(bucket);
          setPrefixStack(['']);
          setObjectTokens([undefined]);
          setObjectPageIndex(0);
          setSelectedObject(0);
        }
      }
      return;
    }

    // inside bucket
    if (key.downArrow || input === 'j') {
      setSelectedObject((s) => Math.min(objects.items.length - 1, s + 1));
    } else if (key.upArrow || input === 'k') {
      setSelectedObject((s) => Math.max(0, s - 1));
    } else if (key.pageDown && objects.nextToken) {
      setObjectTokens((prev) => [...prev.slice(0, objectPageIndex + 1), objects.nextToken]);
      setObjectPageIndex((i) => i + 1);
      setSelectedObject(0);
    } else if (key.pageUp && objectPageIndex > 0) {
      setObjectPageIndex((i) => Math.max(0, i - 1));
      setSelectedObject(0);
    } else if (key.leftArrow || key.backspace) {
      if (currentPrefix) {
        setPrefixStack((prev) => {
          if (prev.length <= 1) return prev;
          const next = prev.slice(0, -1);
          setObjectTokens([undefined]);
          setObjectPageIndex(0);
          setSelectedObject(0);
          return next;
        });
      } else {
        // leave bucket back to bucket list
        setCurrentBucket(undefined);
        setObjects({items: [], nextToken: undefined});
        setObjectTokens([undefined]);
        setObjectPageIndex(0);
        setSelectedObject(0);
      }
    } else if (key.rightArrow || key.return) {
      const obj = objects.items[selectedObject];
      if (!obj) return;
      if (obj.kind === 'folder') {
        setPrefixStack((prev) => {
          const next = [...prev, obj.prefix];
          setObjectTokens([undefined]);
          setObjectPageIndex(0);
          setSelectedObject(0);
          return next;
        });
      } else {
        setDetailObject(obj);
      }
    }
  });

  const bucket = buckets[selectedBucket];
  const activeBucketName = currentBucket ?? bucket?.name;
  const selectedRegion = activeBucketName ? bucketRegions[activeBucketName] ?? 'resolving…' : 'n/a';
  const headerRight = activeBucketName
    ? `Bucket: ${activeBucketName} | Region: ${selectedRegion}`
    : 'No bucket selected';

  if (detailObject) {
    return (
      <S3DetailPage
        profile={profile}
        region={region}
        bucket={currentBucket ?? ''}
        object={detailObject}
        onBack={() => setDetailObject(null)}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Banner
        title="S3"
        subtitle="Read-only. Enter/→ drills in, ←/backspace goes up, PgDn/PgUp paginate, r refresh, esc back."
      />
      <StatusLine
        left={`Profile: ${profile ?? 'default'} | Region preference: ${region ?? 'none'}`}
        right={`${headerRight} | Path: ${
          currentBucket ? `${currentBucket}:${currentPrefix || '/'}` : '/'
        }`}
      />
      {error ? <ErrorBox message={error} /> : null}
      {loadingBuckets ? <InfoBox message="Loading buckets…" /> : null}

      {!loadingBuckets && !buckets.length ? (
        <InfoBox message="No buckets found." />
      ) : (
        <Box>
          <Box flexDirection="column" width={40} marginRight={2}>
            <Text bold color={palette.accent}>
              Buckets
            </Text>
            {buckets.map((b, idx) => (
              <Text key={b.name} color={idx === selectedBucket ? palette.accent : undefined}>
                {idx === selectedBucket ? '➜ ' : '  '}
                {b.name}
              </Text>
            ))}
          </Box>

          <Box flexDirection="column" flexGrow={1}>
            <Text bold>
              Objects (page {objectPageIndex + 1}
              {objects.nextToken ? ' → PgDn for more' : ''})
            </Text>
            {loadingObjects ? <InfoBox message="Loading objects…" /> : null}
            {!loadingObjects && (!currentBucket || objects.items.length === 0) ? (
              <Text color="gray">{currentBucket ? 'Empty or no access.' : 'Select a bucket.'}</Text>
            ) : (
              objects.items.slice(0, 20).map((obj, idx) => {
                const isSelected = idx === selectedObject && !!currentBucket;
                const folderLabel =
                  obj.kind === 'folder'
                    ? obj.prefix.slice(currentPrefix.length) || '/'
                    : undefined;
                return (
                  <Text
                    key={obj.kind === 'folder' ? `folder-${obj.prefix}` : `file-${obj.key}`}
                    color={isSelected ? palette.accent : undefined}
                  >
                    {isSelected ? '➜ ' : '  '}
                    {obj.kind === 'folder' ? (
                      <Text color={palette.info}>{folderLabel}</Text>
                    ) : (
                      <>
                        {obj.key.slice(currentPrefix.length)} —{' '}
                        <Text color={palette.info}>{fmtBytes(obj.size)}</Text> —{' '}
                        <Text color={palette.muted}>
                          {obj.lastModified?.toISOString?.() ?? 'n/a'}
                        </Text>
                      </>
                    )}
                  </Text>
                );
              })
            )}
            <Text color="gray">Read-only. Upload/delete not available.</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function S3DetailPage({
  profile,
  region,
  bucket,
  object,
  onBack,
}: {
  profile?: string;
  region?: string;
  bucket: string;
  object: ObjectSummary;
  onBack: () => void;
}) {
  const [downloadPath, setDownloadPath] = useState(defaultDownloadPath(bucket, object.key));
  const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
  const [downloadError, setDownloadError] = useState<string>();
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  useInput((input, key) => {
    if (key.escape || key.leftArrow || input === 'h') {
      onBack();
    } else if (key.tab && pathSuggestions.length) {
      setDownloadPath(collapseHome(pathSuggestions[0]));
    } else if (key.return && downloadPath && downloadStatus !== 'saving') {
      startDownload();
    }
  });

  useEffect(() => {
    let active = true;
    suggestPaths(downloadPath)
      .then((suggestions) => {
        if (active) setPathSuggestions(suggestions);
      })
      .catch(() => {
        if (active) setPathSuggestions([]);
      });
    return () => {
      active = false;
    };
  }, [downloadPath]);

  const startDownload = async () => {
    setDownloadStatus('saving');
    setDownloadError(undefined);
    try {
      const destination = await downloadObject({
        profile,
        region,
        bucket,
        key: object.key,
        destination: expandHome(downloadPath),
      });
      setDownloadStatus('done');
      setDownloadPath(collapseHome(destination));
    } catch (err) {
      setDownloadStatus('idle');
      setDownloadError((err as Error).message);
    }
  };

  return (
    <Box flexDirection="column">
      <Banner title="S3 Object" subtitle="← to go back. Enter to download. Tab accepts suggestion." />
      <StatusLine left={`Bucket: ${bucket}`} right={`Key: ${object.key}`} />

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
        marginTop={1}
      >
        <Text bold>{object.key}</Text>
        <Text>
          Size: <Text color={palette.info}>{fmtBytes(object.size)}</Text>
        </Text>
        <Text>
          Last modified:{' '}
          <Text color={palette.muted}>{object.lastModified?.toISOString?.() ?? 'n/a'}</Text>
        </Text>
        <Text>
          Storage class: <Text color={palette.warning}>{object.storageClass ?? 'unknown'}</Text>
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Download</Text>
        <Text color="gray">
          Path with autocompletion. Tab uses the first suggestion. Enter downloads.
        </Text>
        <Box>
          <Text>Path: </Text>
          <TextInput value={downloadPath} onChange={setDownloadPath} />
        </Box>
        {pathSuggestions.length ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">Suggestions (first is Tab target):</Text>
            {pathSuggestions.map((s, idx) => (
              <Text key={s} color={idx === 0 ? 'cyan' : 'gray'}>
                {collapseHome(s)}
              </Text>
            ))}
          </Box>
        ) : null}
        {downloadStatus === 'saving' ? <InfoBox message="Downloading…" /> : null}
        {downloadStatus === 'done' ? <InfoBox message={`Saved to ${downloadPath}`} /> : null}
        {downloadError ? <ErrorBox message={downloadError} /> : null}
      </Box>
    </Box>
  );
}

function fmtBytes(size?: number) {
  if (size === undefined) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = size;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[u]}`;
}

function defaultDownloadPath(bucketName: string, key: string) {
  return collapseHome(path.join(os.homedir(), 'Downloads', bucketName, key));
}

function collapseHome(p: string) {
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

function expandHome(p: string) {
  if (!p) return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

async function suggestPaths(inputPath: string): Promise<string[]> {
  if (!inputPath) return [];
  const expanded = expandHome(inputPath);
  const dir = inputPath.endsWith(path.sep) ? expanded : path.dirname(expanded);
  const prefix = inputPath.endsWith(path.sep) ? '' : path.basename(expanded);
  try {
    const entries = await fs.readdir(dir, {withFileTypes: true});
    return entries
      .filter((e) => e.name.startsWith(prefix))
      .slice(0, 6)
      .map((e) => path.join(dir, e.name + (e.isDirectory() ? path.sep : '')));
  } catch {
    return [];
  }
}
