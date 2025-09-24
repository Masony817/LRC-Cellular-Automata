import { StrictMode, useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {PlayIcon, PauseIcon, Grid2X2Plus, Turtle, Rabbit, FullscreenIcon} from 'lucide-react'
import "./index.css";
import { Canvas } from "./canvas";
import { Button } from "./components/ui/button";
import type { CanvasHandler } from "./canvas";
import type { Stats } from "./gpu";
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  useSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarSeparator,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "./components/ui/sidebar";
import { clamp, DraggableNumericInput } from "./components/ui/draggable";
import { Switch } from './components/ui/switch'

function SidebarHotkeys() {
  const { toggleSidebar } = useSidebar();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "KeyI") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleSidebar]);
  return null;
}

function App() {
  // viewport tracking
  const [widthIsMax, setWidthIsMax] = useState(false);
  const [heightIsMax, setHeightIsMax] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(1200);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const MIN_DIMENSION = 100;

  const getViewportSize = () =>
    typeof window === "undefined"
      ? { width: 1200, height: 800 }
      : { width: window.innerWidth, height: window.innerHeight };

  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    const handleResize = () => setViewportSize(getViewportSize());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (widthIsMax) {
      setCanvasWidth(viewportSize.width);
    } else if (canvasWidth > viewportSize.width) {
      setCanvasWidth(viewportSize.width);
    }
  }, [widthIsMax, viewportSize.width]);

  useEffect(() => {
    if (heightIsMax) {
      setCanvasHeight(viewportSize.height);
    } else if (canvasHeight > viewportSize.height) {
      setCanvasHeight(viewportSize.height);
    }
  }, [heightIsMax, viewportSize.height]);

  const applyWidth = useCallback(
    (next: number) => {
      if (next >= viewportSize.width) {
        setWidthIsMax(true);
        setCanvasWidth(viewportSize.width);
      } else {
        setWidthIsMax(false);
        setCanvasWidth(clamp(next, MIN_DIMENSION, viewportSize.width));
      }
    },
    [viewportSize.width]
  );

  const applyHeight = useCallback(
    (next: number) => {
      if (next >= viewportSize.height) {
        setHeightIsMax(true);
        setCanvasHeight(viewportSize.height);
      } else {
        setHeightIsMax(false);
        setCanvasHeight(clamp(next, MIN_DIMENSION, viewportSize.height));
      }
    },
    [viewportSize.height]
  );

  const handleWidthText = useCallback(
    (text: string) => {
      if (text.trim().toLowerCase() === "max") {
        setWidthIsMax(true);
        setCanvasWidth(viewportSize.width);
        return true;
      }
      const parsed = Number.parseInt(text, 10);
      if (!Number.isNaN(parsed)) {
        applyWidth(parsed);
        return true;
      }
      return false;
    },
    [applyWidth, viewportSize.width]
  );

  const handleHeightText = useCallback(
    (text: string) => {
      if (text.trim().toLowerCase() === "max") {
        setHeightIsMax(true);
        setCanvasHeight(viewportSize.height);
        return true;
      }
      const parsed = Number.parseInt(text, 10);
      if (!Number.isNaN(parsed)) {
        applyHeight(parsed);
        return true;
      }
      return false;
    },
    [applyHeight, viewportSize.height]
  );

  //rest of the sidebar control stuff
  const canvasRef = useRef<CanvasHandler>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cellSize, setCellSize] = useState(2);
  const [mode, setMode] = useState<"LCR" | "Conway">("LCR");
  const [speed, setSpeedValue] = useState(200); //200ms default
  const [density, setDensity] = useState(30); //0.3 default

  useEffect(() => {
    if (stats?.speed != null) {
      setSpeedValue(stats.speed);
    }
  }, [stats?.speed]);

  const handleSpeedChange = useCallback((next: number) => {
    const clamped = clamp(next, 50, 1000);
    setSpeedValue(clamped);
    canvasRef.current?.setSpeed(clamped);
  }, []);

  const handleDensityChange = useCallback((next: number) => {
    const clamped = clamp(next, 0, 100);
    setDensity(clamped);
    canvasRef.current?.randomize(clamped / 100);
  }, []);

  const handleCellSizeChange = useCallback((next: number) => {
    const clamped = clamp(next, 1, 10);
    setCellSize(clamped);
  }, []);

  return (
    <SidebarProvider>
      <Sidebar side="right" variant="sidebar" collapsible="offcanvas">
        <SidebarHeader>
           <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-sidebar-foreground/80 min-w-[80px]">
              Gen {stats?.generation ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => canvasRef.current?.toggle()}
                aria-label={stats?.isRunning ? "Pause" : "Play"}
              >
                {stats?.isRunning ? (
                  <PauseIcon fill="black" />
                ) : (
                  <PlayIcon fill="black" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => canvasRef.current?.reset()}
                aria-label="Clear"
              >
                Clear
              </Button>
            </div>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            {/*<SidebarGroupLabel>Rule Set</SidebarGroupLabel>*/}
            <SidebarGroupContent>
              <div className="flex pt-2 items-center justify-between gap-2">
                <span className={`text-sm ${mode === "Conway" ? "font-bold" : ""}`}>Conway</span>
                <Switch
                  checked={mode === "LCR"}
                  onCheckedChange={(checked: boolean) => {
                    const newMode = checked ? "LCR" : "Conway";
                    setMode(newMode);
                    canvasRef.current?.setMode(newMode);
                  }}
                />
                <span className={`text-sm ${mode === "LCR" ? "font-bold" : ""}`}>LCR-CA</span>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Grid Size</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex items-center gap-2 ">
                  <DraggableNumericInput
                    width={24}
                    ariaLabel="Canvas width"
                    label="W"
                    value={canvasWidth}
                    min={MIN_DIMENSION}
                    max={viewportSize.width}
                    dragScale={5}
                    displayValue={widthIsMax ? "max" : undefined}
                    onChange={applyWidth}
                    onTextCommit={handleWidthText}
                  />
                
                  <DraggableNumericInput
                    width={24}
                    ariaLabel="Canvas height"
                    label="H"
                    value={canvasHeight}
                    min={MIN_DIMENSION}
                    max={viewportSize.height}
                    dragScale={5}
                    displayValue={heightIsMax ? "max" : undefined}
                    onChange={applyHeight}
                    onTextCommit={handleHeightText}
                  />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Cell Size & Density</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex items-center gap-2">
                <DraggableNumericInput
                  width={24}
                  ariaLabel="Cell size in pixels"
                  label={FullscreenIcon}
                  labelClassName="w-4 h-4 text-sidebar-foreground/60"
                  value={cellSize}
                  min={1}
                  max={10}
                  dragScale={0.1}
                  onChange={handleCellSizeChange}
                />
                {/* <span className="text-xs text-sidebar-foreground/60">px</span> */}
                
                <DraggableNumericInput
                  width={24}
                  ariaLabel="Random fill density percentage"
                  label={Grid2X2Plus}
                  labelClassName="w-4 h-4 text-sidebar-foreground/60"
                  value={density}
                  min={0}
                  max={100}
                  dragScale={0.5}
                  onChange={handleDensityChange}
                />
                {/* <span className="text-xs text-sidebar-foreground/60">%</span> */}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Speed</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex items-center gap-2">
                <DraggableNumericInput
                  width={48}
                  ariaLabel="Simulation speed in milliseconds"
                  label={speed > 350 ? Turtle : Rabbit}
                  labelClassName="w-4 h-4 text-sidebar-foreground/60"
                  value={speed}
                  min={50}
                  max={1000}
                  dragScale={4}
                  onChange={handleSpeedChange}
                />
                <span className="text-xs text-sidebar-foreground/60">ms</span>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter />
      </Sidebar>

      <SidebarInset className="min-h-screen flex flex-col items-center justify-center">
        <Canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          cellSize={cellSize}
          mode={mode}
          onStatsUpdate={setStats}
        />
      </SidebarInset>

      <SidebarHotkeys />
    </SidebarProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
