import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { seedPersonas } from './seed.js';

export type DB = DatabaseSync;
export const nowIso = () => new Date().toISOString();

/**
 * 테이블 구조
 * - users               : 사용자. kind='member'(실제 이용자) / 'demo_persona'(시연용 가상 이용자)를 명확히 구분
 * - conversations       : 대화 세션
 * - messages            : 대화 메시지 (meta: 추출된 기억 후보, 참고한 기억 등)
 * - memories            : 생애기억. status='pending'(확인 대기)/'confirmed'(확인됨), source='stated'/'inferred'/'manual'
 * - interests           : 확인된 기억에서 파생된 추천용 태그 (기억 수정·삭제 시 자동 재계산)
 * - recommendations     : 추천 결과 스냅샷 (최근 2회분 보관 → 순위 변화 표시)
 * - connection_requests : 교류 제안과 수락/거절 상태
 * ── 2차 개선: 가족 연계·개인화 ──
 * - user_prefs          : 대화 방식(말 길이·말 빠르기·피하고 싶은 이야기)과 가족 공유 범위 — 기기와 무관하게 계정에 저장
 * - family_invites      : 어르신이 만든 가족 초대 코드 (24시간 유효)
 * - family_members      : 초대 코드로 연결된 가족·보호자 (접속 토큰은 해시로만 저장)
 * - family_posts        : 가족이 보낸 사진·메시지와 전달 상태(소개함/봄/함께 이야기함)
 * - memory_comments     : 가족이 공유된 추억에 남긴 댓글·질문 (질문은 다음 회상 대화에 활용)
 * - reminders           : 복약·생활 알림 (앱 화면이 열려 있을 때만 안내 — 푸시 알림 아님)
 * - reminder_checks     : 날짜별 알림 확인 기록
 * - dialogue_log        : 인사·후속 질문 사용 이력 (같은 인사·질문 반복 방지)
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('member','demo_persona')),
  persona_key TEXT UNIQUE,
  nickname TEXT NOT NULL,
  age_band TEXT NOT NULL,
  region_province TEXT,
  region_city TEXT,
  region_share TEXT NOT NULL DEFAULT 'city' CHECK (region_share IN ('none','province','city')),
  consent_memory INTEGER NOT NULL DEFAULT 0,
  consent_matching INTEGER NOT NULL DEFAULT 0,
  intro TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'demo',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('work','hobby','place','family','life_event','daily')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL CHECK (source IN ('stated','inferred','manual')),
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed')),
  use_for_matching INTEGER NOT NULL DEFAULT 1,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  conversation_title TEXT,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  last_recalled_at TEXT,
  recall_count INTEGER NOT NULL DEFAULT 0,
  share_family INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id, status);

CREATE TABLE IF NOT EXISTS interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_id INTEGER REFERENCES memories(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL CHECK (dimension IN ('work','hobby','interest','experience')),
  tag TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('memory','persona')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_int_user ON interests(user_id);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  score REAL NOT NULL,
  breakdown TEXT NOT NULL,
  common TEXT NOT NULL,
  reason TEXT NOT NULL,
  user_tags TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rec_user ON recommendations(user_id, batch_id);

CREATE TABLE IF NOT EXISTS connection_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
  message TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  responded_at TEXT
);
`;

// 2차 개선에서 추가된 테이블 (기존 테이블과 독립적이라 IF NOT EXISTS 로 안전하게 추가)
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS family_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invite_code ON family_invites(code);

CREATE TABLE IF NOT EXISTS family_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS family_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  sender_label TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  photo_file TEXT,
  created_at TEXT NOT NULL,
  offered_at TEXT,
  seen_at TEXT,
  talked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_post_user ON family_posts(user_id, created_at);

CREATE TABLE IF NOT EXISTS memory_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  sender_label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comment','question')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_comment_mem ON memory_comments(memory_id);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('medication','life')),
  label TEXT NOT NULL,
  time TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL CHECK (created_by IN ('elder','family')),
  family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_checks (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (reminder_id, date)
);

CREATE TABLE IF NOT EXISTS dialogue_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dlog_user ON dialogue_log(user_id, created_at);
`;

const hasColumn = (db: DB, table: string, col: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === col);

const MEMORIES_V2 = `CREATE TABLE memories_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('work','hobby','place','family','life_event','daily')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL CHECK (source IN ('stated','inferred','manual')),
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed')),
  use_for_matching INTEGER NOT NULL DEFAULT 1,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  conversation_title TEXT,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  last_recalled_at TEXT,
  recall_count INTEGER NOT NULL DEFAULT 0,
  share_family INTEGER NOT NULL DEFAULT 0,
  engagement INTEGER NOT NULL DEFAULT 0
);`;

/**
 * 기존 데이터베이스를 지우지 않고 새 구조로 옮깁니다(여러 번 실행해도 안전).
 * - memories: '최근 관심사 및 일상(daily)' 분류 추가는 CHECK 제약 때문에 표 재작성이 필요 → 모든 행을 그대로 복사
 * - conversations: 대화 방식(channel), 종료 시각, 연결된 가족 소식 열 추가
 */
export function migrate(db: DB): void {
  const memSql = (db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='memories'`).get() as { sql: string } | undefined)?.sql ?? '';
  if (memSql && !memSql.includes("'daily'")) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN');
    try {
      db.exec(MEMORIES_V2);
      const cols = 'id, user_id, category, title, detail, tags, source, status, use_for_matching, conversation_id, conversation_title, message_id, created_at, updated_at, confirmed_at, last_recalled_at, recall_count';
      db.exec(`INSERT INTO memories_v2 (${cols}) SELECT ${cols} FROM memories;`);
      db.exec('DROP TABLE memories;');
      db.exec('ALTER TABLE memories_v2 RENAME TO memories;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id, status);');
      const bad = db.prepare('PRAGMA foreign_key_check').all();
      if (bad.length) throw new Error(`외래키 검사 실패: ${JSON.stringify(bad).slice(0, 200)}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }
  if (!hasColumn(db, 'conversations', 'channel')) db.exec(`ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'text';`);
  if (!hasColumn(db, 'conversations', 'ended_at')) db.exec('ALTER TABLE conversations ADD COLUMN ended_at TEXT;');
  if (!hasColumn(db, 'conversations', 'family_post_id')) db.exec('ALTER TABLE conversations ADD COLUMN family_post_id INTEGER;');
  db.exec(SCHEMA_V2);
}

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  seedPersonas(db);
  return db;
}

/** 여러 쿼리를 하나의 트랜잭션으로 */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const parseJson = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
