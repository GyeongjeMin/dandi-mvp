/**
 * 동네 친구 추천 — 태그 기반 가중치 유사도
 *
 *  점수 = Σ(항목 가중치 × 항목 유사도) ÷ Σ(내 정보가 있는 항목의 가중치) × 100
 *  항목 유사도 = (같은 태그 수 + 0.5 × 비슷한 계열 태그 쌍 수) ÷ min(내 태그 수, 상대 태그 수)
 *  지역 = 같은 시·군 1.0 / 같은 도 0.5 (양쪽 모두 공개 동의한 범위 안에서만)
 *
 *  ✔ 입력은 오직 '이용자가 확인한 기억'에서 나온 태그와 '공개 동의한' 지역뿐입니다.
 *  ✔ 가족 기억, 확인 대기 중인 기억, '추천에 쓰지 않기'로 한 기억은 사용하지 않습니다.
 *  ✔ 추천 이유 문장은 실제로 겹친 항목으로만 만듭니다(미리 써 둔 문구 없음).
 */
import type { DB } from '../db/database.js';
import { nowIso, parseJson, tx } from '../db/database.js';
import { publicRegion, type UserRow } from './users.js';
import { DIMENSION_LABEL, FAMILY_LABEL, familyOf, getTagDef } from './tags.js';
import { eul, joinKo } from './josa.js';

export type MatchDim = 'work' | 'hobby' | 'interest' | 'experience' | 'region';

export const WEIGHTS: Record<MatchDim, number> = {
  hobby: 0.35, work: 0.25, interest: 0.2, experience: 0.1, region: 0.1,
};
const DIM_LABEL: Record<MatchDim, string> = { ...DIMENSION_LABEL, region: '사는 지역' } as Record<MatchDim, string>;

type TagSets = Record<Exclude<MatchDim, 'region'>, string[]>;

export function loadTagSets(db: DB, userId: number): TagSets {
  const rows = db.prepare('SELECT DISTINCT dimension, tag FROM interests WHERE user_id = ?').all(userId) as Array<{ dimension: keyof TagSets; tag: string }>;
  const sets: TagSets = { work: [], hobby: [], interest: [], experience: [] };
  for (const r of rows) if (sets[r.dimension] && !sets[r.dimension].includes(r.tag)) sets[r.dimension].push(r.tag);
  return sets;
}

interface RelatedPair { mine: string; theirs: string; family: string; familyLabel: string }

function compareDim(mine: string[], theirs: string[]) {
  const exact = mine.filter((t) => theirs.includes(t));
  const restMine = mine.filter((t) => !exact.includes(t));
  const restTheirs = theirs.filter((t) => !exact.includes(t));
  const related: RelatedPair[] = [];
  for (const a of restMine) {
    const fa = familyOf(a);
    if (!fa || fa === 'region') continue;
    const bIdx = restTheirs.findIndex((b) => familyOf(b) === fa);
    if (bIdx >= 0) {
      related.push({ mine: a, theirs: restTheirs[bIdx], family: fa, familyLabel: FAMILY_LABEL[fa] ?? fa });
      restTheirs.splice(bIdx, 1);
    }
  }
  const denom = Math.min(mine.length, theirs.length);
  const similarity = denom ? Math.min(1, (exact.length + 0.5 * related.length) / denom) : 0;
  return { exact, related, similarity };
}

function regionSimilarity(me: UserRow, other: UserRow): { similarity: number; label: string | null } {
  if (me.region_share === 'none' || other.region_share === 'none') return { similarity: 0, label: null };
  if (!me.region_province || me.region_province !== other.region_province) return { similarity: 0, label: null };
  const bothCity = me.region_share === 'city' && other.region_share === 'city';
  if (bothCity && me.region_city && me.region_city === other.region_city) return { similarity: 1, label: me.region_city };
  return { similarity: 0.5, label: me.region_province };
}

export interface Recommendation {
  rank: number;
  score: number;
  user: {
    id: number; nickname: string; ageBand: string; region: string; intro: string;
    hobbies: string[]; interests: string[]; works: string[]; experiences: string[];
  };
  breakdown: Array<{ dimension: MatchDim; label: string; weight: number; similarity: number; points: number; active: boolean }>;
  common: {
    exact: Array<{ dimension: MatchDim; tag: string }>;
    related: Array<RelatedPair & { dimension: MatchDim }>;
    region: string | null;
  };
  commonExperiences: string[];
  reason: string;
  delta: { status: 'new' | 'up' | 'down' | 'same'; previousRank: number | null } | null;
}

export function buildReason(nickname: string, me: string, c: Recommendation['common']): string {
  const sentences: string[] = [];
  const hobbyLike = c.exact.filter((e) => e.dimension === 'hobby' || e.dimension === 'interest').map((e) => e.tag);
  if (hobbyLike.length) sentences.push(`${nickname}님은 ${me}님처럼 ${joinKo(hobbyLike.slice(0, 3))}에 관심이 많아요.`);
  const relHobby = c.related.filter((r) => r.dimension === 'hobby' || r.dimension === 'interest');
  if (!hobbyLike.length && relHobby.length) {
    sentences.push(`${me}님은 ${relHobby[0].mine}, ${nickname}님은 ${eul(relHobby[0].theirs)} 좋아하셔서 '${relHobby[0].familyLabel}' 이야기가 잘 통할 거예요.`);
  }
  const workExact = c.exact.filter((e) => e.dimension === 'work').map((e) => e.tag);
  const workRel = c.related.filter((r) => r.dimension === 'work');
  if (workExact.length) sentences.push(`두 분 모두 ${joinKo(workExact)} 일을 하신 경험이 있어요.`);
  else if (workRel.length) sentences.push(`두 분 모두 과거 ${workRel[0].familyLabel} 관련 일을 하신 경험이 있어요(${workRel[0].mine} · ${workRel[0].theirs}).`);
  const exp = c.exact.filter((e) => e.dimension === 'experience' && getTagDef(e.tag)?.category !== 'place').map((e) => e.tag);
  if (exp.length) sentences.push(`${joinKo(exp)} 경험도 함께 나누실 수 있어요.`);
  const lived = c.exact.filter((e) => e.dimension === 'experience' && getTagDef(e.tag)?.category === 'place').map((e) => e.tag);
  if (lived.length && c.region) sentences.push(`${nickname}님도 ${me}님처럼 ${lived[0]}에서 지내셨고, 지금도 같은 ${c.region}에 사셔서 가까이에서 만나기 좋아요.`);
  else if (lived.length) sentences.push(`두 분 모두 ${lived[0]}에서 지내신 추억이 있어요.`);
  else if (c.region) sentences.push(`같은 ${c.region}에 사셔서 가까이에서 만나기도 좋아요.`);
  if (!sentences.length) return '';
  return `${sentences.join(' ')} 공통된 이야기를 나누기 좋을 것 같아요.`;
}

/** 순수 계산 (DB 저장 없음) */
export function computeRecommendations(db: DB, me: UserRow): { list: Recommendation[]; myTags: TagSets } {
  const myTags = loadTagSets(db, me.id);
  const candidates = db.prepare(`SELECT * FROM users WHERE kind = 'demo_persona' AND consent_matching = 1 AND id != ?`).all(me.id) as unknown as UserRow[];
  const activeDims = (Object.keys(WEIGHTS) as MatchDim[]).filter((d) =>
    d === 'region' ? me.region_share !== 'none' && !!me.region_province : myTags[d].length > 0);
  const totalWeight = activeDims.reduce((s, d) => s + WEIGHTS[d], 0);
  const hasMemoryTags = (['work', 'hobby', 'interest', 'experience'] as const).some((d) => myTags[d].length > 0);

  const list: Recommendation[] = [];
  for (const other of candidates) {
    const theirs = loadTagSets(db, other.id);
    const common: Recommendation['common'] = { exact: [], related: [], region: null };
    const breakdown: Recommendation['breakdown'] = [];
    let total = 0;
    for (const d of Object.keys(WEIGHTS) as MatchDim[]) {
      let similarity = 0;
      if (d === 'region') {
        const r = regionSimilarity(me, other);
        similarity = r.similarity;
        common.region = r.label;
      } else {
        const r = compareDim(myTags[d], theirs[d]);
        similarity = r.similarity;
        r.exact.forEach((tag) => common.exact.push({ dimension: d, tag }));
        r.related.forEach((p) => common.related.push({ ...p, dimension: d }));
      }
      const active = activeDims.includes(d);
      const points = active && totalWeight ? (WEIGHTS[d] * similarity / totalWeight) * 100 : 0;
      total += points;
      breakdown.push({ dimension: d, label: DIM_LABEL[d], weight: WEIGHTS[d], similarity: Math.round(similarity * 100) / 100, points: Math.round(points * 10) / 10, active });
    }
    // 대화로 알게 된 공통점이 하나도 없으면(지역만 같으면) 추천하지 않습니다.
    const memoryCommon = common.exact.length + common.related.length;
    if (!hasMemoryTags || memoryCommon === 0) continue;

    const commonExperiences = [
      ...common.exact.filter((e) => e.dimension === 'work' || e.dimension === 'experience')
        .map((e) => (getTagDef(e.tag)?.category === 'place' ? `${e.tag}에서의 생활` : e.tag)),
      ...common.related.filter((r) => r.dimension === 'work' || r.dimension === 'experience').map((r) => `${r.familyLabel} 관련 일 (${r.mine} · ${r.theirs})`),
    ];
    list.push({
      rank: 0,
      score: Math.round(total),
      user: {
        id: other.id, nickname: other.nickname, ageBand: other.age_band, region: publicRegion(other), intro: other.intro ?? '',
        hobbies: theirs.hobby, interests: theirs.interest, works: theirs.work,
        experiences: theirs.experience.filter((t) => getTagDef(t)?.category !== 'place'),
      },
      breakdown,
      common,
      commonExperiences,
      reason: buildReason(other.nickname, me.nickname, common),
      delta: null,
    });
  }
  list.sort((a, b) => b.score - a.score || b.common.exact.length - a.common.exact.length || a.user.id - b.user.id);
  list.forEach((r, i) => { r.rank = i + 1; });
  return { list, myTags };
}

/**
 * 추천을 계산해 DB(recommendations)에 저장하고, 직전 결과와 비교한 순위 변화를 붙여 돌려줍니다.
 * 결과가 바뀐 경우에만 새 묶음(batch)을 저장하며, 최근 2개 묶음만 보관합니다.
 */
export function refreshRecommendations(db: DB, me: UserRow) {
  const { list, myTags } = computeRecommendations(db, me);
  const flatTags = Object.values(myTags).flat();
  const signature = JSON.stringify(list.map((r) => [r.user.id, r.score, r.reason]));

  const batches = db.prepare(`SELECT batch_id, MAX(created_at) AS at FROM recommendations WHERE user_id = ? GROUP BY batch_id ORDER BY at DESC`).all(me.id) as Array<{ batch_id: string; at: string }>;
  const loadBatch = (id?: string) => (id
    ? db.prepare('SELECT * FROM recommendations WHERE user_id = ? AND batch_id = ? ORDER BY rank').all(me.id, id) as Array<{ target_user_id: number; rank: number; score: number; reason: string; user_tags: string; created_at: string }>
    : []);
  let latest = loadBatch(batches[0]?.batch_id);
  let previous = loadBatch(batches[1]?.batch_id);
  const latestSig = JSON.stringify(latest.filter((r) => r.target_user_id !== me.id).map((r) => [r.target_user_id, r.score, r.reason]));
  const latestTags = parseJson<string[]>(latest[0]?.user_tags, []);
  const tagsChanged = JSON.stringify([...latestTags].sort()) !== JSON.stringify([...flatTags].sort());

  if (!batches.length || latestSig !== signature || tagsChanged) {
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = nowIso();
    tx(db, () => {
      const ins = db.prepare(`INSERT INTO recommendations (user_id, target_user_id, batch_id, rank, score, breakdown, common, reason, user_tags, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      if (list.length === 0) {
        // 추천이 없어도 '내 태그 스냅샷'은 남겨 변화 비교에 씁니다 (target_user_id = 본인, rank 0)
        ins.run(me.id, me.id, batchId, 0, 0, '[]', '{}', '', JSON.stringify(flatTags), now);
      }
      for (const r of list) {
        ins.run(me.id, r.user.id, batchId, r.rank, r.score, JSON.stringify(r.breakdown), JSON.stringify(r.common), r.reason, JSON.stringify(flatTags), now);
      }
      if (batches[1]) db.prepare('DELETE FROM recommendations WHERE user_id = ? AND batch_id NOT IN (?, ?)').run(me.id, batchId, batches[0].batch_id);
    });
    previous = latest;
    latest = loadBatch(batchId);
  }

  const prevRank = new Map(previous.filter((r) => r.target_user_id !== me.id).map((r) => [r.target_user_id, r.rank]));
  const hasPrevious = previous.length > 0;
  for (const r of list) {
    if (!hasPrevious) continue;
    const p = prevRank.get(r.user.id) ?? null;
    r.delta = { previousRank: p, status: p === null ? 'new' : p > r.rank ? 'up' : p < r.rank ? 'down' : 'same' };
  }
  const prevTags = parseJson<string[]>(previous[0]?.user_tags, []);
  const curIds = new Set(list.map((r) => r.user.id));
  const dropped = previous.filter((r) => r.target_user_id !== me.id && !curIds.has(r.target_user_id)).map((r) => r.target_user_id);
  const droppedNames = dropped.length
    ? (db.prepare(`SELECT nickname FROM users WHERE id IN (${dropped.map(() => '?').join(',')})`).all(...dropped) as Array<{ nickname: string }>).map((x) => x.nickname)
    : [];

  return {
    recommendations: list,
    myTags,
    weights: WEIGHTS,
    changes: hasPrevious ? {
      since: previous[0]?.created_at ?? null,
      addedTags: flatTags.filter((t) => !prevTags.includes(t)),
      removedTags: prevTags.filter((t) => !flatTags.includes(t)),
      droppedUsers: droppedNames,
    } : null,
  };
}
