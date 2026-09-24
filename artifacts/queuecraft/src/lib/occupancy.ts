const LOW_BACKGROUND = [220, 252, 231] as const;
const MID_BACKGROUND = [255, 237, 213] as const;
const HIGH_BACKGROUND = [254, 226, 226] as const;
const LOW_TEXT = [20, 83, 45] as const;
const MID_TEXT = [154, 52, 18] as const;
const HIGH_TEXT = [153, 27, 27] as const;

const interpolate = (
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  amount: number,
) =>
  start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * amount),
  ) as [number, number, number];

const rgb = ([red, green, blue]: readonly [number, number, number]) =>
  `rgb(${red}, ${green}, ${blue})`;

/**
 * Returns a readable, color-blind-friendly treatment for a percentage.
 * Values above 100 remain red so over-allocation is never understated.
 */
export function occupancyStyle(percent: number) {
  const value = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const midpointAmount = value <= 50 ? value / 50 : (value - 50) / 50;
  const background =
    value <= 50
      ? interpolate(LOW_BACKGROUND, MID_BACKGROUND, midpointAmount)
      : interpolate(MID_BACKGROUND, HIGH_BACKGROUND, midpointAmount);
  const text =
    value <= 50
      ? interpolate(LOW_TEXT, MID_TEXT, midpointAmount)
      : interpolate(MID_TEXT, HIGH_TEXT, midpointAmount);

  return {
    backgroundColor: rgb(background),
    color: rgb(text),
    borderColor: rgb(text),
  };
}

/** Available capacity is the inverse of occupancy for visual encoding. */
export function availableStyle(availablePercent: number) {
  return occupancyStyle(100 - availablePercent);
}