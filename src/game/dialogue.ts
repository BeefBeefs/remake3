/**
 * NPC speech from the language file (`Idioma.dat`, keys `ACTORS\ID-<actor>*`). The text is the speech, then a blank line,
 * then one line per answer the player can pick, each starting with `$<n>` (`$0 What can you sell me?`). A second visit
 * to an NPC with a `**` entry (the Princess, ID-63) says that one instead.
 */
export interface Dialogue {
  text: string;
  /** the player's answers, in order; an NPC with nothing to answer gets a single "Continue" */
  replies: string[];
}

export function parseDialogue(raw: string): Dialogue {
  const lines = raw.replace(/\r/g, '').split('\n');
  const replies: string[] = [];
  const body: string[] = [];
  for (const l of lines) {
    const m = /^\$(\d+)\s*(.*)$/.exec(l);
    if (m) replies[Number(m[1])] = m[2]!.trim();
    else body.push(l);
  }
  return { text: body.join('\n').trim(), replies: replies.length ? replies.map((r) => r ?? '') : ['Continue'] };
}

/** The speech for the nth time the hero talks to this actor: `*`, then `**` if the NPC has one (alternating). */
export function speechFor(texts: Record<string, string>, actor: string, visit: number): string | null {
  const first = texts[`ACTORS\\ID-${actor}*`];
  if (first === undefined) return null;
  const second = texts[`ACTORS\\ID-${actor}**`];
  return second !== undefined && visit % 2 === 1 ? second : first;
}
