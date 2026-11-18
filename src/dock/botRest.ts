/** DEV ONLY: minimal Firestore REST writer for simulator bots (rules still apply: the bot's ID token is sent). */
import { firestoreRestDocsBase } from '../lib/firebase';

type Val = string | number | boolean | null | Val[] | { [k: string]: Val };

function enc(v: Val): Record<string, unknown> {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

export interface RestWrite {
  path: string; // e.g. rooms/ABCD/players/uid
  fields: Record<string, Val>;
  serverTime?: string[]; // fields set to the server's request time
  mustNotExist?: boolean;
  mask?: string[]; // partial update (only these fields)
}

export async function restCommit(token: string, writes: RestWrite[]): Promise<void> {
  const base = firestoreRestDocsBase();
  const docRoot = base.replace(/^.*?\/v1\//, '');
  const body = {
    writes: writes.map((w) => ({
      update: { name: `${docRoot}/${w.path}`, fields: Object.fromEntries(Object.entries(w.fields).map(([k, v]) => [k, enc(v)])) },
      ...(w.mask ? { updateMask: { fieldPaths: w.mask } } : {}),
      ...(w.serverTime?.length ? { updateTransforms: w.serverTime.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) } : {}),
      ...(w.mustNotExist ? { currentDocument: { exists: false } } : {}),
    })),
  };
  const res = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
    throw new Error(j.error?.status ?? `HTTP ${res.status}`);
  }
}
