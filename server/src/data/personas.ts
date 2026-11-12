/**
 * 시연용 가상 어르신 프로필 8명 — 실존 인물이 아닌 가상 데이터입니다.
 * 각 프로필은 공개 동의한 범위의 정보만 갖고 있으며, 연락처는 저장하지 않습니다.
 * 태그는 tags.ts 의 표준 태그를 사용합니다.
 */
export interface Persona {
  key: string;
  nickname: string;
  ageBand: string;
  province: string;
  city: string;
  regionShare: 'province' | 'city';
  intro: string;
  work: string[];
  hobby: string[];
  interest: string[];
  experience: string[];
  lifeStory: string; // 주요 생애경험 (공개 동의한 한 줄 소개)
}

export const PERSONAS: Persona[] = [
  {
    key: 'p_jeongsun', nickname: '정순', ageBand: '70대 초반', province: '경남', city: '진주시', regionShare: 'city',
    intro: '시장 골목에서 30년 동안 반찬가게를 했어요.',
    work: ['반찬가게'], hobby: ['텃밭 가꾸기', '요리'], interest: ['전통음식', '지역 축제'], experience: ['진주', '자원봉사'],
    lifeStory: '남강유등축제 때마다 음식 봉사를 했어요.',
  },
  {
    key: 'p_youngho', nickname: '영호', ageBand: '70대 후반', province: '경남', city: '진주시', regionShare: 'city',
    intro: '초등학교에서 40년 동안 아이들을 가르쳤어요.',
    work: ['교사'], hobby: ['바둑', '등산'], interest: ['역사'], experience: ['진주', '은퇴'],
    lifeStory: '정년퇴직 후 지역 역사 해설 봉사를 해 봤어요.',
  },
  {
    key: 'p_malsun', nickname: '말순', ageBand: '80대 초반', province: '경남', city: '사천시', regionShare: 'city',
    intro: '삼천포 시장에서 생선 장사를 오래 했지요.',
    work: ['시장 장사'], hobby: ['노래', '뜨개질'], interest: ['건강 관리'], experience: ['사천'],
    lifeStory: '시장 상인들과 노래교실을 함께 다녔어요.',
  },
  {
    key: 'p_deoksu', nickname: '덕수', ageBand: '70대 초반', province: '경남', city: '진주시', regionShare: 'city',
    intro: '평생 목수로 집을 지었어요.',
    work: ['목수'], hobby: ['텃밭 가꾸기', '낚시', '목공'], interest: ['자연'], experience: ['진주', '집 짓기'],
    lifeStory: '지금 사는 집도 제 손으로 직접 지었답니다.',
  },
  {
    key: 'p_sunja', nickname: '순자', ageBand: '60대 후반', province: '경남', city: '창원시', regionShare: 'city',
    intro: '학교 급식실에서 조리 일을 했어요.',
    work: ['급식 조리'], hobby: ['요리', '노래'], interest: ['건강 관리', '전통음식'], experience: ['창원', '은퇴'],
    lifeStory: '은퇴 후 복지관에서 요리 교실 도우미를 해요.',
  },
  {
    key: 'p_jaeseok', nickname: '재석', ageBand: '70대 중반', province: '부산', city: '부산', regionShare: 'city',
    intro: '택시를 몰며 전국 안 가 본 데가 없어요.',
    work: ['운전'], hobby: ['등산', '사진'], interest: ['여행'], experience: ['부산'],
    lifeStory: '은퇴 기념으로 전국 일주를 다녀왔어요.',
  },
  {
    key: 'p_okhee', nickname: '옥희', ageBand: '80대 초반', province: '경남', city: '진주시', regionShare: 'province',
    intro: '한복 바느질로 자식들을 키웠어요.',
    work: ['바느질'], hobby: ['뜨개질', '꽃 가꾸기'], interest: ['전통문화'], experience: ['진주', '상경'],
    lifeStory: '젊을 때 서울에서 한복집 일을 배워 내려왔어요.',
  },
  {
    key: 'p_byeongcheol', nickname: '병철', ageBand: '60대 후반', province: '경남', city: '김해시', regionShare: 'city',
    intro: '회사를 그만두고 고향에 내려와 농사를 짓고 있어요.',
    work: ['농사', '회사원'], hobby: ['꽃 가꾸기', '악기 연주'], interest: ['전통음식', '자연'], experience: ['김해', '귀농'],
    lifeStory: '쉰다섯에 귀농해서 매실 농사를 시작했어요.',
  },
];
