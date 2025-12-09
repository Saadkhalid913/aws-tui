import {describe, expect, it} from 'vitest';
import {CONFIG_PATH, DEFAULT_CONFIG, resolveInitialSettings} from '../src/config.js';

describe('resolveInitialSettings', () => {
  it('prefers environment variables over file config', () => {
    const env = {
      AWS_PROFILE: 'env-profile',
      AWS_REGION: 'us-west-1',
    } satisfies NodeJS.ProcessEnv;

    const result = resolveInitialSettings(env, {
      profile: 'file-profile',
      region: 'us-east-1',
      pageSize: 10,
      refreshSeconds: 45,
    });

    expect(result.profile).toBe('env-profile');
    expect(result.region).toBe('us-west-1');
    expect(result.pageSize).toBe(10);
    expect(result.refreshSeconds).toBe(45);
    expect(result.configPath).toBe(CONFIG_PATH);
  });

  it('falls back to defaults when values are missing', () => {
    const result = resolveInitialSettings({}, {});

    expect(result.profile).toBeUndefined();
    expect(result.region).toBeUndefined();
    expect(result.pageSize).toBe(DEFAULT_CONFIG.pageSize);
    expect(result.refreshSeconds).toBe(DEFAULT_CONFIG.refreshSeconds);
    expect(result.configPath).toBe(CONFIG_PATH);
  });
});
