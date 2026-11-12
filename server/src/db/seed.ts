import type { DatabaseSync } from 'node:sqlite';
import { PERSONAS } from '../data/personas.js';

/** 시연용 가상 이용자를 넣습니다. 이미 있으면 내용만 최신으로 맞춥니다(멱등). */
export function seedPersonas(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const find = db.prepare('SELECT id FROM users WHERE persona_key = ?');
  const insert = db.prepare(`INSERT INTO users
    (kind, persona_key, nickname, age_band, region_province, region_city, region_share, consent_memory, consent_matching, intro, created_at, updated_at)
    VALUES ('demo_persona', ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`);
  const update = db.prepare(`UPDATE users SET nickname=?, age_band=?, region_province=?, region_city=?, region_share=?, intro=?, updated_at=? WHERE id=?`);
  const clearInterests = db.prepare(`DELETE FROM interests WHERE user_id = ? AND origin = 'persona'`);
  const addInterest = db.prepare(`INSERT INTO interests (user_id, memory_id, dimension, tag, origin, created_at) VALUES (?, NULL, ?, ?, 'persona', ?)`);

  db.exec('BEGIN');
  try {
    for (const p of PERSONAS) {
      const intro = `${p.intro} ${p.lifeStory}`;
      const row = find.get(p.key) as { id: number } | undefined;
      let id: number;
      if (row) {
        id = row.id;
        update.run(p.nickname, p.ageBand, p.province, p.city, p.regionShare, intro, now, id);
      } else {
        id = Number(insert.run(p.key, p.nickname, p.ageBand, p.province, p.city, p.regionShare, intro, now, now).lastInsertRowid);
      }
      clearInterests.run(id);
      for (const [dim, tags] of [['work', p.work], ['hobby', p.hobby], ['interest', p.interest], ['experience', p.experience]] as const) {
        for (const t of tags) addInterest.run(id, dim, t, now);
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
