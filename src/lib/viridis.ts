/**
 * Hex ping-count coloring is a two-step pipeline:
 * 1. Scale — map raw count → t ∈ [0, 1] (handles outliers differently per mode)
 * 2. Colormap — map t → Viridis RGB via piecewise linear interpolation
 */

export type CountColorScale = "linear" | "log" | "percentile";

export const COUNT_COLOR_SCALE_OPTIONS: {
	value: CountColorScale;
	label: string;
	/** Short line shown under the scale control. */
	summary: string;
	/** Full explanation for the info tooltip. */
	description: string;
}[] = [
	{
		value: "linear",
		label: "Linear",
		summary: "Quietest → busiest hex in view",
		description:
			"Maps colors evenly from the lowest to the highest ping count in your selection. Simple and faithful, but one very busy hex can make the rest look almost empty.",
	},
	{
		value: "log",
		label: "Log",
		summary: "Compresses high counts",
		description:
			"Uses a logarithmic scale so small and medium activity differences stand out when some hexes have far more pings than others. Good for heavy-tailed traffic.",
	},
	{
		value: "percentile",
		label: "Percentile",
		summary: "Ignores extreme highs & lows",
		description:
			"Colors the middle 90% of hexes (5th–95th percentile). Very quiet and very hot spots are capped at the ends so the map isn’t dominated by outliers.",
	},
];

/** Viridis RGB stops (0–1). */
const VIRIDIS_RGB: [number, [number, number, number]][] = [
	[0, [68, 1, 84]],
	[0.25, [59, 82, 139]],
	[0.5, [33, 144, 140]],
	[0.75, [92, 200, 99]],
	[1, [253, 231, 37]],
];

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function percentile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const idx = Math.floor(q * (sorted.length - 1));
	return sorted[idx];
}

function clamp01(t: number) {
	return Math.max(0, Math.min(1, t));
}

/** Display range for the legend (depends on scale mode). */
export function colorScaleRange(
	values: number[],
	mode: CountColorScale,
): { min: number; max: number } {
	if (values.length === 0) return { min: 0, max: 1 };

	if (mode === "percentile") {
		const sorted = [...values].sort((a, b) => a - b);
		const min = percentile(sorted, 0.05);
		const max = percentile(sorted, 0.95);
		if (min === max) return { min, max: max + 1 };
		return { min, max };
	}

	if (mode === "log") {
		const positive = values.filter((v) => v > 0);
		if (positive.length === 0) return { min: 0, max: 1 };
		return {
			min: Math.min(...positive),
			max: Math.max(...positive),
		};
	}

	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		min = Math.min(min, v);
		max = Math.max(max, v);
	}
	if (min === max) return { min, max: max + 1 };
	return { min, max };
}

/** Map a count to colormap position t ∈ [0, 1]. */
export function countToColorT(
	count: number,
	values: number[],
	mode: CountColorScale,
): number {
	if (values.length === 0) return 0;

	if (mode === "log") {
		const positive = values.filter((v) => v > 0);
		if (positive.length === 0 || count <= 0) return 0;
		const logMin = Math.log(Math.min(...positive));
		const logMax = Math.log(Math.max(...positive));
		const range = logMax - logMin;
		if (range <= 0) return 1;
		return clamp01((Math.log(count) - logMin) / range);
	}

	const { min, max } = colorScaleRange(values, mode);
	const range = max - min;
	if (range <= 0) return 1;
	return clamp01((count - min) / range);
}

/** Map normalized value 0–1 to Viridis RGB. */
export function viridisRgb(t: number): [number, number, number] {
	const clamped = clamp01(t);
	for (let i = 0; i < VIRIDIS_RGB.length - 1; i++) {
		const [p0, c0] = VIRIDIS_RGB[i];
		const [p1, c1] = VIRIDIS_RGB[i + 1];
		if (clamped <= p1) {
			const localT = p1 === p0 ? 0 : (clamped - p0) / (p1 - p0);
			return [
				Math.round(lerp(c0[0], c1[0], localT)),
				Math.round(lerp(c0[1], c1[1], localT)),
				Math.round(lerp(c0[2], c1[2], localT)),
			];
		}
	}
	const last = VIRIDIS_RGB[VIRIDIS_RGB.length - 1][1];
	return [...last];
}

export function viridisRgba(
	t: number,
	alpha = 220,
): [number, number, number, number] {
	const [r, g, b] = viridisRgb(t);
	return [r, g, b, alpha];
}

export function viridisLegendCss(): string {
	return "linear-gradient(to right, rgb(68,1,84), rgb(59,82,139), rgb(33,144,140), rgb(92,200,99), rgb(253,231,37))";
}

/** @deprecated use colorScaleRange */
export function countRange(values: number[]): { min: number; max: number } {
	return colorScaleRange(values, "linear");
}

/** @deprecated use countToColorT */
export function normalizeCount(
	count: number,
	min: number,
	max: number,
): number {
	const range = max - min;
	if (range <= 0) return 1;
	return clamp01((count - min) / range);
}
