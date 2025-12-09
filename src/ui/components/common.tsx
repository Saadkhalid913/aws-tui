import React from 'react';
import {Box, Text} from 'ink';

export const palette = {
  accent: 'cyan',
  muted: 'gray',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
  info: 'blue',
} as const;

export function ec2StateColor(state?: string) {
  switch (state?.toLowerCase()) {
    case 'running':
      return palette.success;
    case 'stopped':
    case 'shutting-down':
    case 'terminated':
      return palette.danger;
    case 'pending':
    case 'stopping':
      return palette.warning;
    default:
      return undefined;
  }
}

export function statusColor(status?: string) {
  switch (status?.toLowerCase()) {
    case 'ok':
      return palette.success;
    case 'impaired':
    case 'insufficient-data':
      return palette.warning;
    case 'failed':
      return palette.danger;
    default:
      return undefined;
  }
}

export function Banner({title, subtitle}: {title: string; subtitle?: string}) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={palette.accent}>
        {title}
      </Text>
      {subtitle ? <Text color={palette.muted}>{subtitle}</Text> : null}
    </Box>
  );
}

export function ErrorBox({message}: {message: string}) {
  return (
    <Box borderStyle="round" borderColor={palette.danger} paddingX={1} paddingY={0} marginBottom={1}>
      <Text color={palette.danger}>{message}</Text>
    </Box>
  );
}

export function InfoBox({message}: {message: string}) {
  return (
    <Box borderStyle="round" borderColor={palette.accent} paddingX={1} paddingY={0} marginBottom={1}>
      <Text>{message}</Text>
    </Box>
  );
}

export function StatusLine({left, right}: {left: string; right?: string}) {
  return (
    <Box justifyContent="space-between" borderStyle="single" paddingX={1}>
      <Text>{left}</Text>
      {right ? <Text color={palette.muted}>{right}</Text> : null}
    </Box>
  );
}
