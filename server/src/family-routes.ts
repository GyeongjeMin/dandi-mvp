/**
 * 가족·보호자용 API (/api/family/*)
 * - 어르신 계정과 분리된 '가족 전용 토큰'(x-dandi-family 헤더)으로만 접근합니다.
 * - 가족은 연결된 어르신 한 분의 '공유된 정보'만 볼 수 있습니다.
 * MVP 한계: 본인인증·계정 비밀번호가 없는 초대 코드 방식입니다. 실서비스에서는 휴대폰 인증 등이 필요합니다.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/database.js';
import {
  addComment, buildDashboard, connectFamily, createPost, deleteComment, deletePost, memberByToken, type FamilyMemberRow,
} from './domain/family.js';
import { createReminder, deleteReminder, listReminders, parseReminderInput, updateReminder, type ReminderKind } from './domain/reminders.js';

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;
const ah = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const text = (v: unknown, max: number, field: string, required = true): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw httpError(400, `${field}을(를) 적어 주세요.`);
  if (s.length > max) throw httpError(400, `${field}은(는) ${max}자 이내로 적어 주세요.`);
  return s;
};
const idParam = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, '잘못된 번호예요.');
  return n;
};

declare module 'express-serve-static-core' {
  interface Request { family?: FamilyMemberRow }
}

// ── 사진 파일 ─────────────────────────────────

const MEDIA_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const MAX_PHOTO = 4 * 1024 * 1024;

/** data URL(이미지) → 검사 후 파일로 저장. 파일 이름은 추측할 수 없는 무작위 값. */
export function savePhoto(uploadDir: string, dataUrl: string): string {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw httpError(400, '사진은 JPG, PNG, WEBP 형식만 올릴 수 있어요.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_PHOTO) throw httpError(400, '사진이 너무 커요. 4MB 이하로 올려 주세요.');
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 4).toString('hex') === '89504e47';
  const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  const ext = isJpeg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;
  if (!ext) throw httpError(400, '사진 파일을 읽을 수 없어요. 다른 사진으로 시도해 주세요.');
  fs.mkdirSync(uploadDir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  return name;
}

export function removePhotoFiles(uploadDir: string, files: Array<string | null>): void {
  for (const f of files) {
    if (!f || !MEDIA_RE.test(f)) continue;
    try { fs.unlinkSync(path.join(uploadDir, f)); } catch { /* 이미 없으면 무시 */ }
  }
}

/** 사진 보기: 추측할 수 없는 파일 이름을 아는 사람(어르신·연결된 가족 화면)만 볼 수 있는 방식 */
export const mediaHandler = (uploadDir: string) => (req: Request, res: Response) => {
  const file = String(req.params.file);
  const full = path.join(uploadDir, file);
  if (!MEDIA_RE.test(file) || !fs.existsSync(full)) { res.status(404).json({ error: '사진을 찾을 수 없어요.' }); return; }
  res.setHeader('cache-control', 'private, max-age=86400');
  res.setHeader('x-content-type-options', 'nosniff');
  res.sendFile(full);
};

// ── 초대 코드 무차별 대입 방지 (같은 주소에서 10분에 10번 실패하면 잠시 막음) ──
const failures = new Map<string, { count: number; until: number }>();
function guardConnect(ip: string) {
  const f = failures.get(ip);
  if (f && f.until > Date.now() && f.count >= 10) throw httpError(429, '코드를 너무 여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.');
}
function recordFailure(ip: string) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 10 * 60_000 });
  else f.count++;
}

export function createFamilyRouter(db: DB, uploadDir: string) {
  const r = express.Router();

  // 연결하기 (토큰 없이 접근 가능한 유일한 경로)
  r.post('/connect', ah((req, res) => {
    const ip = req.ip ?? 'unknown';
    guardConnect(ip);
    const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\D/g, '') : '';
    if (code.length !== 6) throw httpError(400, '어르신 화면에 보이는 6자리 숫자를 적어 주세요.');
    const name = text(req.body?.name, 12, '이름');
    const relation = text(req.body?.relation, 10, '관계');
    try {
      res.status(201).json(connectFamily(db, code, name, relation));
    } catch (e) {
      if ((e as { status?: number }).status === 404) recordFailure(ip);
      throw e;
    }
  }));

  r.use((req, _res, next) => {
    const m = memberByToken(db, String(req.header('x-dandi-family') ?? ''));
    if (!m) return next(httpError(401, '가족 연결이 끊겼어요. 어르신께 새 초대 코드를 받아 다시 연결해 주세요.'));
    req.family = m;
    next();
  });
  const fam = (req: Request) => req.family!;

  r.get('/dashboard', (req, res) => { res.json(buildDashboard(db, fam(req))); });

  // 사진·메시지 보내기
  r.post('/posts', ah((req, res) => {
    const message = text(req.body?.message, 300, '메시지', false);
    const photo = typeof req.body?.photo === 'string' && req.body.photo ? req.body.photo : null;
    if (!message && !photo) throw httpError(400, '사진이나 메시지 중 하나는 꼭 넣어 주세요.');
    const file = photo ? savePhoto(uploadDir, photo) : null;
    res.status(201).json({ post: createPost(db, fam(req), { message, photoFile: file }) });
  }));
  r.delete('/posts/:id', ah((req, res) => {
    const d = deletePost(db, fam(req), idParam(req.params.id));
    if (!d) throw httpError(404, '내가 보낸 소식만 지울 수 있어요.');
    removePhotoFiles(uploadDir, [d.photoFile]);
    res.json({ ok: true });
  }));

  // 공유된 추억에 댓글·질문
  r.post('/memories/:id/comments', ah((req, res) => {
    const kind = req.body?.kind === 'question' ? 'question' : 'comment';
    const content = text(req.body?.content, 200, kind === 'question' ? '질문' : '댓글');
    res.status(201).json({ comment: addComment(db, fam(req), idParam(req.params.id), kind, content) });
  }));
  r.delete('/comments/:id', ah((req, res) => {
    if (!deleteComment(db, fam(req), idParam(req.params.id))) throw httpError(404, '내가 쓴 댓글만 지울 수 있어요.');
    res.json({ ok: true });
  }));

  // 복약·생활 알림 관리
  r.get('/reminders', (req, res) => { res.json({ reminders: listReminders(db, fam(req).user_id) }); });
  r.post('/reminders', ah((req, res) => {
    const input = parseReminderInput(req.body ?? {}, false) as { kind: ReminderKind; label: string; time: string };
    res.status(201).json({ reminder: createReminder(db, fam(req).user_id, input, { kind: 'family', memberId: fam(req).id }) });
  }));
  r.patch('/reminders/:id', ah((req, res) => {
    const rem = updateReminder(db, fam(req).user_id, idParam(req.params.id), parseReminderInput(req.body ?? {}, true));
    if (!rem) throw httpError(404, '알림을 찾을 수 없어요.');
    res.json({ reminder: rem });
  }));
  r.delete('/reminders/:id', ah((req, res) => {
    if (!deleteReminder(db, fam(req).user_id, idParam(req.params.id))) throw httpError(404, '알림을 찾을 수 없어요.');
    res.json({ ok: true });
  }));

  // 이 기기에서 연결 끊기
  r.delete('/me', (req, res) => {
    db.prepare('DELETE FROM family_members WHERE id = ?').run(fam(req).id);
    res.json({ ok: true });
  });

  return r;
}
