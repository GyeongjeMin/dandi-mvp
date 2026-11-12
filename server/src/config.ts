import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

// server/.env 를 읽습니다 (없으면 기본값 = 데모 모드). 외부 패키지(dotenv) 없이 Node 내장 기능 사용.
try {
  process.loadEnvFile(path.join(SERVER_ROOT, '.env'));
} catch {
  /* .env 가 없으면 기본값으로 실행 */
}

export type ProviderName = 'demo' | 'anthropic' | 'openai';

export interface LLMConfig {
  provider: ProviderName;
  requested: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  warning: string | null;
}

function resolveLLM(): LLMConfig {
  const requested = (process.env.LLM_PROVIDER ?? 'demo').trim().toLowerCase();
  const demo = (warning: string | null): LLMConfig => ({
    provider: 'demo', requested, model: 'rule-based-demo', apiKey: '', baseUrl: '', warning,
  });

  if (requested === 'anthropic') {
    const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
    if (!apiKey) return demo('LLM_PROVIDER=anthropic 이지만 ANTHROPIC_API_KEY 가 비어 있어 데모 모드로 실행합니다.');
    return {
      provider: 'anthropic', requested, apiKey,
      model: (process.env.ANTHROPIC_MODEL ?? '').trim() || 'claude-sonnet-5-5',
      baseUrl: 'https://api.anthropic.com/v1', warning: null,
    };
  }
  if (requested === 'openai') {
    const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();
    const model = (process.env.OPENAI_MODEL ?? '').trim();
    if (!apiKey) return demo('LLM_PROVIDER=openai 이지만 OPENAI_API_KEY 가 비어 있어 데모 모드로 실행합니다.');
    if (!model) return demo('LLM_PROVIDER=openai 이지만 OPENAI_MODEL 이 비어 있어 데모 모드로 실행합니다.');
    return {
      provider: 'openai', requested, apiKey, model,
      baseUrl: ((process.env.OPENAI_BASE_URL ?? '').trim() || 'https://api.openai.com/v1').replace(/\/$/, ''),
      warning: null,
    };
  }
  if (requested !== 'demo') return demo(`알 수 없는 LLM_PROVIDER "${requested}" — 데모 모드로 실행합니다.`);
  return demo(null);
}

const dbFileEnv = process.env.DB_FILE?.trim() || './data/dandi.sqlite';

export const config = {
  port: Number(process.env.PORT) || 4000,
  dbFile: dbFileEnv === ':memory:' ? ':memory:' : path.resolve(SERVER_ROOT, dbFileEnv),
  clientDist: path.resolve(SERVER_ROOT, '..', 'client', 'dist'),
  llm: resolveLLM(),
};
