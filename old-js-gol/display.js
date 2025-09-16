// display.js - main coordinator

import { Grid } from './grid.js';
import { GameOfLife } from './game.js';
import { GameUI } from './ui.js';
import { placePattern, drawPatternPreview } from './patterns.js';

class GameApplication {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.grid = null;
        this.game = null;
        this.ui = null;
        
        this.initialize();
    }

    initialize() {
        this.grid = new Grid(this.canvas, 10);
        
        // initialize game loop
        this.game = new GameOfLife(this.grid, (stats) => {
            if (this.ui) {
                this.ui.onGameUpdate(stats);
            }
            this.render();
        });
        
        // setup ui
        this.ui = new GameUI(
            this.game,
            (pattern) => this.onPatternChange(pattern),
            (speed) => this.onSpeedChange(speed)
        );
        
        // setup event listeners
        this.setupEventListeners();
        
        // import any state from url
        this.ui.importState();
        
        // initial render
        this.render();
    }

    setupEventListeners() {
        // mouse events
        this.canvas.addEventListener("mousedown", (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            this.game.handleMouseDown(x, y, placePattern);
        });

        this.canvas.addEventListener("mousemove", (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            this.game.handleMouseMove(x, y);
        });

        this.canvas.addEventListener("mouseup", () => {
            this.game.handleMouseUp();
        });

        this.canvas.addEventListener("mouseleave", () => {
            this.game.handleMouseLeave();
        });

        // handle window resize
        window.addEventListener('resize', () => {
            this.game.handleResize();
            this.ui.handleResize();
        });

        // prevent context menu on canvas
        this.canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    onPatternChange(pattern) {
        // handle pattern
        console.log(`Pattern changed to: ${pattern}`);
    }

    onSpeedChange(speed) {
        // handle speed change
        console.log(`Speed changed to: ${speed}ms`);
    }

    render() {
        this.game.render(drawPatternPreview);
    }

    // public methods for external control? 
    start() {
        this.game.start();
    }

    stop() {
        this.game.stop();
    }

    reset() {
        this.game.reset();
    }

    randomize() {
        this.game.randomize();
    }

    getStats() {
        return this.game.getStats();
    }

    exportState() {
        return this.ui.exportState();
    }
}

// init app on dom load
document.addEventListener('DOMContentLoaded', () => {
    // make app globally accessible for debugging
    window.gameApp = new GameApplication();
});

// export for modularity
export default GameApplication;
