import type { DB } from '../db/database.js';
import { nowIso } from '../db/database.js';

export type RegionShare = 'none' | 'province' | 'city';

export interface UserRow {
  id: number;
  kind: 'member' | 'demo_persona';
  persona_key: string | null;
  nickname: string;
  age_band: string;
  region_province: string | null;
  region_city: string | null;
  region_share: RegionShare;
  consent_memory: number;
  consent_matching: number;
  intro: string | null;
  created_at: string;
  updated_at: string;
}

export const AGE_BANDS = ['60대 초반', '60대 후반', '70대 초반', '70대 중반', '70대 후반', '80대 초반', '80대 후반', '90대 이상'];

export function toUserDTO(u: UserRow) {
  return {
    id: u.id,
    nickname: u.nickname,
    ageBand: u.age_band,
    regionProvince: u.region_province ?? '',
    regionCity: u.region_city ?? '',
    regionShare: u.region_share,
    consentMemory: !!u.consent_memory,
    consentMatching: !!u.consent_matching,
    createdAt: u.created_at,
  };
}

/** 공개 동의 범위 안의 지역만 보여줍니다. 정확한 주소는 아예 저장하지 않습니다. */
export function publicRegion(u: Pick<UserRow, 'region_province' | 'region_city' | 'region_share'>): string {
  if (u.region_share === 'city' && u.region_city) return [u.region_province, u.region_city].filter(Boolean).join(' ');
  if (u.region_share !== 'none' && u.region_province) return u.region_province;
  return '지역 비공개';
}

export function getUser(db: DB, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export interface UserInput {
  nickname: string;
  ageBand: string;
  regionProvince: string;
  regionCity: string;
  regionShare: RegionShare;
  consentMemory: boolean;
  consentMatching: boolean;
}

export function createMember(db: DB, input: UserInput): UserRow {
  const now = nowIso();
  const r = db.prepare(`INSERT INTO users
    (kind, nickname, age_band, region_province, region_city, region_share, consent_memory, consent_matching, created_at, updated_at)
    VALUES ('member', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.nickname, input.ageBand, input.regionProvince, input.regionCity, input.regionShare,
    input.consentMemory ? 1 : 0, input.consentMatching ? 1 : 0, now, now,
  );
  return getUser(db, Number(r.lastInsertRowid))!;
}

export function updateMember(db: DB, id: number, patch: Partial<UserInput>): UserRow {
  const cur = getUser(db, id)!;
  const next = {
    nickname: patch.nickname ?? cur.nickname,
    ageBand: patch.ageBand ?? cur.age_band,
    regionProvince: patch.regionProvince ?? cur.region_province ?? '',
    regionCity: patch.regionCity ?? cur.region_city ?? '',
    regionShare: patch.regionShare ?? cur.region_share,
    consentMemory: patch.consentMemory ?? !!cur.consent_memory,
    consentMatching: patch.consentMatching ?? !!cur.consent_matching,
  };
  db.prepare(`UPDATE users SET nickname=?, age_band=?, region_province=?, region_city=?, region_share=?,
      consent_memory=?, consent_matching=?, updated_at=? WHERE id=?`).run(
    next.nickname, next.ageBand, next.regionProvince, next.regionCity, next.regionShare,
    next.consentMemory ? 1 : 0, next.consentMatching ? 1 : 0, nowIso(), id,
  );
  return getUser(db, id)!;
}
