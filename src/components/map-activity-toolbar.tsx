import type { ReactNode } from "react";
import { Eraser, Link2, PencilLine, Unlink } from "lucide-react";
import { cn } from "../lib/utils";

type MapActivityToolbarProps = {
	disabled?: boolean;
	isDrawing: boolean;
	isHexLayerVisible: boolean;
	hexSyncWithTimeline: boolean;
	onDrawClick: () => void;
	onSyncChange: (sync: boolean) => void;
};

function ToolbarButton({
	active,
	disabled,
	icon,
	label,
	onClick,
	title,
}: {
	active?: boolean;
	disabled?: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
	title: string;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			title={title}
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 px-3 py-2 text-sm transition-colors rounded-md",
				"disabled:opacity-50 disabled:pointer-events-none",
				active
					? "bg-amber-500/20 text-amber-100"
					: "text-slate-100 hover:bg-slate-700/80",
			)}
		>
			{icon}
			<span className="font-medium whitespace-nowrap">{label}</span>
		</button>
	);
}

export function MapActivityToolbar({
	disabled,
	isDrawing,
	isHexLayerVisible,
	hexSyncWithTimeline,
	onDrawClick,
	onSyncChange,
}: MapActivityToolbarProps) {
	const drawLabel = isHexLayerVisible
		? "Clear hex"
		: isDrawing
			? "Stop drawing"
			: "Draw area";

	const drawIcon = isHexLayerVisible ? (
		<Eraser className="h-4 w-4 shrink-0" strokeWidth={2} />
	) : (
		<PencilLine className="h-4 w-4 shrink-0" strokeWidth={2} />
	);

	return (
		<div
			className={cn(
				"absolute left-1/2 top-4 z-10 -translate-x-1/2",
				"flex items-center gap-1 p-1 rounded-lg",
				"bg-slate-800/95 text-slate-100 drop-shadow-paper backdrop-blur-sm",
				"border border-slate-700/80",
			)}
		>
			<ToolbarButton
				disabled={disabled}
				active={isDrawing && !isHexLayerVisible}
				icon={drawIcon}
				label={drawLabel}
				onClick={onDrawClick}
				title={
					isHexLayerVisible
						? "Clear hexagons (Esc)"
						: isDrawing
							? "Stop drawing (Esc)"
							: "Draw an area to view AIS ping activity"
				}
			/>

			{isHexLayerVisible ? (
				<>
					<div className="w-px h-7 bg-slate-600/80 mx-0.5" aria-hidden />
					<button
						type="button"
						role="switch"
						aria-checked={hexSyncWithTimeline}
						aria-label="Sync ping counts with trip routes"
						title={
							hexSyncWithTimeline
								? "Ping counts follow trip routes on the timeline"
								: "Showing total ping counts across all time"
						}
						onClick={() => onSyncChange(!hexSyncWithTimeline)}
						className={cn(
							"flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
							"hover:bg-slate-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
							hexSyncWithTimeline ? "text-amber-100" : "text-slate-300",
						)}
					>
						{hexSyncWithTimeline ? (
							<Link2 className="h-4 w-4 shrink-0" strokeWidth={2} />
						) : (
							<Unlink className="h-4 w-4 shrink-0" strokeWidth={2} />
						)}
						<span className="font-medium whitespace-nowrap">
							Sync pings with routes
						</span>
						<span
							className={cn(
								"relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
								hexSyncWithTimeline
									? "bg-amber-500/90"
									: "bg-slate-600",
							)}
						>
							<span
								className={cn(
									"pointer-events-none absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
									hexSyncWithTimeline
										? "translate-x-4"
										: "translate-x-0",
								)}
							/>
						</span>
					</button>
				</>
			) : null}
		</div>
	);
}
