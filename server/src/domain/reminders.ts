/**
 * 복약·생활 알림.
 * - 가족이나 어르신이 등록하고, 어르신 화면이 열려 있을 때 홈 화면과 단디의 첫마디로 안내합니다.
 * - 웹 MVP 에는 푸시 알림·문자 발송 기능이 없습니다(화면이 닫혀 있으면 알리지 못함).
 */
import type { DB } from '../db/database.js';
import { nowIso } from '../db/database.js';
import { kstDate, kstMinutes, timeLabel } from './time.js';

export type ReminderKind = 'medication' | 'life';

interface ReminderRow {
  id: number; user_id: number; kind: ReminderKind; label: string; time: string; enabled: number;
  created_by: 'elder' | 'family'; family_member_id: number | null; created_at: string;
}

export interface Reminder {
  id: number;
  kind: ReminderKind;
  label: string;
  time: string;
  timeLabel: string;
  enabled: boolean;
  createdBy: 'elder' | 'family';
  checkedToday: boolean;
  checkedAt: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toReminder(db: DB, r: ReminderRow, today = kstDate()): Reminder {
  const c = db.prepare('SELECT checked_at FROM reminder_checks WHERE reminder_id = ? AND date = ?').get(r.id, today) as { checked_at: string } | undefined;
  return {
    id: r.id, kind: r.kind, label: r.label, time: r.time, timeLabel: timeLabel(r.time), enabled: !!r.enabled,
    createdBy: r.created_by, checkedToday: !!c, checkedAt: c?.checked_at ?? null,
  };
}

export function listReminders(db: DB, userId: number): Reminder[] {
  const rows = db.prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY time, id').all(userId) as unknown as ReminderRow[];
  const today = kstDate();
  return rows.map((r) => toReminder(db, r, today));
}

export function parseReminderInput(b: Record<string, unknown>, partial: boolean) {
  const bad = (m: string) => Object.assign(new Error(m), { status: 400 });
  const out: { kind?: ReminderKind; label?: string; time?: string; enabled?: boolean } = {};
  if (!partial || b.kind !== undefined) {
    if (b.kind !== 'medication' && b.kind !== 'life') throw bad('알림 종류를 골라 주세요.');
    out.kind = b.kind;
  }
  if (!partial || b.label !== undefined) {
    const l = typeof b.label === 'string' ? b.label.trim() : '';
    if (!l) throw bad('알림 내용을 적어 주세요.');
    if (l.length > 30) throw bad('알림 내용은 30자 이내로 적어 주세요.');
    out.label = l;
  }
  if (!partial || b.time !== undefined) {
    if (typeof b.time !== 'string' || !TIME_RE.test(b.time)) throw bad('시간을 00:00 형식으로 골라 주세요.');
    out.time = b.time;
  }
  if (b.enabled !== undefined) out.enabled = b.enabled === true;
  return out;
}

export function createReminder(db: DB, userId: number, input: { kind: ReminderKind; label: string; time: string }, by: { kind: 'elder' | 'family'; memberId?: number }): Reminder {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?').get(userId) as { n: number }).n;
  if (count >= 20) throw Object.assign(new Error('알림은 20개까지 만들 수 있어요.'), { status: 400 });
  const r = db.prepare(`INSERT INTO reminders (user_id, kind, label, time, enabled, created_by, family_member_id, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`).run(userId, input.kind, input.label, input.time, by.kind, by.memberId ?? null, nowIso());
  return getReminder(db, userId, Number(r.lastInsertRowid))!;
}

export function getReminder(db: DB, userId: number, id: number): Reminder | undefined {
  const r = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, userId) as ReminderRow | undefined;
  return r ? toReminder(db, r) : undefined;
}

export function updateReminder(db: DB, userId: number, id: number, patch: { kind?: ReminderKind; label?: string; time?: string; enabled?: boolean }): Reminder | undefined {
  const cur = getReminder(db, userId, id);
  if (!cur) return undefined;
  db.prepare('UPDATE reminders SET kind = ?, label = ?, time = ?, enabled = ? WHERE id = ? AND user_id = ?').run(
    patch.kind ?? cur.kind, patch.label ?? cur.label, patch.time ?? cur.time, (patch.enabled ?? cur.enabled) ? 1 : 0, id, userId,
  );
  return getReminder(db, userId, id);
}

export function deleteReminder(db: DB, userId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
}

export function checkReminder(db: DB, userId: number, id: number): Reminder | undefined {
  if (!getReminder(db, userId, id)) return undefined;
  db.prepare('INSERT OR IGNORE INTO reminder_checks (reminder_id, date, checked_at) VALUES (?, ?, ?)').run(id, kstDate(), nowIso());
  return getReminder(db, userId, id);
}

/** 지금 안내할 알림: 켜져 있고, 오늘 아직 확인하지 않았고, 시간이 30분 전 ~ 90분 후 사이 */
export function dueReminders(db: DB, userId: number, now = new Date()): Reminder[] {
  const mins = kstMinutes(now);
  return listReminders(db, userId).filter((r) => {
    if (!r.enabled || r.checkedToday) return false;
    const [h, m] = r.time.split(':').map(Number);
    const diff = mins - (h * 60 + m);
    return diff >= -30 && diff <= 90;
  });
}
