// 백엔드 API 호출. API 키는 백엔드에만 있고, 브라우저는 /api 로만 요청합니다.

export type MemoryCategory = 'work' | 'hobby' | 'place' | 'family' | 'life_event' | 'daily';
export type RegionShare = 'none' | 'province' | 'city';
export type MessageMode = 'demo' | 'ai' | 'fallback' | 'template';
export type Channel = 'text' | 'voice';

export interface User {
  id: number;
  nickname: string;
  ageBand: string;
  regionProvince: string;
  regionCity: string;
  regionShare: RegionShare;
  consentMemory: boolean;
  consentMatching: boolean;
  createdAt: string;
}

export interface Health {
  ok: boolean;
  mode: 'demo' | 'ai';
  provider: string;
  model: string | null;
  warning: string | null;
  categories: Record<MemoryCategory, string>;
  ageBands: string[];
}

export interface Memory {
  id: number;
  category: MemoryCategory;
  categoryLabel: string;
  title: string;
  detail: string;
  tags: string[];
  source: 'stated' | 'inferred' | 'manual';
  status: 'pending' | 'confirmed';
  useForMatching: boolean;
  conversationId: number | null;
  conversationTitle: string | null;
  conversationExists: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  recallCount: number;
  shareFamily: boolean;
  engagement: number;
}
export interface MemoryComment {
  id: number; memoryId: number; from: string; kind: 'comment' | 'question'; content: string; createdAt: string; usedAt: string | null; mine?: boolean;
}
export interface FamilyPost {
  id: number; from: string; message: string; photoUrl: string | null; createdAt: string;
  offeredAt: string | null; seenAt: string | null; talkedAt: string | null; mine?: boolean;
}
export interface Reminder {
  id: number; kind: 'medication' | 'life'; label: string; time: string; timeLabel: string; enabled: boolean;
  createdBy: 'elder' | 'family'; checkedToday: boolean; checkedAt: string | null;
}
export interface Prefs {
  replyLength: 'short' | 'normal';
  speechRate: number;
  avoidTopics: string[];
  shareActivity: boolean;
  shareTopics: boolean;
  reduceMotion: boolean;
}
export interface FamilyMember { id: number; name: string; relation: string; label: string; createdAt: string; lastSeenAt: string | null }
export type MemoryRef = Memory | { id: number; deleted: true };
export const isDeleted = (m: MemoryRef): m is { id: number; deleted: true } => 'deleted' in m;

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  mode: MessageMode;
  createdAt: string;
  candidates: MemoryRef[];
  alreadyKnown: MemoryRef[];
  usedMemories: Array<{ id: number; title: string }>;
  notice: string | null;
  pendingAction: 'family_post' | 'memory_confirm' | null;
  showPost: FamilyPost | null;
  confirmed: Array<{ id: number; title: string }>;
  endSession: boolean;
  emotion: Emotion;
}
export type Emotion = 'neutral' | 'happy' | 'comforting';

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  channel: Channel;
  endedAt: string | null;
  messages: Message[];
}
export interface SendResult { userMessage: Message; assistantMessage: Message; conversationTitle: string }
export interface ConversationSummary {
  id: number;
  title: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  lastMessage: string | null;
}

export type MatchDim = 'work' | 'hobby' | 'interest' | 'experience' | 'region';
export interface Recommendation {
  rank: number;
  score: number;
  user: { id: number; nickname: string; ageBand: string; region: string; intro: string; hobbies: string[]; interests: string[]; works: string[]; experiences: string[] };
  breakdown: Array<{ dimension: MatchDim; label: string; weight: number; similarity: number; points: number; active: boolean }>;
  common: {
    exact: Array<{ dimension: MatchDim; tag: string }>;
    related: Array<{ dimension: MatchDim; mine: string; theirs: string; familyLabel: string }>;
    region: string | null;
  };
  commonExperiences: string[];
  reason: string;
  delta: { status: 'new' | 'up' | 'down' | 'same'; previousRank: number | null } | null;
}
export interface RecommendationResponse {
  consentRequired: boolean;
  recommendations: Recommendation[];
  myTags: Record<'work' | 'hobby' | 'interest' | 'experience', string[]> | null;
  weights?: Record<MatchDim, number>;
  changes: { since: string | null; addedTags: string[]; removedTags: string[]; droppedUsers: string[] } | null;
}

export interface Connection {
  id: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message: string;
  isDemo: boolean;
  createdAt: string;
  respondedAt: string | null;
  target: { id: number; nickname: string; ageBand: string; region: string } | null;
}

export interface HomeData {
  user: User;
  recentMemories: Memory[];
  pendingCount: number;
  confirmedCount: number;
  counts: Record<MemoryCategory, number>;
  recentConversations: ConversationSummary[];
  pendingConnections: number;
  unseenFamilyPosts: number;
  reminders: Reminder[];
  dueReminderIds: number[];
  prefs: Prefs;
}

const USER_KEY = 'dandi.userId';
export const getUserId = () => Number(localStorage.getItem(USER_KEY)) || null;
export const setUserId = (id: number | null) => (id ? localStorage.setItem(USER_KEY, String(id)) : localStorage.removeItem(USER_KEY));

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const id = getUserId();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(id ? { 'x-dandi-user': String(id) } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError((data as { error?: string }).error ?? '문제가 생겼어요. 다시 시도해 주세요.', res.status);
  }
  return data as T;
}

/**
 * 음성 대화용 스트리밍 요청. 단디의 답이 만들어지는 대로 onDelta 로 조각을 받고, 저장이 끝나면 최종 결과를 돌려줍니다.
 * (EventSource 는 POST·헤더를 못 쓰므로 fetch 스트림을 직접 읽습니다.)
 */
export async function streamMessage(
  conversationId: number, content: string, onDelta: (t: string) => void, signal?: AbortSignal, onMeta?: (m: { emotion: Emotion }) => void,
): Promise<SendResult> {
  const id = getUserId();
  let res: Response;
  try {
    res = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(id ? { 'x-dandi-user': String(id) } : {}) },
      body: JSON.stringify({ content, channel: 'voice' }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('인터넷 연결이 불안정해요. 연결을 확인하고 다시 말씀해 주세요.', 0);
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError((data as { error?: string }).error ?? '문제가 생겼어요. 다시 말씀해 주세요.', res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result: SendResult | null = null;
  let error: string | null = null;
  const handle = (block: string) => {
    const ev = /^event: (\w+)/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (!ev || !data) return;
    const j = JSON.parse(data);
    if (ev === 'meta') onMeta?.(j);
    else if (ev === 'delta') onDelta(j.text);
    else if (ev === 'done') result = j;
    else if (ev === 'error') error = j.error;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 2); }
  }
  if (buf.trim()) handle(buf);
  if (error) throw new ApiError(error, 500);
  if (!result) throw new ApiError('단디의 대답을 끝까지 받지 못했어요. 다시 말씀해 주세요.', 0);
  return result;
}

// ── 가족·보호자용 API (어르신 계정과 별도의 가족 전용 토큰) ──
const FAMILY_KEY = 'dandi.familyToken';
export const getFamilyToken = () => { try { return localStorage.getItem(FAMILY_KEY); } catch { return null; } };
export const setFamilyToken = (t: string | null) => { try { if (t) localStorage.setItem(FAMILY_KEY, t); else localStorage.removeItem(FAMILY_KEY); } catch { /* 저장 불가 */ } };

export async function familyApi<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getFamilyToken();
  let res: Response;
  try {
    res = await fetch(`/api/family${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { 'x-dandi-family': token } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? '문제가 생겼어요. 다시 시도해 주세요.', res.status);
  return data as T;
}
