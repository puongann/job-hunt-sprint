import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEFAULT_TEAM_NAMES } from '../config/brand';
import { Loading } from '../components/ui';
import { cleanNickname, joinRoom, type JoinError } from '../lib/api';
import { useAuthUid, useMember, usePlayers, useRoom } from '../lib/hooks';
import { normalizeCode } from '../lib/ids';
import type { Team } from '../lib/types';
import { PhoneJoinForm, PhoneShell } from '../views/Phone';

const CLOSED_MSG = 'The office is closed. Ask your teacher to open the rejoin QR.';

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { uid, error: authError } = useAuthUid();
  const [code, setCode] = useState(() => normalizeCode(params.get('code') ?? safeGet('hirer.lastRoom') ?? ''));
  const [nickname, setNickname] = useState('');
  const [team, setTeam] = useState<Team>('A');
  const [teamTouched, setTeamTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = code.length === 4;
  const room = useRoom(valid ? code : undefined, !!uid);
  const players = usePlayers(valid ? code : undefined, !!uid && !!room.data);
  const member = useMember(valid ? code : undefined, uid);

  const counts = useMemo(() => {
    if (!room.data) return null;
    const c = { A: 0, B: 0 };
    players.data.forEach((p) => (c[p.team] += 1));
    return c;
  }, [players.data, room.data]);

  // Default the team picker to the smaller team (until the student picks).
  useEffect(() => {
    if (counts && !teamTouched) setTeam(counts.B < counts.A ? 'B' : 'A');
  }, [counts, teamTouched]);

  // Same browser, already joined: resume automatically.
  useEffect(() => {
    if (member.data && !member.data.revoked && valid) {
      safeSet('hirer.lastRoom', code);
      navigate(`/play/${code}`, { replace: true });
    }
  }, [member.data, valid, code, navigate]);

  if (authError) return <Fatal msg={`Could not sign in: ${authError}`} />;
  if (!uid) return <Loading />;

  const teamNames = room.data?.teamNames ?? DEFAULT_TEAM_NAMES;
  const closed = room.data && !room.data.joinOpen;

  async function submit() {
    setError(null);
    if (!valid) return setError('Enter the 4-letter office code.');
    const nick = cleanNickname(nickname);
    if (nick.length < 2 || nick.length > 16) return setError('Your nickname needs 2 to 16 characters.');
    setBusy(true);
    try {
      await joinRoom(code, uid as string, nick, team);
      safeSet('hirer.lastRoom', code);
      navigate(`/play/${code}`, { replace: true });
    } catch (e) {
      const kind = (e as { kind?: JoinError }).kind;
      setError(
        kind === 'closed'
          ? CLOSED_MSG
          : kind === 'taken'
            ? 'That nickname is taken. Try another one (or add a number).'
            : kind === 'no-room'
              ? 'No office with that code.'
              : `Something went wrong: ${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <PhoneJoinForm
        code={code}
        nickname={nickname}
        team={team}
        counts={counts}
        teamNames={teamNames}
        onCode={(v) => {
          setCode(normalizeCode(v));
          setError(null);
        }}
        onNickname={setNickname}
        onTeam={(t) => {
          setTeam(t);
          setTeamTouched(true);
        }}
        onSubmit={submit}
        busy={busy}
        error={error ?? (closed ? CLOSED_MSG : null)}
        roomFound={valid && !room.loading ? !!room.data : undefined}
      />
    </PhoneShell>
  );
}

export function Fatal({ msg }: { msg: string }) {
  return (
    <PhoneShell>
      <p className="rounded-lg bg-paper p-4 text-center font-semibold text-rejected shadow">{msg}</p>
    </PhoneShell>
  );
}

export function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
export function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
