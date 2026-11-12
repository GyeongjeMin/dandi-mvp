import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/database.js';
import type { LLMConfig } from './config.js';
import { createProvider } from './llm/providers.js';
import {
  AGE_BANDS, createMember, getUser, toUserDTO, updateMember, type RegionShare, type UserRow, type UserInput,
} from './domain/users.js';
import {
  createMemory, deleteMemory, getMemory, isCategory, listMemories, updateMemory, type MemoryPatch,
} from './domain/memories.js';
import {
  deleteConversation, endConversation, getConversation, getConversationRow, listConversations,
} from './domain/conversations.js';
import { handleUserMessage, makeRecallQuestion, startConversation, type Engine } from './domain/dandi.js';
import { refreshRecommendations } from './domain/matching.js';
import { cancelConnection, createConnection, demoRespond, listConnections } from './domain/connections.js';
import { CATEGORY_LABEL } from './domain/tags.js';
import { getPrefs, setPrefs, validatePrefsPatch } from './domain/prefs.js';
import { createFamilyRouter, mediaHandler, removePhotoFiles } from './family-routes.js';
import {
  activeInvite, allPhotoFiles, cancelInvite, commentsFor, createInvite, listMembers, listPosts, markPost, removeMember, unseenPostCount,
} from './domain/family.js';
import { checkReminder, createReminder, dueReminders, listReminders, parseReminderInput, updateReminder } from './domain/reminders.js';

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;
const ah = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const str = (v: unknown, max: number, field: string, required = true): string => {
  if (v === undefined || v === null || v === '') {
    if (required) throw httpError(400, `${field} 을(를) 입력해 주세요.`);
    return '';
  }
  if (typeof v !== 'string') throw httpError(400, `${field} 형식이 올바르지 않아요.`);
  const s = v.trim();
  if (required && !s) throw httpError(400, `${field} 을(를) 입력해 주세요.`);
  if (s.length > max) throw httpError(400, `${field} 은(는) ${max}자 이내로 적어 주세요.`);
  return s;
};
const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, '잘못된 번호예요.');
  return n;
};
const SHARES: RegionShare[] = ['none', 'province', 'city'];

function parseUserInput(b: Record<string, unknown>, partial: boolean): Partial<UserInput> {
  const out: Partial<UserInput> = {};
  if (!partial || b.nickname !== undefined) out.nickname = str(b.nickname, 12, '별명');
  if (!partial || b.ageBand !== undefined) {
    const a = str(b.ageBand, 20, '연령대');
    if (!AGE_BANDS.includes(a)) throw httpError(400, '연령대를 목록에서 골라 주세요.');
    out.ageBand = a;
  }
  if (!partial || b.regionProvince !== undefined) out.regionProvince = str(b.regionProvince, 10, '시·도', false);
  if (!partial || b.regionCity !== undefined) out.regionCity = str(b.regionCity, 15, '시·군·구', false);
  if (!partial || b.regionShare !== undefined) {
    if (!SHARES.includes(b.regionShare as RegionShare)) throw httpError(400, '지역 공개 범위가 올바르지 않아요.');
    out.regionShare = b.regionShare as RegionShare;
  }
  if (!partial || b.consentMemory !== undefined) out.consentMemory = b.consentMemory === true;
  if (!partial || b.consentMatching !== undefined) out.consentMatching = b.consentMatching === true;
  return out;
}

function parseMemoryPatch(b: Record<string, unknown>): MemoryPatch {
  const p: MemoryPatch = {};
  if (b.category !== undefined) {
    if (!isCategory(b.category)) throw httpError(400, '분류가 올바르지 않아요.');
    p.category = b.category;
  }
  if (b.title !== undefined) p.title = str(b.title, 40, '제목');
  if (b.detail !== undefined) p.detail = str(b.detail, 300, '내용', false);
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== 'string')) throw httpError(400, '태그 형식이 올바르지 않아요.');
    p.tags = (b.tags as string[]).map((t) => t.trim()).filter(Boolean).slice(0, 6);
  }
  if (b.useForMatching !== undefined) p.useForMatching = b.useForMatching === true;
  if (b.shareFamily !== undefined) p.shareFamily = b.shareFamily === true;
  return p;
}

declare module 'express-serve-static-core' {
  interface Request { user?: UserRow }
}

export function createApp(db: DB, llm: LLMConfig, opts: { clientDist?: string; uploadDir?: string } = {}) {
  const app = express();
  const engine: Engine = { provider: createProvider(llm) };
  const uploadDir = opts.uploadDir ?? path.join(process.cwd(), 'data', 'uploads');
  // 사진을 받는 가족 소식 등록만 큰 요청을 허용하고, 나머지는 작게 제한
  const smallJson = express.json({ limit: '100kb' });
  const photoJson = express.json({ limit: '6mb' });
  app.use((req, res, next) => (req.method === 'POST' && req.path === '/api/family/posts' ? photoJson : smallJson)(req, res, next));

  // ── 가족·보호자용 API (가족 전용 토큰으로 접근) 와 사진 파일
  app.get('/api/media/:file', mediaHandler(uploadDir));
  app.use('/api/family', createFamilyRouter(db, uploadDir));

  const api = express.Router();

  // ── 서비스 상태 (화면 상단 '데모 모드 / AI 모드' 표시용) — API 키는 절대 내보내지 않음
  api.get('/health', (_req, res) => {
    res.json({
      ok: true,
      mode: llm.provider === 'demo' ? 'demo' : 'ai',
      provider: llm.provider,
      model: llm.provider === 'demo' ? null : llm.model,
      warning: llm.warning,
      categories: CATEGORY_LABEL,
      ageBands: AGE_BANDS,
    });
  });

  // ── 이용자 등록 (본인인증 없는 MVP: 브라우저에 이용자 번호를 저장해 구분)
  api.post('/users', ah((req, res) => {
    const input = parseUserInput(req.body ?? {}, false) as UserInput;
    const u = createMember(db, input);
    res.status(201).json({ user: toUserDTO(u) });
  }));

  // 이하 모든 API 는 x-dandi-user 헤더의 이용자 본인 데이터만 다룹니다.
  const requireUser = (req: Request, _res: Response, next: NextFunction) => {
    const id = Number(req.header('x-dandi-user'));
    const u = Number.isInteger(id) && id > 0 ? getUser(db, id) : undefined;
    if (!u) return next(httpError(401, '이용자 정보를 찾을 수 없어요. 처음 화면에서 다시 시작해 주세요.'));
    if (u.kind !== 'member') return next(httpError(403, '시연용 가상 이용자로는 로그인할 수 없어요.'));
    req.user = u;
    next();
  };
  api.use(requireUser);
  const me = (req: Request) => req.user!;

  api.get('/me', (req, res) => { res.json({ user: toUserDTO(me(req)) }); });
  api.patch('/me', ah((req, res) => {
    const u = updateMember(db, me(req).id, parseUserInput(req.body ?? {}, true));
    res.json({ user: toUserDTO(u) });
  }));
  api.delete('/me', ah((req, res) => {
    const files = allPhotoFiles(db, me(req).id);
    db.prepare('DELETE FROM users WHERE id = ? AND kind = ?').run(me(req).id, 'member');
    removePhotoFiles(uploadDir, files); // 가족이 보낸 사진 파일까지 지움
    res.json({ ok: true });
  }));

  // ── 대화 방식·공유 범위 (계정에 저장 → 어느 기기에서든 같게)
  api.get('/prefs', (req, res) => { res.json({ prefs: getPrefs(db, me(req).id) }); });
  api.patch('/prefs', ah((req, res) => {
    res.json({ prefs: setPrefs(db, me(req).id, validatePrefsPatch(req.body ?? {})) });
  }));

  // ── 가족 연결 관리 (어르신 쪽)
  api.get('/care', (req, res) => {
    const u = me(req);
    res.json({ invite: activeInvite(db, u.id), members: listMembers(db, u.id), prefs: getPrefs(db, u.id) });
  });
  api.post('/care/invite', (req, res) => { res.status(201).json({ invite: createInvite(db, me(req).id) }); });
  api.delete('/care/invite', (req, res) => { cancelInvite(db, me(req).id); res.json({ ok: true }); });
  api.delete('/care/members/:id', (req, res, next) => {
    if (!removeMember(db, me(req).id, idParam(req.params.id))) return next(httpError(404, '연결된 가족을 찾을 수 없어요.'));
    res.json({ ok: true });
  });
  // 가족 소식 (어르신이 보는 화면)
  api.get('/care/posts', (req, res) => { res.json({ posts: listPosts(db, me(req).id) }); });
  api.post('/care/posts/:id/seen', (req, res) => {
    markPost(db, me(req).id, idParam(req.params.id), 'seen_at');
    res.json({ ok: true });
  });

  // ── 복약·생활 알림 (어르신 쪽: 오늘 목록 보기, 확인, 끄고 켜기, 직접 만들기)
  api.get('/reminders', (req, res) => {
    res.json({ reminders: listReminders(db, me(req).id), due: dueReminders(db, me(req).id).map((r) => r.id) });
  });
  api.post('/reminders', ah((req, res) => {
    const input = parseReminderInput(req.body ?? {}, false) as { kind: 'medication' | 'life'; label: string; time: string };
    res.status(201).json({ reminder: createReminder(db, me(req).id, input, { kind: 'elder' }) });
  }));
  api.patch('/reminders/:id', ah((req, res) => {
    // 어르신은 켜고 끄기만 (내용 수정은 가족 화면 또는 새로 만들기)
    const r = updateReminder(db, me(req).id, idParam(req.params.id), { enabled: req.body?.enabled === true });
    if (!r) throw httpError(404, '알림을 찾을 수 없어요.');
    res.json({ reminder: r });
  }));
  api.post('/reminders/:id/check', ah((req, res) => {
    const r = checkReminder(db, me(req).id, idParam(req.params.id));
    if (!r) throw httpError(404, '알림을 찾을 수 없어요.');
    res.json({ reminder: r });
  }));

  // ── 홈
  api.get('/home', (req, res) => {
    const u = me(req);
    const all = listMemories(db, u.id);
    const confirmed = all.filter((m) => m.status === 'confirmed');
    const counts = Object.fromEntries(Object.keys(CATEGORY_LABEL).map((c) => [c, confirmed.filter((m) => m.category === c).length]));
    const pendingConnections = listConnections(db, u.id).filter((c) => c.status === 'pending').length;
    res.json({
      user: toUserDTO(u),
      recentMemories: confirmed.slice(0, 4),
      pendingCount: all.length - confirmed.length,
      confirmedCount: confirmed.length,
      counts,
      recentConversations: listConversations(db, u.id, 3),
      pendingConnections,
      unseenFamilyPosts: unseenPostCount(db, u.id),
      reminders: listReminders(db, u.id).filter((r) => r.enabled),
      dueReminderIds: dueReminders(db, u.id).map((r) => r.id),
      prefs: getPrefs(db, u.id),
    });
  });

  // ── 대화
  api.get('/conversations', (req, res) => { res.json({ conversations: listConversations(db, me(req).id, 30) }); });
  api.post('/conversations', ah(async (req, res) => {
    const b = req.body ?? {};
    const memoryId = b.memoryId === undefined ? undefined : idParam(b.memoryId);
    const question = b.question === undefined ? undefined : str(b.question, 300, '질문');
    const postId = b.postId === undefined ? undefined : idParam(b.postId);
    const channel = b.channel === 'voice' ? 'voice' : 'text';
    const id = await startConversation(db, engine, me(req), { memoryId, question, postId, channel });
    res.status(201).json({ conversation: getConversation(db, me(req).id, id) });
  }));
  api.post('/conversations/:id/end', (req, res, next) => {
    if (!endConversation(db, me(req).id, idParam(req.params.id))) return next(httpError(404, '대화를 찾을 수 없어요.'));
    res.json({ ok: true });
  });

  /**
   * 음성 대화용 스트리밍 응답 (Server-Sent Events)
   *  event: meta  → { emotion }  캐릭터 표정 (첫 조각보다 먼저)
   *  event: delta → { text }  답의 일부 (브라우저가 문장 단위로 끊어 바로 읽기 시작)
   *  event: done  → { userMessage, assistantMessage, conversationTitle }  저장이 끝난 최종 결과
   *  event: error → { error }
   */
  api.post('/conversations/:id/messages/stream', ah(async (req, res) => {
    const id = idParam(req.params.id);
    if (!getConversationRow(db, me(req).id, id)) throw httpError(404, '대화를 찾을 수 없어요.');
    const text = str(req.body?.content, 500, '메시지');
    const channel = req.body?.channel === 'text' ? 'text' : 'voice';
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const result = await handleUserMessage(db, engine, me(req), id, text, {
        channel,
        onMeta: (m) => send('meta', m),          // 캐릭터 표정 (답보다 먼저)
        onDelta: (t) => send('delta', { text: t }),
      });
      send('done', result);
    } catch (e) {
      console.error('[단디] 스트리밍 응답 오류:', e);
      send('error', { error: (e as { status?: number }).status && (e as { status?: number }).status! < 500 ? (e as Error).message : '잠시 문제가 생겼어요. 다시 말씀해 주세요.' });
    }
    res.end();
  }));
  api.get('/conversations/:id', (req, res, next) => {
    const c = getConversation(db, me(req).id, idParam(req.params.id));
    if (!c) return next(httpError(404, '대화를 찾을 수 없어요.'));
    res.json({ conversation: c });
  });
  api.delete('/conversations/:id', (req, res, next) => {
    if (!deleteConversation(db, me(req).id, idParam(req.params.id))) return next(httpError(404, '대화를 찾을 수 없어요.'));
    res.json({ ok: true });
  });
  api.post('/conversations/:id/messages', ah(async (req, res) => {
    const id = idParam(req.params.id);
    if (!getConversationRow(db, me(req).id, id)) throw httpError(404, '대화를 찾을 수 없어요.');
    const text = str(req.body?.content, 500, '메시지');
    const result = await handleUserMessage(db, engine, me(req), id, text);
    res.status(201).json(result);
  }));

  // ── 기억
  api.get('/memories', (req, res) => {
    const status = req.query.status === 'pending' || req.query.status === 'confirmed' ? req.query.status : undefined;
    const memories = listMemories(db, me(req).id, status);
    // 가족이 공유된 추억에 남긴 댓글·질문도 함께 (어르신 본인 화면)
    res.json({ memories, comments: commentsFor(db, me(req).id, memories.filter((m) => m.shareFamily).map((m) => m.id)) });
  });
  api.post('/memories', ah((req, res) => {
    const b = req.body ?? {};
    if (!isCategory(b.category)) throw httpError(400, '분류를 골라 주세요.');
    const m = createMemory(db, me(req).id, {
      category: b.category,
      title: str(b.title, 40, '제목'),
      detail: str(b.detail, 300, '내용', false),
      tags: Array.isArray(b.tags) ? b.tags.filter((t: unknown) => typeof t === 'string') : [],
      source: 'manual',
      status: 'confirmed',
    });
    res.status(201).json({ memory: m });
  }));
  api.patch('/memories/:id', ah((req, res) => {
    const m = updateMemory(db, me(req).id, idParam(req.params.id), parseMemoryPatch(req.body ?? {}));
    if (!m) throw httpError(404, '기억을 찾을 수 없어요.');
    res.json({ memory: m });
  }));
  api.post('/memories/:id/confirm', ah((req, res) => {
    const m = updateMemory(db, me(req).id, idParam(req.params.id), { ...parseMemoryPatch(req.body ?? {}), status: 'confirmed' });
    if (!m) throw httpError(404, '기억을 찾을 수 없어요.');
    res.json({ memory: m });
  }));
  api.delete('/memories/:id', (req, res, next) => {
    if (!deleteMemory(db, me(req).id, idParam(req.params.id))) return next(httpError(404, '기억을 찾을 수 없어요.'));
    res.json({ ok: true });
  });
  api.post('/memories/:id/recall-question', ah(async (req, res) => {
    const m = getMemory(db, me(req).id, idParam(req.params.id));
    if (!m) throw httpError(404, '기억을 찾을 수 없어요.');
    if (m.status !== 'confirmed') throw httpError(400, '확인된 기억으로만 회상 질문을 만들 수 있어요.');
    res.json(await makeRecallQuestion(db, engine, me(req), m));
  }));

  // ── 동네 친구 추천
  api.get('/recommendations', (req, res) => {
    const u = me(req);
    if (!u.consent_matching) {
      res.json({ consentRequired: true, recommendations: [], myTags: null, changes: null });
      return;
    }
    res.json({ consentRequired: false, ...refreshRecommendations(db, u) });
  });

  // ── 교류 연결
  api.get('/connections', (req, res) => { res.json({ connections: listConnections(db, me(req).id) }); });
  api.post('/connections', ah((req, res) => {
    if (!me(req).consent_matching) throw httpError(403, '친구 추천 동의 후 이용할 수 있어요.');
    const c = createConnection(db, me(req).id, idParam(req.body?.toUserId), str(req.body?.message, 200, '인사말', false));
    res.status(201).json({ connection: c });
  }));
  api.post('/connections/:id/demo-respond', ah((req, res) => {
    const d = req.body?.decision;
    if (d !== 'accepted' && d !== 'declined') throw httpError(400, 'decision 은 accepted 또는 declined 여야 해요.');
    res.json({ connection: demoRespond(db, me(req).id, idParam(req.params.id), d) });
  }));
  api.post('/connections/:id/cancel', ah((req, res) => {
    res.json({ connection: cancelConnection(db, me(req).id, idParam(req.params.id)) });
  }));

  app.use('/api', api);

  // 빌드된 프론트엔드가 있으면 함께 제공 (npm run build 후 npm start 로 한 주소에서 실행)
  if (opts.clientDist && fs.existsSync(path.join(opts.clientDist, 'index.html'))) app.use(express.static(opts.clientDist));

  // 오류 응답 (내부 오류 내용은 노출하지 않음)
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error('[단디] 서버 오류:', err);
    res.status(status).json({ error: status >= 500 ? '잠시 문제가 생겼어요. 다시 시도해 주세요.' : err.message });
  });
  return app;
}
