import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {
  fetchInstanceStatuses,
  InstanceSummary,
  listInstances,
  startInstances,
  stopInstances,
} from '../aws/ec2.js';
import {Banner, ErrorBox, InfoBox, StatusLine, ec2StateColor, statusColor, palette} from './components/common.js';

export function EC2View({
  profile,
  region,
  pageSize,
  onBack,
  onOpenDetail,
}: {
  profile?: string;
  region?: string;
  pageSize: number;
  onBack: () => void;
  onOpenDetail: (instance: InstanceSummary, statusChecks?: string) => void;
}) {
  const [page, setPage] = useState<{items: InstanceSummary[]; nextToken?: string}>({
    items: [],
  });
  const [pageTokenIndex, setPageTokenIndex] = useState(0);
  const [tokens, setTokens] = useState<(string | undefined)[]>([undefined]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);

  const currentToken = tokens[pageTokenIndex];

  const loadPage = async (token?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(undefined);
    try {
      const data = await listInstances({
        profile,
        region,
        nextToken: token,
        pageSize,
        signal: controller.signal,
      });
      setPage(data);
      const ids = data.items.slice(0, 20).map((i) => i.id); // small status fetch
      if (ids.length) {
        fetchInstanceStatuses({profile, region, instanceIds: ids, signal: controller.signal})
          .then((sts) => {
            const map: Record<string, string> = {};
            for (const s of sts) {
              map[s.id] = `${s.instanceStatus ?? 'unknown'}/${s.systemStatus ?? 'unknown'}`;
            }
            setStatuses(map);
          })
          .catch(() => {});
      }
    } catch (err) {
      if (!(err as Error).name.includes('AbortError')) {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTokens([undefined]);
    setPageTokenIndex(0);
    setSelected(0);
    loadPage(undefined);
    return () => abortRef.current?.abort();
  }, [profile, region, pageSize]);

  useEffect(() => {
    loadPage(currentToken);
  }, [pageTokenIndex]);

  const requestStateChange = async (action: 'start' | 'stop', instance: InstanceSummary) => {
    if (!instance.id) return;
    setActionBusy(true);
    setActionError(undefined);
    setActionMessage(`${action === 'start' ? 'Starting' : 'Stopping'} ${instance.id}…`);
    try {
      if (action === 'start') {
        await startInstances({profile, region, instanceIds: [instance.id]});
      } else {
        await stopInstances({profile, region, instanceIds: [instance.id]});
      }
      setActionMessage(
        `${action === 'start' ? 'Start' : 'Stop'} request sent for ${instance.id}. Refreshing…`,
      );
      await loadPage(currentToken);
      setActionMessage(
        `${action === 'start' ? 'Start' : 'Stop'} request sent; state may take time to update.`,
      );
    } catch (err) {
      setActionError((err as Error).message);
      setActionMessage(undefined);
    } finally {
      setActionBusy(false);
    }
  };

  useInput((input, key) => {
    if (key.escape || input === 'h') {
      onBack();
    } else if (input === 'r') {
      loadPage(currentToken);
    } else if ((input === 's' || input === 'x') && !actionBusy) {
      const instance = page.items[selected];
      if (!instance) return;
      const state = instance.state?.toLowerCase();
      if (input === 's' && state === 'stopped') {
        requestStateChange('start', instance);
      } else if (input === 'x' && state === 'running') {
        requestStateChange('stop', instance);
      } else {
        setActionError('Action not available for this state.');
      }
    } else if (key.pageDown && page.nextToken) {
      setTokens((prev) => [...prev.slice(0, pageTokenIndex + 1), page.nextToken]);
      setPageTokenIndex((i) => i + 1);
      setSelected(0);
    } else if (key.pageUp && pageTokenIndex > 0) {
      setPageTokenIndex((i) => Math.max(0, i - 1));
      setSelected(0);
    } else if (key.downArrow || input === 'j') {
      setSelected((s) => Math.min(page.items.length - 1, s + 1));
    } else if (key.upArrow || input === 'k') {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.return) {
      const instance = page.items[selected];
      if (instance) {
        onOpenDetail(instance, statuses[instance.id]);
      }
    }
  });

  const selectedInstance = useMemo(() => page.items[selected], [page.items, selected]);

  return (
    <Box flexDirection="column">
      <Banner
        title="EC2 Instances"
        subtitle="Arrows/jk move, PgDn/PgUp paginate, enter for details, s start (stopped), x stop (running), r refresh, esc to home. ←/→ move between pages globally."
      />
      <StatusLine
        left={`Profile: ${profile ?? 'default'} | Region: ${region ?? 'unset'}`}
        right={`Page ${pageTokenIndex + 1}${page.nextToken ? ' (more with PgDn)' : ''}`}
      />
      {error ? <ErrorBox message={error} /> : null}
      {actionError ? <ErrorBox message={actionError} /> : null}
      {loading ? <InfoBox message="Loading instances…" /> : null}
      {actionMessage ? <InfoBox message={actionMessage} /> : null}

      {!loading && page.items.length === 0 ? (
        <InfoBox message="No instances found." />
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {page.items.map((instance, idx) => (
            <Box key={instance.id}>
              <Text color={idx === selected ? palette.accent : undefined}>
                {idx === selected ? '➜ ' : '  '}
                {instance.name ? `${instance.name} ` : ''}
                ({instance.id}) –{' '}
                <Text color={ec2StateColor(instance.state)}>{instance.state ?? 'unknown'}</Text>{' '}
                {instance.type ?? ''} {instance.az ?? ''}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {selectedInstance ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          paddingY={0}
          marginTop={1}
        >
          <Text bold>Details</Text>
          <Text>ID: {selectedInstance.id}</Text>
          <Text>Name: {selectedInstance.name ?? 'n/a'}</Text>
          <Text>
            State:{' '}
            <Text color={ec2StateColor(selectedInstance.state)}>
              {selectedInstance.state ?? 'unknown'}
            </Text>
          </Text>
          <Text>Type: {selectedInstance.type ?? 'unknown'}</Text>
          <Text>AZ: {selectedInstance.az ?? 'unknown'}</Text>
          <Text>Launched: {selectedInstance.launched?.toISOString?.() ?? 'unknown'}</Text>
          <Text>Public IP: {selectedInstance.publicIp ?? 'n/a'}</Text>
          <Text>Private IP: {selectedInstance.privateIp ?? 'n/a'}</Text>
          <Text>
            Status checks:{' '}
            <Text color={statusColor(statuses[selectedInstance.id])}>
              {statuses[selectedInstance.id] ?? 'pending/unknown'}
            </Text>
          </Text>
          <Text color="gray">
            Actions: s to start (if stopped), x to stop (if running). r refreshes list.
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function EC2DetailPage({
  profile,
  region,
  instance,
  statusChecks,
  onBack,
}: {
  profile?: string;
  region?: string;
  instance: InstanceSummary;
  statusChecks?: string;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (key.escape || key.leftArrow || input === 'h') {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Banner
        title="EC2 Instance"
        subtitle="← to go back. Actions are available from the list view (s start, x stop)."
      />
      <StatusLine
        left={`Profile: ${profile ?? 'default'} | Region: ${region ?? 'unset'}`}
        right={instance.id}
      />
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
        marginTop={1}
      >
        <Text bold>{instance.name ?? instance.id}</Text>
        <Text>ID: {instance.id}</Text>
        <Text>
          State:{' '}
          <Text color={ec2StateColor(instance.state)}>{instance.state ?? 'unknown'}</Text>
        </Text>
        <Text>Type: {instance.type ?? 'unknown'}</Text>
        <Text>AZ: {instance.az ?? 'unknown'}</Text>
        <Text>Launched: {instance.launched?.toISOString?.() ?? 'unknown'}</Text>
        <Text>Public IP: {instance.publicIp ?? 'n/a'}</Text>
        <Text>Private IP: {instance.privateIp ?? 'n/a'}</Text>
        <Text>
          Status checks:{' '}
          <Text color={statusColor(statusChecks)}>{statusChecks ?? 'pending/unknown'}</Text>
        </Text>
        <Text color="gray">Read-only. Start/stop/edit not available yet.</Text>
      </Box>
    </Box>
  );
}
