import { Info } from "lucide-react";
import {
	type CountColorScale,
	COUNT_COLOR_SCALE_OPTIONS,
	colorScaleRange,
	viridisLegendCss,
} from "../lib/viridis";
import { cn } from "../lib/utils";

type HexColorLegendProps = {
	counts: number[];
	scale: CountColorScale;
	onScaleChange: (scale: CountColorScale) => void;
};

export function HexColorLegend({
	counts,
	scale,
	onScaleChange,
}: HexColorLegendProps) {
	const range = colorScaleRange(counts, scale);
	const scaleMeta =
		COUNT_COLOR_SCALE_OPTIONS.find((o) => o.value === scale) ??
		COUNT_COLOR_SCALE_OPTIONS[0];

	return (
		<div className="absolute bottom-4 left-4 z-10 flex w-[15rem] flex-col gap-2 overflow-visible rounded-md border border-slate-700/80 bg-slate-800/95 px-3.5 py-2.5 text-xs text-slate-300">
			<div className="flex items-center justify-between gap-2">
				<span className="shrink-0 text-slate-400">Ping count</span>
				<div className="flex shrink-0 items-center gap-1.5">
					<select
						value={scale}
						onChange={(e) =>
							onScaleChange(e.target.value as CountColorScale)
						}
						className="min-w-[6.25rem] rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[11px] text-slate-100"
						aria-label="Color scale for ping counts"
					>
						{COUNT_COLOR_SCALE_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
					<div className="relative shrink-0 group">
						<button
							type="button"
							className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-700/60 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60"
							aria-label={`About ${scaleMeta.label} color scale`}
						>
							<Info className="h-3.5 w-3.5" strokeWidth={2} />
						</button>
						<div
							role="tooltip"
							className={cn(
								"pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 w-52",
								"rounded-md border border-slate-600 bg-slate-900 px-2.5 py-2 text-[11px] leading-snug text-slate-200 shadow-lg",
								"opacity-0 translate-y-1 transition-all duration-150",
								"group-hover:opacity-100 group-hover:translate-y-0",
								"group-focus-within:opacity-100 group-focus-within:translate-y-0",
							)}
						>
							<p className="font-medium text-slate-100 mb-1">
								{scaleMeta.label} scale
							</p>
							<p>{scaleMeta.description}</p>
						</div>
					</div>
				</div>
			</div>
			<p className="text-[10px] leading-snug text-slate-500">
				{scaleMeta.summary}
			</p>
			<div
				className="h-2 w-full rounded-sm"
				style={{ background: viridisLegendCss() }}
			/>
			<div className="flex justify-between tabular-nums">
				<span>{Math.round(range.min)}</span>
				<span>{Math.round(range.max)}</span>
			</div>
		</div>
	);
}
