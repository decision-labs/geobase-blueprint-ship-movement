import React, { useEffect, useState } from "react";
import { MVTLayer, TripsLayer, H3HexagonLayer } from "@deck.gl/geo-layers";
import Map, { Marker, useMap } from "react-map-gl/maplibre";
import DeckGL, {
	MapController,
	GeoJsonLayer,
	LinearInterpolator,
	MapViewState,
	PathLayer,
	IconLayer,
} from "deck.gl";
import { useRef, useCallback } from "react";
import moment from "moment-timezone";
import LoadingLine from './components/ui/loading-line';
import { cn } from "./lib/utils";
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
	end_date,
	interval_val,
	map_areas,
	max_timestamp,
	min_timestamp,
	ports_and_things,
	start_date,
	transitionProps,
  time_range,
} from "./lib/consts";
import { Header } from "./Header";
import { MjolnirGestureEvent } from "mjolnir.js";

const supabase = createClient(VITE_GEOBASE_URL, VITE_GEOBASE_ANON_KEY);

export default function Demo({
	loopLength = max_timestamp - min_timestamp,
	animationSpeed = defaultAnimationSpeed,
}) {
	const [isTripsLayerLoading, setIsTripsLayerLoading] = useState(true);
	const [isLoading, setIsLoading] = useState(true);
	const [activityData, setActivityData] = useState([]);
	const [time, setTime] = useState(0);
	const [hexTimestampIndex, setHexTimestampIndex] = useState(0);
	const [hexTimestamps, setHexTimestamps] = useState([]);
	const [hexGroups, setHexGroups] = useState([]);
	const [mvtTripsUrl, setMvtTripsUrl] = useState(TIME_VECTOR_TILES_URL);
	const [vertices, setVertices] = useState([]);
	const [isPaused, setIsPaused] = useState(false);
	const isHexPulsePaused = useRef(false);
	const [isDrawing, setIsDrawing] = useState(false);
	const [isHexLayerVisible, setIsHexLayerVisible] = useState(false);
	const [polygonLayer, setPolygonLayer] = useState<GeoJsonLayer>(
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
			pickable: true,
			stroked: true,
			lineWidthMinPixels: 2,
			getLineWidth: 1,
			getFillColor: [255, 0, 0, 100],
			getLineColor: [200, 200, 200, 200],
			getPointRadius: 4,
		}),
	);
	const circleData = useRef({
		center: [0, 0],
		radius: 0,
	});
	const [trailAnimation] = useState<{
		id: number | null;
	}>({
		id: null,
	});
	const [hexAnimation] = useState<{
		id: number | null;
	}>({
		id: null,
	});
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
	const classRef = useRef<any>(
		class DemoMapController extends MapController {
			constructor(props) {
				super(props);
				this.state = {
					...this.state,
				};
			}

			protected _onPanStart(event: MjolnirGestureEvent): boolean {
				if (isDrawingRef.current) {
					event.preventDefault();
					return false;
				} else {
					return super._onPanStart(event);
				}
			}
		},
	);

	

	type Icon = {
		name: string;
		type: string;
		area: string;
		coordinates: [longitude: number, latitude: number];
	};

	const iconLayer = new IconLayer<Icon>({
		id: "IconLayer",
		data: ports_and_things,
		// getColor: (d: Icon) => [Math.sqrt(d.exits), 140, 0],
		getIcon: (d: Icon) => d.type,
		getPosition: (d: Icon) => d.coordinates,
		getSize: 20,
		iconAtlas: "/atlas.png",
		iconMapping: "/atlas.json",
		pickable: true,
	});

	const tripsLayer = new MVTLayer({
		id: "trips",
		data: mvtTripsUrl,
		binary: false,
		minZoom: 5,
		// maxZoom: 23,
		lineWidthMinPixels: 1,
		onTileLoad: onTileLoad,
		onTileError: () => {
			setIsTripsLayerLoading(false);
		},
		maxCacheSize: 0,
		currentTime: time, // it has to be here, not inside the TripsLayer
		// loadOptions: { mode: 'no-cors' }, // this causes problem of mode being deprecated
		renderSubLayers: (props) => {
			return new TripsLayer(props, {
				data: props.data,
				getPath: (d) => d.geometry.coordinates,
				getTimestamps: (d) => d.properties.timestamps,
				getColor: (d) => {
					return [255, 255, 255]; // dark mode
					// return [50, 48, 43]; // light mode
				},
				opacity: 0.8,
				widthMinPixels: 3,
				trailLength: defaultTrailLength,
			});
		},
	});

	const hexToRGBAArray = (hex: string) => {
		const r = parseInt(hex.substring(1, 3), 16);
		const g = parseInt(hex.substring(3, 5), 16);
		const b = parseInt(hex.substring(5, 7), 16);
		const a = parseInt(hex.substring(7, 9), 16);
		return [r, g, b, a];
	};


	const h3ActivityLayer = new H3HexagonLayer({
		id: "H3HexagonLayer",
		data: activityData,
		extruded: true,
		getHexagon: (d) => d.hexid,
		getFillColor: (d) => [255, (1 - d.count / 500) * 255, 0],
		getElevation: (d) => d.count,
		elevationScale: 20,
		pickable: true,
	});

	function onTileLoad(tile: any) {
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
				.map((t: string) => {
					return parseInt(t, 10) - min_timestamp;
				});

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
		h3ActivityLayer.props.data = [];
		setVertices([]);
		setPolygonLayer(null);
		setIsDrawing(false);
		setHexTimestamps([]);
		setHexGroups([]);
		setHexTimestampIndex(0);
		setIsHexLayerVisible(false);
	};

	function getH3Resolution(radius) {
		let resolution;

		const area = radius;
		switch (true) {
			case area < 0.895 * 10:
				resolution = 11; // < 1m
				break;
			case area < 6.2 * 10:
				resolution = 10; // < 7
				break;
			case area < 44 * 10:
				resolution = 9; // < 44
				break;
			case area < 307 * 10:
				resolution = 8; // < 307
				break;
			case area < 2150 * 10:
				resolution = 7; // < 2150
				break;
			case area < 15000 * 10:
				resolution = 6; // < 15000
				break;
			default:
				resolution = 6;
		}

		return resolution;
	}

	function handleMapDrag(event) {
		if (isDrawing) {
			const { coordinate } = event;
			const newVertices = [...vertices, coordinate];
			setVertices(newVertices);
			setPolygonLayer(
				new GeoJsonLayer({
					id: "polygon-layer",
					data: {
						type: "Feature",
						geometry: {
							type: "LineString",
							coordinates: newVertices,
						},
					},
					pickable: true,
					stroked: true,
					filled: false,
					lineWidthMinPixels: 2,
					getLineColor: [255, 255, 255],
				}),
			);
		}
	}

	async function handleMapDragEnd(event) {
		if (!isDrawing) return;

		if (vertices.length > 3) {
			setIsDrawing(false);
			const newVertices = [...vertices, vertices[0]];
			setVertices(newVertices);
			setPolygonLayer(
				new GeoJsonLayer({
					id: "polygon-layer",
					data: {
						type: "Feature",
						geometry: {
							type: "Polygon",
							coordinates: [newVertices],
						},
					},
					pickable: true,
					filled: true,
					lineCapRounded: true,
					lineJointRounded: true,
					stroked: true,
					lineWidthMinPixels: 2,
					getLineColor: [255, 255, 255],
					getFillColor: [255, 255, 255, 50],
				}),
			);

			const geojson ={
				type: "Polygon",
				coordinates: [newVertices],
			};

			const resolution_val = 7;

			setIsLoading(true);
			let { data, error } = await supabase.rpc(
				"activity_by_region_and_time_local",
				{
					geojson,
					interval_val,
					resolution_val,
				},
			);

			setPolygonLayer(null);
			setVertices([]);

			if (error) console.error(error);
			else {
				const groupedData = data.reduce((acc, curr) => {
					if (!acc[curr.time_int]) {
						acc[curr.time_int] = [];
					}
					acc[curr.time_int].push(curr);
					return acc;
				}, {});

				let allTimestamps = Object.keys(groupedData);
				allTimestamps = allTimestamps.sort((a, b) => {
					const dateA = new Date(a);
					const dateB = new Date(b);
					return dateA - dateB;
				});

				setHexTimestamps(allTimestamps);
				setHexGroups(groupedData);
				setHexTimestampIndex(1);
				setIsHexLayerVisible(true);
				setIsLoading(false);
			}
		}
	}

	function goToView(view: MapAreaName) {
		switch (view) {
			case "kiel-canal":
				setCurrentMapArea("kiel-canal");
				setMapViewState({
					...map_areas[0],
					...transitionProps,
				});
				break;
			case "gothenburg":
				setCurrentMapArea("gothenburg");
				setMapViewState({
					...map_areas[1],
					...transitionProps,
				});
				break;
			case "oresund-bridge":
				setCurrentMapArea("oresund-bridge");
				setMapViewState({
					...map_areas[2],
					...transitionProps,
				});
				break;
			case "big-picture":
				setCurrentMapArea("big-picture");
				setMapViewState({
					...map_areas[3],
					...transitionProps,
				});
				break;
		}
	}

	// This function calculates the hexTimestampIndex based on the current time
	function calculateHexTimestampIndex(time: number) {
		// Convert interval_val to milliseconds
		const intervalParts = interval_val.split(" ");
		const intervalValue = parseInt(intervalParts[0]);
		const intervalUnit = intervalParts[1];
		let intervalMilliseconds: number;
		switch (intervalUnit) {
			case "hour":
			case "hours":
				intervalMilliseconds = intervalValue * 60 * 60 * 1000;
				break;
			case "min":
			case "mins":
				intervalMilliseconds = intervalValue * 60 * 1000;
				break;
			// Add more cases if you have other units
			default:
				throw new Error(`Unsupported interval unit: ${intervalUnit}`);
		}

		const intervalSeconds = intervalMilliseconds / 1000;
		// Calculate the total number of bins
		const totalBins = loopLength / intervalSeconds;

		// Calculate the hexTimestampIndex by finding the bin that the current time falls into
		const hexTimestampIndex = Math.floor(time / intervalSeconds);

		// Make sure the index is within the range of total bins
		return hexTimestampIndex % totalBins;
	}

	const handleMapLoad = useCallback(() => {
		goToView("kiel-canal");
		setMapViewState((viewState) => ({
			...viewState,
			bearing: viewState.bearing,
			transitionDuration: 1000,
			transitionInterpolator: new LinearInterpolator(["bearing"]),
			// onTransitionEnd: rotateCamera,
		}));
	}, []);

	useEffect(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (!isLoadingRef.current) {
					clearH3Layer();
				}
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
		setActivityData(hexGroups[hexTimestamps[hexTimestampIndex]] || []);
		h3ActivityLayer.data =
			hexGroups[hexTimestamps[hexTimestampIndex]] || [];
	}, [hexTimestampIndex]);

	useEffect(() => {
		if (hexTimestamps.length === 0) return;
		const timer = setInterval(() => {
			if (!isHexPulsePaused.current) {
				setHexTimestampIndex(calculateHexTimestampIndex(time));
			}
		}, 200);
		return () => clearInterval(timer);
	}, [hexTimestamps]);

	useEffect(() => {
		const animateTrails = () => {
			if (!isPaused)
				setTime((t) => {
					const newTime = (t + animationSpeed) % loopLength;
					// Calculate the new hexTimestampIndex based on the newTime
					if (activityData.length > 0) {
						const newHexTimestampIndex =
							calculateHexTimestampIndex(newTime);
						setHexTimestampIndex(newHexTimestampIndex);
					}
					return newTime;
				});
			// setTime((t) => (t + animationSpeed) % loopLength);
			trailAnimation.id = window.requestAnimationFrame(animateTrails);
		};

		trailAnimation.id = window.requestAnimationFrame(animateTrails);

		return () => {
			window.cancelAnimationFrame(trailAnimation.id);
		};
	}, [isPaused, setTime, animationSpeed, loopLength]);

	const date = new Date(hexTimestamps[hexTimestampIndex]);
	const utcTime = moment.utc(date).format("YYYY-MM-DD HH:mm:ss");

// use get_time_range to get the time range

const [dataTimeRange, setDataTimeRange] = useState(null);

useEffect( () => {
  setDataTimeRange(time_range);
}, []);

	return dataTimeRange ? (
		<div className="bg-slate-900 p-10 fixed h-screen w-screen flex flex-col gap-6 max-w-[75rem] left-1/2 -translate-x-1/2">
			<Header goToView={goToView} currentView={currentMapArea} />
			<div className="relative w-full h-full bg-slate-950 drop-shadow-paper">
				{isLoading ? <LoadingLine /> : <div></div>}
				{isTripsLayerLoading && (
					<div className="absolute top-4 left-4 bg-slate-800 text-slate-100 px-4 py-2 rounded-md">
						Loading trips...
					</div>
				)}
				<DeckGL
					getCursor={() => {
						return isDrawingRef.current ? "crosshair" : "grab";
					}}
					initialViewState={mapViewState}
					layers={[
						tripsLayer,
						h3ActivityLayer,
						polygonLayer,
						iconLayer,
					]}
					onDrag={handleMapDrag}
					onDragEnd={handleMapDragEnd}
					controller={classRef.current}
					onLoad={handleMapLoad}
				>
					<Map mapStyle={MAP_STYLE}></Map>
				</DeckGL>


				{!isLoading ? (
					<button
						onClick={() => {
							if (isHexLayerVisible) {
								clearH3Layer();
							} else {
								setIsDrawing(!isDrawing);
								if (isDrawing) {
									clearH3Layer();
								}
							}
						}}
						className="absolute right-4 top-4 px-4 py-3 bg-slate-800 text-slate-100 drop-shadow-paper text-sm hover:bg-slate-700 active:bg-slate-800"
					>
						{isHexLayerVisible
							? "Clear hexagons (Esc)"
							: isDrawing
								? "Stop drawing (Esc)"
								: "Draw to view activity"}
					</button>
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
				startDate={start_date}
				endDate={end_date}
				time={time}
				setTime={setTime}
				isPaused={isPaused}
				setIsPaused={setIsPaused}
			/>
		</div>
	) : null;
}
