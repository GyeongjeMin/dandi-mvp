/**
 * 시나리오 A~F 자동 테스트 (+ 개인정보 보호 · AI 모드 파이프라인 점검)
 * 실행: npm test   (server 폴더 또는 프로젝트 루트에서)
 * - 실제 데이터베이스 파일은 건드리지 않습니다 (메모리 DB와 임시 파일 사용).
 * - AI 모드는 가짜 'OpenAI 호환' 서버를 띄워, 실제 API 키 없이 LLM 연동 경로(요청·JSON 검증·저장)를 점검합니다.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { openDatabase, type DB } from '../db/database.js';
import { createApp } from '../app.js';
import type { LLMConfig } from '../config.js';

const DEMO: LLMConfig = { provider: 'demo', requested: 'demo', model: 'rule-based-demo', apiKey: '', baseUrl: '', warning: null };

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failures.push(name); console.log(`  ✘ ${name}${detail !== undefined ? `\n      → ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }
}

interface Ctx { base: string; userId?: number; close: () => Promise<void> }

async function start(db: DB, llm: LLMConfig): Promise<Ctx> {
  const app = createApp(db, llm);
  const server: http.Server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}/api`, close: () => new Promise((r) => server.close(() => r())) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(ctx: Ctx, method: string, url: string, body?: unknown, userId = ctx.userId): Promise<{ status: number; data: any }> {
  const res = await fetch(ctx.base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(userId ? { 'x-dandi-user': String(userId) } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

/** SSE 스트리밍 응답을 끝까지 읽어 delta 조각과 done 결과로 나눔 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function streamCall(ctx: Ctx, url: string, body: unknown, userId = ctx.userId): Promise<{ status: number; deltas: string[]; done: any; error: any; meta: any; order: string[] }> {
  const res = await fetch(ctx.base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(userId ? { 'x-dandi-user': String(userId) } : {}) },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const deltas: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let done: any = null; let error: any = null; let meta: any = null;
  const order: string[] = [];
  for (const block of raw.split('\n\n')) {
    const ev = /^event: (\w+)/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (!ev || !data) continue;
    const j = JSON.parse(data);
    order.push(ev);
    if (ev === 'meta') meta = j;
    if (ev === 'delta') deltas.push(j.text);
    if (ev === 'done') done = j;
    if (ev === 'error') error = j;
  }
  return { status: res.status, deltas, done, error, meta, order };
}

// 가족용 API 호출 (x-dandi-family 토큰)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function famCall(ctx: Ctx, token: string | null, method: string, url: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(ctx.base + '/family' + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-dandi-family': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// 1×1 픽셀 PNG
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const NEW_USER = {
  nickname: '봄날', ageBand: '70대 초반', regionProvince: '경남', regionCity: '진주시', regionShare: 'city',
  consentMemory: true, consentMatching: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const recNames = (recs: any[]) => recs.map((r) => `${r.rank}.${r.user.nickname}(${r.score})`).join(' ');

async function demoScenarios() {
  console.log('\n■ 데모 모드 시나리오');
  const db = openDatabase(':memory:');
  const ctx = await start(db, DEMO);
  try {
    const h = await call(ctx, 'GET', '/health');
    check('상태 API: 데모 모드로 표시', h.data.mode === 'demo' && !('apiKey' in h.data));
    const u = await call(ctx, 'POST', '/users', NEW_USER);
    ctx.userId = u.data.user.id;
    check('이용자 등록', u.status === 201 && ctx.userId);

    // ── 시나리오 A
    console.log('\n[A] 기억 저장');
    const c1 = await call(ctx, 'POST', '/conversations', {});
    const conv1 = c1.data.conversation.id;
    const m1 = await call(ctx, 'POST', `/conversations/${conv1}/messages`, { content: '젊었을 때 진주에서 작은 식당을 운영했었지.' });
    const reply = m1.data.assistantMessage;
    console.log(`    단디: ${reply.content}`);
    check('A-1 단디가 식당 운영에 공감하고 질문', /식당을 운영하셨군요/.test(reply.content) && /\?/.test(reply.content), reply.content);
    const cand = reply.candidates.find((m: { title: string }) => m.title === '식당 운영');
    check('A-2 "식당 운영" 기억 후보가 확인 대기로 추출됨', cand && cand.status === 'pending' && cand.category === 'work', reply.candidates);
    check('A-3 지역(진주)이 같은 기억의 태그로 구조화됨', cand?.tags.includes('진주'), cand?.tags);
    const before = await call(ctx, 'GET', '/memories?status=confirmed');
    check('A-4 확인 전에는 확정된 기억이 아님', before.data.memories.length === 0);
    const conf = await call(ctx, 'POST', `/memories/${cand.id}/confirm`, {});
    check('A-5 [기억할게요] → 확정', conf.data.memory.status === 'confirmed');
    const mem = await call(ctx, 'GET', '/memories?status=confirmed');
    const saved = mem.data.memories[0];
    check('A-6 나의 추억에서 확인 + 어떤 대화에서 나왔는지 기록', saved?.title === '식당 운영' && saved.conversationId === conv1 && /식당/.test(saved.conversationTitle), saved);
    const dup = await call(ctx, 'POST', `/conversations/${conv1}/messages`, { content: '그래, 식당을 했었다니까.' });
    check('A-7 같은 이야기는 중복 저장하지 않음', dup.data.assistantMessage.candidates.length === 0 && dup.data.assistantMessage.alreadyKnown.length === 1, dup.data.assistantMessage);

    // ── 시나리오 B
    console.log('\n[B] 회상 대화');
    const c2 = await call(ctx, 'POST', '/conversations', {});
    const opening = c2.data.conversation.messages[0];
    console.log(`    단디: ${opening.content}`);
    check('B-1 새 대화의 첫 마디가 저장된 식당 기억으로 회상 질문', /식당/.test(opening.content) && /\?/.test(opening.content), opening.content);
    check('B-2 참고한 기억이 표시됨', opening.usedMemories.some((m: { title: string }) => m.title === '식당 운영'));
    const rq = await call(ctx, 'POST', `/memories/${cand.id}/recall-question`, {});
    console.log(`    회상 질문: ${rq.data.question}`);
    check('B-3 나의 추억 화면의 회상 질문 생성', /식당/.test(rq.data.question), rq.data);

    // ── 시나리오 C
    console.log('\n[C] 네트워킹');
    const r0 = await call(ctx, 'GET', '/recommendations');
    console.log(`    텃밭 이전: ${recNames(r0.data.recommendations)}`);
    const conv2 = c2.data.conversation.id;
    const m2 = await call(ctx, 'POST', `/conversations/${conv2}/messages`, { content: '요즘은 텃밭 가꾸기를 좋아해.' });
    console.log(`    단디: ${m2.data.assistantMessage.content}`);
    const garden = m2.data.assistantMessage.candidates.find((m: { tags: string[] }) => m.tags.includes('텃밭 가꾸기'));
    check('C-1 "텃밭 가꾸기" 관심사가 추출됨', !!garden, m2.data.assistantMessage.candidates);
    await call(ctx, 'POST', `/memories/${garden.id}/confirm`, {});
    const r1 = await call(ctx, 'GET', '/recommendations');
    const recs = r1.data.recommendations;
    console.log(`    텃밭 이후: ${recNames(recs)}`);
    const gardeners = recs.filter((r: { common: { exact: Array<{ tag: string }> } }) => r.common.exact.some((e) => e.tag === '텃밭 가꾸기'));
    check('C-2 텃밭을 좋아하는 가상 이용자(정순·덕수)가 추천됨', gardeners.map((r: { user: { nickname: string } }) => r.user.nickname).sort().join() === '덕수,정순', recNames(gardeners));
    check('C-3 1순위가 텃밭 공통점을 가진 이용자', gardeners.some((r: { rank: number }) => r.rank === 1));
    check('C-4 새로 반영된 관심사가 변화 정보로 표시', r1.data.changes?.addedTags.includes('텃밭 가꾸기'), r1.data.changes);
    const deoksu0 = r0.data.recommendations.find((r: { user: { nickname: string } }) => r.user.nickname === '덕수');
    const deoksu1 = recs.find((r: { user: { nickname: string } }) => r.user.nickname === '덕수');
    check('C-5 덕수님 순위·점수가 올라감', deoksu1 && (!deoksu0 || deoksu1.score > deoksu0.score) && deoksu1.delta, { before: deoksu0?.score, after: deoksu1?.score, delta: deoksu1?.delta });
    const js = recs.find((r: { user: { nickname: string } }) => r.user.nickname === '정순');
    console.log(`    추천 이유(정순): ${js.reason}`);
    check('C-6 추천 이유가 실제 공통점(텃밭·음식 관련 일)으로 생성됨', /텃밭 가꾸기/.test(js.reason) && /음식 관련 일/.test(js.reason), js.reason);
    check('C-7 추천 카드 정보(별명·연령대·공개 지역·취미·공통 경험)', js.user.ageBand && js.user.region === '경남 진주시' && js.user.hobbies.length && js.commonExperiences.length, js.user);
    const okhee = recs.find((r: { user: { nickname: string } }) => r.user.nickname === '옥희');
    check('C-8 시·도까지만 공개한 이용자는 시·군을 표시하지 않음', !okhee || okhee.user.region === '경남', okhee?.user.region);

    // ── 시나리오 D
    console.log('\n[D] 교류 연결');
    const req1 = await call(ctx, 'POST', '/connections', { toUserId: js.user.id, message: '텃밭 이야기 나눠요' });
    check('D-1 교류 제안 → 대기 상태 (자동 수락 없음)', req1.status === 201 && req1.data.connection.status === 'pending' && req1.data.connection.isDemo);
    const again = await call(ctx, 'POST', '/connections', { toUserId: js.user.id });
    check('D-2 같은 분에게 중복 제안 방지', again.status === 409);
    const acc = await call(ctx, 'POST', `/connections/${req1.data.connection.id}/demo-respond`, { decision: 'accepted' });
    check('D-3 시연 컨트롤로 수락 → 연결 완료', acc.data.connection.status === 'accepted');
    check('D-4 연결 후에도 연락처는 공개되지 않음', !JSON.stringify(acc.data).match(/phone|전화번호|연락처|address/i));
    const req2 = await call(ctx, 'POST', '/connections', { toUserId: deoksu1.user.id });
    const dec = await call(ctx, 'POST', `/connections/${req2.data.connection.id}/demo-respond`, { decision: 'declined' });
    check('D-5 시연 컨트롤로 거절 → 거절 상태', dec.data.connection.status === 'declined');
    const twice = await call(ctx, 'POST', `/connections/${req2.data.connection.id}/demo-respond`, { decision: 'accepted' });
    check('D-6 이미 답한 요청은 다시 바꿀 수 없음', twice.status === 409);

    // ── 시나리오 E
    console.log('\n[E] 기억 관리');
    const ed = await call(ctx, 'PATCH', `/memories/${garden.id}`, { title: '등산', detail: '요즘은 주말마다 등산을 다녀.' });
    check('E-1 관심사 수정 → 태그가 새 내용으로 다시 만들어짐', ed.data.memory.tags.includes('등산') && !ed.data.memory.tags.includes('텃밭 가꾸기'), ed.data.memory.tags);
    const r2 = await call(ctx, 'GET', '/recommendations');
    console.log(`    수정 이후: ${recNames(r2.data.recommendations)}`);
    const hikers = r2.data.recommendations.filter((r: { common: { exact: Array<{ tag: string }> } }) => r.common.exact.some((e) => e.tag === '등산'));
    check('E-2 수정한 관심사(등산)로 추천이 바뀜 (영호·재석)', hikers.map((r: { user: { nickname: string } }) => r.user.nickname).sort().join() === '영호,재석', recNames(hikers));
    check('E-3 텃밭 공통점은 더 이상 쓰이지 않음', !r2.data.recommendations.some((r: { common: { exact: Array<{ tag: string }> } }) => r.common.exact.some((e) => e.tag === '텃밭 가꾸기')));
    const del = await call(ctx, 'DELETE', `/memories/${garden.id}`);
    check('E-4 기억 삭제', del.data.ok);
    const r3 = await call(ctx, 'GET', '/recommendations');
    console.log(`    삭제 이후: ${recNames(r3.data.recommendations)}`);
    check('E-5 삭제 후 추천에서 등산 공통점 사라짐', !r3.data.recommendations.some((r: { common: { exact: Array<{ tag: string }> } }) => r.common.exact.some((e) => e.tag === '등산')));
    check('E-6 변화 정보에 빠진 관심사 표시', r3.data.changes?.removedTags.includes('등산'), r3.data.changes);
    const c3 = await call(ctx, 'POST', '/conversations', {});
    const m3 = await call(ctx, 'POST', `/conversations/${c3.data.conversation.id}/messages`, { content: '오늘 산에 다녀왔어' });
    check('E-7 삭제된 기억은 이후 대화에 쓰이지 않음', !m3.data.assistantMessage.usedMemories.some((m: { id: number }) => m.id === garden.id) && !/전에.*등산/.test(m3.data.assistantMessage.content), m3.data.assistantMessage);

    // ── 개인정보·안전
    console.log('\n[보호] 개인정보 및 안전 설계');
    const fam = await call(ctx, 'POST', `/conversations/${conv2}/messages`, { content: '손주들이 너무 보고 싶어.' });
    const famCands = fam.data.assistantMessage.candidates;
    const inferred = famCands.find((m: { source: string }) => m.source === 'inferred');
    check('P-1 AI의 짐작은 "inferred"로 구분되어 확인 대기', inferred && inferred.status === 'pending', famCands);
    for (const m of famCands) await call(ctx, 'POST', `/memories/${m.id}/confirm`, {});
    const famRow = db.prepare(`SELECT COUNT(*) AS n FROM interests i JOIN memories m ON m.id = i.memory_id WHERE m.category = 'family'`).get() as { n: number };
    check('P-2 가족 기억은 추천 데이터로 쓰지 않음', famRow.n === 0);
    const persona = db.prepare(`SELECT id FROM users WHERE kind = 'demo_persona' LIMIT 1`).get() as { id: number };
    check('P-3 시연용 가상 이용자로 접근 불가', (await call(ctx, 'GET', '/memories', undefined, persona.id)).status === 403);
    const other = await call(ctx, 'POST', '/users', { ...NEW_USER, nickname: '가을' });
    const peek = await call(ctx, 'GET', `/memories`, undefined, other.data.user.id);
    const steal = await call(ctx, 'PATCH', `/memories/${cand.id}`, { title: '해킹' }, other.data.user.id);
    check('P-4 다른 이용자의 기억은 보이지도, 고칠 수도 없음', peek.data.memories.length === 0 && steal.status === 404);
    await call(ctx, 'PATCH', '/me', { consentMatching: false });
    const noConsent = await call(ctx, 'GET', '/recommendations');
    check('P-5 친구 추천 동의를 끄면 추천하지 않음', noConsent.data.consentRequired === true && noConsent.data.recommendations.length === 0);
    await call(ctx, 'PATCH', '/me', { consentMatching: true, consentMemory: false });
    const noMem = await call(ctx, 'POST', `/conversations/${conv2}/messages`, { content: '예전에 택시 운전을 했어.' });
    check('P-6 기억 저장 동의를 끄면 아무것도 저장하지 않음', noMem.data.assistantMessage.candidates.length === 0 && /저장하지 않았/.test(noMem.data.assistantMessage.notice ?? ''), noMem.data.assistantMessage);
    const bad = await call(ctx, 'POST', `/conversations/${conv2}/messages`, { content: '' });
    check('P-7 빈 메시지는 거절', bad.status === 400);
    const wipe = await call(ctx, 'DELETE', '/me');
    const after = await call(ctx, 'GET', '/memories');
    const left = db.prepare('SELECT COUNT(*) AS n FROM memories WHERE user_id = ?').get(ctx.userId!) as { n: number };
    check('P-8 "모든 정보 지우기" → 이용자·기억 완전 삭제', wipe.data.ok && after.status === 401 && left.n === 0);
  } finally {
    await ctx.close();
    db.close();
  }
}

async function persistenceScenario() {
  console.log('\n[F] 데이터 지속성 (실제 파일 DB, 서버 재시작)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dandi-test-'));
  const file = path.join(dir, 'test.sqlite');
  let db = openDatabase(file);
  let ctx = await start(db, DEMO);
  const u = await call(ctx, 'POST', '/users', NEW_USER);
  ctx.userId = u.data.user.id;
  const c = await call(ctx, 'POST', '/conversations', {});
  const m = await call(ctx, 'POST', `/conversations/${c.data.conversation.id}/messages`, { content: '예전에 식당을 운영했어.' });
  await call(ctx, 'POST', `/memories/${m.data.assistantMessage.candidates[0].id}/confirm`, {});
  await ctx.close();
  db.close();

  db = openDatabase(file); // 서버를 껐다 켠 상황
  ctx = await start(db, DEMO);
  ctx.userId = u.data.user.id;
  const mem = await call(ctx, 'GET', '/memories?status=confirmed');
  check('F-1 재시작 후에도 기억 유지', mem.data.memories.some((x: { title: string }) => x.title === '식당 운영'));
  const c2 = await call(ctx, 'POST', '/conversations', {});
  check('F-2 재시작 후 새 대화에서 저장된 기억으로 회상', /식당/.test(c2.data.conversation.messages[0].content), c2.data.conversation.messages[0].content);
  const personas = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE kind='demo_persona'`).get() as { n: number };
  check('F-3 재시작해도 가상 이용자가 중복 생성되지 않음 (8명)', personas.n === 8, personas.n);
  await ctx.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

async function aiModeScenario() {
  console.log('\n[AI] AI 모드 연동 경로 (가짜 OpenAI 호환 서버 사용)');
  const seen: Array<{ system: string; user: string }> = [];
  let failNext = false;
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      if (failNext) { failNext = false; res.writeHead(500); res.end('boom'); return; }
      const j = JSON.parse(body);
      if (j.stream) {
        // 스트리밍 요청: 답을 5글자씩 나눠 SSE 로 보냄
        const content = '그러셨군요. 텃밭 이야기를 들으니 저도 기뻐요. 요즘은 무엇을 심으셨어요?';
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (let i = 0; i < content.length; i += 5) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 5) } }] })}\n\n`);
        res.end('data: [DONE]\n\n');
        seen.push({ system: j.messages[0].content, user: j.messages[j.messages.length - 1].content });
        return;
      }
      const system = j.messages[0].content as string;
      const user = j.messages[j.messages.length - 1].content as string;
      seen.push({ system, user });
      let content = '그러셨군요. 더 들려주세요.';
      if (system.includes('JSON으로만')) {
        content = user.includes('텃밭')
          ? '```json\n{"memories":[{"category":"hobby","title":"텃밭 농사","detail":"요즘 텃밭에서 상추를 키우신다.","tags":["텃밭 농사"],"certainty":"stated"},{"category":"bad","title":"x"}]}\n```'
          : '{"memories":[]}';
      } else if (system.includes('회상')) content = '텃밭에서 처음 수확하신 날은 어떠셨어요?';
      else content = user.includes('텃밭') ? '텃밭을 가꾸시는군요! 어떤 채소를 키우세요?' : '안녕하세요, 봄날님! 오늘은 어떻게 지내셨어요?';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, () => r()));
  const port = (fake.address() as AddressInfo).port;
  const AI: LLMConfig = { provider: 'openai', requested: 'openai', model: 'fake-model', apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}/v1`, warning: null };
  const db = openDatabase(':memory:');
  const ctx = await start(db, AI);
  try {
    check('AI-1 상태 API: AI 모드 표시, 키는 노출 안 함', (await call(ctx, 'GET', '/health')).data.mode === 'ai');
    const health = await call(ctx, 'GET', '/health');
    check('AI-2 API 키가 응답 어디에도 없음', !JSON.stringify(health.data).includes('test-key'));
    ctx.userId = (await call(ctx, 'POST', '/users', NEW_USER)).data.user.id;
    const c = await call(ctx, 'POST', '/conversations', {});
    check('AI-3 첫 인사를 LLM이 생성', c.data.conversation.messages[0].mode === 'ai');
    const m = await call(ctx, 'POST', `/conversations/${c.data.conversation.id}/messages`, { content: '요즘 텃밭에서 상추를 키워.' });
    const a = m.data.assistantMessage;
    check('AI-4 응답을 LLM이 생성', a.mode === 'ai' && /텃밭/.test(a.content), a);
    check('AI-5 LLM 추출 JSON 검증: 올바른 항목만 저장, 잘못된 항목 제외', a.candidates.length === 1, a.candidates);
    check('AI-6 자유 태그("텃밭 농사")를 표준 태그로 정규화', a.candidates[0]?.tags.includes('텃밭 가꾸기'), a.candidates[0]?.tags);
    await call(ctx, 'POST', `/memories/${a.candidates[0].id}/confirm`, {});
    await call(ctx, 'POST', `/conversations/${c.data.conversation.id}/messages`, { content: '오늘은 텃밭에 물을 줬어.' });
    const lastReplyPrompt = [...seen].reverse().find((s) => s.system.includes('확인된 기억'))!;
    check('AI-7 다음 대화에서 확인된 기억을 프롬프트에 넣어 활용', lastReplyPrompt.system.includes('텃밭 농사'), lastReplyPrompt.system.slice(-300));
    check('AI-8 프롬프트에 "지어내지 말 것" 규칙 포함', lastReplyPrompt.system.includes('지어내거나 단정하지 마세요'));
    failNext = true;
    const f = await call(ctx, 'POST', `/conversations/${c.data.conversation.id}/messages`, { content: '고마워' });
    check('AI-9 AI 오류 시 데모 응답으로 대체하고 알림', f.data.assistantMessage.mode === 'fallback' && f.data.assistantMessage.notice, f.data.assistantMessage);
    const recs = await call(ctx, 'GET', '/recommendations');
    check('AI-10 AI가 추출한 관심사로 추천 계산', recs.data.recommendations.some((r: { common: { exact: Array<{ tag: string }> } }) => r.common.exact.some((e) => e.tag === '텃밭 가꾸기')));
    // 음성 대화 스트리밍: 답을 조각조각 받아 바로 읽을 수 있어야 함
    const vc = await call(ctx, 'POST', '/conversations', { channel: 'voice' });
    const s = await streamCall(ctx, `/conversations/${vc.data.conversation.id}/messages/stream`, { content: '오늘도 텃밭에 다녀왔어.' });
    const joined = s.deltas.join('');
    check('AI-11 AI 답을 여러 조각으로 스트리밍', s.deltas.length >= 3 && s.done?.assistantMessage.mode === 'ai', { n: s.deltas.length, mode: s.done?.assistantMessage.mode });
    check('AI-12 스트리밍한 조각을 합치면 저장된 답과 같음', joined.trim() === s.done?.assistantMessage.content, { joined, saved: s.done?.assistantMessage.content });
    const voicePrompt = [...seen].reverse().find((x) => x.system.includes('음성 대화'));
    check('AI-13 음성 대화·짧은 답 선호·이미 한 질문 반복 금지가 프롬프트에 반영', !!voicePrompt && voicePrompt.system.includes('1~2문장') && voicePrompt.system.includes('같은 질문을 반복하지'), voicePrompt?.system.slice(0, 200));
  } finally {
    await ctx.close();
    db.close();
    fake.close();
  }
}

// ─────────────────────────────────────────────
// 2차 개선 시나리오
// ─────────────────────────────────────────────

async function migrationScenario() {
  console.log('\n[M] 기존 데이터베이스 마이그레이션 (데이터 보존)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dandi-mig-'));
  const file = path.join(dir, 'old.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK (kind IN ('member','demo_persona')), persona_key TEXT UNIQUE,
      nickname TEXT NOT NULL, age_band TEXT NOT NULL, region_province TEXT, region_city TEXT,
      region_share TEXT NOT NULL DEFAULT 'city' CHECK (region_share IN ('none','province','city')),
      consent_memory INTEGER NOT NULL DEFAULT 0, consent_matching INTEGER NOT NULL DEFAULT 0, intro TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, created_at TEXT NOT NULL, last_message_at TEXT NOT NULL);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'demo', meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('work','hobby','place','family','life_event')), title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL CHECK (source IN ('stated','inferred','manual')), status TEXT NOT NULL CHECK (status IN ('pending','confirmed')),
      use_for_matching INTEGER NOT NULL DEFAULT 1, conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL, conversation_title TEXT,
      message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, confirmed_at TEXT,
      last_recalled_at TEXT, recall_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE interests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE, dimension TEXT NOT NULL CHECK (dimension IN ('work','hobby','interest','experience')),
      tag TEXT NOT NULL, origin TEXT NOT NULL CHECK (origin IN ('memory','persona')), created_at TEXT NOT NULL);
    INSERT INTO users (kind, nickname, age_band, created_at, updated_at, consent_memory) VALUES ('member', '옛날이용자', '70대 초반', '2026-01-01', '2026-01-01', 1);
    INSERT INTO conversations (user_id, title, created_at, last_message_at) VALUES (1, '옛 대화', '2026-01-01', '2026-01-01');
    INSERT INTO memories (user_id, category, title, tags, source, status, created_at, updated_at) VALUES (1, 'work', '식당 운영', '["식당 운영"]', 'stated', 'confirmed', '2026-01-01', '2026-01-01');
    INSERT INTO interests (user_id, memory_id, dimension, tag, origin, created_at) VALUES (1, 1, 'work', '식당 운영', 'memory', '2026-01-01');
  `);
  old.close();
  const db = openDatabase(file);
  const mem = db.prepare('SELECT * FROM memories WHERE id = 1').get() as { title: string; share_family: number };
  const interests = db.prepare(`SELECT COUNT(*) AS n FROM interests WHERE origin = 'memory'`).get() as { n: number };
  check('M-1 기존 기억이 그대로 남음 (새 열은 기본값)', mem?.title === '식당 운영' && mem.share_family === 0, mem);
  check('M-2 기억에 연결된 추천 태그(interests)가 지워지지 않음', interests.n === 1, interests);
  const conv = db.prepare('SELECT channel, family_post_id FROM conversations WHERE id = 1').get() as { channel: string };
  check('M-3 기존 대화에 새 열(channel=text)이 추가됨', conv?.channel === 'text', conv);
  db.prepare(`INSERT INTO memories (user_id, category, title, tags, source, status, created_at, updated_at) VALUES (1, 'daily', '손녀 결혼 소식', '[]', 'stated', 'pending', '2026-01-02', '2026-01-02')`).run();
  check('M-4 새 분류(최근 관심사 및 일상)를 저장할 수 있음', (db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE category='daily'`).get() as { n: number }).n === 1);
  db.close();
  const again = openDatabase(file); // 두 번 열어도 안전
  check('M-5 마이그레이션을 여러 번 실행해도 안전', (again.prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n === 2);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

async function voiceScenario() {
  console.log('\n[V] 음성 대화 (스트리밍 · 말로 기억 확인 · 대화 마무리)');
  const db = openDatabase(':memory:');
  const ctx = await start(db, DEMO);
  try {
    ctx.userId = (await call(ctx, 'POST', '/users', NEW_USER)).data.user.id;
    const c = await call(ctx, 'POST', '/conversations', { channel: 'voice' });
    const convId = c.data.conversation.id;
    check('V-1 음성 대화로 시작 (channel=voice)', c.data.conversation.channel === 'voice');
    const s1 = await streamCall(ctx, `/conversations/${convId}/messages/stream`, { content: '젊었을 때 진주에서 작은 식당을 운영했었지.' });
    const a1 = s1.done?.assistantMessage;
    console.log(`    단디: ${a1?.content}`);
    check('V-2 스트리밍 응답(delta → done)', s1.status === 200 && s1.deltas.length >= 1 && a1, s1);
    check('V-3 조각을 합치면 저장된 답과 같음', s1.deltas.join('').trim() === a1?.content, { d: s1.deltas.join(''), c: a1?.content });
    check('V-4 화면을 안 봐도 되게 말로 "기억해 둬도 될까요?" 여쭤봄', /기억해 둬도 될까요\?/.test(a1?.content) && a1?.pendingAction === 'memory_confirm', a1);
    check('V-5 꼬리 질문은 확인 뒤로 미뤄 한 번에 질문 하나만', (a1?.content.match(/\?/g) ?? []).length === 1, a1?.content);
    const s2 = await streamCall(ctx, `/conversations/${convId}/messages/stream`, { content: '응, 기억해 줘' });
    const a2 = s2.done?.assistantMessage;
    console.log(`    단디: ${a2?.content}`);
    const mems = await call(ctx, 'GET', '/memories?status=confirmed');
    check('V-6 "응" → 기억 확정 + 미뤄 둔 질문 이어서', mems.data.memories.some((m: { title: string }) => m.title === '식당 운영') && /잘 기억해 둘게요/.test(a2?.content) && /기억에 남는 일/.test(a2?.content), a2);
    check('V-7 확정된 기억이 화면에 표시될 정보로 전달', a2?.confirmed.some((m: { title: string }) => m.title === '식당 운영'));
    const s3 = await streamCall(ctx, `/conversations/${convId}/messages/stream`, { content: '요즘은 텃밭 가꾸기를 좋아해.' });
    check('V-8 새 이야기에서 다시 확인 질문', s3.done?.assistantMessage.pendingAction === 'memory_confirm');
    const s4 = await streamCall(ctx, `/conversations/${convId}/messages/stream`, { content: '아니, 그건 됐어' });
    const pend = await call(ctx, 'GET', '/memories?status=pending');
    check('V-9 "아니" → 그 기억은 저장하지 않음(후보 삭제)', !pend.data.memories.some((m: { tags: string[] }) => m.tags.includes('텃밭 가꾸기')) && /기억하지 않을게요/.test(s4.done?.assistantMessage.content), s4.done?.assistantMessage.content);
    const s5 = await streamCall(ctx, `/conversations/${convId}/messages/stream`, { content: '오늘은 여기까지 할게' });
    check('V-10 "오늘은 여기까지" → 마무리 인사 + 대화 종료 신호', s5.done?.assistantMessage.endSession === true, s5.done?.assistantMessage);
    const end = await call(ctx, 'POST', `/conversations/${convId}/end`, {});
    const after = await call(ctx, 'GET', `/conversations/${convId}`);
    check('V-11 대화 종료 시각 기록, 대화 내용은 저장되어 있음', end.data.ok && after.data.conversation.endedAt && after.data.conversation.messages.length >= 9, after.data.conversation.messages.length);
    const bad = await streamCall(ctx, `/conversations/99999/messages/stream`, { content: '안녕' });
    check('V-12 없는 대화로 스트리밍 요청 → 404', bad.status === 404);
    const daily = await call(ctx, 'POST', `/conversations/${convId}/messages`, { content: '다음 주에 동창회 모임에 나가기로 했어.' });
    const dm = daily.data.assistantMessage.candidates.find((m: { category: string }) => m.category === 'daily');
    check('V-13 "최근 관심사 및 일상" 기억 후보 추출 (낱말 단위로 짧은 제목)', dm && dm.title === '동창회 모임에 나가기로 했어', daily.data.assistantMessage.candidates);
    const apt = await call(ctx, 'POST', `/conversations/${convId}/messages`, { content: '요즘 아파트 앞에 새 빵집이 생겼어.' });
    check('V-14 "아파트"를 건강 이야기로 잘못 거르지 않음', apt.data.assistantMessage.candidates.some((m: { category: string }) => m.category === 'daily'), apt.data.assistantMessage.candidates);
  } finally {
    await ctx.close();
    db.close();
  }
}

async function personalizationScenario() {
  console.log('\n[R] 다시 이야기하고 싶어지는 대화 (반복 방지 · 후속 질문 · 선호 반영)');
  const db = openDatabase(':memory:');
  const ctx = await start(db, DEMO);
  try {
    ctx.userId = (await call(ctx, 'POST', '/users', NEW_USER)).data.user.id;
    const firsts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await call(ctx, 'POST', '/conversations', {});
      firsts.push(c.data.conversation.messages[0].content);
    }
    const greet = firsts.map((t) => t.split(/(?<=[.!?])\s/)[0]);
    console.log(`    첫 인사: ${greet.join(' / ')}`);
    check('R-1 연속으로 같은 인사말을 쓰지 않음', greet[0] !== greet[1] && greet[1] !== greet[2], greet);
    const qs = firsts.map((t) => t.split(/(?<=[.!?])\s/).slice(1).join(' '));
    check('R-2 기억이 없을 때의 일상 질문도 매번 다름', new Set(qs).size === 3, qs);

    // 어제 텃밭 이야기를 나눈 상황 만들기
    const yesterday = new Date(Date.now() - 26 * 3600_000).toISOString();
    const cv = db.prepare('INSERT INTO conversations (user_id, title, created_at, last_message_at) VALUES (?, ?, ?, ?)').run(ctx.userId!, '어제 이야기', yesterday, yesterday);
    db.prepare(`INSERT INTO messages (conversation_id, user_id, role, content, mode, meta, created_at) VALUES (?, ?, 'user', ?, 'demo', '{}', ?)`)
      .run(Number(cv.lastInsertRowid), ctx.userId!, '오늘 아침에 텃밭에 물을 주고 왔어.', yesterday);
    const f1 = await call(ctx, 'POST', '/conversations', {});
    const o1 = f1.data.conversation.messages[0].content;
    console.log(`    단디: ${o1}`);
    check('R-3 어제 나눈 이야기로 후속 질문 ("어제 말씀하신 텃밭은…")', /어제/.test(o1) && /텃밭/.test(o1), o1);
    const f2 = await call(ctx, 'POST', '/conversations', {});
    check('R-4 같은 후속 질문을 바로 반복하지 않음', !/어제 말씀하신 텃밭/.test(f2.data.conversation.messages[0].content), f2.data.conversation.messages[0].content);

    // 피하고 싶은 이야기
    const m = await call(ctx, 'POST', '/memories', { category: 'work', title: '식당 운영', detail: '진주에서 식당을 했다' });
    await call(ctx, 'PATCH', '/prefs', { avoidTopics: ['식당'] });
    const f3 = await call(ctx, 'POST', '/conversations', {});
    check('R-5 "피하고 싶은 이야기"로 정한 기억은 먼저 꺼내지 않음', !/식당/.test(f3.data.conversation.messages[0].content), f3.data.conversation.messages[0].content);
    await call(ctx, 'PATCH', '/prefs', { avoidTopics: [] });
    const f4 = await call(ctx, 'POST', '/conversations', {});
    check('R-6 설정을 풀면 다시 회상 질문에 사용', /식당/.test(f4.data.conversation.messages[0].content), f4.data.conversation.messages[0].content);
    await call(ctx, 'POST', `/conversations/${f4.data.conversation.id}/messages`, { content: '그럼, 단골손님들이 많았지. 국밥을 제일 많이 팔았어.' });
    const eng = db.prepare('SELECT engagement FROM memories WHERE id = ?').get(m.data.memory.id) as { engagement: number };
    check('R-7 기억 이야기에 길게 대답하시면 "좋아하는 주제"로 기록', eng.engagement === 1, eng);
    const badPref = await call(ctx, 'PATCH', '/prefs', { speechRate: 5 });
    check('R-8 잘못된 설정값은 거절', badPref.status === 400);
    const prefs = await call(ctx, 'GET', '/prefs');
    check('R-9 대화 방식은 계정에 저장 (기기와 무관)', prefs.data.prefs.replyLength === 'short' && prefs.data.prefs.speechRate === 0.9);
  } finally {
    await ctx.close();
    db.close();
  }
}

async function familyScenario() {
  console.log('\n[FAM] 가족·보호자 연계');
  const db = openDatabase(':memory:');
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dandi-up-'));
  const app = createApp(db, DEMO, { uploadDir });
  const server: http.Server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const ctx: Ctx = { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, close: () => new Promise((r) => server.close(() => r())) };
  try {
    ctx.userId = (await call(ctx, 'POST', '/users', NEW_USER)).data.user.id;
    const c0 = await call(ctx, 'POST', '/conversations', {});
    const m0 = await call(ctx, 'POST', `/conversations/${c0.data.conversation.id}/messages`, { content: '젊었을 때 진주에서 작은 식당을 운영했었지.' });
    const memId = m0.data.assistantMessage.candidates[0].id;
    await call(ctx, 'POST', `/memories/${memId}/confirm`, {});
    await call(ctx, 'POST', `/conversations/${c0.data.conversation.id}/messages`, { content: '요즘은 텃밭 가꾸기를 좋아해.' });
    await call(ctx, 'POST', `/conversations/${c0.data.conversation.id}/messages`, { content: '오늘 날씨가 좋네.' });

    const inv = await call(ctx, 'POST', '/care/invite', {});
    check('FAM-1 어르신이 6자리 초대 코드를 만듦', /^\d{6}$/.test(inv.data.invite.code), inv.data);
    const wrong = await famCall(ctx, null, 'POST', '/connect', { code: inv.data.invite.code === '000000' ? '111111' : '000000', name: '지영', relation: '딸' });
    check('FAM-2 틀린 코드로는 연결 안 됨', wrong.status === 404);
    const con = await famCall(ctx, null, 'POST', '/connect', { code: inv.data.invite.code, name: '지영', relation: '딸' });
    const token = con.data.token as string;
    check('FAM-3 맞는 코드 → 가족 전용 토큰 발급', con.status === 201 && token.length > 20 && con.data.elderNickname === '봄날');
    const stored = db.prepare('SELECT token_hash FROM family_members').get() as { token_hash: string };
    check('FAM-4 서버에는 토큰 원문이 아닌 해시만 저장', stored.token_hash !== token && stored.token_hash.length === 64);
    check('FAM-5 토큰 없이는 가족 화면 접근 불가', (await famCall(ctx, null, 'GET', '/dashboard')).status === 401);
    check('FAM-6 가족 토큰으로 어르신 API 사용 불가', (await call(ctx, 'GET', '/memories', undefined, 0)).status === 401);

    const d0 = await famCall(ctx, token, 'GET', '/dashboard');
    check('FAM-7 어르신이 공유를 켜기 전에는 이용 현황·대화 주제·추억이 보이지 않음',
      d0.data.activity.shared === false && d0.data.topics.shared === false && d0.data.memories.length === 0, d0.data);
    await call(ctx, 'PATCH', '/prefs', { shareActivity: true, shareTopics: true });
    const d1 = await famCall(ctx, token, 'GET', '/dashboard');
    console.log(`    이용 현황: 7일 대화 ${d1.data.activity.conversations7d}회 · ${d1.data.activity.minutes7d}분 · 주제 ${d1.data.topics.list.map((t: { tag: string }) => t.tag).join(', ')}`);
    check('FAM-8 공유를 켜면 실제 기록으로 이용 현황 계산', d1.data.activity.shared && d1.data.activity.conversations7d === 1 && d1.data.activity.lastUsedAt && d1.data.activity.enoughData === true, d1.data.activity);
    check('FAM-9 대화 주제는 관심사 이름만 (식당 운영·텃밭 가꾸기)', d1.data.topics.list.some((t: { tag: string }) => t.tag === '식당 운영') && d1.data.topics.list.some((t: { tag: string }) => t.tag === '텃밭 가꾸기'), d1.data.topics);
    check('FAM-10 가족 화면 어디에도 대화 원문은 없음', !JSON.stringify(d1.data).includes('작은 식당을 운영했었지') && !JSON.stringify(d1.data).includes('날씨가 좋네'));

    const noShare = await famCall(ctx, token, 'POST', `/memories/${memId}/comments`, { kind: 'question', content: '식당 이름이 뭐였어요?' });
    check('FAM-11 공유하지 않은 추억에는 댓글을 달 수 없음 (존재도 알 수 없음)', noShare.status === 404);
    await call(ctx, 'PATCH', `/memories/${memId}`, { shareFamily: true });
    const q = await famCall(ctx, token, 'POST', `/memories/${memId}/comments`, { kind: 'question', content: '엄마, 그 식당 이름이 뭐였어요?' });
    check('FAM-12 공유된 추억에 가족이 질문을 남김', q.status === 201 && q.data.comment.kind === 'question');
    const mine = await call(ctx, 'GET', '/memories?status=confirmed');
    check('FAM-13 어르신의 나의 추억 화면에도 가족 질문이 보임', mine.data.comments[memId]?.[0]?.content === '엄마, 그 식당 이름이 뭐였어요?', mine.data.comments);
    const o1 = await call(ctx, 'POST', '/conversations', {});
    const t1 = o1.data.conversation.messages[0].content;
    console.log(`    단디: ${t1}`);
    check('FAM-14 단디가 다음 대화에서 가족의 질문을 대신 여쭤봄', /그 식당 이름이 뭐였어요/.test(t1) && /딸 지영/.test(t1), t1);
    const d2 = await famCall(ctx, token, 'GET', '/dashboard');
    check('FAM-15 가족 화면에 "단디가 여쭤봤어요" 상태 표시', !!d2.data.memories[0].comments[0].usedAt);

    const badPhoto = await famCall(ctx, token, 'POST', '/posts', { message: '사진', photo: 'data:image/png;base64,aGVsbG8=' });
    check('FAM-16 이미지가 아닌 파일은 거절', badPhoto.status === 400);
    const p = await famCall(ctx, token, 'POST', '/posts', { message: '손주 민준이 첫 운동회 사진이에요!', photo: TINY_PNG });
    check('FAM-17 가족이 사진·메시지를 보냄', p.status === 201 && /^\/api\/media\/[a-f0-9]{32}\.png$/.test(p.data.post.photoUrl), p.data);
    const media = await fetch(ctx.base.replace(/\/api$/, '') + p.data.post.photoUrl);
    check('FAM-18 보낸 사진을 볼 수 있음', media.status === 200 && (media.headers.get('content-type') ?? '').includes('image/png'));
    const home = await call(ctx, 'GET', '/home');
    check('FAM-19 어르신 홈에 새 가족 소식 수 표시', home.data.unseenFamilyPosts === 1);
    const o2 = await call(ctx, 'POST', '/conversations', { channel: 'voice' });
    const t2 = o2.data.conversation.messages[0];
    console.log(`    단디: ${t2.content}`);
    check('FAM-20 단디가 먼저 "사진을 보내왔어요. 같이 보실까요?"', /사진을 보내왔어요/.test(t2.content) && /같이 보실까요\?/.test(t2.content) && t2.pendingAction === 'family_post', t2);
    const yes = await streamCall(ctx, `/conversations/${o2.data.conversation.id}/messages/stream`, { content: '응, 보여줘' });
    const shown = yes.done?.assistantMessage;
    console.log(`    단디: ${shown?.content}`);
    check('FAM-21 "응" → 사진을 화면에 크게 보여 주고 이야기를 이어감', shown?.showPost?.photoUrl === p.data.post.photoUrl && /운동회/.test(shown?.content), shown);
    const d3 = await famCall(ctx, token, 'GET', '/dashboard');
    check('FAM-22 가족 화면에 "함께 이야기함"과 교류 요약 반영', d3.data.posts[0].talkedAt && d3.data.exchange.talked === 1 && d3.data.exchange.seen === 1, d3.data.exchange);
    const o3 = await call(ctx, 'POST', '/conversations', {});
    check('FAM-23 이미 본 소식은 다시 권하지 않음', !/같이 보실까요/.test(o3.data.conversation.messages[0].content));

    // 알림: 지금 시각으로 등록하면 바로 안내
    const kst = new Date(Date.now() + 9 * 3600_000);
    const hhmm = `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
    const rem = await famCall(ctx, token, 'POST', '/reminders', { kind: 'medication', label: '혈압약', time: hhmm });
    check('FAM-24 가족이 복약 알림 등록', rem.status === 201 && rem.data.reminder.createdBy === 'family');
    const badRem = await famCall(ctx, token, 'POST', '/reminders', { kind: 'medication', label: '약', time: '25:00' });
    check('FAM-25 잘못된 시간은 거절', badRem.status === 400);
    const due = await call(ctx, 'GET', '/reminders');
    check('FAM-26 어르신 화면에 지금 챙길 알림으로 표시', due.data.due.includes(rem.data.reminder.id));
    const o4 = await call(ctx, 'POST', '/conversations', {});
    console.log(`    단디: ${o4.data.conversation.messages[0].content}`);
    check('FAM-27 단디의 첫마디에 알림 안내', /혈압약 시간이에요/.test(o4.data.conversation.messages[0].content), o4.data.conversation.messages[0].content);
    const ate = await call(ctx, 'POST', `/conversations/${o4.data.conversation.id}/messages`, { content: '약 먹었어' });
    const d4 = await famCall(ctx, token, 'GET', '/dashboard');
    check('FAM-28 "약 먹었어" → 오늘 확인됨으로 기록, 가족 화면에 반영', /확인해 둘게요/.test(ate.data.assistantMessage.content) && d4.data.reminders[0].checkedToday === true, ate.data.assistantMessage.content);

    // 다른 어르신 데이터 격리
    const other = (await call(ctx, 'POST', '/users', { ...NEW_USER, nickname: '가을' })).data.user.id;
    const otherInv = await call(ctx, 'POST', '/care/invite', {}, other);
    const otherFam = await famCall(ctx, null, 'POST', '/connect', { code: otherInv.data.invite.code, name: '민수', relation: '아들' });
    const od = await famCall(ctx, otherFam.data.token, 'GET', '/dashboard');
    check('FAM-29 다른 어르신의 가족은 이 어르신의 정보를 볼 수 없음', od.data.elder.nickname === '가을' && od.data.memories.length === 0 && od.data.posts.length === 0);
    const steal = await famCall(ctx, otherFam.data.token, 'POST', `/memories/${memId}/comments`, { kind: 'comment', content: '해킹' });
    check('FAM-30 다른 어르신의 공유 추억에 접근 불가', steal.status === 404);

    // 연결 해제와 전체 삭제
    const members = await call(ctx, 'GET', '/care');
    await call(ctx, 'DELETE', `/care/members/${members.data.members[0].id}`);
    check('FAM-31 어르신이 연결을 끊으면 가족 화면 접근 불가', (await famCall(ctx, token, 'GET', '/dashboard')).status === 401);
    const photoFile = path.join(uploadDir, p.data.post.photoUrl.split('/').pop());
    const existed = fs.existsSync(photoFile);
    await call(ctx, 'DELETE', '/me');
    check('FAM-32 "모든 정보 지우기" → 가족이 보낸 사진 파일까지 삭제', existed && !fs.existsSync(photoFile));
  } finally {
    await ctx.close();
    db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

async function emotionScenario() {
  console.log('\n[EMO] 캐릭터 표정 (분명한 표현일 때만, 아니면 중립)');
  const { classifyEmotion } = await import('../domain/emotion.js');
  const cases: Array<[string, string]> = [
    ['손주가 달리기에서 1등을 했어.', 'happy'],
    ['그때 식당 하던 시절이 참 즐거웠지.', 'happy'],
    ['요즘 너무 외로워.', 'comforting'],
    ['남편이 돌아가신 지 벌써 3년이야.', 'comforting'],
    ['좋았는데 요즘은 다리가 아파.', 'comforting'],
    ['오늘 시장에 다녀왔어.', 'neutral'],
    ['별로 안 좋았어.', 'neutral'],
  ];
  for (const [t, want] of cases) check(`EMO "${t}" → ${want}`, classifyEmotion(t) === want, classifyEmotion(t));
  const db = openDatabase(':memory:');
  const ctx = await start(db, DEMO);
  try {
    ctx.userId = (await call(ctx, 'POST', '/users', NEW_USER)).data.user.id;
    const c = await call(ctx, 'POST', '/conversations', { channel: 'voice' });
    check('EMO-8 첫 인사는 반가운 표정', c.data.conversation.messages[0].emotion === 'happy');
    const s = await streamCall(ctx, `/conversations/${c.data.conversation.id}/messages/stream`, { content: '손주가 달리기에서 1등을 했어.' });
    check('EMO-9 표정(meta)이 답의 첫 조각보다 먼저 도착', s.order[0] === 'meta' && s.meta?.emotion === 'happy', s.order);
    check('EMO-10 저장된 답에도 표정 기록', s.done?.assistantMessage.emotion === 'happy');
    const s2 = await streamCall(ctx, `/conversations/${c.data.conversation.id}/messages/stream`, { content: '오늘 시장에 다녀왔어.' });
    check('EMO-11 분명하지 않으면 중립', s2.meta?.emotion === 'neutral' && s2.done?.assistantMessage.emotion === 'neutral');
    const pr = await call(ctx, 'PATCH', '/prefs', { reduceMotion: true });
    check('EMO-12 움직임 줄이기 설정이 계정에 저장', pr.data.prefs.reduceMotion === true);
  } finally {
    await ctx.close();
    db.close();
  }
}

await demoScenarios();
await persistenceScenario();
await aiModeScenario();
await migrationScenario();
await voiceScenario();
await personalizationScenario();
await familyScenario();
await emotionScenario();
console.log(`\n결과: ${passed}개 통과, ${failures.length}개 실패`);
if (failures.length) {
  console.log('실패 항목:\n - ' + failures.join('\n - '));
  process.exit(1);
}
