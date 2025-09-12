const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// dimensions
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const tileSize = 10;
const gridWidth = Math.floor(canvas.width / tileSize);
const gridHeight = Math.floor(canvas.height / tileSize);

// init 
let grid = Array(gridHeight).fill().map(() => Array(gridWidth).fill(0));
let generation = 0;
let timestep = 0;

// random demo pattern
grid[2][3] = 1;
grid[4][5] = 1;
grid[7][2] = 1;

class Cell {
    constructor(row, col, state) {
        this.row = row;
        this.col = col;
        this.state = state;
        this.nextState = state;
    }

    updateNeighborCount() {
        this.liveNeighbors = this.countLiveNeighbors();
    }

    countLiveNeighbors() {
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
        // Conway's Game of Life rules
        if (this.state === 1) {
            // live cell survives with 2 or 3 neighbors
            this.nextState = (this.liveNeighbors === 2 || this.liveNeighbors === 3) ? 1 : 0;
        } else {
            // dead cell becomes alive with exactly 3 neighbors
            this.nextState = (this.liveNeighbors === 3) ? 1 : 0;
        }
    }

    draw() {
        ctx.fillStyle = this.state === 1 ? "white" : "black";
        ctx.fillRect(this.col * tileSize, this.row * tileSize, tileSize, tileSize);
    }
}

function drawStats() {
    // Draw background for stats
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(10, 10, 200, 60);
    
    // Draw text
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.fillText(`Generation: ${generation}`, 20, 30);
    ctx.fillText(`Timestep: ${timestep}`, 20, 50);
}

function drawGrid() {
    // clear canvas
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // draw cells
    for (let row = 0; row < gridHeight; row++) {
        for (let col = 0; col < gridWidth; col++) {
            if (grid[row][col] === 1) {
                ctx.fillStyle = "white";
                ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
            }
        }
    }
    
    // grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;

    for (let col = 0; col <= gridWidth; col++) {
        ctx.beginPath();
        ctx.moveTo(col * tileSize, 0);
        ctx.lineTo(col * tileSize, gridHeight * tileSize);
        ctx.stroke();
    }
    for (let row = 0; row <= gridHeight; row++) {
        ctx.beginPath();
        ctx.moveTo(0, row * tileSize);
        ctx.lineTo(gridWidth * tileSize, row * tileSize);
        ctx.stroke();
    }
    
    // game stats
    drawStats();
}

let isDragging = false;
let drawingState = 0;

function handleMouseDown(event) {
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    
    if (row >= 0 && row < gridHeight && col >= 0 && col < gridWidth) {
        grid[row][col] = grid[row][col] === 1 ? 0 : 1;
        drawingState = grid[row][col];
        drawGrid();
    }
}

function handleMouseMove(event) {
    if (!isDragging) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);
    
    if (row >= 0 && row < gridHeight && col >= 0 && col < gridWidth) {
        if (grid[row][col] !== drawingState) {
            grid[row][col] = drawingState;
            drawGrid();
        }
    }
}

function handleMouseUp() {
    isDragging = false;
}

function handleMouseLeave() {
    isDragging = false;
}

function getNeighbors(row, col) {
    const neighbors = [];
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            
            const neighborRow = row + i;
            const neighborCol = col + j;
            
            // handle bounds
            if (neighborRow >= 0 && neighborRow < gridHeight && 
                neighborCol >= 0 && neighborCol < gridWidth) {
                neighbors.push(grid[neighborRow][neighborCol]);
            } else {
                neighbors.push(0);
            }
        }
    }
    return neighbors;
}

// game loop 
function updateGrid() {
    // new grid for next state
    const nextGrid = Array(gridHeight).fill().map(() => Array(gridWidth).fill(0));
    
    // process each cell
    for (let row = 0; row < gridHeight; row++) {
        for (let col = 0; col < gridWidth; col++) {
            const cell = new Cell(row, col, grid[row][col]);
            cell.updateNeighborCount();
            cell.updateState();
            nextGrid[row][col] = cell.nextState;
        }
    }
    
    // update grid
    grid = nextGrid;
    generation++;
    timestep++;
    drawGrid();
}

// game state control
let isRunning = false;
let gameInterval;

function startGame() {
    if (!isRunning) {
        isRunning = true;
        gameInterval = setInterval(updateGrid, 200); // 200ms update
    }
}

function stopGame() {
    if (isRunning) {
        isRunning = false;
        clearInterval(gameInterval);
    }
}

function toggleGame() {
    if (isRunning) {
        stopGame();
    } else {
        startGame();
    }
}

//controls
canvas.addEventListener("mousedown", handleMouseDown);
canvas.addEventListener("mousemove", handleMouseMove);
canvas.addEventListener("mouseup", handleMouseUp);
canvas.addEventListener("mouseleave", handleMouseLeave);


document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
        event.preventDefault();
        toggleGame();
    }
});

// initial draw
drawGrid();
