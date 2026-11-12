/**
 * 표준 태그 사전.
 * - 대화(비정형 텍스트) → 구조화된 태그로 바꾸는 기준이며, 추천(매칭) 계산의 공통 언어입니다.
 * - family(계열)가 같으면 "비슷한 경험"으로 보고 부분 점수를 줍니다. 예) 식당 운영 ↔ 반찬가게 = 음식 관련 일
 * - AI 모드에서도 LLM이 뽑은 태그를 이 사전으로 정규화하므로, 같은 뜻이 다른 말로 표현돼도 매칭됩니다.
 */

export type MemoryCategory = 'work' | 'hobby' | 'place' | 'family' | 'life_event' | 'daily';
export type Dimension = 'work' | 'hobby' | 'interest' | 'experience' | 'family';

export const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  work: '과거 직업 및 활동',
  hobby: '취미 및 관심사',
  place: '고향 및 거주 경험',
  family: '가족과의 추억',
  life_event: '인상 깊었던 생애경험',
  daily: '최근 관심사 및 일상',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as MemoryCategory[];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  work: '직업 경험',
  hobby: '취미',
  interest: '관심사',
  experience: '생애경험·지역',
  family: '가족(추천에 사용 안 함)',
};

export const FAMILY_LABEL: Record<string, string> = {
  food: '음식', edu: '교육', build: '집 짓기·목공', farm: '농사', drive: '운전', sea: '바다',
  trade: '장사', sew: '바느질', public: '공공', care: '돌봄·보건', factory: '공장', office: '회사',
  beauty: '미용', garden: '식물 가꾸기', cook: '음식 만들기', outdoor: '바깥 활동', brain: '두뇌 놀이',
  music: '노래·음악', craft: '손으로 만드는 일', art: '예술', read: '읽을거리', health: '건강',
  localculture: '지역 문화', humanities: '역사', travel: '여행', nature: '자연', change: '삶의 큰 변화',
  volunteer: '봉사', region: '고향·사는 곳', family: '가족',
};

export interface TagDef {
  tag: string; // 표준 태그 = 표시 이름
  dim: Dimension;
  category: MemoryCategory;
  family: string;
  keywords: string[];
}

const def = (tag: string, dim: Dimension, category: MemoryCategory, family: string, keywords: string[]): TagDef => ({
  tag, dim, category, family, keywords: [tag, ...keywords],
});

export const TAGS: TagDef[] = [
  // ── 과거 직업 및 활동 ──
  def('식당 운영', 'work', 'work', 'food', ['식당', '음식점', '밥집', '국밥집', '분식집', '한식집', '백반집', '횟집', '식당을 운영', '식당 운영']),
  def('반찬가게', 'work', 'work', 'food', ['반찬가게', '반찬 가게', '반찬 장사']),
  def('급식 조리', 'work', 'work', 'food', ['급식', '조리원', '조리사']),
  def('교사', 'work', 'work', 'edu', ['선생님', '교직', '교편', '학교 선생']),
  def('목수', 'work', 'work', 'build', ['대목', '집 짓는 일', '목수 일']),
  def('농사', 'work', 'work', 'farm', ['농부', '과수원', '논농사', '농사꾼', '농사를 지', '농사 지']),
  def('운전', 'work', 'work', 'drive', ['택시', '버스 기사', '버스 운전', '운전기사', '운전 기사', '화물차', '트럭']),
  def('어업', 'work', 'work', 'sea', ['어부', '고기잡이', '배를 탔', '선원']),
  def('시장 장사', 'work', 'work', 'trade', ['시장에서 장사', '장사', '상인', '가게를 했', '가게를 운영', '구멍가게', '점방']),
  def('바느질', 'work', 'work', 'sew', ['재봉', '양장점', '한복집', '삯바느질', '봉제']),
  def('공무원', 'work', 'work', 'public', ['면사무소', '시청', '군청', '우체국']),
  def('간호·돌봄', 'work', 'work', 'care', ['간호사', '간호', '요양보호사']),
  def('공장 근무', 'work', 'work', 'factory', ['공장', '방직', '방적']),
  def('회사원', 'work', 'work', 'office', ['회사에 다녔', '회사 다녔', '직장 생활']),
  def('미용', 'work', 'work', 'beauty', ['미용실', '미장원', '이발소', '미용사']),

  // ── 취미 ──
  def('텃밭 가꾸기', 'hobby', 'hobby', 'garden', ['텃밭', '주말농장', '채소를 키', '채소 키우', '상추', '고추 모종', '밭을 가꾸', '밭 가꾸']),
  def('꽃 가꾸기', 'hobby', 'hobby', 'garden', ['화초', '화분', '꽃 가꾸', '꽃을 키', '꽃 키우', '난초', '분재']),
  def('요리', 'hobby', 'hobby', 'cook', ['음식 만들', '음식을 만들', '반찬 만들', '반찬을 만들', '김치 담그', '김장']),
  def('등산', 'hobby', 'hobby', 'outdoor', ['산에 오르', '산에 다니', '산행']),
  def('산책', 'hobby', 'hobby', 'outdoor', ['걷기', '걷는 걸', '걷는 것']),
  def('낚시', 'hobby', 'hobby', 'outdoor', []),
  def('바둑', 'hobby', 'hobby', 'brain', ['장기 두']),
  def('노래', 'hobby', 'hobby', 'music', ['트로트', '가요', '노래교실', '노래 교실']),
  def('악기 연주', 'hobby', 'hobby', 'music', ['하모니카', '기타 치', '장구', '피아노']),
  def('춤', 'hobby', 'hobby', 'music', ['댄스', '에어로빅']),
  def('뜨개질', 'hobby', 'hobby', 'craft', ['뜨개', '수놓', '자수']),
  def('목공', 'hobby', 'hobby', 'craft', ['나무로 만들', '나무를 깎']),
  def('사진', 'hobby', 'hobby', 'art', []),
  def('서예', 'hobby', 'hobby', 'art', ['붓글씨']),
  def('그림', 'hobby', 'hobby', 'art', []),
  def('독서', 'hobby', 'hobby', 'read', ['책 읽', '책을 읽', '신문 읽']),
  def('체조', 'hobby', 'hobby', 'health', ['게이트볼', '요가', '운동']),

  // ── 관심사 ──
  def('전통음식', 'interest', 'hobby', 'food', ['향토음식', '장 담그', '된장', '고추장', '떡 만들', '전통 음식']),
  def('지역 축제', 'interest', 'hobby', 'localculture', ['축제', '유등', '개천예술제']),
  def('전통문화', 'interest', 'hobby', 'localculture', ['한복', '민요', '국악']),
  def('역사', 'interest', 'hobby', 'humanities', ['옛날 이야기']),
  def('여행', 'interest', 'hobby', 'travel', ['구경 다니']),
  def('건강 관리', 'interest', 'hobby', 'health', ['건강식', '건강에 관심']),
  def('자연', 'interest', 'hobby', 'nature', ['새 소리', '숲길']),

  // ── 인상 깊었던 생애경험 ──
  def('귀농', 'experience', 'life_event', 'change', ['시골로 내려']),
  def('자원봉사', 'experience', 'life_event', 'volunteer', ['봉사']),
  def('상경', 'experience', 'life_event', 'change', ['서울로 올라']),
  def('집 짓기', 'experience', 'life_event', 'build', ['집을 지', '집을 직접']),
  def('은퇴', 'experience', 'life_event', 'change', ['정년', '퇴직']),
  def('해외 생활', 'experience', 'life_event', 'change', ['외국에서', '해외에서', '독일에서', '사우디']),

  // ── 지역 (생활 경험) ──
  ...['진주', '사천', '창원', '마산', '김해', '통영', '거제', '하동', '산청', '함양', '밀양', '부산', '대구', '서울', '남해', '의령', '합천']
    .map((p) => def(p, 'experience', 'place', 'region', [])),

  // ── 가족 (추천에는 절대 사용하지 않음) ──
  def('손주', 'family', 'family', 'family', ['손자', '손녀']),
  def('자녀', 'family', 'family', 'family', ['아들', '딸이', '딸은', '딸네', '딸하고', '딸과', '딸도', '딸을', '딸한테', '딸이랑', '며느리', '사위']),
  def('배우자', 'family', 'family', 'family', ['남편', '아내', '영감', '할멈', '집사람', '바깥양반']),
  def('부모님', 'family', 'family', 'family', ['어머니', '아버지', '엄마가', '어머님', '아버님']),
  def('형제자매', 'family', 'family', 'family', ['형님', '동생', '언니', '오빠', '누나']),
];

const BY_TAG = new Map(TAGS.map((t) => [t.tag, t]));
export const getTagDef = (tag: string): TagDef | undefined => BY_TAG.get(tag);

export interface TagMatch {
  def: TagDef;
  keyword: string;
  index: number;
}

/** 텍스트에서 표준 태그를 찾습니다. 긴 키워드를 먼저 잡고, 겹치는 짧은 키워드는 무시합니다. */
export function detectTags(text: string): TagMatch[] {
  const candidates: TagMatch[] = [];
  for (const d of TAGS) {
    for (const kw of d.keywords) {
      let from = 0;
      while (true) {
        const i = text.indexOf(kw, from);
        if (i < 0) break;
        candidates.push({ def: d, keyword: kw, index: i });
        from = i + kw.length;
      }
    }
  }
  candidates.sort((a, b) => b.keyword.length - a.keyword.length || a.index - b.index);
  const used: Array<[number, number]> = [];
  const seen = new Set<string>();
  const out: TagMatch[] = [];
  for (const c of candidates) {
    const s = c.index, e = c.index + c.keyword.length;
    if (used.some(([us, ue]) => s < ue && e > us)) continue;
    used.push([s, e]);
    if (seen.has(c.def.tag)) continue;
    seen.add(c.def.tag);
    out.push(c);
  }
  return out.sort((a, b) => a.index - b.index);
}

/** 자유 형식 태그(예: LLM 출력 "텃밭 농사")를 표준 태그로 바꿉니다. 사전에 없으면 정리된 원문을 그대로 둡니다. */
export function normalizeTag(raw: string): string {
  const t = raw.trim().replace(/^#/, '').replace(/\s+/g, ' ').slice(0, 20);
  if (!t) return '';
  if (BY_TAG.has(t)) return t;
  for (const d of TAGS) if (d.keywords.includes(t)) return d.tag;
  const found = detectTags(t);
  if (found.length === 1) return found[0].def.tag;
  return t;
}

/** 기억의 태그 목록을 정규화: 주어진 태그 + 제목·내용에서 찾은 표준 태그, 중복 제거, 최대 6개 */
export function normalizeTags(raw: string[], text: string): string[] {
  const out: string[] = [];
  const push = (t: string) => { if (t && !out.includes(t)) out.push(t); };
  raw.map(normalizeTag).forEach(push);
  detectTags(text).forEach((m) => push(m.def.tag));
  return out.slice(0, 6);
}

/** 태그가 추천 계산에서 어떤 항목(차원)에 속하는지. 사전에 없는 태그는 기억 분류를 따릅니다. */
export function dimensionOf(tag: string, category: MemoryCategory): Dimension {
  const d = BY_TAG.get(tag);
  if (d) return d.dim;
  switch (category) {
    case 'work': return 'work';
    case 'hobby': return 'hobby';
    case 'family': return 'family';
    case 'daily': return 'interest';
    default: return 'experience';
  }
}

export function familyOf(tag: string): string | null {
  return BY_TAG.get(tag)?.family ?? null;
}

/** LLM 프롬프트에 넣을 표준 태그 목록 (가족 제외) */
export function vocabularyForPrompt(): string {
  const groups: Record<string, string[]> = {};
  for (const t of TAGS) {
    if (t.dim === 'family') continue;
    (groups[t.dim] ??= []).push(t.tag);
  }
  return Object.entries(groups).map(([dim, tags]) => `${DIMENSION_LABEL[dim as Dimension]}: ${tags.join(', ')}`).join('\n');
}
