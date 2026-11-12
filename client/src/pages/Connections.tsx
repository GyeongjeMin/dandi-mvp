import { useCallback, useEffect, useState } from 'react';
import { Button, Card, DemoBanner, PageTitle, Spinner } from '../components/ui';
import { api, type Connection } from '../lib/api';
import { formatDate } from '../lib/format';
import { navigate } from '../lib/router';
import { useApp } from '../lib/store';

const STATUS: Record<Connection['status'], { label: string; tone: string }> = {
  pending: { label: '답을 기다리는 중', tone: 'bg-peach-100 text-peach-700' },
  accepted: { label: '연결 완료', tone: 'bg-leaf-100 text-leaf-700' },
  declined: { label: '이번에는 어렵대요', tone: 'bg-cream-200 text-ink-soft' },
  cancelled: { label: '제안 취소함', tone: 'bg-cream-200 text-ink-soft' },
};

export default function Connections() {
  const { toast } = useApp();
  const [list, setList] = useState<Connection[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => api<{ connections: Connection[] }>('/connections').then((r) => setList(r.connections)).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const act = async (c: Connection, path: string, body: unknown, msg: string) => {
    setBusy(c.id);
    try {
      await api(`/connections/${c.id}/${path}`, { method: 'POST', body });
      toast(msg);
      load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };

  if (!list) return <Spinner />;

  return (
    <div>
      <PageTitle title="교류 연결" subtitle="추천받은 분께 보낸 교류 제안과 연결 상태예요." />
      <div className="mb-5">
        <DemoBanner>
          <b>시연 모드</b> · 상대방은 가상의 이용자예요. 실제 사람에게 메시지가 전달되지 않아요.
          상대방의 수락·거절은 저절로 되지 않고, 아래 <b>‘시연용 상대방 응답’</b> 버튼을 눌러야만 바뀌어요.
        </DemoBanner>
      </div>

      {list.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-xl font-bold">아직 보낸 교류 제안이 없어요</p>
          <p className="mt-1 text-lg text-ink-soft">동네 친구 찾기에서 마음에 드는 분께 인사를 건네 보세요.</p>
          <Button className="mt-4" variant="peach" onClick={() => navigate('/friends')}>동네 친구 찾기</Button>
        </Card>
      ) : (
        <div className="space-y-5">
          {list.map((c) => {
            const step = c.status === 'pending' ? 2 : c.status === 'accepted' ? 3 : 2;
            return (
              <Card key={c.id} className="dandi-in">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-peach-100 to-leaf-100 text-xl font-black">{c.target?.nickname.slice(0, 1)}</div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-black">{c.target?.nickname}님</h2>
                    <p className="text-base text-ink-soft">{c.target?.ageBand} · {c.target?.region}</p>
                  </div>
                  <span className={`rounded-full px-4 py-1.5 text-base font-extrabold ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
                </div>

                {/* 진행 단계 */}
                <ol className="mt-5 grid grid-cols-3 gap-2 text-center text-sm font-bold">
                  {['제안 보냄', '상대방 확인', '양쪽 동의 · 연결'].map((s, i) => {
                    const done = i + 1 < step || (c.status === 'accepted' && i + 1 <= 3);
                    const now = i + 1 === step && c.status === 'pending';
                    const failed = i === 2 && (c.status === 'declined' || c.status === 'cancelled');
                    return (
                      <li key={s} className={`rounded-xl px-2 py-2 ${failed ? 'bg-cream-200 text-ink-faint line-through' : done ? 'bg-leaf-600 text-white' : now ? 'bg-peach-100 text-peach-700' : 'bg-cream-100 text-ink-faint'}`}>
                        {i + 1}. {s}
                      </li>
                    );
                  })}
                </ol>

                <p className="mt-4 rounded-2xl bg-cream-100 p-3 text-lg">💌 “{c.message}”</p>
                <p className="mt-2 text-sm text-ink-faint">{formatDate(c.createdAt, true)} 제안{c.respondedAt ? ` · ${formatDate(c.respondedAt, true)} 응답` : ''}</p>

                {c.status === 'pending' && (
                  <div className="mt-4 rounded-2xl border-2 border-dashed border-peach-200 bg-peach-50 p-4">
                    <p className="text-base font-extrabold text-peach-700">🎬 시연용 상대방 응답 (평가 시연을 위한 버튼이에요)</p>
                    <p className="text-sm text-ink-soft">실제 서비스에서는 {c.target?.nickname}님이 본인 단디에서 직접 수락하거나 거절해요.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy === c.id} onClick={() => act(c, 'demo-respond', { decision: 'accepted' }, `${c.target?.nickname}님이 수락했어요 (시연)`)}>{c.target?.nickname}님으로 ‘수락’</Button>
                      <Button size="sm" variant="secondary" disabled={busy === c.id} onClick={() => act(c, 'demo-respond', { decision: 'declined' }, `${c.target?.nickname}님이 거절했어요 (시연)`)}>{c.target?.nickname}님으로 ‘거절’</Button>
                      <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => act(c, 'cancel', {}, '제안을 취소했어요')}>내 제안 취소</Button>
                    </div>
                  </div>
                )}
                {c.status === 'accepted' && (
                  <div className="mt-4 rounded-2xl bg-leaf-50 p-4 text-lg">
                    <p className="font-extrabold text-leaf-700">🎉 두 분 모두 동의해서 연결되었어요!</p>
                    <p className="mt-1 text-base text-ink-soft">연락처는 서로 공개되지 않아요. 실제 서비스에서는 다음 방법으로 이어 드릴 예정이에요:</p>
                    <ul className="mt-2 grid gap-2 text-base sm:grid-cols-3">
                      <li className="rounded-xl bg-white p-3">📞 단디를 통한 안심 전화 연결</li>
                      <li className="rounded-xl bg-white p-3">👪 보호자·복지관 확인 후 만남 주선</li>
                      <li className="rounded-xl bg-white p-3">🏘️ 지역 모임·커뮤니티 연계</li>
                    </ul>
                  </div>
                )}
                {c.status === 'declined' && (
                  <p className="mt-4 rounded-2xl bg-cream-100 p-4 text-lg text-ink-soft">괜찮아요. 마음이 맞는 다른 분도 기다리고 있어요. <a href="#/friends" className="font-bold text-leaf-700 underline">다른 분 보기</a></p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
