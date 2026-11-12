/**
 * 교체 가능한 LLM 연동 구조.
 * 새 제공자를 추가하려면 LLMProvider 인터페이스(complete 함수 하나)만 구현해 createProvider 에 등록하면 됩니다.
 * API 키는 서버 환경변수에서만 읽고, 프론트엔드로 절대 보내지 않습니다.
 */
import type { LLMConfig } from '../config.js';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export interface CompleteOptions {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  name: string;
  model: string;
  complete(opts: CompleteOptions): Promise<string>;
  /** 답을 만드는 대로 조금씩 보내 줍니다(음성 대화에서 첫 문장을 빨리 읽기 위해). 전체 답을 돌려줍니다. */
  stream(opts: CompleteOptions, onDelta: (text: string) => void): Promise<string>;
}

/** fetch 응답 본문(SSE)을 줄 단위로 읽어 'data:' 내용을 넘겨 줍니다. */
async function readSse(res: Response, onData: (data: string) => void): Promise<void> {
  if (!res.body) throw new LLMError('AI 서버가 스트림을 보내지 않았어요.');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) onData(line.slice(5).trim());
    }
  }
  if (buf.startsWith('data:')) onData(buf.slice(5).trim());
}

async function postStream(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new LLMError(`AI 서버에 연결하지 못했어요: ${(e as Error).message}`);
  }
  if (!res.ok) throw new LLMError(`AI 서버 오류 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res;
}

export class LLMError extends Error {}

/** API 규칙에 맞게 대화를 정리: 첫 메시지는 user, 같은 역할 연속은 합치기 */
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    if (!t.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n${t.content}`;
    else out.push({ ...t });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: '(대화를 시작합니다)' });
  if (out.length === 0) out.push({ role: 'user', content: '(대화를 시작합니다)' });
  return out;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new LLMError(`AI 서버에 연결하지 못했어요: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new LLMError(`AI 서버 오류 (${res.status}): ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new LLMError('AI 서버 응답을 해석하지 못했어요.'); }
}

class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  constructor(public model: string, private apiKey: string, private baseUrl: string) {}
  async complete({ system, messages, maxTokens = 600, temperature = 0.7 }: CompleteOptions): Promise<string> {
    const data = await postJson(`${this.baseUrl}/messages`, {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }, { model: this.model, system, messages: normalizeTurns(messages), max_tokens: maxTokens, temperature }) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    if (!text) throw new LLMError('AI가 빈 응답을 보냈어요.');
    return text;
  }
  async stream({ system, messages, maxTokens = 600, temperature = 0.7 }: CompleteOptions, onDelta: (t: string) => void): Promise<string> {
    const res = await postStream(`${this.baseUrl}/messages`, {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }, { model: this.model, system, messages: normalizeTurns(messages), max_tokens: maxTokens, temperature, stream: true });
    let full = '';
    await readSse(res, (data) => {
      try {
        const ev = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) { full += ev.delta.text; onDelta(ev.delta.text); }
        if (ev.type === 'error') throw new LLMError(`AI 스트림 오류: ${ev.error?.message ?? ''}`);
      } catch (e) { if (e instanceof LLMError) throw e; }
    });
    if (!full.trim()) throw new LLMError('AI가 빈 응답을 보냈어요.');
    return full.trim();
  }
}

class OpenAICompatibleProvider implements LLMProvider {
  name = 'openai';
  constructor(public model: string, private apiKey: string, private baseUrl: string) {}
  async complete({ system, messages, maxTokens = 600, temperature = 0.7 }: CompleteOptions): Promise<string> {
    const data = await postJson(`${this.baseUrl}/chat/completions`, {
      authorization: `Bearer ${this.apiKey}`,
    }, {
      model: this.model,
      messages: [{ role: 'system', content: system }, ...normalizeTurns(messages)],
      // OpenAI 공식 API의 최신 모델은 max_completion_tokens 만 받고 temperature 를 제한하는 경우가 있어 나눠 보냅니다.
      ...(this.baseUrl.includes('api.openai.com')
        ? { max_completion_tokens: maxTokens * 4 } // 추론형 모델의 내부 사고 토큰 여유분
        : { max_tokens: maxTokens, temperature }),
    }) as { choices?: Array<{ message?: { content?: string } }> };
    const text = (data.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new LLMError('AI가 빈 응답을 보냈어요.');
    return text;
  }
  async stream({ system, messages, maxTokens = 600, temperature = 0.7 }: CompleteOptions, onDelta: (t: string) => void): Promise<string> {
    const res = await postStream(`${this.baseUrl}/chat/completions`, {
      authorization: `Bearer ${this.apiKey}`,
    }, {
      model: this.model,
      stream: true,
      messages: [{ role: 'system', content: system }, ...normalizeTurns(messages)],
      ...(this.baseUrl.includes('api.openai.com')
        ? { max_completion_tokens: maxTokens * 4 }
        : { max_tokens: maxTokens, temperature }),
    });
    let full = '';
    await readSse(res, (data) => {
      if (data === '[DONE]') return;
      try {
        const ev = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const t = ev.choices?.[0]?.delta?.content;
        if (t) { full += t; onDelta(t); }
      } catch { /* 해석할 수 없는 줄은 건너뜀 */ }
    });
    if (!full.trim()) throw new LLMError('AI가 빈 응답을 보냈어요.');
    return full.trim();
  }
}

/** 데모 모드면 null (규칙 기반 엔진 사용) */
export function createProvider(cfg: LLMConfig): LLMProvider | null {
  switch (cfg.provider) {
    case 'anthropic': return new AnthropicProvider(cfg.model, cfg.apiKey, cfg.baseUrl);
    case 'openai': return new OpenAICompatibleProvider(cfg.model, cfg.apiKey, cfg.baseUrl);
    default: return null;
  }
}
