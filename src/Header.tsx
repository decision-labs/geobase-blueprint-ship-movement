import React from "react";
import { MapAreaName } from "./lib/consts";
import { cn } from "./lib/utils";

export type HeaderProps = {
	goToView: (view: MapAreaName) => void;
	currentView: MapAreaName;
};

export function Header({
	goToView,
	currentView
}: HeaderProps) {
	return (
		<header className="flex flex-col lg:flex-row lg:justify-between gap-8 text-slate-100">
			<div className="flex flex-col gap-8">
				<h1 className="text-5xl tracking-wide leading-tight">
					Northern Waterways
				</h1>
				<div className="flex items-center gap-10">
					<button
						onClick={() => goToView("kiel-canal")}
						className={cn(
							"text-xl transition border-b-2 border-dashed",
							currentView === "kiel-canal" ? "border-neutral-600 text-slate-300" : "border-black/10 text-slate-400",
							"hover:border-neutral-600"
						)}
					>
						Kiel Canal
					</button>
					<button
						onClick={() => goToView("gothenburg")}
						className={cn(
							"text-xl transition border-b-2 border-dashed",
							currentView === "gothenburg" ? "border-neutral-600 text-slate-300" : "border-black/10 text-slate-400",
							"hover:border-neutral-600"
						)}
					>
						Gothenburg
					</button>
					<button
						onClick={() => goToView("oresund-bridge")}
						className={cn(
							"text-xl transition border-b-2 border-dashed",
							currentView === "oresund-bridge" ? "border-neutral-600 text-slate-300" : "border-black/10 text-slate-400",
							"hover:border-neutral-600"
						)}
					>
						Øresund Bridge
					</button>
					<button
						onClick={() => goToView("big-picture")}
						className={cn(
							"text-xl transition border-b-2 border-dashed",
							currentView === "big-picture"
								? "border-blue-400 text-blue-300"
								: "border-black/10 text-blue-400",
							"hover:border-blue-400"
						)}
					>
						Big Picture
					</button>
				</div>
			</div>
			<div className="grid grid-cols-3 gap-x-4 lg:gap-x-12 gap-y-4 h-fit lg:self-center">
				<div className="flex items-center whitespace-nowrap gap-2 text-sm">
					<div className="bg-white rounded-full w-3 h-3"></div>
					Ships
				</div>
				<div className="flex items-center whitespace-nowrap gap-2 text-sm">
					<div className="bg-amber-500 rounded-full w-3 h-3"></div>
					Port
				</div>
				<div className="flex items-center whitespace-nowrap gap-2 text-sm">
					<div className="bg-red-500 rounded-full w-3 h-3"></div>
					Choke Points
				</div>
				<div className="flex items-center whitespace-nowrap gap-2 text-sm">
					<div className="bg-indigo-400 rounded-full w-3 h-3"></div>
					Siding
				</div>
				<div className="flex items-center whitespace-nowrap gap-2 text-sm">
					<div className="bg-green-400 rounded-full w-3 h-3"></div>
					Anchorage
				</div>
			</div>
		</header>
	);
}
