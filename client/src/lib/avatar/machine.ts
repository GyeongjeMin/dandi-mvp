/**
 * 단디 캐릭터 상태 머신 (순수 함수 — 화면·3D 와 분리되어 있어 쉽게 검증 가능)
 *
 * 입력은 모두 '실제 대화 처리 이벤트'입니다. 시간이 지나면 저절로 상태가 바뀌는 타이머는 없습니다.
 *   PHASE      ← VoiceSession 의 상태 (preparing / listening / thinking / speaking / paused / error / idle)
 *   EMOTION    ← 서버가 이번 답과 함께 보낸 표정 (어르신 말에서 분명한 표현이 있을 때만 happy / comforting)
 *   HEARD      ← 음성 인식이 어르신 말을 실시간으로 받아 적을 때마다 (경청 끄덕임)
 *   SPEECH     ← 음성합성의 실제 시작·단어 경계·끝 (입 움직임)
 *
 *   ┌──────── preparing ────────┐
 *   │                           ▼
 *  idle ──(listening)──▶ listening ──(user done)──▶ thinking ──(first sentence)──▶ speaking
 *   ▲                      ▲  │HEARD: 끄덕임                    EMOTION: 다음 답의 표정 예약   │SPEECH: 입
 *   └──(paused/error/end)──┘  └─────────────────────(답을 다 읽음)◀────────────────────────────┘
 */
export type AvatarMode = 'idle' | 'listening' | 'thinking' | 'speaking';
export type Emotion = 'neutral' | 'happy' | 'comforting';
export type ConversationPhase = 'idle' | 'preparing' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';

export interface AvatarState {
  mode: AvatarMode;
  emotion: Emotion;        // 지금 얼굴에 나타나는 표정
  nextEmotion: Emotion;    // 다음 말하기에 쓸 표정 (서버가 미리 알려 줌)
  speaking: boolean;       // 음성합성이 실제로 소리를 내는 중인지
  heardAt: number;         // 마지막으로 어르신 말을 들은 시각 (끄덕임)
  wordAt: number;          // 마지막 단어 경계 시각 (입 강조)
}

export type AvatarEvent =
  | { type: 'PHASE'; phase: ConversationPhase }
  | { type: 'EMOTION'; emotion: Emotion }
  | { type: 'HEARD'; at: number }
  | { type: 'SPEECH'; kind: 'start' | 'word' | 'end'; at: number };

export const initialAvatarState: AvatarState = { mode: 'idle', emotion: 'neutral', nextEmotion: 'neutral', speaking: false, heardAt: 0, wordAt: 0 };

const MODE_OF: Record<ConversationPhase, AvatarMode> = {
  idle: 'idle', preparing: 'idle', paused: 'idle', error: 'idle',
  listening: 'listening', thinking: 'thinking', speaking: 'speaking',
};

export function avatarReducer(s: AvatarState, e: AvatarEvent): AvatarState {
  switch (e.type) {
    case 'PHASE': {
      const mode = MODE_OF[e.phase];
      if (mode === 'speaking') return { ...s, mode, emotion: s.nextEmotion };              // 말하기 시작 → 예약된 표정
      if (mode === 'thinking') return { ...s, mode, emotion: 'neutral', nextEmotion: 'neutral', speaking: false }; // 새 답 준비 → 중립
      if (mode === 'listening') return { ...s, mode, speaking: false };                    // 들을 때는 직전 표정을 부드럽게 유지
      return { ...s, mode, speaking: false, emotion: e.phase === 'error' ? 'neutral' : s.emotion };
    }
    case 'EMOTION':
      // 이미 말하는 중에 도착하면 바로 반영, 아니면 다음 말하기에 사용
      return s.mode === 'speaking' ? { ...s, emotion: e.emotion, nextEmotion: e.emotion } : { ...s, nextEmotion: e.emotion };
    case 'HEARD':
      return s.mode === 'listening' ? { ...s, heardAt: e.at } : s;
    case 'SPEECH':
      if (e.kind === 'start') return { ...s, speaking: true, wordAt: e.at };
      if (e.kind === 'word') return { ...s, wordAt: e.at };
      return { ...s, speaking: false };
  }
}
