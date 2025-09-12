// game.js - game logic

export class GameOfLife {
    constructor(grid, onUpdate = null) {
        this.grid = grid;
        this.generation = 0;
        this.timestep = 0;
        this.isRunning = false;
        this.gameInterval = null;
        this.gameSpeed = 200; // milliseconds
        this.onUpdate = onUpdate; // callback for ui
        
        // mouse interactions
        this.isDragging = false;
        this.drawingState = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.selectedPattern = null;
        this.patternPreviewActive = false;
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.gameInterval = setInterval(() => this.update(), this.gameSpeed);
            this.notifyUpdate();
        }
    }

    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.gameInterval);
            this.notifyUpdate();
        }
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    update() {
        this.grid.computeNextGeneration();
        this.generation++;
        this.timestep++;
        this.notifyUpdate();
    }

    reset() {
        this.stop();
        this.grid.clearGrid();
        this.generation = 0;
        this.timestep = 0;
        this.notifyUpdate();
    }

    randomize(density = 0.3) {
        this.grid.randomFill(density);
        this.generation = 0;
        this.timestep = 0;
        this.notifyUpdate();
    }

    setSpeed(speed) {
        this.gameSpeed = Math.max(50, Math.min(1000, speed));
        
        // restart with new speed if running already
        if (this.isRunning) {
            clearInterval(this.gameInterval);
            this.gameInterval = setInterval(() => this.update(), this.gameSpeed);
        }
        this.notifyUpdate();
    }

    getSpeed() {
        return this.gameSpeed;
    }

    getStats() {
        return {
            generation: this.generation,
            timestep: this.timestep,
            isRunning: this.isRunning,
            speed: this.gameSpeed
        };
    }

    // mouse interaction methods
    handleMouseDown(x, y, placePatternFn = null) {
        this.mouseX = x;
        this.mouseY = y;
        
        const { row, col } = this.grid.getGridPosition(x, y);
        
        // pattern placement
        if (this.selectedPattern && this.grid.isValidPosition(row, col) && placePatternFn) {
            const success = placePatternFn(this.grid.grid, col, row, this.selectedPattern, this.grid.gridWidth, this.grid.gridHeight);
            if (success) {
                this.notifyUpdate();
            }
            return;
        }
        
        // cell drawing behavior
        if (this.grid.isValidPosition(row, col)) {
            this.isDragging = true;
            this.drawingState = this.grid.toggleCell(row, col);
            this.notifyUpdate();
        }
    }

    handleMouseMove(x, y) {
        this.mouseX = x;
        this.mouseY = y;
        
        const { row, col } = this.grid.getGridPosition(x, y);
        
        // pattern preview
        if (this.selectedPattern) {
            this.patternPreviewActive = this.grid.isValidPosition(row, col);
            this.notifyUpdate();
        }
        
        // dragging for cell drawing
        if (this.isDragging && !this.selectedPattern && this.grid.isValidPosition(row, col)) {
            if (this.grid.getCell(row, col) !== this.drawingState) {
                this.grid.setCell(row, col, this.drawingState);
                this.notifyUpdate();
            }
        }
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    handleMouseLeave() {
        this.isDragging = false;
        this.patternPreviewActive = false;
        this.notifyUpdate();
    }

    // pattern management
    setSelectedPattern(patternKey) {
        this.selectedPattern = patternKey || null;
        this.patternPreviewActive = false;
        this.notifyUpdate();
    }

    getSelectedPattern() {
        return this.selectedPattern;
    }

    clearPatternSelection() {
        this.selectedPattern = null;
        this.patternPreviewActive = false;
        this.notifyUpdate();
    }

    // shortcuts
    handleKeyPress(code, ctrlKey = false) {
        switch (code) {
            case "Space":
                this.toggle();
                break;
            case "Escape":
                this.clearPatternSelection();
                break;
            case "KeyC":
                if (ctrlKey) {
                    this.reset();
                }
                break;
            case "KeyR":
                this.randomize();
                break;
        }
    }

    // resize handling
    handleResize() {
        this.grid.resize();
        this.notifyUpdate();
    }

    // notification system
    notifyUpdate() {
        if (this.onUpdate) {
            this.onUpdate(this.getStats());
        }
    }

    // render
    render(drawPatternPreviewFn = null) {
        this.grid.draw(
            this.selectedPattern,
            this.patternPreviewActive,
            this.mouseX,
            this.mouseY,
            drawPatternPreviewFn
        );
    }
}
