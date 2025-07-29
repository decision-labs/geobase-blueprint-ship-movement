import React from "react";
import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
import { cn } from "./lib/utils";
import moment from "moment";

export type TimelineProps = {
	isPaused: boolean;
	setIsPaused: (isPaused: boolean) => void;
	setTime: (time: number) => void;
	time: number;
	startDate: Date;
	endDate: Date;
	loopLength: number;
};

export function Timeline({ time, startDate, endDate, loopLength, isPaused, setIsPaused, setTime }: TimelineProps) {
	const [isDragging, setIsDragging] = React.useState(false);
	const [percentOffset, setPercentOffset] = React.useState(0);
	const [currentDate, setCurrentDate] = React.useState(new Date());
	const sliceWidthInHours = (endDate.getTime() - startDate.getTime()) / 1000 / 60 / 60;
	const sliceWidthPercent = (sliceWidthInHours / 24) * 200; // Was 100. Set to 200 to widen the timeline.  
	const slicePercentStart = ((startDate.getTime() / 1000 / 60 / 60) % 24) / 24 * 100;
	const isPausedRef = React.useRef(isPaused);

	const startingDragPosition = React.useRef({
		handle: 0,
		timeSlice: 0,
	});
	const isDraggingRef = React.useRef(false);

	const grabHandle = React.useRef<HTMLDivElement | null>(null);
	const timeSliceRef = React.useRef<HTMLDivElement | null>(null);

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		setIsDragging(true);
		setIsPaused(true);
		isDraggingRef.current = true;
		if (grabHandle.current && timeSliceRef.current) {
			const { left: handleLeft } = grabHandle.current.getBoundingClientRect();
			const { left: timeSliceLeft } = timeSliceRef.current.getBoundingClientRect();
			startingDragPosition.current.handle = handleLeft;
			startingDragPosition.current.timeSlice = timeSliceLeft;
		}
	};

	React.useEffect(() => {
		isPausedRef.current = isPaused;
		if (isPaused) return;

		setPercentOffset((time / loopLength) * 100);
		setCurrentDate(new Date(startDate.getTime() + (time * 1000)));

	}, [time, isPaused]);

	React.useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDraggingRef.current) return;

			if (grabHandle.current && timeSliceRef.current) {
				const { timeSlice: timeSliceLeft } = startingDragPosition.current;
				let timeSliceOffset = e.clientX - timeSliceLeft;
				const timeSliceWidth = timeSliceRef.current.clientWidth;

				const maxOffset = timeSliceWidth;
				const minOffset = 0;

				if (timeSliceOffset < minOffset) {
					timeSliceOffset = minOffset;
				} else if (timeSliceOffset > maxOffset) {
					timeSliceOffset = maxOffset;
				}

				const newTime = (timeSliceOffset / timeSliceWidth) * loopLength;
				setPercentOffset((timeSliceOffset / timeSliceWidth) * 100);
				setTime(newTime);
				setCurrentDate(new Date(startDate.getTime() + (newTime * 1000)));
			}
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			isDraggingRef.current = false;
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === " ") {
				e.preventDefault();
				setIsPaused(!isPausedRef.current);
			}
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("keydown", handleKeyDown);

		};
	}, []);

	return (
		<div className={
			cn(
				"flex flex-col gap-3 select-none mt-4 text-slate-500",
				isDragging ? "cursor-grabbing" : ""
			)
		}>
			<h2 className="text-lg text-left self-left order-2 mt-2">
				Timeline {moment(currentDate).tz('Europe/Berlin').format('(DD.MM.YYYY)')}
			</h2>
			<div className="relative w-full h-20 order-1">
				<div
					ref={timeSliceRef}
					style={{
						left: `${slicePercentStart}%`,
						width: `${sliceWidthPercent}%`
					}}
					className="absolute bottom-0 h-3/4 bg-slate-800/50 border-x border-slate-500"
				>
					<div
						style={{
							width: `${percentOffset}%`,
						}}
						className="h-full bg-slate-800 border-r border-slate-500"
					></div>
					<div
						ref={grabHandle}
						style={{
							left: `${percentOffset}%`,
						}}
						onMouseDown={handleMouseDown}
						className={
							cn(
								"will-change-[left] absolute bottom-0 rounded-full bg-slate-400 w-3 h-3 translate-y-1/2 -translate-x-1/2",
								isDragging ? "" : "cursor-grab"
							)
						}
					></div>
					<div
						style={{
							left: `${percentOffset}%`,
						}}
						className="text-sm absolute -bottom-2 pointer-events-none -translate-x-1/2 translate-y-full text-slate-600 whitespace-nowrap"
					>
						{
							// Convert currentDate to berlin time 'Europe/Berlin'
							// Day month year hour:minute

							moment(currentDate).tz('UTC').format('HH:mm')
						}&nbsp;UTC
					</div>
					<div className="text-sm absolute bottom-0 left-2 pointer-events-none  -translate-y-full text-slate-600">
						{moment(startDate).tz('UTC').format('HH:mm')}
					</div>
					<div className="text-sm absolute bottom-0 right-2 pointer-events-none -translate-y-full text-slate-600">
						{moment(endDate).tz('UTC').format('HH:mm')}
					</div>
					<button
						onClick={() => setIsPaused(!isPaused)}
						className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-slate-300 hover:bg-slate-700 flex items-center justify-center transition"
					>
						{!isPaused ? <PauseIcon /> : <PlayIcon />}
					</button>
				</div>

			</div>
		</div>
	);
}
