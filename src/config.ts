import {promises as fs} from 'fs';
import os from 'os';
import path from 'path';
import {z} from 'zod';

export type AppConfig = {
  profile?: string;
  region?: string;
  pageSize: number;
  refreshSeconds: number;
};

export const DEFAULT_CONFIG: AppConfig = {
  pageSize: 50,
  refreshSeconds: 30,
};

const configSchema = z
  .object({
    profile: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    pageSize: z.number().int().positive().optional(),
    refreshSeconds: z.number().int().positive().optional(),
  })
  .strict();

const configDir = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'aws-tui')
  : path.join(os.homedir(), '.config', 'aws-tui');

export const CONFIG_PATH = path.join(configDir, 'config.json');

export async function loadConfig(): Promise<{config: AppConfig; path: string}> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = configSchema.parse(JSON.parse(raw));
    return {config: {...DEFAULT_CONFIG, ...parsed}, path: CONFIG_PATH};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {config: {...DEFAULT_CONFIG}, path: CONFIG_PATH};
    }
    throw error;
  }
}

export async function saveConfig(config: Partial<AppConfig>): Promise<void> {
  const merged = {...DEFAULT_CONFIG, ...config};
  await fs.mkdir(configDir, {recursive: true});
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

export function resolveInitialSettings(
  env: NodeJS.ProcessEnv,
  fileConfig: AppConfig,
): AppConfig & {configPath: string} {
  const fromEnvProfile = env.AWS_PROFILE || env.AWS_DEFAULT_PROFILE;
  const fromEnvRegion = env.AWS_REGION || env.AWS_DEFAULT_REGION;

  return {
    profile: fromEnvProfile ?? fileConfig.profile,
    region: fromEnvRegion ?? fileConfig.region,
    pageSize: fileConfig.pageSize ?? DEFAULT_CONFIG.pageSize,
    refreshSeconds: fileConfig.refreshSeconds ?? DEFAULT_CONFIG.refreshSeconds,
    configPath: CONFIG_PATH,
  };
}
