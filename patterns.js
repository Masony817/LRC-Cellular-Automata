// patterns.js - pattern definitions and utilities

// some known conway's game of life patterns
export const PATTERNS = {
    glider: {
        name: "Glider",
        description: "Classic moving pattern",
        cells: [
            [0, 1, 0],
            [0, 0, 1],
            [1, 1, 1]
        ]
    },
    lwss: {
        name: "LWSS",
        description: "Lightweight Spaceship",
        cells: [
            [1, 0, 0, 1, 0],
            [0, 0, 0, 0, 1],
            [1, 0, 0, 0, 1],
            [0, 1, 1, 1, 1]
        ]
    },
    gosperGun: {
        name: "Gosper Gun",
        description: "First discovered gun pattern",
        cells: [
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
            [0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
            [1,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [1,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,1,1,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
        ]
    },
    pulsar: {
        name: "Pulsar",
        description: "Period-3 oscillator",
        cells: [
            [0,0,1,1,1,0,0,0,1,1,1,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [0,0,1,1,1,0,0,0,1,1,1,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,1,1,1,0,0,0,1,1,1,0,0],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [1,0,0,0,0,1,0,1,0,0,0,0,1],
            [0,0,0,0,0,0,0,0,0,0,0,0,0],
            [0,0,1,1,1,0,0,0,1,1,1,0,0]
        ]
    },
    pentadecathlon: {
        name: "Pentadecathlon",
        description: "Period-15 oscillator",
        cells: [
            [1,1,1,1,1,1,1,1],
            [1,0,1,1,1,1,0,1],
            [1,1,1,1,1,1,1,1]
        ]
    },
    rpentomino: {
        name: "R-pentomino",
        description: "Methuselah pattern",
        cells: [
            [0,1,1],
            [1,1,0],
            [0,1,0]
        ]
    },
    acorn: {
        name: "Acorn",
        description: "Long-lived methuselah",
        cells: [
            [0,1,0,0,0,0,0],
            [0,0,0,1,0,0,0],
            [1,1,0,0,1,1,1]
        ]
    },
    diehard: {
        name: "Diehard",
        description: "Dies after 130 generations",
        cells: [
            [0,0,0,0,0,0,1,0],
            [1,1,0,0,0,0,0,0],
            [0,1,0,0,0,1,1,1]
        ]
    },
    beacon: {
        name: "Beacon",
        description: "Period-2 oscillator",
        cells: [
            [1,1,0,0],
            [1,1,0,0],
            [0,0,1,1],
            [0,0,1,1]
        ]
    },
    toad: {
        name: "Toad",
        description: "Period-2 oscillator",
        cells: [
            [0,1,1,1],
            [1,1,1,0]
        ]
    }
};

// places a pattern on the grid at specified coordinates

export function placePattern(grid, gridCol, gridRow, patternKey, gridWidth, gridHeight) {
    const pattern = PATTERNS[patternKey];
    if (!pattern) return false;
    
    // check if pattern fits within bounds
    for (let row = 0; row < pattern.cells.length; row++) {
        for (let col = 0; col < pattern.cells[row].length; col++) {
            const targetCol = gridCol + col;
            const targetRow = gridRow + row;
            
            if (targetCol < 0 || targetCol >= gridWidth || 
                targetRow < 0 || targetRow >= gridHeight) {
                return false; // pattern doesn't fit
            }
        }
    }
    
    // place a pattern
    for (let row = 0; row < pattern.cells.length; row++) {
        for (let col = 0; col < pattern.cells[row].length; col++) {
            if (pattern.cells[row][col] === 1) {
                const targetCol = gridCol + col;
                const targetRow = gridRow + row;
                grid[targetRow][targetCol] = 1;
            }
        }
    }
    
    return true;
}

// draws a pattern preview on the canvas
export function drawPatternPreview(ctx, gridCol, gridRow, patternKey, tileSize, gridWidth, gridHeight) {
    const pattern = PATTERNS[patternKey];
    if (!pattern) return;
    
    const startCol = gridCol;
    const startRow = gridRow;
    
    // draw preview cells with a red hint
    ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.lineWidth = 2;
    
    for (let row = 0; row < pattern.cells.length; row++) {
        for (let col = 0; col < pattern.cells[row].length; col++) {
            if (pattern.cells[row][col] === 1) {
                const drawCol = startCol + col;
                const drawRow = startRow + row;
                
                // check bounds
                if (drawCol >= 0 && drawCol < gridWidth && drawRow >= 0 && drawRow < gridHeight) {
                    const x = drawCol * tileSize;
                    const y = drawRow * tileSize;
                    
                    // fill with preview color
                    ctx.fillRect(x, y, tileSize, tileSize);
                    
                    // add border
                    ctx.strokeRect(x, y, tileSize, tileSize);
                }
            }
        }
    }
}

// draws a small pattern preview on a canvas for the dropdown menu

export function drawPatternPreviewSmall(canvas, patternKey) {
    const pattern = PATTERNS[patternKey];
    if (!pattern) return;
    
    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // clear canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // calculate cell size to fit pattern in canvas
    const patternWidth = Math.max(...pattern.cells.map(row => row.length));
    const patternHeight = pattern.cells.length;
    const cellSize = Math.min(
        Math.floor(canvasWidth / patternWidth),
        Math.floor(canvasHeight / patternHeight)
    );
    
    // center the pattern
    const offsetX = Math.floor((canvasWidth - patternWidth * cellSize) / 2);
    const offsetY = Math.floor((canvasHeight - patternHeight * cellSize) / 2);
    
    // draw pattern
    ctx.fillStyle = 'white';
    for (let row = 0; row < pattern.cells.length; row++) {
        for (let col = 0; col < pattern.cells[row].length; col++) {
            if (pattern.cells[row][col] === 1) {
                const x = offsetX + col * cellSize;
                const y = offsetY + row * cellSize;
                ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
            }
        }
    }
}
