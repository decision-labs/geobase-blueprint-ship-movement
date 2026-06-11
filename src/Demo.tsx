import React, {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { MVTLayer, TripsLayer, H3HexagonLayer } from "@deck.gl/geo-layers";
import Map from "react-map-gl/maplibre";
import DeckGL, {
	MapController,
	GeoJsonLayer,
	LinearInterpolator,
	MapViewState,
	IconLayer,
} from "deck.gl";
import { MapActivityToolbar } from "./components/map-activity-toolbar";
import { HexColorLegend } from "./components/hex-color-legend";
import LoadingLine from "./components/ui/loading-line";
import { Timeline } from "./Timeline";
import { createClient } from "@supabase/supabase-js";
import "./styles.css";
import {
	MAP_STYLE,
	MapAreaName,
	TIME_VECTOR_TILES_URL,
	VITE_GEOBASE_ANON_KEY,
	VITE_GEOBASE_URL,
	defaultAnimationSpeed,
	defaultTrailLength,
	aggregateHexBins,
	animationTimeBinIndex,
	buildHexBinsByIndex,
	activityIntervalForLoop,
	type HexActivityRow,
	map_areas,
	ports_and_things,
	transitionProps,
	STATIC_TIME_RANGE,
	MIN_H3_RESOLUTION,
	resolutionForQuery,
} from "./lib/consts";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import { Header } from "./Header";
import {
	type CountColorScale,
	countToColorT,
	viridisRgba,
} from "./lib/viridis";

const supabase = createClient(VITE_GEOBASE_URL, VITE_GEOBASE_ANON_KEY);

/** ~3 m between freehand samples so fast drags still register enough vertices. */
const DRAW_MIN_SEGMENT_DEG = 0.00003;

class DemoMapController extends MapController {}

export default function Demo({
	animationSpeed = defaultAnimationSpeed,
}) {
	const [isTripsLayerLoading, setIsTripsLayerLoading] = useState(true);
	const [isLoading, setIsLoading] = useState(true);
	const [activityData, setActivityData] = useState<HexActivityRow[]>([]);
	const [time, setTime] = useState(0);
	const timeRef = useRef(0);
	const isPausedRef = useRef(false);
	const verticesRef = useRef<[number, number][]>([]);
	const [isPaused, setIsPaused] = useState(false);
	const [isDrawing, setIsDrawing] = useState(false);
	const [isHexLayerVisible, setIsHexLayerVisible] = useState(false);
	const [hexSyncWithTimeline, setHexSyncWithTimeline] = useState(true);
	const [countColorScale, setCountColorScale] =
		useState<CountColorScale>("percentile");
	const [queryError, setQueryError] = useState<string | null>(null);
	const [isActivityLoading, setIsActivityLoading] = useState(false);
	const isQueryingRef = useRef(false);
	const hexCountsRef = useRef<number[]>([]);
	const countColorScaleRef = useRef<CountColorScale>("percentile");
	const hexBinsByIndexRef = useRef<Record<number, HexActivityRow[]>>({});
	const hexBinIndexRef = useRef(-1);
	const isHexLayerVisibleRef = useRef(false);
	const hexSyncWithTimelineRef = useRef(true);
	const loopLengthRef = useRef(0);
	const minTimestampRef = useRef<number | null>(null);
	const activityIntervalRef = useRef(activityIntervalForLoop(0));
	const [tripsLayerEpoch, setTripsLayerEpoch] = useState(0);
	const [dataTimeRange, setDataTimeRange] = useState<{
		start_time: string;
		end_time: string;
	} | null>(null);
	const [startDate, setStartDate] = useState<Date | null>(null);
	const [endDate, setEndDate] = useState<Date | null>(null);
	const [minTimestamp, setMinTimestamp] = useState<number | null>(null);
	const [maxTimestamp, setMaxTimestamp] = useState<number | null>(null);

	const loopLength = (maxTimestamp ?? 0) - (minTimestamp ?? 0);

	function setHexBatch(batch: HexActivityRow[]) {
		hexCountsRef.current = batch.map((d) => d.count);
		setActivityData(batch);
	}

	function syncHexLayerToTime(timeOffsetSec: number) {
		if (!isHexLayerVisibleRef.current || !hexSyncWithTimelineRef.current) {
			return;
		}
		const binIdx = animationTimeBinIndex(
			timeOffsetSec,
			loopLengthRef.current,
			activityIntervalRef.current,
		);
		if (binIdx === hexBinIndexRef.current) return;
		hexBinIndexRef.current = binIdx;
		setHexBatch(hexBinsByIndexRef.current[binIdx] ?? []);
	}

	function applyHexDisplayMode(syncWithTimeline: boolean) {
		if (!isHexLayerVisibleRef.current) return;
		hexBinIndexRef.current = -1;
		if (syncWithTimeline) {
			syncHexLayerToTime(timeRef.current);
		} else {
			setHexBatch(aggregateHexBins(hexBinsByIndexRef.current));
		}
	}

	function setAnimationTime(nextTime: number) {
		timeRef.current = nextTime;
		setTime(nextTime);
		syncHexLayerToTime(nextTime);
	}

	const [polygonLayer, setPolygonLayer] = useState(
		() =>
			new GeoJsonLayer({
				id: "polygon-layer",
				data: {
					type: "FeatureCollection",
					features: [
						{
							type: "Feature",
							geometry: {
								type: "LineString",
								coordinates: [],
							},
						},
					],
				},
				pickable: false,
				stroked: true,
				lineWidthMinPixels: 2,
				getLineColor: [255, 255, 255],
			}),
	);
	const [mapViewState, setMapViewState] = useState<MapViewState>({
		longitude: 10.6821,
		latitude: 56.19442,
		zoom: 5.5,
		minZoom: 0,
		maxZoom: 23,
		bearing: 0,
		pitch: 0,
	});
	const [currentMapArea, setCurrentMapArea] =
		useState<MapAreaName>("kiel-canal");
	const isLoadingRef = useRef<boolean>(isLoading);
	const isDrawingRef = useRef<boolean>(isDrawing);
	const zoomRef = useRef<number>(mapViewState.zoom);

	function enableDrawingMode() {
		setIsDrawing(true);
		isDrawingRef.current = true;
	}

	type Icon = {
		name: string;
		type: string;
		area: string;
		coordinates: [longitude: number, latitude: number];
	};

	const iconLayer = new IconLayer<Icon>({
		id: "IconLayer",
		data: ports_and_things,
		getIcon: (d: Icon) => d.type,
		getPosition: (d: Icon) => d.coordinates,
		getSize: 20,
		iconAtlas: "/atlas.png",
		iconMapping: "/atlas.json",
		pickable: !isDrawing,
	});

	const tripsLayer = new MVTLayer({
		id: "trips",
		data: `${TIME_VECTOR_TILES_URL}&_=${tripsLayerEpoch}`,
		binary: false,
		pickable: !isDrawing,
		minZoom: 5,
		lineWidthMinPixels: 1,
		onTileLoad: onTileLoad,
		onTileError: () => setIsTripsLayerLoading(false),
		maxCacheSize: 0,
		currentTime: time,
		renderSubLayers: (props) =>
			new TripsLayer(props, {
				data: props.data,
				getPath: (d) => d.geometry.coordinates,
				getTimestamps: (d) => d.properties.timestamps,
				getColor: () => [255, 255, 255],
				opacity: 0.8,
				widthMinPixels: 3,
				trailLength: defaultTrailLength,
				pickable: false,
			}),
	});

	const h3ActivityLayer = new H3HexagonLayer({
		id: "H3HexagonLayer",
		data: activityData,
		extruded: true,
		getHexagon: (d) => d.hexid,
		getFillColor: (d) => {
			const t = countToColorT(
				d.count,
				hexCountsRef.current,
				countColorScaleRef.current,
			);
			const alpha = Math.round(130 + t * 125);
			return viridisRgba(t, alpha);
		},
		getElevation: (d) => d.count,
		elevationScale: 20,
		pickable: !isDrawing,
	});

	function onTileLoad(tile: any) {
		const epochMinTs = minTimestampRef.current;
		if (epochMinTs == null) {
			tile.content = [];
			return;
		}

		setIsTripsLayerLoading(true);
		setIsLoading(false);

		const features = [];

		if (!tile.content || tile.content.length === 0) {
			tile.content = features;
			return;
		}

		for (const feature of tile.content) {
			const ts = feature.properties.times;
			const ts_final = ts
				.substring(1, ts.length - 1)
				.split(",")
				.map((t: string) => parseInt(t, 10) - epochMinTs);

			// slice Multi into individual features
			if (feature.geometry.type === "MultiLineString") {
				let index = 0;
				for (const coords of feature.geometry.coordinates) {
					const ts_segment = ts_final.slice(
						index,
						index + coords.length,
					);
					features.push({
						...feature,
						geometry: {
							type: "LineString",
							coordinates: coords,
						},
						properties: {
							tripid: Math.round(Math.random() * 100000),
							timestamps: ts_segment,
						},
					});
					index = coords.length;
				}
			} else {
				features.push({
					...feature,
					properties: {
						tripid: Math.round(Math.random() * 100000),
						route_id: feature.properties.trip_id
							? feature.properties.trip_id
							: 0,
						timestamps: ts_final,
					},
				});
			}
		}

		setIsTripsLayerLoading(false);
		tile.content = features;
	}

	const clearH3Layer = () => {
		setActivityData([]);
		resetDrawingPolygon();
		setIsDrawing(false);
		isDrawingRef.current = false;
		hexBinsByIndexRef.current = {};
		hexBinIndexRef.current = -1;
		isHexLayerVisibleRef.current = false;
		setIsHexLayerVisible(false);
		setQueryError(null);
	};

	function updatePolygonPreview(
		coords: [number, number][],
		closePolygon = false,
	) {
		verticesRef.current = coords;

		const geometry =
			closePolygon && coords.length >= 3
				? {
						type: "Polygon" as const,
						coordinates: [[...coords, coords[0]]],
					}
				: { type: "LineString" as const, coordinates: coords };

		setPolygonLayer(
			new GeoJsonLayer({
				id: "polygon-layer",
				data: { type: "Feature", geometry },
				pickable: true,
				stroked: true,
				filled: closePolygon && coords.length >= 3,
				lineWidthMinPixels: 2,
				getLineColor: [255, 255, 255],
				getFillColor: [255, 255, 255, 50],
			}),
		);
	}

	function appendVertex(coord: [number, number]) {
		const verts = verticesRef.current;
		if (verts.length === 0) {
			updatePolygonPreview([coord]);
			return;
		}
		const last = verts[verts.length - 1];
		const dx = coord[0] - last[0];
		const dy = coord[1] - last[1];
		const dist = Math.hypot(dx, dy);
		if (dist < 1e-10) return;

		const newVerts = [...verts];
		if (dist > DRAW_MIN_SEGMENT_DEG) {
			const steps = Math.ceil(dist / DRAW_MIN_SEGMENT_DEG);
			for (let i = 1; i <= steps; i++) {
				const t = i / steps;
				newVerts.push([last[0] + dx * t, last[1] + dy * t]);
			}
		} else {
			newVerts.push(coord);
		}
		updatePolygonPreview(newVerts);
	}

	function resetDrawingPolygon() {
		verticesRef.current = [];
		updatePolygonPreview([]);
	}

	function handleMapDragStart(event: { coordinate?: number[] }) {
		if (!isDrawingRef.current || !event.coordinate) return;
		setQueryError(null);
		const coord = event.coordinate as [number, number];
		updatePolygonPreview([coord]);
	}

	function handleMapDrag(event: { coordinate?: number[] }) {
		if (!isDrawingRef.current || !event.coordinate) return;
		appendVertex(event.coordinate as [number, number]);
	}

	function handleMapDragEnd() {
		if (!isDrawingRef.current) return;
		const verts = verticesRef.current;
		if (verts.length < 3) {
			setQueryError(
				"Shape too small — drag a longer loop on the map, then release.",
			);
			resetDrawingPolygon();
			enableDrawingMode();
			return;
		}
		updatePolygonPreview(verts, true);
		void runActivityQuery(verts);
	}

	async function runActivityQuery(coords: [number, number][]) {
		if (coords.length < 3) {
			setQueryError(
				"Shape too small — drag a longer loop on the map, then release.",
			);
			resetDrawingPolygon();
			enableDrawingMode();
			return;
		}
		if (isQueryingRef.current) {
			setQueryError("Still loading the last query — try again in a moment.");
			return;
		}

		const closed = [...coords, coords[0]];
		let areaM2 = 0;
		try {
			areaM2 = area(turfPolygon([closed]));
		} catch {
			setQueryError("Could not read that shape — try drawing again.");
			resetDrawingPolygon();
			enableDrawingMode();
			return;
		}

		let resolution_val = resolutionForQuery(
			zoomRef.current,
			closed,
			areaM2,
		);

		setIsDrawing(false);
		isDrawingRef.current = false;
		isQueryingRef.current = true;
		setQueryError(null);

		const geojson = JSON.stringify({
			type: "Polygon",
			coordinates: [closed],
		});

		let data: HexActivityRow[] | null = null;
		let error: { message?: string } | null = null;

		// Yield so the animation loop can tick before loading UI + network work.
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => resolve()),
		);
		startTransition(() => setIsActivityLoading(true));

		try {
			while (resolution_val >= MIN_H3_RESOLUTION) {
				const result = await supabase.rpc(
					"activity_by_region_and_time_local",
					{
						geojson,
						interval_val: activityIntervalRef.current,
						resolution_val,
					},
				);
				data = result.data;
				error = result.error;
				if (
					!error?.message?.includes("hex cells") ||
					resolution_val <= MIN_H3_RESOLUTION
				) {
					break;
				}
				resolution_val--;
			}
		} finally {
			resetDrawingPolygon();
			isQueryingRef.current = false;
			setIsActivityLoading(false);
		}

		if (error) {
			const msg = error.message ?? "Activity query failed";
			setQueryError(
				msg.includes("timeout")
					? "Query timed out — draw a smaller area."
					: msg.includes("hex cells")
						? "Area too large — draw a smaller loop or zoom in."
						: msg
			);
			enableDrawingMode();
			return;
		}

		const groupedData = (data ?? []).reduce(
			(acc: Record<string, HexActivityRow[]>, curr: HexActivityRow) => {
				if (!curr.time_int) return acc;
				if (!acc[curr.time_int]) acc[curr.time_int] = [];
				acc[curr.time_int].push(curr);
				return acc;
			},
			{},
		);

		if (Object.keys(groupedData).length === 0) {
			setQueryError(
				"No ship activity in this area for the current time range.",
			);
			enableDrawingMode();
			return;
		}

		if (minTimestamp) {
			hexBinsByIndexRef.current = buildHexBinsByIndex(
				groupedData,
				minTimestamp,
				activityIntervalRef.current,
			);
		}
		hexBinIndexRef.current = -1;
		isHexLayerVisibleRef.current = true;
		setIsHexLayerVisible(true);
		applyHexDisplayMode(hexSyncWithTimelineRef.current);
	}

	function applyMapView(view: MapViewState) {
		zoomRef.current = view.zoom;
		setMapViewState(view);
	}

	function goToView(view: MapAreaName) {
		switch (view) {
			case "kiel-canal":
				setCurrentMapArea("kiel-canal");
				applyMapView({ ...map_areas[0], ...transitionProps });
				break;
			case "gothenburg":
				setCurrentMapArea("gothenburg");
				applyMapView({ ...map_areas[1], ...transitionProps });
				break;
			case "oresund-bridge":
				setCurrentMapArea("oresund-bridge");
				applyMapView({ ...map_areas[2], ...transitionProps });
				break;
			case "big-picture":
				setCurrentMapArea("big-picture");
				applyMapView({ ...map_areas[3], ...transitionProps });
				break;
		}
	}

	const handleMapLoad = useCallback(() => {
		goToView("kiel-canal");
		setMapViewState((viewState) => {
			const next = {
				...viewState,
				bearing: viewState.bearing,
				transitionDuration: 1000,
				transitionInterpolator: new LinearInterpolator(["bearing"]),
			};
			zoomRef.current = next.zoom;
			return next;
		});
	}, []);

	useEffect(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isQueryingRef.current) {
				clearH3Layer();
			}
		};

		window.addEventListener("keydown", handleKeydown);

		return () => {
			window.removeEventListener("keydown", handleKeydown);
		};
	}, []);

	useEffect(() => {
		isDrawingRef.current = isDrawing;
	}, [isDrawing]);

	useEffect(() => {
		isLoadingRef.current = isLoading;
	}, [isLoading]);

	useEffect(() => {
		loopLengthRef.current = loopLength;
		if (loopLength > 0) {
			activityIntervalRef.current = activityIntervalForLoop(loopLength);
		}
	}, [loopLength]);

	useEffect(() => {
		minTimestampRef.current = minTimestamp;
		if (minTimestamp != null) {
			setTripsLayerEpoch((epoch) => epoch + 1);
		}
	}, [minTimestamp]);

	useEffect(() => {
		isHexLayerVisibleRef.current = isHexLayerVisible;
	}, [isHexLayerVisible]);

	useEffect(() => {
		hexSyncWithTimelineRef.current = hexSyncWithTimeline;
	}, [hexSyncWithTimeline]);

	useEffect(() => {
		countColorScaleRef.current = countColorScale;
		if (hexCountsRef.current.length > 0) {
			setActivityData((prev) => [...prev]);
		}
	}, [countColorScale]);

	useEffect(() => {
		isPausedRef.current = isPaused;
	}, [isPaused]);

	useEffect(() => {
		if (!startDate || !endDate || loopLength <= 0) return;

		let rafId: number;

		const animateTrails = () => {
			if (!isPausedRef.current && loopLengthRef.current > 0) {
				const nextTime =
					(timeRef.current + animationSpeed) % loopLengthRef.current;
				timeRef.current = nextTime;
				setTime(nextTime);
				syncHexLayerToTime(nextTime);
			}
			rafId = window.requestAnimationFrame(animateTrails);
		};

		rafId = window.requestAnimationFrame(animateTrails);

		return () => {
			window.cancelAnimationFrame(rafId);
		};
	}, [animationSpeed, loopLength, startDate, endDate]);

	async function fetchTimeRange() {
		const { data, error } = await supabase.rpc("get_ships_time_range");

		if (error) {
			console.error("Error fetching time range:", error);
			return null;
		}

		return data?.[0] ?? null;
	}

	useEffect(() => {
		async function loadTimeRange() {
			let result = null;
			if (STATIC_TIME_RANGE?.start_time && STATIC_TIME_RANGE?.end_time) {
				result = STATIC_TIME_RANGE;
			} else {
				result = await fetchTimeRange();
			}

			if (result) {
				const start = new Date(result.start_time);
				const end = new Date(result.end_time);
				setStartDate(start);
				setEndDate(end);
				setMinTimestamp(Math.floor(start.getTime() / 1000));
				setMaxTimestamp(Math.floor(end.getTime() / 1000));
				setDataTimeRange(result);
			}
		}

		void loadTimeRange();
	}, []);

	return dataTimeRange ? (
		<div className="bg-slate-900 p-10 fixed h-screen w-screen flex flex-col gap-6 max-w-[75rem] left-1/2 -translate-x-1/2">
			<Header goToView={goToView} currentView={currentMapArea} />
			<div className="relative w-full h-full bg-slate-950 drop-shadow-paper">
				{isLoading || isActivityLoading ? <LoadingLine /> : null}
				{isTripsLayerLoading && (
					<div className="absolute top-4 left-4 bg-slate-800 text-slate-100 px-4 py-2 rounded-md">
						Loading trips...
					</div>
				)}
				{queryError ? (
					<div className="absolute top-4 left-4 max-w-sm bg-red-950/90 text-red-100 px-4 py-2 rounded-md text-sm">
						{queryError}
					</div>
				) : null}
				<DeckGL
					getCursor={() => {
						return isDrawingRef.current ? "crosshair" : "grab";
					}}
					initialViewState={mapViewState}
					onViewStateChange={({ viewState }) => applyMapView(viewState)}
					layers={[
						tripsLayer,
						isHexLayerVisible ? h3ActivityLayer : null,
						polygonLayer,
						iconLayer,
					].filter(Boolean)}
					onDragStart={handleMapDragStart}
					onDrag={handleMapDrag}
					onDragEnd={handleMapDragEnd}
					controller={{
						type: DemoMapController,
						dragPan: !isDrawing,
						scrollZoom: !isDrawing,
						doubleClickZoom: !isDrawing,
						touchRotate: !isDrawing,
						keyboard: !isDrawing,
					}}
					onLoad={handleMapLoad}
				>
					<Map mapStyle={MAP_STYLE}></Map>
				</DeckGL>


				{isHexLayerVisible ? (
					<HexColorLegend
						counts={activityData.map((d) => d.count)}
						scale={countColorScale}
						onScaleChange={setCountColorScale}
					/>
				) : null}
				{!isLoading ? (
					<MapActivityToolbar
						disabled={isActivityLoading}
						isDrawing={isDrawing}
						isHexLayerVisible={isHexLayerVisible}
						hexSyncWithTimeline={hexSyncWithTimeline}
						onDrawClick={() => {
							if (isHexLayerVisible) {
								clearH3Layer();
							} else {
								setIsDrawing((drawing) => {
									const next = !drawing;
									isDrawingRef.current = next;
									if (!next) clearH3Layer();
									else {
										setQueryError(null);
										resetDrawingPolygon();
									}
									return next;
								});
							}
						}}
						onSyncChange={(sync) => {
							setHexSyncWithTimeline(sync);
							hexSyncWithTimelineRef.current = sync;
							applyHexDisplayMode(sync);
						}}
					/>
				) : null}
				<p className="absolute left-0 -bottom-2 translate-y-full tracking-wide text-sm text-slate-100/50">
					Created with{" "}
					<a
						href="https://geobase.app"
						className="hover:underline text-slate-100"
					>
						geobase.app
					</a>
				</p>
			</div>
			<Timeline
				loopLength={loopLength}
				startDate={startDate}
				endDate={endDate}
				time={time}
				setTime={setAnimationTime}
				isPaused={isPaused}
				setIsPaused={setIsPaused}
			/>
		</div>
	) : null;
}
