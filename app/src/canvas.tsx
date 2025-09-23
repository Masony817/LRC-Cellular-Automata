import React, { useRef, useEffect, useState, useCallback, useImperativeHandle } from 'react';
import { WebGPUManager } from './WebGPUManager';
import { GPU, type Stats } from './gpu';
import { type PatternName, getPatternCells, setPatterns } from './patterns';

interface CanvasProps{
    width?: number;
    height?: number;
    cellSize?: number;
    mode? : 'LCR' | 'Conway';
    onStatsUpdate? : (stats: Stats) => void;
}

export type CanvasHandler = {
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
  randomize: (density?: number) => void;
  setSpeed: (ms: number) => void;
  setMode: (mode: 'LCR' | 'Conway') => void;
  getStats: () => Stats | null;
}

export const Canvas = React.forwardRef<CanvasHandler, CanvasProps>(({
     width = 800, 
     height = 600, 
     cellSize = 4,
     mode = 'Conway',
     onStatsUpdate = () => {}
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameRef = useRef<GPU | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    // removed in-canvas UI; keep component headless and controlled from parent


    // drawing
    const [isDragging, setIsDragging] = useState(false);
    const drawingStateRef = useRef<0 | 1>(1);
    const [mousePos, setMousePos] = useState<{col: number; row: number} | null>(null);

    // pattern (to be migrated into sidebar controls)
    const [selectedPattern, setSelectedPattern] = useState<PatternName | null>(null);

    const gridWidth = Math.floor(width / cellSize);
    const gridHeight = Math.floor(height / cellSize);

    //cached grid and coordination
    const gridDataRef = useRef<Uint32Array | null>(null);
    const fetchInFlightRef = useRef<Promise<void> | null>(null);
    const pendingGenRef = useRef<number | null>(null);
    const rafIdRef = useRef<number | null>(null); 
    const initStartedRef = useRef(false);

    const wrap = useCallback((n: number, max: number) => {
        const r = n % max;
        return r < 0 ? r + max : r;
    }, []);

    const drawFromCache = useCallback(() => {
        const canvas = canvasRef.current;
        const data = gridDataRef.current;
        if(!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        //clear canvas
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        //render cells
        if(data){
        ctx.fillStyle = 'white';
        for (let row = 0; row < gridHeight; row++){
            let base = row * gridWidth;
            for (let col = 0; col < gridWidth; col++){
                if (data[base + col] === 1){
                    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                }
                }
            }
        }
        
        if(selectedPattern && mousePos){
            const cells = getPatternCells(selectedPattern);
            if (cells){
                ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.lineWidth = 1;
                for (let r = 0; r < cells.length; r++){
                    for (let c = 0; c < cells[r].length; c++){
                        if (cells[r][c] === 1){
                            const drawCol = wrap(mousePos.col + c, gridWidth);
                            const drawRow = wrap(mousePos.row + r, gridHeight);
                            ctx.fillRect(drawCol * cellSize, drawRow * cellSize, cellSize, cellSize);
                            ctx.strokeRect(drawCol * cellSize, drawRow * cellSize, cellSize, cellSize);
                        }
                    }
                }
            }
        }
        //draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 0.5;

        for (let col = 0; col <= gridWidth; col++){
            ctx.beginPath();
            ctx.moveTo(col * cellSize, 0);
            ctx.lineTo(col * cellSize, gridHeight * cellSize);
            ctx.stroke();
        }

        for (let row = 0; row <= gridHeight; row++){
            ctx.beginPath();
            ctx.moveTo(0, row * cellSize);
            ctx.lineTo(gridWidth * cellSize, row * cellSize);
            ctx.stroke();
        }
    }, [width, height, cellSize, gridWidth, gridHeight, selectedPattern, mousePos, wrap]);

    const requestDraw = useCallback(() => {
        if(rafIdRef.current) return;
        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            drawFromCache();
        });
    }, [drawFromCache]);
    const requestDrawRef = useRef<() => void>(() => {});
    useEffect(() => {
        requestDrawRef.current = requestDraw;
    }, [requestDraw]);


    useImperativeHandle(ref, () => ({
      start: () => gameRef.current?.start(),
      stop: () => gameRef.current?.stop(),
      toggle: () => { stats?.isRunning ? gameRef.current?.stop() : gameRef.current?.start() },
      reset: () => gameRef.current?.reset(),
      randomize: (density?: number) => gameRef.current?.randomize(density),
      setSpeed: (ms: number) => gameRef.current?.setSpeed(ms),
      setMode: (mode) => gameRef.current?.setMode(mode),
      getStats: () => stats,
    }), [stats]);

    const scheduleFetch = useCallback((generation: number)=>{
        pendingGenRef.current = generation;
        if(fetchInFlightRef.current) return;

        const runOnce = async () => {
            pendingGenRef.current = null;
            const game = gameRef.current;
            if(!game) return;
            const gridData = await game.getGridData();
            gridDataRef.current = gridData;

            // compute alive count (to be surfaced later in sidebar)

            // fetched and cached one frame of grid data
            requestDraw();
        };
        const loop = async () => {
            do {
                await runOnce();
            } while (pendingGenRef.current !== null);
        };
        fetchInFlightRef.current = loop().finally(()=> {
            fetchInFlightRef.current = null;
        });
    }, [requestDraw]);

    const handleStatsUpdate = useCallback((newStats: Stats) =>{
        setStats(newStats);
        onStatsUpdate?.(newStats);
    }, [onStatsUpdate]);

    useEffect(() => {
        if(stats){
            scheduleFetch(stats.generation);
        }
    }, [stats?.generation, scheduleFetch]);

    useEffect(() => {
        requestDraw();
    }, [mousePos, selectedPattern, cellSize, gridWidth, gridHeight, width, height, requestDraw]);

    useEffect(() => {

        if(initStartedRef.current) return;
        initStartedRef.current = true;

        const initializeWebGPU = async () => {
            const webGPUManager = WebGPUManager.getInstance();

            if (!webGPUManager.isSupported()){
                console.error('WebGPU not supported');
                return;
            }

            const success = await webGPUManager.init();
            if (!success){
                console.error('Failed to initialize WebGPU');
                return;
            }

            console.log('WebGPU initialized successfully');
            const device = webGPUManager.getDevice();
            const game = new GPU(device, gridWidth, gridHeight, handleStatsUpdate);

            await game.init();
            console.log('Game initialized successfully');

            //random pattern init
            game.randomize();
            console.log('Random pattern initialized');

            gameRef.current = game;
            console.log('Canvas initialized successfully');
        };

        // load patterns JSON
        const loadPatterns = async () => {
            try {
                const res = await fetch('/patterns.json');
                if (!res.ok) throw new Error(`Failed to fetch patterns: ${res.status}`);
                const data = await res.json();
                setPatterns(data);
                console.log('Patterns loaded', { count: Object.keys(data || {}).length });
            } catch (err) {
                console.error('Error loading patterns.json', err);
            }
        };

        initializeWebGPU();
        loadPatterns();

        return () =>{
            console.log('Canvas unmounted');
            if (gameRef.current){
                gameRef.current.destroy();
            }
        }
    }, [gridWidth, gridHeight, handleStatsUpdate]);

    // controlled mode by parent component
    useEffect(()=>{
      gameRef.current?.setMode(mode);
    }, [mode]);

    // resize GPU when grid dims change due to width/height/cellSize
    useEffect(() => {
        if (!gameRef.current) return;
        gameRef.current.resize(gridWidth, gridHeight);
        // invalidate CPU cache and redraw
        gridDataRef.current = null;
        requestDrawRef.current();
    }, [gridWidth, gridHeight]);
    
    const localCoordsToCell = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const col = Math.floor((event.clientX - rect.left) / cellSize);
        const row = Math.floor((event.clientY - rect.top) / cellSize);
        return { col, row };
    };

    const handleMouseDown = useCallback(async (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!gameRef.current) return;
        const pos = localCoordsToCell(event);
        if (!pos) return;
        setMousePos(pos);

        if (selectedPattern){
            const cells = getPatternCells(selectedPattern);
            if (cells){
                gameRef.current.placePattern(cells, pos.col, pos.row);
                // update CPU cache immediately for responsiveness
                const data = gridDataRef.current;
                if (data){
                    let delta = 0;
                    for (let r = 0; r < cells.length; r++){
                        for (let c = 0; c < cells[r].length; c++){
                            if (cells[r][c] === 1){
                                const col = wrap(pos.col + c, gridWidth);
                                const row = wrap(pos.row + r, gridHeight);
                                const idx = row * gridWidth + col;
                                if (data[idx] === 0){
                                  data[idx] = 1;
                                  delta++;
                                }
                            }
                        }
                    }
                    // alive count state removed; will be reintroduced via sidebar later
                    requestDraw();
                    console.log('Pattern applied to CPU cache', { pattern: selectedPattern, at: pos });
                }
            }
            return;
        }

        // draw mode
        const current = await gameRef.current.getCell(pos.col, pos.row);
        const desired = (current === 1 ? 0 : 1) as 0 | 1;
        drawingStateRef.current = desired;
        gameRef.current.setCell(pos.col, pos.row, desired);
        // update CPU cache and redraw (wrapping)
        const data = gridDataRef.current;
        if (data){
            const col = wrap(pos.col, gridWidth);
            const row = wrap(pos.row, gridHeight);
            const idx = row * gridWidth + col;
            const old = data[idx];
            const next = drawingStateRef.current;
            if (old !== next){
              data[idx] = next;
              // alive count state removed; will be reintroduced via sidebar later
            }
            requestDraw();
        }
        setIsDragging(true);
    }, [cellSize, selectedPattern, wrap]);

    const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = localCoordsToCell(event);
        if (!pos) return;
        setMousePos(pos);
        if (isDragging && !selectedPattern && gameRef.current){
            gameRef.current.setCell(pos.col, pos.row, drawingStateRef.current);
            const data = gridDataRef.current;
            if (data){
                const col = wrap(pos.col, gridWidth);
                const row = wrap(pos.row, gridHeight);
                data[row * gridWidth + col] = drawingStateRef.current;
                requestDraw();
            }
        }
    }, [isDragging, selectedPattern, wrap]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleCanvasClick = useCallback((_event: React.MouseEvent<HTMLCanvasElement>) => {
        // placeholder to keep onClick, actual actions handled on mouse down/up
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!gameRef.current) return;
            const code = e.code;
            if ([ 'Space', 'KeyR', 'Escape' ].includes(code) || (code === 'KeyC' && e.ctrlKey)){
                e.preventDefault();
            }
            switch (code){
                case 'Space':
                    if (stats?.isRunning){
                        gameRef.current.stop();
                    } else {
                        gameRef.current.start();
                    }
                    break;
                case 'KeyR':
                    gameRef.current.randomize();
                    break;
                case 'Escape':
                    setSelectedPattern(null);
                    break;
                default:
                    if (code === 'KeyC' && e.ctrlKey){
                        gameRef.current.reset();
                    }
                    break;
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [stats]);

    return (
        <div className="flex flex-col items-center space-y-4 relative w-full">
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="border border-gray-300 cursor-crosshair"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>
      );
});
Canvas.displayName = 'Canvas';
