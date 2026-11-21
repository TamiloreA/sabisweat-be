/**
 * Sabi Sweat Step Notification Copy Library & Personalisation Engine
 *
 * Implements progress band classification, exact copy pools (morning, afternoon,
 * evening, and near-goal), locale-aware number/plural formatting, graceful
 * missing-name handling, and least-recently-shown per-member variation rotation.
 */

export type StepProgressBand =
  | 'unknown'
  | 'zero'
  | 'below_half'
  | 'halfway'
  | 'near_goal'
  | 'completed';

export type ActiveStepBand = 'zero' | 'below_half' | 'halfway' | 'near_goal';

export type CheckInSlot = 'morning' | 'afternoon' | 'evening';

export interface StepMetrics {
  steps: number;
  goal: number;
  half: number;
  remaining: number;
  toHalf: number;
  percent: number;
  ratio: number;
}

export interface StepCopyContext {
  steps: number;
  goal: number;
  firstName?: string | null;
  locale?: string | null;
}

export interface RenderedStepCopy {
  key: string;
  title: string;
  body: string;
}

export interface StepCopyVariation {
  key: string;
  group: 'morning' | 'afternoon' | 'evening' | 'near_goal';
  bands: ActiveStepBand[];
  timeNeutral: boolean;
  usesName: boolean;
  render: (params: FormattedStepParams) => { title: string; body: string };
}

interface FormattedStepParams {
  steps: string;
  goal: string;
  half: string;
  remaining: string;
  toHalf: string;
  percent: string;
  stepsWord: string;
  goalStepsWord: string;
  halfStepsWord: string;
  remainingStepsWord: string;
  toHalfStepsWord: string;
  name?: string;
}

/**
 * Computes derived step metrics strictly per spec:
 * - Remaining steps = goal - steps (floored at 0)
 * - Halfway = half the goal rounded UP to a whole step
 * - Displayed percentage = rounded DOWN
 * - Band selection uses the unrounded ratio (steps / goal)
 */
export function computeStepMetrics(steps: number, goal: number): StepMetrics {
  const safeGoal = Math.max(1, Math.round(goal));
  const safeSteps = Math.max(0, Math.round(steps));
  const half = Math.ceil(safeGoal / 2);
  const remaining = Math.max(0, safeGoal - safeSteps);
  const toHalf = Math.max(0, half - safeSteps);
  const ratio = safeSteps / safeGoal;
  const percent = Math.floor(ratio * 100);

  return {
    steps: safeSteps,
    goal: safeGoal,
    half,
    remaining,
    toHalf,
    percent,
    ratio,
  };
}

/**
 * Classifies progress into a band using the unrounded ratio (steps / goal).
 */
export function classifyStepBand(
  steps: number | null | undefined,
  goal: number
): StepProgressBand {
  if (steps === null || steps === undefined || !Number.isFinite(steps) || steps < 0) {
    return 'unknown';
  }
  if (!Number.isFinite(goal) || goal <= 0) {
    return 'unknown';
  }

  const ratio = steps / goal;
  if (ratio >= 1) return 'completed';
  if (ratio >= 0.9) return 'near_goal';
  if (ratio >= 0.5) return 'halfway';
  if (steps > 0) return 'below_half';
  return 'zero';
}

/**
 * Normalizes a preferred first name, returning undefined when absent/blank.
 */
export function sanitizeFirstName(firstName?: string | null): string | undefined {
  if (typeof firstName !== 'string') return undefined;
  const trimmed = firstName.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes an IETF BCP-47 locale tag with safe fallback to en-US.
 */
function resolveLocale(locale?: string | null): string {
  if (!locale || typeof locale !== 'string') return 'en-US';
  const cleaned = locale.trim().replace(/_/g, '-');
  if (!cleaned) return 'en-US';
  try {
    const canonical = Intl.getCanonicalLocales(cleaned);
    return canonical[0] || 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * Formats integer counts according to the member's locale.
 */
export function formatLocaleNumber(value: number, locale?: string | null): string {
  const resolvedLocale = resolveLocale(locale);
  try {
    return new Intl.NumberFormat(resolvedLocale, { maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toLocaleString('en-US');
  }
}

/**
 * Returns singular/plural "step" / "steps" using Intl.PluralRules for the member's locale.
 */
export function pluralizeStepWord(count: number, locale?: string | null): string {
  const resolvedLocale = resolveLocale(locale);
  try {
    const category = new Intl.PluralRules(resolvedLocale).select(count);
    return category === 'one' ? 'step' : 'steps';
  } catch {
    return count === 1 ? 'step' : 'steps';
  }
}

/**
 * Helper to format an optional ", {name}" suffix cleanly without leaving dangling commas.
 */
function withCommaName(prefix: string, name?: string, suffix: string = ''): string {
  return name ? `${prefix}, ${name}${suffix}` : `${prefix}${suffix}`;
}

export const STEP_COPY_VARIATIONS: readonly StepCopyVariation[] = [
  // ─── Afternoon: Zero steps recorded ────────────────────────────────────────
  {
    key: 'afternoon_zero_1',
    group: 'afternoon',
    bands: ['zero'],
    timeNeutral: true,
    usesName: false,
    render: () => ({
      title: 'Start with a song',
      body: 'Put on a favourite track and walk for as long as it plays.',
    }),
  },
  {
    key: 'afternoon_zero_2',
    group: 'afternoon',
    bands: ['zero'],
    timeNeutral: false, // Mentions "afternoon"
    usesName: false,
    render: () => ({
      title: 'A little room to move',
      body: 'Got a few minutes? Take your first steps of the afternoon.',
    }),
  },
  {
    key: 'afternoon_zero_3',
    group: 'afternoon',
    bands: ['zero'],
    timeNeutral: true,
    usesName: false,
    render: () => ({
      title: 'Your ring is open',
      body: 'A walk at your own pace gets it started.',
    }),
  },
  {
    key: 'afternoon_zero_4',
    group: 'afternoon',
    bands: ['zero'],
    timeNeutral: true,
    usesName: true,
    render: ({ name }) => ({
      title: withCommaName('Ready', name, '?'),
      body: 'Pick a spot nearby and walk there. The first step counts.',
    }),
  },

  // ─── Afternoon: Started and below halfway ──────────────────────────────────
  {
    key: 'afternoon_below_half_1',
    group: 'afternoon',
    bands: ['below_half'],
    timeNeutral: true,
    usesName: false,
    render: ({ toHalf, toHalfStepsWord, steps }) => ({
      title: `${toHalf} ${toHalfStepsWord} to halfway`,
      body: `You’ve logged ${steps} so far today.`,
    }),
  },
  {
    key: 'afternoon_below_half_2',
    group: 'afternoon',
    bands: ['below_half'],
    timeNeutral: true,
    usesName: false,
    render: ({ steps, stepsWord }) => ({
      title: `Build on ${steps} ${stepsWord}`,
      body: 'Take a short walk when you next have a break.',
    }),
  },
  {
    key: 'afternoon_below_half_3',
    group: 'afternoon',
    bands: ['below_half'],
    timeNeutral: true,
    usesName: true,
    render: ({ half, halfStepsWord, toHalf, name }) => ({
      title: `Halfway is ${half} ${halfStepsWord}`,
      body: withCommaName(`You’re ${toHalf} away`, name, '.'),
    }),
  },
  {
    key: 'afternoon_below_half_4',
    group: 'afternoon',
    bands: ['below_half'],
    timeNeutral: true,
    usesName: false,
    render: ({ steps, stepsWord }) => ({
      title: 'You’re on the board',
      body: `${steps} ${stepsWord} so far. Where will your next walk take you?`,
    }),
  },

  // ─── Afternoon: Halfway or more with the ring still open (50% to <90%) ────
  {
    key: 'afternoon_halfway_1',
    group: 'afternoon',
    bands: ['halfway'],
    timeNeutral: true,
    usesName: false,
    render: ({ steps, goal, goalStepsWord }) => ({
      title: 'Half the ring or more',
      body: `You’ve covered ${steps} of your ${goal} ${goalStepsWord}.`,
    }),
  },
  {
    key: 'afternoon_halfway_2',
    group: 'afternoon',
    bands: ['halfway'],
    timeNeutral: true,
    usesName: false,
    render: ({ remaining, remainingStepsWord, steps }) => ({
      title: `${remaining} ${remainingStepsWord} to your goal`,
      body: `You’ve already logged ${steps} today.`,
    }),
  },
  {
    key: 'afternoon_halfway_3',
    group: 'afternoon',
    bands: ['halfway'],
    timeNeutral: true,
    usesName: true,
    render: ({ percent, name }) => ({
      title: withCommaName('Look at that ring', name),
      body: `You’re ${percent}% of the way there.`,
    }),
  },
  {
    key: 'afternoon_halfway_4',
    group: 'afternoon',
    bands: ['halfway'],
    timeNeutral: true,
    usesName: false,
    render: ({ steps, stepsWord }) => ({
      title: `${steps} ${stepsWord} and counting`,
      body: 'Keep your next break open for a walk.',
    }),
  },

  // ─── Morning ───────────────────────────────────────────────────────────────
  {
    key: 'morning_zero_1',
    group: 'morning',
    bands: ['zero'],
    timeNeutral: false,
    usesName: false,
    render: ({ goal, goalStepsWord }) => ({
      title: 'Your ring is open',
      body: `Your goal today is ${goal} ${goalStepsWord}.`,
    }),
  },
  {
    key: 'morning_zero_2',
    group: 'morning',
    bands: ['zero'],
    timeNeutral: false,
    usesName: true,
    render: ({ name }) => ({
      title: withCommaName('Find your pace', name),
      body: 'Where will your first walk take you?',
    }),
  },
  {
    key: 'morning_started_1',
    group: 'morning',
    bands: ['below_half', 'halfway'],
    timeNeutral: false,
    usesName: false,
    render: ({ steps, stepsWord }) => ({
      title: 'An early start',
      body: `You’ve already logged ${steps} ${stepsWord} this morning.`,
    }),
  },
  {
    key: 'morning_started_2',
    group: 'morning',
    bands: ['below_half', 'halfway'],
    timeNeutral: false,
    usesName: false,
    render: ({ steps, stepsWord, goal }) => ({
      title: `${steps} ${stepsWord} into the day`,
      body: `That’s progress towards your goal of ${goal}.`,
    }),
  },

  // ─── Evening ───────────────────────────────────────────────────────────────
  {
    key: 'evening_started_1',
    group: 'evening',
    bands: ['below_half', 'halfway'],
    timeNeutral: false,
    usesName: false,
    render: ({ steps, stepsWord }) => ({
      title: 'One more walk?',
      body: `You’ve logged ${steps} ${stepsWord} today.`,
    }),
  },
  {
    key: 'evening_started_2',
    group: 'evening',
    bands: ['below_half', 'halfway'],
    timeNeutral: false,
    usesName: true,
    render: ({ steps, stepsWord, name }) => ({
      title: 'Your evening total',
      body: `${withCommaName(`${steps} ${stepsWord} so far`, name, '.')} Choose where you go next.`,
    }),
  },
  {
    key: 'evening_started_3',
    group: 'evening',
    bands: ['below_half', 'halfway'],
    timeNeutral: false,
    usesName: false,
    render: ({ remaining, remainingStepsWord }) => ({
      title: 'Room for a few more',
      body: `You’re ${remaining} ${remainingStepsWord} from your goal.`,
    }),
  },
  {
    key: 'evening_any_4',
    group: 'evening',
    bands: ['zero', 'below_half', 'halfway'],
    timeNeutral: false,
    usesName: false,
    render: ({ goal, goalStepsWord }) => ({
      title: 'Take a moment to move',
      body: `A short evening walk counts towards your ${goal} ${goalStepsWord}.`,
    }),
  },

  // ─── Near goal (90% to <100%, any time of day) ─────────────────────────────
  {
    key: 'near_goal_1',
    group: 'near_goal',
    bands: ['near_goal'],
    timeNeutral: true,
    usesName: false,
    render: ({ remaining, remainingStepsWord, steps }) => ({
      title: `${remaining} ${remainingStepsWord} to close your ring`,
      body: `You’ve logged ${steps}. Bring it home.`,
    }),
  },
  {
    key: 'near_goal_2',
    group: 'near_goal',
    bands: ['near_goal'],
    timeNeutral: true,
    usesName: true,
    render: ({ remaining, remainingStepsWord, name }) => ({
      title: withCommaName('Nearly there', name),
      body: `Just ${remaining} ${remainingStepsWord} between you and a closed ring.`,
    }),
  },
  {
    key: 'near_goal_3',
    group: 'near_goal',
    bands: ['near_goal'],
    timeNeutral: true,
    usesName: false,
    render: ({ steps, remaining }) => ({
      title: 'The final stretch',
      body: `${steps} down. ${remaining} to go.`,
    }),
  },
  {
    key: 'near_goal_4',
    group: 'near_goal',
    bands: ['near_goal'],
    timeNeutral: true,
    usesName: false,
    render: ({ remaining, remainingStepsWord }) => ({
      title: 'Your ring is nearly closed',
      body: `Another ${remaining} ${remainingStepsWord} will do it.`,
    }),
  },
];

/**
 * Returns the eligible copy variations for a given local check-in slot and progress band.
 * - `near_goal` always takes priority over morning, afternoon, and evening copy.
 * - `morning` uses morning options for the band plus time-neutral afternoon options for that band.
 * - `afternoon` uses the 4 afternoon options for the band.
 * - `evening` uses option 4 + time-neutral zero options at zero, and all 4 evening options once started.
 */
export function getEligibleStepVariations(
  slot: CheckInSlot | 'any',
  band: ActiveStepBand
): StepCopyVariation[] {
  if (band === 'near_goal') {
    return STEP_COPY_VARIATIONS.filter((v) => v.group === 'near_goal');
  }

  if (slot === 'afternoon') {
    return STEP_COPY_VARIATIONS.filter(
      (v) => v.group === 'afternoon' && v.bands.includes(band)
    );
  }

  if (slot === 'morning') {
    const primary = STEP_COPY_VARIATIONS.filter(
      (v) => v.group === 'morning' && v.bands.includes(band)
    );
    const reusableAfternoon = STEP_COPY_VARIATIONS.filter(
      (v) => v.group === 'afternoon' && v.timeNeutral && v.bands.includes(band)
    );
    return [...primary, ...reusableAfternoon];
  }

  if (slot === 'evening') {
    if (band === 'zero') {
      const eveningZero = STEP_COPY_VARIATIONS.filter(
        (v) => v.group === 'evening' && v.bands.includes('zero')
      );
      const timeNeutralZero = STEP_COPY_VARIATIONS.filter(
        (v) => v.group === 'afternoon' && v.timeNeutral && v.bands.includes('zero')
      );
      return [...eveningZero, ...timeNeutralZero];
    }

    return STEP_COPY_VARIATIONS.filter(
      (v) => v.group === 'evening' && v.bands.includes(band)
    );
  }

  // Fallback for 'any' (non-near_goal): time-neutral afternoon pool
  return STEP_COPY_VARIATIONS.filter(
    (v) => v.group === 'afternoon' && v.timeNeutral && v.bands.includes(band)
  );
}

/**
 * Selects the least recently shown eligible variation for a member.
 * Variations never shown before take priority (in pool order), followed by the
 * variation with the oldest last-shown timestamp.
 */
export function selectLeastRecentlyShownVariation(
  eligible: readonly StepCopyVariation[],
  lastShownAtByKey: ReadonlyMap<string, number>
): StepCopyVariation {
  if (eligible.length === 0) {
    throw new Error('No eligible step notification variations available');
  }

  let best = eligible[0];
  let bestTime = lastShownAtByKey.has(best.key)
    ? lastShownAtByKey.get(best.key)!
    : Number.NEGATIVE_INFINITY;

  for (let i = 1; i < eligible.length; i++) {
    const candidate = eligible[i];
    const candidateTime = lastShownAtByKey.has(candidate.key)
      ? lastShownAtByKey.get(candidate.key)!
      : Number.NEGATIVE_INFINITY;

    if (candidateTime < bestTime) {
      best = candidate;
      bestTime = candidateTime;
    }
  }

  return best;
}

/**
 * Renders a chosen variation with locale-formatted counts, singular/plural step words,
 * and optional first name (removing both name and comma when absent).
 */
export function renderStepCopyVariation(
  variation: StepCopyVariation,
  context: StepCopyContext
): RenderedStepCopy {
  const metrics = computeStepMetrics(context.steps, context.goal);
  const name = sanitizeFirstName(context.firstName);
  const locale = context.locale;

  const formatted: FormattedStepParams = {
    steps: formatLocaleNumber(metrics.steps, locale),
    goal: formatLocaleNumber(metrics.goal, locale),
    half: formatLocaleNumber(metrics.half, locale),
    remaining: formatLocaleNumber(metrics.remaining, locale),
    toHalf: formatLocaleNumber(metrics.toHalf, locale),
    percent: formatLocaleNumber(metrics.percent, locale),
    stepsWord: pluralizeStepWord(metrics.steps, locale),
    goalStepsWord: pluralizeStepWord(metrics.goal, locale),
    halfStepsWord: pluralizeStepWord(metrics.half, locale),
    remainingStepsWord: pluralizeStepWord(metrics.remaining, locale),
    toHalfStepsWord: pluralizeStepWord(metrics.toHalf, locale),
    name,
  };

  const { title, body } = variation.render(formatted);
  return {
    key: variation.key,
    title,
    body,
  };
}
