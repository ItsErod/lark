export type ZoomMax = 2 | 3 | 4;

const STEPS = [1, 1.5, 2, 3, 4];

export function nextZoom(current: number, direction: 1 | -1, max: ZoomMax): number {
  const steps = STEPS.filter((step) => step <= max);
  const index = steps.findIndex((step) => step >= current - 0.01);
  const at = index < 0 ? steps.length - 1 : index;
  const next = at + direction;
  if (next < 0) return steps[0];
  if (next >= steps.length) return steps[steps.length - 1];
  return steps[next];
}
