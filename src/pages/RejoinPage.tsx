import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Btn, Loading, TeamBadge, cx } from '../components/ui';
import { cancelRejoin, requestRejoin } from '../lib/api';
import { isOnline, useAuthUid, useMember, useMyRejoinRequest, usePlayers, useRoom, useServerNow } from '../lib/hooks';
import { DEFAULT_TEAM_NAMES } from '../config/brand';
import { Note, PhoneShell } from '../views/Phone';
import { Fatal, safeSet } from './JoinPage';

export default function RejoinPage() {
  const { roomId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const navigate = useNavigate();
  const { uid, error: authError } = useAuthUid();
  const room = useRoom(roomId, !!uid);
  const players = usePlayers(roomId, !!uid);
  const member = useMember(roomId, uid);
  const req = useMyRejoinRequest(roomId, uid);
  const now = useServerNow(2000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Already a member on this browser (e.g. approved): go play as that player.
  useEffect(() => {
    if (member.data && !member.data.revoked) {
      safeSet('hirer.lastRoom', roomId);
      navigate(`/play/${roomId}`, { replace: true, state: { welcomeBack: req.data?.status === 'approved' } });
    }
  }, [member.data, req.data?.status, roomId, navigate]);

  const list = useMemo(
    () =>
      [...players.data].sort((a, b) => {
        const ao = isOnline(a, now) ? 1 : 0;
        const bo = isOnline(b, now) ? 1 : 0;
        return ao - bo || a.nickname.localeCompare(b.nickname);
      }),
    [players.data, now],
  );

  if (authError) return <Fatal msg={`Could not sign in: ${authError}`} />;
  if (!uid || room.loading || req.loading) return <Loading />;
  if (!room.data) return <Fatal msg="No office with that code." />;

  const r = room.data;
  const teamNames = r.teamNames ?? DEFAULT_TEAM_NAMES;
  const windowOpen = r.rejoinOpen && (r.rejoinExpiresAt?.toMillis() ?? 0) > now && r.rejoinToken === token;
  const pending = req.data?.status === 'pending';
  const denied = req.data?.status === 'denied';
  const pendingName = players.data.find((p) => p.id === req.data?.playerId)?.nickname;

  if (pending) {
    return (
      <PhoneShell>
        <Note>Waiting for HR to confirm it's really you...</Note>
        <p className="text-center text-lg">
          You asked to be <b>{pendingName}</b>. Show your face to the teacher.
        </p>
        <Btn variant="paper" onClick={() => cancelRejoin(roomId, uid).catch(() => {})}>
          That's not me, go back
        </Btn>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <h1 className="rounded-lg bg-paper px-3 py-2 text-center font-serif text-2xl font-black shadow">Lost your seat? Pick your name.</h1>
      {denied && <Note className="text-rejected">HR said no. Ask your teacher, then try again.</Note>}
      {!windowOpen && <Note>The rejoin window is closed. Ask your teacher to show the rejoin QR again.</Note>}
      {error && <p className="text-center font-semibold text-rejected">{error}</p>}
      <ul className="flex flex-col gap-2">
        {list.map((p) => {
          const online = isOnline(p, now);
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={!windowOpen || busy !== null}
                onClick={async () => {
                  setBusy(p.id);
                  setError(null);
                  try {
                    await requestRejoin(roomId, uid, p.id, token);
                  } catch {
                    setError('Could not send the request. The window may have closed.');
                  } finally {
                    setBusy(null);
                  }
                }}
                className={cx(
                  'flex min-h-[56px] w-full items-center justify-between rounded-xl bg-paper px-4 text-left shadow transition active:scale-[0.99] disabled:opacity-50',
                  busy === p.id && 'ring-4 ring-maroon',
                )}
              >
                <span className="text-lg font-bold">{p.nickname}</span>
                <span className="flex items-center gap-2">
                  {!online && <span className="rounded bg-ink/10 px-2 text-xs font-bold uppercase">offline</span>}
                  <TeamBadge team={p.team} name={teamNames[p.team].split(' - ')[0]} className="text-xs" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </PhoneShell>
  );
}
