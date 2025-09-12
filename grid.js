// grid.js - grid management and rendering

export class Cell {
    constructor(row, col, state) {
        this.row = row;
        this.col = col;
        this.state = state;
        this.nextState = state;
    }

    updateNeighborCount(grid, gridWidth, gridHeight) {
        this.liveNeighbors = this.countLiveNeighbors(grid, gridWidth, gridHeight);
    }

    countLiveNeighbors(grid, gridWidth, gridHeight) {
        let count = 0;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue;
                
                const neighborRow = this.row + i;
                const neighborCol = this.col + j;
                
                // Check bounds
                if (neighborRow >= 0 && neighborRow < gridHeight && 
                    neighborCol >= 0 && neighborCol < gridWidth) {
                    count += grid[neighborRow][neighborCol];
                }
            }
        }
        return count;
    }

    updateState() {
        // conway's game of life rules
        if (this.state === 1) {
            // live cell survives with 2 or 3 neighbors
            this.nextState = (this.liveNeighbors === 2 || this.liveNeighbors === 3) ? 1 : 0;
        } else {
            // dead cell becomes alive with exactly 3 neighbors
            this.nextState = (this.liveNeighbors === 3) ? 1 : 0;
        }
    }
}

export class Grid {
    constructor(canvas, tileSize = 10) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.tileSize = tileSize;
        this.updateDimensions();
        this.initializeGrid();
    }

    updateDimensions() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gridWidth = Math.floor(this.canvas.width / this.tileSize);
        this.gridHeight = Math.floor(this.canvas.height / this.tileSize);
    }

    initializeGrid() {
        this.grid = Array(this.gridHeight).fill().map(() => Array(this.gridWidth).fill(0));
    }

    clearGrid() {
        this.grid = Array(this.gridHeight).fill().map(() => Array(this.gridWidth).fill(0));
    }

    randomFill(density = 0.3) {
        for (let row = 0; row < this.gridHeight; row++) {
            for (let col = 0; col < this.gridWidth; col++) {
                this.grid[row][col] = Math.random() < density ? 1 : 0;
            }
        }
    }

    getCell(row, col) {
        if (row >= 0 && row < this.gridHeight && col >= 0 && col < this.gridWidth) {
            return this.grid[row][col];
        }
        return 0;
    }

    setCell(row, col, state) {
        if (row >= 0 && row < this.gridHeight && col >= 0 && col < this.gridWidth) {
            this.grid[row][col] = state;
        }
    }

    toggleCell(row, col) {
        if (row >= 0 && row < this.gridHeight && col >= 0 && col < this.gridWidth) {
            this.grid[row][col] = this.grid[row][col] === 1 ? 0 : 1;
            return this.grid[row][col];
        }
        return 0;
    }

    getGridPosition(x, y) {
        return {
            col: Math.floor(x / this.tileSize),
            row: Math.floor(y / this.tileSize)
        };
    }

    isValidPosition(row, col) {
        return row >= 0 && row < this.gridHeight && col >= 0 && col < this.gridWidth;
    }

    draw(selectedPattern = null, patternPreviewActive = false, mouseX = 0, mouseY = 0, drawPatternPreview = null) {
        // clear canvas
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // draw cells
        for (let row = 0; row < this.gridHeight; row++) {
            for (let col = 0; col < this.gridWidth; col++) {
                if (this.grid[row][col] === 1) {
                    this.ctx.fillStyle = "white";
                    this.ctx.fillRect(col * this.tileSize, row * this.tileSize, this.tileSize, this.tileSize);
                }
            }
        }
        
        // draw grid lines
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        this.ctx.lineWidth = 0.5;

        for (let col = 0; col <= this.gridWidth; col++) {
            this.ctx.beginPath();
            this.ctx.moveTo(col * this.tileSize, 0);
            this.ctx.lineTo(col * this.tileSize, this.gridHeight * this.tileSize);
            this.ctx.stroke();
        }
        for (let row = 0; row <= this.gridHeight; row++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, row * this.tileSize);
            this.ctx.lineTo(this.gridWidth * this.tileSize, row * this.tileSize);
            this.ctx.stroke();
        }
        
        // draw pattern preview if available
        if (selectedPattern && patternPreviewActive && drawPatternPreview) {
            const gridCol = Math.floor(mouseX / this.tileSize);
            const gridRow = Math.floor(mouseY / this.tileSize);
            drawPatternPreview(this.ctx, gridCol, gridRow, selectedPattern, this.tileSize, this.gridWidth, this.gridHeight);
        }
    }

    // compute next generation
    computeNextGeneration() {
        const nextGrid = Array(this.gridHeight).fill().map(() => Array(this.gridWidth).fill(0));
        
        // process cell
        for (let row = 0; row < this.gridHeight; row++) {
            for (let col = 0; col < this.gridWidth; col++) {
                const cell = new Cell(row, col, this.grid[row][col]);
                cell.updateNeighborCount(this.grid, this.gridWidth, this.gridHeight);
                cell.updateState();
                nextGrid[row][col] = cell.nextState;
            }
        }
        
        this.grid = nextGrid;
    }

    resize() {
        const oldGrid = this.grid;
        const oldWidth = this.gridWidth;
        const oldHeight = this.gridHeight;
        
        this.updateDimensions();
        this.initializeGrid();
        
        // copy over existing cells that still fit when resized
        const copyWidth = Math.min(oldWidth, this.gridWidth);
        const copyHeight = Math.min(oldHeight, this.gridHeight);
        
        for (let row = 0; row < copyHeight; row++) {
            for (let col = 0; col < copyWidth; col++) {
                this.grid[row][col] = oldGrid[row][col];
            }
        }
    }
}
