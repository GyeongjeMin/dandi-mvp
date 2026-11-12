import { useCallback, useEffect, useState } from 'react';
import { Button, Card, PageTitle, Spinner, Toggle } from '../components/ui';
import { ConfirmModal } from '../components/memory';
import { api, type FamilyMember, type Prefs, type Reminder } from '../lib/api';
import { formatDate } from '../lib/format';
import { useApp } from '../lib/store';

interface CareData { invite: { code: string; expiresAt: string } | null; members: FamilyMember[]; prefs: Prefs }

/** 어르신 쪽 '가족 연결과 알림' — 누구와 무엇을 나눌지 어르신이 직접 정합니다. */
export default function CareSettings() {
  const { toast } = useApp();
  const [data, setData] = useState<CareData | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [form, setForm] = useState({ kind: 'medication' as Reminder['kind'], label: '', time: '09:00' });

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api<CareData>('/care'), api<{ reminders: Reminder[] }>('/reminders')]);
      setData(c);
      setReminders(r.reminders);
    } catch (e) { toast((e as Error).message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const setShare = async (patch: Partial<Prefs>, msg: string) => {
    try { await api('/prefs', { method: 'PATCH', body: patch }); toast(msg); load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const makeInvite = async () => {
    try { await api('/care/invite', { method: 'POST' }); load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const cancelInvite = async () => {
    try { await api('/care/invite', { method: 'DELETE' }); load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await api(`/care/members/${removing.id}`, { method: 'DELETE' }); toast(`${removing.label} 님과 연결을 끊었어요`); setRemoving(null); load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const toggleReminder = async (r: Reminder) => {
    try { await api(`/reminders/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }); load(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const addReminder = async () => {
    try {
      await api('/reminders', { method: 'POST', body: form });
      toast('알림을 만들었어요');
      setForm({ ...form, label: '' });
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (!data) return <Spinner />;
  const familyUrl = `${location.origin}${location.pathname}#/family`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle title="가족 연결과 알림" subtitle="가족과 무엇을 나눌지 직접 정하실 수 있어요. 대화 내용은 가족에게 보내지 않아요." />

      <Card className="space-y-3">
        <h2 className="text-xl font-extrabold">가족에게 보여 줄 것</h2>
        <Toggle checked={data.prefs.shareActivity} onChange={(v) => setShare({ shareActivity: v }, v ? '이용 현황을 가족과 나눠요' : '이용 현황 공유를 껐어요')}
          label="단디와 이야기한 날짜·횟수·시간"
          description="가족이 ‘오늘도 단디와 이야기하셨구나’ 하고 안심할 수 있어요. 무슨 말을 했는지는 보이지 않아요." />
        <Toggle checked={data.prefs.shareTopics} onChange={(v) => setShare({ shareTopics: v }, v ? '대화 주제를 가족과 나눠요' : '대화 주제 공유를 껐어요')}
          label="주로 이야기한 관심사 이름"
          description="예: ‘텃밭 가꾸기’, ‘등산’처럼 관심사 이름만 보여요. 대화 문장과 가족 이야기는 보내지 않아요." />
        <p className="rounded-2xl bg-cream-100 p-4 text-base text-ink-soft">
          📒 추억은 ‘나의 추억’에서 하나씩 <b>[가족과 공유]</b>를 눌러야 가족이 볼 수 있어요. 가족은 공유된 추억에 댓글이나 질문을 남길 수 있고, 질문은 단디가 다음 대화에서 대신 여쭤봐요.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl font-extrabold">가족 초대하기</h2>
        {data.invite ? (
          <div className="rounded-3xl bg-leaf-50 p-5 text-center">
            <p className="text-lg font-bold text-leaf-700">가족에게 이 숫자를 알려 주세요</p>
            <p className="my-2 font-mono text-5xl font-black tracking-[0.3em]" aria-label={`초대 코드 ${data.invite.code.split('').join(' ')}`}>{data.invite.code}</p>
            <p className="text-base text-ink-soft">{formatDate(data.invite.expiresAt, true)}까지 쓸 수 있어요</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={makeInvite}>새 숫자 받기</Button>
              <Button size="sm" variant="ghost" onClick={cancelInvite}>초대 그만하기</Button>
            </div>
          </div>
        ) : (
          <Button onClick={makeInvite}>초대 숫자 만들기</Button>
        )}
        <div className="text-base text-ink-soft">
          <p className="font-bold text-ink">가족은 이렇게 연결해요</p>
          <ol className="mt-1 list-decimal space-y-1 pl-6">
            <li>가족의 휴대폰이나 컴퓨터에서 가족용 화면을 열어요: <span className="break-all font-mono text-ink">{familyUrl}</span></li>
            <li>위의 6자리 숫자와 이름, 관계를 적으면 연결돼요.</li>
          </ol>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl font-extrabold">연결된 가족</h2>
        {data.members.length === 0 ? <p className="text-lg text-ink-soft">아직 연결된 가족이 없어요.</p> : (
          <ul className="space-y-2">
            {data.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-cream-200 bg-white p-4">
                <span aria-hidden className="text-2xl">👤</span>
                <div className="flex-1">
                  <p className="text-lg font-bold">{m.label}</p>
                  <p className="text-sm text-ink-faint">{formatDate(m.createdAt)} 연결{m.lastSeenAt ? ` · 최근 접속 ${formatDate(m.lastSeenAt, true)}` : ''}</p>
                </div>
                <Button size="sm" variant="danger" onClick={() => setRemoving(m)}>연결 끊기</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl font-extrabold">복약·생활 알림</h2>
        <p className="text-base text-ink-soft">단디 화면이 열려 있을 때 첫 화면과 단디의 인사로 알려 드려요. 휴대폰 푸시 알림이나 문자는 아직 보내지 않아요.</p>
        {reminders.length === 0 ? <p className="text-lg text-ink-soft">등록된 알림이 없어요.</p> : (
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${r.enabled ? 'border-cream-200 bg-white' : 'border-cream-200 bg-cream-100 opacity-70'}`}>
                <span aria-hidden className="text-2xl">{r.kind === 'medication' ? '💊' : '⏰'}</span>
                <div className="flex-1">
                  <p className="text-lg font-bold">{r.timeLabel} · {r.label}</p>
                  <p className="text-sm text-ink-faint">{r.createdBy === 'family' ? '가족이 만든 알림' : '직접 만든 알림'}{r.checkedToday ? ' · 오늘 확인함' : ''}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => toggleReminder(r)}>{r.enabled ? '끄기' : '켜기'}</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 rounded-2xl bg-cream-100 p-4 sm:grid-cols-[auto_1fr_auto_auto]">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Reminder['kind'] })} className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-2 text-lg" aria-label="알림 종류">
            <option value="medication">💊 약</option>
            <option value="life">⏰ 생활</option>
          </select>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={30} placeholder="예: 혈압약, 산책" aria-label="알림 내용"
            className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-3 text-lg" />
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} aria-label="알림 시간"
            className="min-h-12 rounded-xl border-2 border-cream-300 bg-white px-2 text-lg" />
          <Button size="sm" disabled={!form.label.trim()} onClick={addReminder}>추가</Button>
        </div>
      </Card>

      <ConfirmModal open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} danger
        title="연결을 끊을까요?" confirmLabel="연결 끊기"
        body={<p>{removing?.label} 님은 더 이상 가족 화면을 볼 수 없어요. 이미 보낸 소식은 남아 있어요. 다시 연결하려면 새 초대 숫자가 필요해요.</p>} />
    </div>
  );
}
