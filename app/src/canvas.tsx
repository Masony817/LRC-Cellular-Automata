import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WebGPUManager } from './WebGPUManager';
import { GPU, type Stats } from './gpu';
import { PATTERNS, type PatternName, getPatternCells, setPatterns } from './patterns';

interface CanvasProps{
    width?: number;
    height?: number;
    cellSize?: number;
}

export const Canvas: React.FC<CanvasProps> = ({
     width = 800, 
     height = 600, 
     cellSize = 4
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameRef = useRef<GPU | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [uiVisible, setUiVisible] = useState(true);

    // drawing
    const [isDragging, setIsDragging] = useState(false);
    const drawingStateRef = useRef<0 | 1>(1);
    const [mousePos, setMousePos] = useState<{col: number; row: number} | null>(null);

    // pattern 
    const [selectedPattern, setSelectedPattern] = useState<PatternName | null>(null);
    const [dropdownVisible, setDropdownVisible] = useState(false);
    const [dropdownPos, setDropdownPos] = useState<{x: number; y: number}>({ x: 0, y: 0 });

    const gridWidth = Math.floor(width / cellSize);
    const gridHeight = Math.floor(height / cellSize);

    //cached grid and coordination
    const gridDataRef = useRef<Uint32Array | null>(null);
    const fetchInFlightRef = useRef<Promise<void> | null>(null);
    const pendingGenRef = useRef<number | null>(null);
    const rafIdRef = useRef<number | null>(null); 
    const initStartedRef = useRef(false);

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
                            const drawCol = mousePos.col + c;
                            const drawRow = mousePos.row + r;
                            if (drawCol >= 0 && drawCol < gridWidth && drawRow >= 0 && drawRow < gridHeight){
                                ctx.fillRect(drawCol * cellSize, drawRow * cellSize, cellSize, cellSize);
                                ctx.strokeRect(drawCol * cellSize, drawRow * cellSize, cellSize, cellSize);
                            }
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
    }, [width, height, cellSize, gridWidth, gridHeight, selectedPattern, mousePos]);

    const requestDraw = useCallback(() => {
        if(rafIdRef.current) return;
        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            drawFromCache();
        });
    }, [drawFromCache]);

    const scheduleFetch = useCallback((generation: number)=>{
        pendingGenRef.current = generation;
        if(fetchInFlightRef.current) return;

        const runOnce = async () => {
            pendingGenRef.current = null;
            const game = gameRef.current;
            if(!game) return;
            const gridData = await game.getGridData();
            gridDataRef.current = gridData;
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
    }, [])

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
            setIsInitialized(true);
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
                    for (let r = 0; r < cells.length; r++){
                        for (let c = 0; c < cells[r].length; c++){
                            if (cells[r][c] === 1){
                                const col = pos.col + c;
                                const row = pos.row + r;
                                if (col >= 0 && col < gridWidth && row >= 0 && row < gridHeight){
                                    data[row * gridWidth + col] = 1;
                                }
                            }
                        }
                    }
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
        // update CPU cache and redraw
        const data = gridDataRef.current;
        if (data){
            data[pos.row * gridWidth + pos.col] = desired;
            requestDraw();
        }
        setIsDragging(true);
    }, [cellSize, selectedPattern]);

    const handleMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = localCoordsToCell(event);
        if (!pos) return;
        setMousePos(pos);
        if (isDragging && !selectedPattern && gameRef.current){
            gameRef.current.setCell(pos.col, pos.row, drawingStateRef.current);
            const data = gridDataRef.current;
            if (data){
                data[pos.row * gridWidth + pos.col] = drawingStateRef.current;
                requestDraw();
            }
        }
    }, [isDragging, selectedPattern]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleCanvasClick = useCallback((_event: React.MouseEvent<HTMLCanvasElement>) => {
        // placeholder to keep onClick, actual actions handled on mouse down/up
    }, []);

    // Keyboard shortcuts and dropdown handling
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!gameRef.current) return;
            const code = e.code;
            if ([ 'Space', 'KeyR', 'Escape', 'KeyI' ].includes(code) || (code === 'KeyC' && e.ctrlKey)){
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
                    setDropdownVisible(false);
                    break;
                case 'KeyI':
                    setUiVisible(v => !v);
                    break;
                default:
                    if (code === 'KeyC' && e.ctrlKey){
                        gameRef.current.reset();
                    }
                    break;
            }
        };

        const onDocumentClick = (e: MouseEvent) => {
            if (e.shiftKey){
                e.preventDefault();
                setDropdownVisible(true);
                setDropdownPos({ x: e.clientX, y: e.clientY });
            } else {
                setDropdownVisible(false);
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('click', onDocumentClick);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('click', onDocumentClick);
        };
    }, [stats]);

    return (
        <div className="flex flex-col items-center space-y-4 relative w-full">
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

          {dropdownVisible && (
            <div
              className="absolute z-50 bg-black border border-white rounded p-2 max-h-72 overflow-y-auto min-w-[220px]"
              style={{ left: dropdownPos.x, top: dropdownPos.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-2 hover:bg-gray-700 cursor-pointer"
                onClick={() => { setSelectedPattern(null); setDropdownVisible(false); }}
              >
                <div className="font-bold">None</div>
                <div className="text-xs text-gray-300">Draw Mode</div>
              </div>
              {Object.keys(PATTERNS).map((key) => {
                const k = key as PatternName;
                const p = PATTERNS[k];
                return (
                  <div
                    key={key}
                    className="p-2 hover:bg-gray-700 cursor-pointer flex items-center justify-between"
                    onClick={() => { setSelectedPattern(k); setDropdownVisible(false); }}
                  >
                    <div>
                      <div className="font-bold">{p.name}</div>
                      <div className="text-xs text-gray-300">{p.description}</div>
                    </div>
                    <div className="ml-2 text-xs text-gray-400">{p.cells.length}x{Math.max(...p.cells.map(r => r.length))}</div>
                  </div>
                );
              })}
            </div>
          )}

          {stats && (
            <div className="flex space-x-4 text-sm text-gray-300">
              <span>Generation: {stats.generation}</span>
              <span>Status: {stats.isRunning ? 'Running' : 'Paused'}</span>
              <span>Speed: {stats.speed}ms</span>
              {selectedPattern && <span>Pattern: {PATTERNS[selectedPattern].name}</span>}
            </div>
          )}

          {isInitialized && uiVisible && (
            <div className="flex flex-wrap gap-2 items-center justify-center">
              <button
                onClick={() => gameRef.current?.start()}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Start
              </button>
              <button
                onClick={() => gameRef.current?.stop()}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Stop
              </button>
              <button
                onClick={() => gameRef.current?.reset()}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Clear
              </button>
              <button
                onClick={() => gameRef.current?.randomize(0.3)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Random Fill
              </button>
              <div className="flex items-center gap-2 text-sm text-gray-300 ml-4">
                <label>Speed</label>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={50}
                  defaultValue={stats?.speed ?? 200}
                  onChange={(e) => gameRef.current?.setSpeed(parseInt(e.target.value))}
                  className="w-40"
                />
              </div>
            </div>
          )}
        </div>
      );
};
