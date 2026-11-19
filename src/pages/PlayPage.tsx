import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { DEFAULT_TEAM_NAMES } from '../config/brand';
import { Loading } from '../components/ui';
import { castVote, chooseSide, currentSideKey, heartbeat, heartbeatAndSync, saveSentence } from '../lib/api';
import {
  useAllSentences,
  useAuthUid,
  useMember,
  useMySentences,
  useMyVote,
  usePlayer,
  useRoom,
  useSentence,
  useServerNow,
} from '../lib/hooks';
import { standings } from '../lib/scoring';
import type { Player, Room, Score } from '../lib/types';
import { Note, PhoneChooseSide, PhoneLeaderboard, PhoneLobby, PhoneReview, PhoneShell, PhoneWriting } from '../views/Phone';
import { Fatal } from './JoinPage';

export default function PlayPage() {
  const { roomId = '' } = useParams();
  const location = useLocation();
  const { uid, error: authError } = useAuthUid();
  const member = useMember(roomId, uid);
  const pid = member.data && !member.data.revoked ? member.data.playerId : null;
  const player = usePlayer(roomId, pid);
  const room = useRoom(roomId, !!pid);
  const [welcome, setWelcome] = useState(Boolean((location.state as { welcomeBack?: boolean } | null)?.welcomeBack));

  useEffect(() => {
    if (!welcome) return;
    const t = setTimeout(() => setWelcome(false), 8000);
    return () => clearTimeout(t);
  }, [welcome]);

  // Heartbeat every 15 s (also syncs the clock once).
  useEffect(() => {
    if (!pid) return;
    heartbeatAndSync(roomId, pid).catch(() => {});
    const t = setInterval(() => heartbeat(roomId, pid).catch(() => {}), 15_000);
    const onVis = () => document.visibilityState === 'visible' && heartbeat(roomId, pid).catch(() => {});
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [roomId, pid]);

  if (authError) return <Fatal msg={`Could not sign in: ${authError}`} />;
  if (!uid || member.loading) return <Loading />;
  if (!member.data) return <Navigate to={`/?code=${roomId}`} replace />;
  if (member.data.revoked)
    return (
      <PhoneShell>
        <Note>You joined on another device. This phone is off duty now.</Note>
      </PhoneShell>
    );
  if (player.loading || room.loading || !player.data || !room.data) return <Loading />;

  const r = room.data;
  const p = player.data;
  const teamNames = r.teamNames ?? DEFAULT_TEAM_NAMES;
  // Table rounds: no team until the student has read the table and chosen a side.
  const teamPending = r.pickTeamLater === true && (r.phase === 'lobby' || p.sideRound !== currentSideKey(r));
  return (
    <PhoneShell
      nickname={p.nickname}
      team={teamPending ? undefined : p.team}
      teamName={teamNames[p.team]}
      banner={
        welcome && r.phase !== 'lobby' ? (
          <p className="bg-hired px-4 py-2 text-center font-semibold text-white">Welcome back to the office. The coffee machine missed you.</p>
        ) : null
      }
    >
      {r.phase === 'lobby' && <PhoneLobby welcomeBack={welcome} />}
      {r.phase === 'writing' && <Writing room={r} player={p} />}
      {r.phase === 'review' && <Review room={r} player={p} />}
      {r.phase === 'leaderboard' && <Leaderboard room={r} player={p} />}
    </PhoneShell>
  );
}

function Writing({ room, player }: { room: Room; player: Player }) {
  const round = room.currentRoundId ? room.rounds[room.currentRoundId] : null;
  const mine = useMySentences(room.code, player.id, room.currentRoundId);
  const now = useServerNow(250);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [changing, setChanging] = useState(false);
  if (!round) return <Loading />;
  const end = room.timerEndsAt?.toMillis() ?? 0;
  const sideKey = currentSideKey(room);
  const isTable = round.type === 'table';
  const hasSide = isTable && sideKey !== null && player.sideRound === sideKey;
  const teamNames = room.teamNames ?? DEFAULT_TEAM_NAMES;
  if (isTable && (!hasSide || changing)) {
    return (
      <PhoneChooseSide
        round={round}
        remainingMs={end - now}
        totalMs={round.timerSeconds * 1000}
        teamNames={teamNames}
        current={hasSide ? player.team : undefined}
        onCancel={hasSide ? () => setChanging(false) : undefined}
        busy={choosing}
        error={error}
        onChoose={async (team) => {
          if (!sideKey) return;
          if (hasSide && team === player.team) return setChanging(false);
          setChoosing(true);
          setError(null);
          try {
            await chooseSide(room.code, player.id, team, sideKey, mine.data.map((x) => x.id));
            setChanging(false);
          } catch {
            setError('Could not save your choice (time may be up).');
          } finally {
            setChoosing(false);
          }
        }}
      />
    );
  }
  const slots = Array.from({ length: round.maxPerStudent }, (_, i) => {
    const s = mine.data.find((x) => x.slot === i + 1);
    return { slot: i + 1, saved: s ? s.originalText : null };
  });
  return (
    <PhoneWriting
      key={round.id}
      round={round}
      remainingMs={end - now}
      totalMs={round.timerSeconds * 1000}
      slots={slots}
      savingSlot={saving}
      error={error}
      side={hasSide ? { team: player.team, name: teamNames[player.team] } : undefined}
      onChangeSide={hasSide ? () => setChanging(true) : undefined}
      onSave={async (slot, text) => {
        setSaving(slot);
        setError(null);
        try {
          await saveSentence(room.code, { roundId: round.id, player, slot, text, exists: slots[slot - 1].saved !== null });
        } catch {
          setError("HR's inbox is closed for this sentence (time may be up).");
        } finally {
          setSaving(null);
        }
      }}
    />
  );
}

function Review({ room, player }: { room: Room; player: Player }) {
  const s = useSentence(room.code, room.currentSentenceId);
  const vote = useMyVote(room.code, room.currentSentenceId, player.id);
  const [voteError, setVoteError] = useState<string | null>(null);
  const sentence = s.data;
  const isAuthor = sentence?.authorPlayerId === player.id;
  const step = room.sentenceStep;
  return (
    <PhoneReview
      step={step}
      originalText={sentence?.originalText ?? null}
      correctedText={sentence?.correctedText ?? null}
      showDeletions={room.showDeletions}
      isAuthor={isAuthor}
      myVote={(vote.data?.value ?? null) as Score | null}
      voteError={voteError}
      onVote={async (v) => {
        if (!sentence) return;
        setVoteError(null);
        try {
          await castVote(room.code, sentence.id, player.id, v);
        } catch {
          setVoteError('Voting is closed for this one.');
        }
      }}
      finalScore={step === 'revealed' && sentence?.locked ? sentence.finalScore : null}
      challenge={sentence?.challenge}
      authorNickname={step === 'revealed' || room.hideAuthor !== true ? sentence?.authorNickname : undefined}
      authorTeam={step === 'revealed' || room.hideAuthor !== true ? sentence?.team : undefined}
      teamNames={room.teamNames ?? DEFAULT_TEAM_NAMES}
    />
  );
}

function Leaderboard({ room, player }: { room: Room; player: Player }) {
  const all = useAllSentences(room.code);
  const st = useMemo(() => standings(all.data), [all.data]);
  if (all.loading) return <Loading />;
  return <PhoneLeaderboard standings={st} teamNames={room.teamNames ?? DEFAULT_TEAM_NAMES} myTeam={player.team} />;
}
