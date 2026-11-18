export interface QueueItem {
  id: string;
  authorPlayerId: string;
  slot: number;
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Round-robin review order: every student gets one sentence reviewed before anyone
 * gets a second one. Within each "tier", the order of students is random.
 */
export function buildReviewQueue(items: QueueItem[], rand: () => number = Math.random): string[] {
  const byAuthor = new Map<string, QueueItem[]>();
  for (const it of items) {
    const list = byAuthor.get(it.authorPlayerId) ?? [];
    list.push(it);
    byAuthor.set(it.authorPlayerId, list);
  }
  const lists = [...byAuthor.values()].map((l) => shuffle(l, rand));
  const out: string[] = [];
  for (let tier = 0; ; tier++) {
    const tierItems = lists.filter((l) => l.length > tier).map((l) => l[tier]);
    if (tierItems.length === 0) break;
    out.push(...shuffle(tierItems, rand).map((x) => x.id));
  }
  return out;
}
