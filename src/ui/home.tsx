import React, {useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {Banner, ErrorBox, InfoBox, StatusLine} from './components/common.js';

export type HomeProps = {
  profile?: string;
  region?: string;
  onSelectService: (service: 'ec2' | 's3') => void;
  onOpenRegionModal: () => void;
  errorMessage?: string;
};

const serviceItems = [
  {label: 'EC2 (read-only)', value: 'ec2'},
  {label: 'S3 (read-only)', value: 's3'},
];

export function HomeView({
  profile,
  region,
  onSelectService,
  onOpenRegionModal,
  errorMessage,
}: HomeProps) {
  useInput((input, key) => {
    if (key.return) return;
    if (input === 'R') {
      onOpenRegionModal();
    }
  });

  return (
    <Box flexDirection="column">
      <Banner
        title="AWS TUI (EC2 + S3)"
        subtitle="Read-only. Uses your AWS CLI profile/config."
      />

      <StatusLine
        left={`Profile: ${profile ?? 'default'}    Region: ${region ?? 'not set (R to pick)'}`}
        right="Keys: ↑/↓ select, enter open, R region"
      />

      {errorMessage ? <ErrorBox message={errorMessage} /> : null}
      <Box marginY={1}>
        <Text>Select a service:</Text>
      </Box>
      <SelectInput items={serviceItems} onSelect={(item) => onSelectService(item.value as 'ec2' | 's3')} />

      <Box marginTop={1}>
        <InfoBox message="Press R anytime to change region. Press q to quit." />
      </Box>
    </Box>
  );
}

export type RegionModalProps = {
  open: boolean;
  regions: {name: string; endpoint?: string}[];
  loading: boolean;
  error?: string;
  onSelect: (region: string) => void;
  onClose: () => void;
};

export function RegionModal({open, regions, loading, error, onSelect, onClose}: RegionModalProps) {
  useInput((input, key) => {
    if (!open) return;
    if (key.escape) {
      onClose();
    }
  }, {isActive: open});

  useEffect(() => {
    if (!open) return;
  }, [open]);

  if (!open) return null;

  if (loading) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        paddingY={1}
        marginTop={1}
      >
        <Text>Loading regions…</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={1}
        paddingY={1}
        marginTop={1}
      >
        <Text color="red">{error}</Text>
        <Text color="gray">Press esc to close.</Text>
      </Box>
    );
  }

  const items = regions.map((r) => ({label: r.name, value: r.name}));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={1}
      marginTop={1}
    >
      <Text>Select region (enter to apply, esc to cancel)</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value as string)} />
      </Box>
    </Box>
  );
}
