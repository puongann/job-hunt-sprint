import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GAME_NAME, GAME_TAGLINE } from '../config/brand';
import { Btn, Loading, PaperCard } from '../components/ui';
import { RoundEditor } from '../dock/RoundEditor';
import { createRoom, hostedRooms } from '../lib/api';
import { firebaseConfigured } from '../lib/firebase';
import { useAuthUid } from '../lib/hooks';
import { loadTemplates } from '../lib/rounds';

export default function MainLanding() {
  if (!firebaseConfigured) return <NotConfigured />;
  return <Landing />;
}

function Landing() {
  const navigate = useNavigate();
  const { uid, error } = useAuthUid();
  const [templates, setTemplates] = useState(loadTemplates);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const recent = hostedRooms();

  if (error) return <p className="p-8 text-center text-rejected">Could not sign in: {error}</p>;
  if (!uid) return <Loading />;

  return (
    <div className="cork min-h-screen p-6 text-lg">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="text-center">
          <h1 className="inline-block -rotate-1 rounded-xl bg-maroon px-6 py-2 font-serif text-5xl font-black text-paper shadow-xl">{GAME_NAME}</h1>
          <p className="mt-3 font-hand text-3xl">{GAME_TAGLINE}</p>
        </header>
        <div className="grid gap-6 md:grid-cols-3">
          <PaperCard id="create" className="flex flex-col gap-3 p-5 pt-7">
            <h2 className="font-serif text-2xl font-black">Create room</h2>
            <p className="text-base">
              {templates.length} rounds from this browser's templates: {templates.map((t) => t.title).join(' · ')}
            </p>
            <Btn variant="paper" onClick={() => setEditing(true)}>
              Settings (rounds)
            </Btn>
            <Btn
              disabled={busy}
              className="h-14 text-xl"
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  const { code: c } = await createRoom(uid, templates);
                  navigate(`/main/${c}`);
                } catch (e) {
                  setMsg((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Updating your CV...' : 'Create room'}
            </Btn>
          </PaperCard>
          <PaperCard id="resume" className="flex flex-col gap-3 p-5 pt-7">
            <h2 className="font-serif text-2xl font-black">Resume room</h2>
            {recent.length > 0 && (
              <div className="flex flex-wrap gap-2 text-base">
                This browser:
                {recent.map((c) => (
                  <Link key={c} to={`/main/${c}`} className="rounded bg-ink/10 px-2 font-mono font-bold hover:bg-ink/20">
                    {c}
                  </Link>
                ))}
              </div>
            )}
            {recent.length === 0 && <p className="text-base text-ink/70">Rooms you create on this browser appear here.</p>}
          </PaperCard>
          <PaperCard id="demo" className="flex flex-col gap-3 p-5 pt-7">
            <h2 className="font-serif text-2xl font-black">Play demo</h2>
            <p className="text-base">A 2-3 minute walkthrough for students. Works offline, no room needed.</p>
            <Btn className="h-14 text-xl" onClick={() => navigate('/demo')}>
              Play demo
            </Btn>
          </PaperCard>
        </div>
        {msg && <p className="rounded-lg bg-paper p-3 text-center font-semibold text-rejected shadow">{msg}</p>}
      </div>
      {editing && (
        <RoundEditor
          initial={templates}
          onClose={() => {
            setTemplates(loadTemplates());
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="cork flex min-h-screen items-center justify-center p-6">
      <PaperCard id="nocfg" className="max-w-xl p-6 pt-8 text-lg">
        <h1 className="font-serif text-3xl font-black">Firebase is not set up yet</h1>
        <p className="mt-2">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Firebase web app values, and restart. See the README.
        </p>
        <p className="mt-2">
          You can still play the <Link className="font-bold text-maroon underline" to="/demo">demo</Link>.
        </p>
      </PaperCard>
    </div>
  );
}
