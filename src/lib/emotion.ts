/**
 * A small multinomial Naive Bayes emotion classifier, trained at module load
 * from a labelled seed corpus. It is deliberately tiny and dependency-free:
 *  - runs on the server for every check-in / companion message (fast, private)
 *  - acts as the fallback "Oracle" when no LLM API key is configured
 *  - its label + confidence is handed to the LLM as a grounding hint
 *
 * Extend TRAINING_DATA to "retrain" — the model rebuilds on next boot.
 */

export const EMOTIONS = [
  "joy",
  "calm",
  "tired",
  "anxious",
  "sad",
  "frustrated",
  "overwhelmed",
  "neutral",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

type Sample = [Emotion, string];

const TRAINING_DATA: Sample[] = [
  // joy
  ["joy", "I feel amazing today, crushed my workout and finished the report"],
  ["joy", "so happy I finally did it, proud of myself"],
  ["joy", "great day, everything went well and I'm excited"],
  ["joy", "feeling motivated and energised, let's go"],
  ["joy", "I nailed the interview, I'm thrilled"],
  ["joy", "grateful and cheerful, life is good right now"],
  ["joy", "awesome, streak is alive and I feel unstoppable"],
  ["joy", "loving this progress, feeling fantastic"],
  // calm
  ["calm", "feeling steady and relaxed, ready for a quiet evening"],
  ["calm", "pretty peaceful today, nothing urgent"],
  ["calm", "I'm okay, content, taking it slow"],
  ["calm", "balanced and clear headed after the walk"],
  ["calm", "chill day, just doing my routine"],
  ["calm", "feeling grounded and at ease"],
  // tired
  ["tired", "so exhausted, barely slept last night"],
  ["tired", "I'm drained and have no energy left"],
  ["tired", "sleepy and sluggish, can't focus"],
  ["tired", "burnt out after a long week, need rest"],
  ["tired", "worn out, everything feels heavy and slow"],
  ["tired", "fatigued, my body just wants to lie down"],
  ["tired", "running on empty today"],
  // anxious
  ["anxious", "nervous about tomorrow's exam, can't stop worrying"],
  ["anxious", "my heart is racing, I feel anxious about the deadline"],
  ["anxious", "worried I'll fail, feeling on edge"],
  ["anxious", "stressed and restless, too many what ifs"],
  ["anxious", "I keep overthinking everything and panicking"],
  ["anxious", "scared I'm falling behind, tense all day"],
  ["anxious", "uneasy and jittery, dreading the meeting"],
  // sad
  ["sad", "feeling down and lonely today"],
  ["sad", "I'm sad, nothing seems to matter"],
  ["sad", "kind of hopeless, missed my streak and feel like a failure"],
  ["sad", "low mood, cried a bit, don't want to talk"],
  ["sad", "disappointed in myself, feeling empty"],
  ["sad", "gloomy and blue, hard to get out of bed"],
  ["sad", "heartbroken and unmotivated"],
  // frustrated
  ["frustrated", "so annoyed, the code keeps breaking"],
  ["frustrated", "angry at myself for procrastinating again"],
  ["frustrated", "irritated, nothing is working today"],
  ["frustrated", "fed up with these interruptions"],
  ["frustrated", "this is infuriating, I wasted the whole afternoon"],
  ["frustrated", "mad and stuck, I hate this task"],
  ["frustrated", "ugh, why is everything so hard right now"],
  // overwhelmed
  ["overwhelmed", "too much to do, I don't know where to start"],
  ["overwhelmed", "overwhelmed by my task list, it's endless"],
  ["overwhelmed", "swamped with work and chores, drowning"],
  ["overwhelmed", "everything is piling up and I'm paralysed"],
  ["overwhelmed", "my head is full, way too many things at once"],
  ["overwhelmed", "buried under deadlines, can't breathe"],
  ["overwhelmed", "there's no way I can finish all of this"],
  // neutral
  ["neutral", "what should I do next"],
  ["neutral", "give me a quest suggestion"],
  ["neutral", "planning my week, any ideas"],
  ["neutral", "how does the streak work"],
  ["neutral", "I want to read more books this month"],
  ["neutral", "help me organise my dailies"],
  ["neutral", "thinking about adding a gym habit"],
];

const NEGATIONS = new Set(["not", "no", "never", "dont", "don't", "cant", "can't", "isnt", "isn't"]);

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const out: string[] = [];
  let negate = false;
  for (const w of words) {
    if (NEGATIONS.has(w)) {
      negate = true;
      continue;
    }
    out.push(negate ? `not_${w}` : w);
    negate = false;
  }
  // bigrams add a little context (built from a snapshot so we don't grow forever)
  const unigrams = out.slice();
  for (let i = 0; i < unigrams.length - 1; i++) out.push(`${unigrams[i]}_${unigrams[i + 1]}`);
  return out;
}

interface Model {
  classPrior: Map<Emotion, number>;
  wordCounts: Map<Emotion, Map<string, number>>;
  classTotals: Map<Emotion, number>;
  vocab: Set<string>;
}

function train(samples: Sample[]): Model {
  const classPrior = new Map<Emotion, number>();
  const wordCounts = new Map<Emotion, Map<string, number>>();
  const classTotals = new Map<Emotion, number>();
  const vocab = new Set<string>();
  for (const [label, text] of samples) {
    classPrior.set(label, (classPrior.get(label) ?? 0) + 1);
    const counts = wordCounts.get(label) ?? new Map<string, number>();
    for (const tok of tokenize(text)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
      classTotals.set(label, (classTotals.get(label) ?? 0) + 1);
      vocab.add(tok);
    }
    wordCounts.set(label, counts);
  }
  return { classPrior, wordCounts, classTotals, vocab };
}

const MODEL = train(TRAINING_DATA);

export interface EmotionPrediction {
  emotion: Emotion;
  confidence: number; // 0..1
  scores: Record<Emotion, number>;
}

export function classifyEmotion(text: string): EmotionPrediction {
  const tokens = tokenize(text);
  const total = TRAINING_DATA.length;
  const V = MODEL.vocab.size;
  const logScores = new Map<Emotion, number>();
  for (const label of EMOTIONS) {
    let score = Math.log((MODEL.classPrior.get(label) ?? 0.5) / total);
    const counts = MODEL.wordCounts.get(label) ?? new Map();
    const denom = (MODEL.classTotals.get(label) ?? 0) + V;
    for (const tok of tokens) {
      score += Math.log(((counts.get(tok) ?? 0) + 1) / denom);
    }
    logScores.set(label, score);
  }
  // softmax
  const max = Math.max(...logScores.values());
  let sum = 0;
  const probs = {} as Record<Emotion, number>;
  for (const [label, s] of logScores) {
    const p = Math.exp(s - max);
    probs[label] = p;
    sum += p;
  }
  let best: Emotion = "neutral";
  let bestP = 0;
  for (const label of EMOTIONS) {
    probs[label] = probs[label] / sum;
    if (probs[label] > bestP) {
      bestP = probs[label];
      best = label;
    }
  }
  if (tokens.length === 0) return { emotion: "neutral", confidence: 0.3, scores: probs };
  return { emotion: best, confidence: Math.round(bestP * 100) / 100, scores: probs };
}

export const EMOTION_META: Record<Emotion, { icon: string; label: string; tone: string }> = {
  joy: { icon: "☀️", label: "Joyful", tone: "var(--gold-2)" },
  calm: { icon: "🌙", label: "Calm", tone: "var(--attr-vitality)" },
  tired: { icon: "🕯️", label: "Tired", tone: "var(--muted)" },
  anxious: { icon: "🌪️", label: "Anxious", tone: "var(--attr-intellect)" },
  sad: { icon: "🌧️", label: "Low", tone: "var(--attr-discipline)" },
  frustrated: { icon: "🔥", label: "Frustrated", tone: "var(--attr-strength)" },
  overwhelmed: { icon: "⛰️", label: "Overwhelmed", tone: "var(--ember)" },
  neutral: { icon: "🧭", label: "Steady", tone: "var(--text)" },
};

/** Crisis lexicon — if matched we always add a safety line (escalation path). */
const CRISIS = /\b(suicid|kill myself|end my life|self[- ]harm|hurt myself|don'?t want to (live|be alive))\b/i;
export function detectCrisis(text: string): boolean {
  return CRISIS.test(text);
}

export const SAFETY_LINE =
  "I'm a guild companion, not a clinician. If you're thinking about harming yourself, please reach out to someone now — call or text a local crisis line (988 in the US, 116 123 Samaritans in the UK, or find yours at findahelpline.com). You matter more than any quest.";

/**
 * Template-based empathetic reply (used when no API key is configured, or as
 * a graceful fallback when the provider fails). Follows a CBT micro-skill
 * shape: validate → normalise → one tiny next step → offer control.
 */
export function fallbackReply(input: {
  emotion: Emotion;
  name: string;
  openQuests: number;
  streak: number;
  streakAtRisk: boolean;
}): string {
  const { emotion, name, openQuests, streak, streakAtRisk } = input;
  const streakLine = streakAtRisk
    ? ` Your ${streak}-day streak just needs one tiny seal today — even a trivial quest counts.`
    : streak > 2
      ? ` You're ${streak} days into a streak; that's evidence, not luck.`
      : "";
  switch (emotion) {
    case "overwhelmed":
      return `That sounds like a lot, ${name} — and feeling swamped is a normal reaction to a full board, not a flaw. Let's shrink the mountain: pick the single smallest quest on the list and seal only that. Everything else can wait ten minutes.${streakLine}`;
    case "anxious":
      return `Anxiety usually means you care about how this goes. Take one slow breath out, longer than the in-breath. Then let's make the next step concrete and small — a five-minute trivial quest turns "what if" into "I did".${streakLine}`;
    case "sad":
      return `I'm glad you told me, ${name}. Low days are part of every long story, and they don't erase what you've built. No pressure to be productive — but a gentle Vitality quest (water, a short walk, daylight) often lifts the fog a little.${streakLine}`;
    case "tired":
      return `Rest is a quest too. If you're running on empty, the wise move is a small Vitality deed — hydrate, stretch, or protect your sleep tonight. ${openQuests > 3 ? "Leave the big items for tomorrow's version of you." : ""}${streakLine}`;
    case "frustrated":
      return `Frustration means you're pushing against something real. Step away for two minutes, then break the stuck task into a trivial first move — "open the file", not "finish the feature". Momentum beats mood.${streakLine}`;
    case "joy":
      return `Love this energy, ${name}! Ride it: pick the hardest quest on the board while the wind is at your back — Hard and Epic quests pay the most XP and this is exactly when they feel lightest.${streakLine}`;
    case "calm":
      return `A steady mind is the best time for deliberate work. Choose one Medium quest that matters and give it your full attention — no multitasking, just one clean seal.${streakLine}`;
    default:
      return `I'm here, ${name}. Tell me how the day actually feels, or ask me for a quest — I can suggest something sized to your energy.${openQuests === 0 ? " Your board is empty; a Trivial quest is a great way to light the streak." : ""}${streakLine}`;
  }
}
