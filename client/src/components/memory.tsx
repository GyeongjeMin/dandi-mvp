import { useEffect, useState, type ReactNode } from 'react';
import type { Memory, MemoryCategory } from '../lib/api';
import { formatDate } from '../lib/format';
import { Button, Chip, Modal, Toggle } from './ui';

export const CATEGORY_META: Record<MemoryCategory, { label: string; icon: string; bg: string; text: string; bar: string }> = {
  work: { label: '과거 직업 및 활동', icon: '🧺', bg: 'bg-peach-50', text: 'text-peach-700', bar: 'bg-peach-500' },
  hobby: { label: '취미 및 관심사', icon: '🌱', bg: 'bg-leaf-50', text: 'text-leaf-700', bar: 'bg-leaf-500' },
  place: { label: '고향 및 거주 경험', icon: '🏡', bg: 'bg-amber-50', text: 'text-amber-800', bar: 'bg-amber-500' },
  family: { label: '가족과의 추억', icon: '💛', bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-400' },
  life_event: { label: '인상 깊었던 생애경험', icon: '✨', bg: 'bg-sky-50', text: 'text-sky-800', bar: 'bg-sky-500' },
  daily: { label: '최근 관심사 및 일상', icon: '☕', bg: 'bg-cream-200', text: 'text-ink-soft', bar: 'bg-otter-300' },
};
export const CATEGORY_ORDER: MemoryCategory[] = ['work', 'hobby', 'place', 'family', 'life_event', 'daily'];

export function SourceBadge({ m }: { m: Pick<Memory, 'source' | 'status'> }) {
  if (m.source === 'inferred') return <Chip tone="peach">🤔 단디의 짐작 · 확인 필요</Chip>;
  if (m.source === 'manual') return <Chip tone="cream">✍️ 직접 적은 기억</Chip>;
  return <Chip tone="leaf">🗣️ 직접 말씀하신 내용</Chip>;
}

export function MemoryCard({ m, actions, footer }: { m: Memory; actions?: ReactNode; footer?: ReactNode }) {
  const meta = CATEGORY_META[m.category];
  return (
    <article className="dandi-in relative overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-soft">
      <div className={`absolute inset-y-0 left-0 w-2 ${meta.bar}`} aria-hidden />
      <div className="p-5 pl-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-sm font-bold ${meta.bg} ${meta.text}`}>
            <span aria-hidden>{meta.icon}</span> {meta.label}
          </span>
          {m.status === 'pending' && <Chip tone="peach">확인 대기</Chip>}
          {m.category === 'family' && <Chip tone="cream">🔒 친구 추천에 안 씀</Chip>}
          {m.category !== 'family' && !m.useForMatching && <Chip tone="cream">🔒 추천 제외</Chip>}
          {m.shareFamily && <Chip tone="leaf">👪 가족과 공유 중</Chip>}
        </div>
        <h3 className="mt-2 text-xl font-extrabold">{m.title}</h3>
        {m.detail && <p className="mt-1 text-lg text-ink-soft">{m.detail}</p>}
        {m.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.tags.map((t) => <span key={t} className="rounded-lg bg-cream-100 px-2 py-0.5 text-sm font-semibold text-ink-soft">#{t}</span>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-faint">
          <SourceBadge m={m} />
          <span>
            {formatDate(m.createdAt, true)} ·{' '}
            {m.conversationId ? (
              <a className="underline decoration-dotted underline-offset-4 hover:text-leaf-700" href={`#/chat?c=${m.conversationId}`}>
                {m.conversationTitle ?? '대화'}에서
              </a>
            ) : m.source === 'manual' ? '직접 추가' : `${m.conversationTitle ?? '대화'}에서 (대화 기록 삭제됨)`}
          </span>
        </div>
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        {footer}
      </div>
    </article>
  );
}

export interface MemoryDraft {
  category: MemoryCategory;
  title: string;
  detail: string;
  tags: string[];
  useForMatching: boolean;
}

export function MemoryEditor({ open, initial, onClose, onSave, saving, heading }: {
  open: boolean; initial: MemoryDraft | null; onClose: () => void;
  onSave: (d: MemoryDraft & { tagsTouched: boolean }) => void; saving?: boolean; heading: string;
}) {
  const [d, setD] = useState<MemoryDraft | null>(initial);
  const [tagText, setTagText] = useState('');
  const [tagsTouched, setTagsTouched] = useState(false);
  useEffect(() => {
    setD(initial);
    setTagText(initial?.tags.join(', ') ?? '');
    setTagsTouched(false);
  }, [initial, open]);
  if (!d) return null;
  const tags = tagText.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  return (
    <Modal open={open} onClose={onClose} title={heading}
      footer={<>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button disabled={!d.title.trim() || saving} onClick={() => onSave({ ...d, tags, tagsTouched })}>{saving ? '저장 중…' : '저장하기'}</Button>
      </>}>
      <div className="space-y-4">
        <div>
          <span className="mb-2 block text-lg font-bold">어떤 기억인가요?</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CATEGORY_ORDER.map((c) => (
              <button key={c} type="button" onClick={() => setD({ ...d, category: c })}
                className={`flex min-h-12 items-center gap-2 rounded-2xl border-2 px-3 text-left text-base font-bold ${d.category === c ? 'border-leaf-500 bg-leaf-50' : 'border-cream-200 bg-white'}`}
                aria-pressed={d.category === c}>
                <span aria-hidden>{CATEGORY_META[c].icon}</span>{CATEGORY_META[c].label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">제목</span>
          <input className="w-full rounded-2xl border-2 border-cream-300 bg-white px-4 py-3 text-lg" value={d.title} maxLength={40}
            onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="예: 식당 운영" />
        </label>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">내용</span>
          <textarea className="w-full rounded-2xl border-2 border-cream-300 bg-white px-4 py-3 text-lg" rows={3} value={d.detail} maxLength={300}
            onChange={(e) => setD({ ...d, detail: e.target.value })} placeholder="예: 젊었을 때 진주에서 작은 식당을 했어요" />
        </label>
        <label className="block">
          <span className="mb-1 block text-lg font-bold">이야기 꼬리표 <span className="text-base font-normal text-ink-soft">(쉼표로 구분)</span></span>
          <input className="w-full rounded-2xl border-2 border-cream-300 bg-white px-4 py-3 text-lg" value={tagText}
            onChange={(e) => { setTagText(e.target.value); setTagsTouched(true); }} placeholder="예: 식당 운영, 진주" />
          <span className="mt-1 block text-sm text-ink-soft">비워 두거나 그대로 두면 단디가 제목과 내용을 보고 다시 정리해요. 꼬리표는 친구 추천에 쓰여요.</span>
        </label>
        <Toggle
          checked={d.category === 'family' ? false : d.useForMatching}
          disabled={d.category === 'family'}
          onChange={(v) => setD({ ...d, useForMatching: v })}
          label="친구 추천에 이 기억 쓰기"
          description={d.category === 'family' ? '가족 이야기는 친구 추천에 절대 쓰지 않아요.' : '끄면 이 기억은 단디와의 대화에만 쓰여요.'}
        />
      </div>
    </Modal>
  );
}

export function ConfirmModal({ open, title, body, confirmLabel, onConfirm, onClose, danger }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="secondary" onClick={onClose}>아니요</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <div className="text-lg">{body}</div>
    </Modal>
  );
}
