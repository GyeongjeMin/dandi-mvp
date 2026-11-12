import { useCallback, useEffect, useState } from 'react';
import Character from '../components/Character';
import { Button, Card, Chip, DemoBanner, Modal, PageTitle, Spinner } from '../components/ui';
import { api, type Connection, type Recommendation, type RecommendationResponse, type User } from '../lib/api';
import { navigate } from '../lib/router';
import { useApp } from '../lib/store';

const DIM_TONE: Record<string, string> = { hobby: 'bg-leaf-500', work: 'bg-peach-500', interest: 'bg-amber-500', experience: 'bg-sky-500', region: 'bg-rose-400' };
const MY_TAG_LABEL: Record<string, string> = { work: '직업 경험', hobby: '취미', interest: '관심사', experience: '경험·지역' };

export default function Friends() {
  const { user, setUser, toast } = useApp();
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [proposing, setProposing] = useState<Recommendation | null>(null);
  const [howOpen, setHowOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api<RecommendationResponse>('/recommendations'),
        api<{ connections: Connection[] }>('/connections'),
      ]);
      setData(r);
      setConnections(c.connections);
    } catch (e) { toast((e as Error).message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const agree = async () => {
    try {
      const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { consentMatching: true } });
      setUser(r.user);
      toast('친구 추천을 켰어요');
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  if (!data) return <Spinner label="비슷한 분을 찾고 있어요…" />;

  if (data.consentRequired) {
    return (
      <div>
        <PageTitle title="동네 친구 찾기" />
        <Card className="mx-auto max-w-2xl text-center">
          <Character size={110} className="mx-auto" />
          <h2 className="mt-3 text-2xl font-black">친구 추천을 쓰려면 동의가 필요해요</h2>
          <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-lg">
            <li>✔︎ 확인된 추억 중 <b>직업·취미·관심사·경험</b>만 비교해요.</li>
            <li>✔︎ 지역은 <b>공개를 고른 범위</b>(시·도 또는 시·군·구)까지만 써요.</li>
            <li>✔︎ <b>가족 이야기, 연락처, 상세 주소</b>는 절대 쓰지도 보여 주지도 않아요.</li>
            <li>✔︎ 상대방도 동의해야만 연결돼요.</li>
          </ul>
          <Button size="lg" className="mt-6" onClick={agree}>동의하고 친구 찾기</Button>
          <p className="mt-3 text-base text-ink-soft">‘내 정보’에서 언제든 끌 수 있어요.</p>
        </Card>
      </div>
    );
  }

  const my = data.myTags!;
  const hasTags = Object.values(my).some((v) => v.length);
  const connOf = (id: number) => connections.find((c) => c.target?.id === id && (c.status === 'pending' || c.status === 'accepted'));
  const ch = data.changes;
  const changed = ch && (ch.addedTags.length || ch.removedTags.length);

  return (
    <div>
      <PageTitle title="동네 친구 찾기" subtitle="단디와 나눈 이야기에서 찾은 공통점으로 비슷한 분을 소개해 드려요."
        action={<Button variant="secondary" onClick={() => navigate('/connections')}>내 교류 제안 보기</Button>} />

      <div className="mb-5">
        <DemoBanner>
          <b>시연 모드</b> · 추천되는 분들은 평가 시연을 위한 <b>가상의 어르신 8명</b>이에요. 추천 점수와 이유는 {user?.nickname}님의 실제 저장된 추억으로 그때그때 계산해요.
        </DemoBanner>
      </div>

      {/* 내 추천 정보 */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">추천에 쓰이는 {user?.nickname}님의 정보</h2>
          <button className="text-base font-bold text-leaf-700 underline" onClick={() => setHowOpen(true)}>추천은 어떻게 계산하나요?</button>
        </div>
        {hasTags ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(Object.keys(MY_TAG_LABEL) as Array<keyof typeof my>).map((k) => (
              <div key={k}>
                <p className="text-sm font-bold text-ink-soft">{MY_TAG_LABEL[k]}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {my[k].length ? my[k].map((t) => <Chip key={t} tone={ch?.addedTags.includes(t) ? 'peach' : 'leaf'}>{t}{ch?.addedTags.includes(t) ? ' · 새로' : ''}</Chip>) : <span className="text-base text-ink-faint">아직 없음</span>}
                </div>
              </div>
            ))}
            <div>
              <p className="text-sm font-bold text-ink-soft">공개 지역</p>
              <p className="mt-1 text-base">{user?.regionShare === 'none' ? '공개 안 함' : user?.regionShare === 'province' ? user?.regionProvince : `${user?.regionProvince} ${user?.regionCity}`}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-lg text-ink-soft">아직 확인된 추억이 없어요. 단디에게 젊을 때 하신 일이나 요즘 즐기시는 취미를 들려주세요.</p>
        )}
        <p className="mt-3 text-sm text-ink-faint">‘나의 추억’에서 확인한 기억만 쓰여요. 가족 이야기와 ‘추천 제외’로 정한 기억은 쓰지 않아요.</p>
      </Card>

      {changed ? (
        <div className="dandi-in mb-5 rounded-3xl border-2 border-peach-200 bg-peach-50 p-5">
          <p className="text-lg font-extrabold text-peach-700">✨ 대화로 새로 알게 된 내용이 추천에 반영됐어요</p>
          <p className="mt-1 text-lg">
            {ch!.addedTags.length > 0 && <>새로 반영: <b>{ch!.addedTags.join(', ')}</b> </>}
            {ch!.removedTags.length > 0 && <>· 빠진 정보: <b>{ch!.removedTags.join(', ')}</b></>}
          </p>
          {ch!.droppedUsers.length > 0 && <p className="text-base text-ink-soft">공통점이 없어져 추천에서 빠진 분: {ch!.droppedUsers.join(', ')}</p>}
        </div>
      ) : null}

      {data.recommendations.length === 0 ? (
        <Card className="flex flex-col items-center py-10 text-center">
          <Character size={90} mood="think" />
          <p className="mt-3 text-xl font-bold">아직 공통점이 있는 분을 찾지 못했어요</p>
          <p className="mt-1 text-lg text-ink-soft">단디와 이야기를 더 나누시면 비슷한 분을 찾아 드릴게요.</p>
          <Button className="mt-4" onClick={() => navigate('/chat')}>단디와 이야기하기</Button>
        </Card>
      ) : (
        <div className="space-y-5">
          {data.recommendations.map((r) => (
            <RecCard key={r.user.id} r={r} conn={connOf(r.user.id)} onPropose={() => setProposing(r)} />
          ))}
        </div>
      )}

      <ProposeModal rec={proposing} onClose={() => setProposing(null)} onDone={() => { setProposing(null); load(); }} />

      <Modal open={howOpen} onClose={() => setHowOpen(false)} title="추천은 이렇게 계산해요" footer={<Button onClick={() => setHowOpen(false)}>알겠어요</Button>}>
        <div className="space-y-3 text-lg">
          <p>① 단디가 대화에서 직업·취미·관심사·경험을 찾아 <b>꼬리표</b>로 정리해요. (확인하신 것만)</p>
          <p>② 다른 분의 꼬리표와 항목별로 비교해요. 똑같으면 1점, 비슷한 계열이면(예: 식당 운영 ↔ 반찬가게 = ‘음식 관련 일’) 0.5점이에요.</p>
          <p>③ 항목별 중요도를 곱해 100점 만점으로 바꿔요.</p>
          <div className="space-y-1 rounded-2xl bg-white p-4 text-base">
            {Object.entries(data.weights ?? {}).map(([k, w]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-24 font-bold">{({ hobby: '취미', work: '직업 경험', interest: '관심사', experience: '경험·지역', region: '사는 지역' } as Record<string, string>)[k]}</span>
                <span className={`h-3 rounded-full ${DIM_TONE[k]}`} style={{ width: `${w * 300}px` }} />
                <span>{Math.round(w * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="text-base text-ink-soft">대화로 알게 된 공통점이 하나도 없으면 사는 곳만 같아도 추천하지 않아요. 추천 이유 문장도 실제 겹친 꼬리표로만 만들어요.</p>
        </div>
      </Modal>
    </div>
  );
}

function RecCard({ r, conn, onPropose }: { r: Recommendation; conn?: Connection; onPropose: () => void }) {
  const [open, setOpen] = useState(false);
  const commonTags = new Set([...r.common.exact.map((e) => e.tag), ...r.common.related.map((x) => x.theirs)]);
  const delta = r.delta;
  return (
    <article className="dandi-in overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-soft">
      <div className="flex flex-wrap items-start gap-4 p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-peach-100 to-leaf-100 text-2xl font-black text-ink">
          {r.user.nickname.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-ink px-2 py-0.5 text-sm font-black text-white">{r.rank}위</span>
            <h3 className="text-2xl font-black">{r.user.nickname}님</h3>
            <Chip tone="peach">가상 이용자</Chip>
            {delta && delta.status !== 'same' && (
              <Chip tone={delta.status === 'down' ? 'cream' : 'leaf'}>
                {delta.status === 'new' ? '새로 추천' : delta.status === 'up' ? `▲ ${delta.previousRank}위에서 올라옴` : `▼ ${delta.previousRank}위에서 내려감`}
              </Chip>
            )}
          </div>
          <p className="text-lg text-ink-soft">{r.user.ageBand} · {r.user.region}</p>
          <p className="mt-1 text-base text-ink-soft">“{r.user.intro}”</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-ink-soft">잘 맞는 정도</p>
          <p className="text-3xl font-black text-leaf-700">{r.score}<span className="text-base">점</span></p>
        </div>
      </div>

      <div className="space-y-4 border-t border-cream-200 bg-cream-50 p-5">
        <div className="rounded-2xl bg-leaf-50 p-4">
          <p className="text-sm font-bold text-leaf-700">💡 단디가 추천하는 이유</p>
          <p className="mt-1 text-lg font-semibold leading-relaxed">{r.reason}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-bold text-ink-soft">취미 및 관심사</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {[...r.user.hobbies, ...r.user.interests].map((t) => <Chip key={t} tone={commonTags.has(t) ? 'leaf' : 'cream'}>{commonTags.has(t) ? '✔︎ ' : ''}{t}</Chip>)}
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-ink-soft">공통된 생애경험</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {r.commonExperiences.length ? r.commonExperiences.map((t) => <Chip key={t} tone="peach">{t}</Chip>) : <span className="text-base text-ink-faint">취미·관심사가 비슷해요</span>}
            </div>
          </div>
        </div>
        <button className="text-base font-bold text-ink-soft underline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '점수 자세히 접기' : '점수 자세히 보기'}
        </button>
        {open && (
          <div className="space-y-2 rounded-2xl bg-white p-4">
            {r.breakdown.map((b) => (
              <div key={b.dimension} className="flex items-center gap-3 text-base">
                <span className="w-20 shrink-0 font-bold">{b.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-cream-200">
                  <div className={`h-full ${DIM_TONE[b.dimension]}`} style={{ width: `${b.similarity * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-ink-soft">{b.active ? `+${b.points}점` : '내 정보 없음'}</span>
              </div>
            ))}
          </div>
        )}
        {conn ? (
          <a href="#/connections" className={`flex min-h-14 items-center justify-center rounded-2xl text-lg font-bold ${conn.status === 'accepted' ? 'bg-leaf-100 text-leaf-700' : 'bg-peach-50 text-peach-700'}`}>
            {conn.status === 'accepted' ? '🤝 연결된 분이에요 · 교류 보기' : '⏳ 교류 제안을 보냈어요 · 답을 기다리는 중'}
          </a>
        ) : (
          <Button variant="peach" size="lg" className="w-full" onClick={onPropose}>🤝 {r.user.nickname}님께 교류 제안하기</Button>
        )}
      </div>
    </article>
  );
}

const PRESETS = [
  '안녕하세요! 비슷한 이야기가 많을 것 같아 인사드려요.',
  '같은 취미를 가지셨다고 해서 반가워요. 이야기 나눠요.',
  '예전 일 이야기를 함께 나누고 싶어요.',
];

function ProposeModal({ rec, onClose, onDone }: { rec: Recommendation | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [msg, setMsg] = useState(PRESETS[0]);
  const [sending, setSending] = useState(false);
  if (!rec) return null;
  const send = async () => {
    setSending(true);
    try {
      await api('/connections', { method: 'POST', body: { toUserId: rec.user.id, message: msg } });
      toast(`${rec.user.nickname}님께 교류 제안을 남겼어요 (시연)`);
      onDone();
      navigate('/connections');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSending(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${rec.user.nickname}님께 교류 제안하기`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button variant="peach" onClick={send} disabled={sending}>{sending ? '보내는 중…' : '제안 보내기'}</Button>
      </>}>
      <DemoBanner>
        <b>시연 모드예요.</b> {rec.user.nickname}님은 가상의 이용자라 실제 사람에게 메시지가 가지 않아요. 상대방의 수락·거절은 다음 화면의 <b>시연용 버튼</b>으로 보여 드려요.
      </DemoBanner>
      <p className="mb-2 mt-4 text-lg font-bold">함께 보낼 인사말</p>
      <div className="space-y-2">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setMsg(p)} aria-pressed={msg === p}
            className={`w-full rounded-2xl border-2 p-3 text-left text-lg ${msg === p ? 'border-peach-500 bg-peach-50' : 'border-cream-200 bg-white'}`}>
            {p}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-1 text-base text-ink-soft">
        <li>🔒 내 연락처와 상세 주소는 공개되지 않아요.</li>
        <li>🔒 가족 이야기 등 나의 추억 내용은 전달되지 않아요.</li>
        <li>🤝 상대방이 수락해야만 연결돼요.</li>
      </ul>
    </Modal>
  );
}
