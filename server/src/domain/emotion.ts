/**
 * 단디 캐릭터의 표정 고르기 (어르신의 '감정을 판단'하는 기능이 아닙니다)
 *
 * - 어르신 말에 즐거운 일·힘든 일을 가리키는 '분명한 표현'이 있을 때만 단디가 그에 어울리는 표정을 짓습니다.
 *     즐거운 표현 → happy (밝은 미소)       힘든 표현 → comforting (차분하고 따뜻한 공감)
 * - 애매하거나 둘 다 섞여 있으면 단정하지 않고 neutral (자연스러운 기본 표정).
 * - 힘든 표현이 있으면 공감을 우선합니다 ("좋았는데 요즘은 외로워" → comforting).
 * - 규칙이 공개되어 있어 결과를 설명할 수 있고, AI 모드에서도 같은 규칙을 씁니다(추가 지연 없음).
 */
export type Emotion = 'neutral' | 'happy' | 'comforting';

const HARD = /(힘들|힘든|힘겨|슬프|슬퍼|슬펐|외로|외롭|쓸쓸|적적|아프|아파|아팠|편찮|돌아가셨|돌아가신|세상을 떠|그립|그리워|보고 ?싶|걱정|속상|서운|무서|무섭|고생|우울|눈물|울었|괴로|서럽|허전|막막)/;
const GOOD = /(좋았|좋아|즐거|즐겁|기뻐|기쁘|기뻤|행복|재밌|재미있|재미났|신나|신났|자랑|1등|일등|상을 받|상 받|합격|결혼|축하|웃었|웃겨|맛있|예뻐|예쁘|고마|고맙|최고|뿌듯|반가)/;
const NOT_GOOD = /(안 ?좋|좋지 않|좋진 않|안 즐거|즐겁지 않|재미없|재미 없|안 기뻐|별로)/;

export function classifyEmotion(text: string): Emotion {
  const t = text.replace(/\s+/g, ' ');
  if (HARD.test(t)) return 'comforting';
  if (GOOD.test(t) && !NOT_GOOD.test(t)) return 'happy';
  return 'neutral';
}
