// ui.js - ui components and event handling

import { PATTERNS, drawPatternPreviewSmall } from './patterns.js';

export class GameUI {
    constructor(game, onPatternChange = null, onSpeedChange = null) {
        this.game = game;
        this.onPatternChange = onPatternChange;
        this.onSpeedChange = onSpeedChange;
        
        // get ui elements
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.randomBtn = document.getElementById('random-btn');
        this.patternSelect = document.getElementById('pattern-select');
        this.patternDropdown = document.getElementById('pattern-dropdown');
        this.patternInfo = document.getElementById('pattern-info');
        this.patternName = document.getElementById('pattern-name');
        this.patternDescription = document.getElementById('pattern-description');
        this.generationDisplay = document.getElementById('generation-display');
        this.timestepDisplay = document.getElementById('timestep-display');
        this.speedSlider = document.getElementById('speed-slider');
        this.speedDisplay = document.getElementById('speed-display');
        
        // ui state
        this.uiVisible = true;
        
        // dropdown state
        this.dropdownVisible = false;
        this.selectedPattern = null;
        
        this.initializeEventListeners();
        this.createPatternDropdown();
        this.updateUI();
    }

    initializeEventListeners() {
        // button event listeners
        this.playPauseBtn.addEventListener('click', () => {
            this.game.toggle();
        });

        this.clearBtn.addEventListener('click', () => {
            this.game.reset();
        });

        this.randomBtn.addEventListener('click', () => {
            this.game.randomize();
        });

        // speed control
        this.speedSlider.addEventListener('input', (event) => {
            const speed = parseInt(event.target.value);
            this.game.setSpeed(speed);
            if (this.onSpeedChange) {
                this.onSpeedChange(speed);
            }
        });

        // global click handler for shift+click pattern dropdown
        document.addEventListener('click', (event) => {
            if (event.shiftKey) {
                event.preventDefault();
                this.showPatternDropdown(event.clientX, event.clientY);
            } else {
                this.hidePatternDropdown();
            }
        });

        // prevent dropdown from closing when clicking inside it
        this.patternDropdown.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        // keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // prevent default for game shortcuts
            if (['Space', 'KeyR', 'Escape', 'KeyI'].includes(event.code) || 
                (event.code === 'KeyC' && event.ctrlKey)) {
                event.preventDefault();
            }
            
            // handle ui toggle
            if (event.code === 'KeyI') {
                this.toggleUI();
                return;
            }
            
            this.game.handleKeyPress(event.code, event.ctrlKey);
            
            // update ui for pattern clearing
            if (event.code === 'Escape') {
                this.hidePatternDropdown();
                if (this.game.getSelectedPattern() === null) {
                    this.updatePatternInfo(null);
                }
            }
        });
    }

    createPatternDropdown() {
        // clear existing content
        this.patternDropdown.innerHTML = '';
        
        // none option
        const noneOption = document.createElement('div');
        noneOption.className = 'pattern-option';
        noneOption.innerHTML = `
            <div>
                <div style="font-weight: bold;">None</div>
                <div style="font-size: 12px; color: #ccc;">Draw Mode</div>
            </div>
        `;
        noneOption.addEventListener('click', () => {
            this.selectPattern(null);
        });
        this.patternDropdown.appendChild(noneOption);
        
        // add pattern options
        Object.keys(PATTERNS).forEach(patternKey => {
            const pattern = PATTERNS[patternKey];
            const option = document.createElement('div');
            option.className = 'pattern-option';
            
            // preview canvas
            const canvas = document.createElement('canvas');
            canvas.className = 'pattern-preview';
            canvas.width = 60;
            canvas.height = 40;
            
            option.innerHTML = `
                <div>
                    <div style="font-weight: bold;">${pattern.name}</div>
                    <div style="font-size: 12px; color: #ccc;">${pattern.description}</div>
                </div>
            `;
            option.appendChild(canvas);
            
            // draw pattern preview
            drawPatternPreviewSmall(canvas, patternKey);
            
            option.addEventListener('click', () => {
                this.selectPattern(patternKey);
            });
            
            this.patternDropdown.appendChild(option);
        });
    }

    showPatternDropdown(x, y) {
        this.patternDropdown.style.left = `${x}px`;
        this.patternDropdown.style.top = `${y}px`;
        this.patternDropdown.style.display = 'block';
        this.dropdownVisible = true;
        
        // handling off screen dropdown
        const rect = this.patternDropdown.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.patternDropdown.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            this.patternDropdown.style.top = `${y - rect.height}px`;
        }
    }

    hidePatternDropdown() {
        this.patternDropdown.style.display = 'none';
        this.dropdownVisible = false;
    }

    selectPattern(patternKey) {
        this.selectedPattern = patternKey;
        this.game.setSelectedPattern(patternKey);
        this.updatePatternInfo(patternKey);
        this.hidePatternDropdown();
        
        if (this.onPatternChange) {
            this.onPatternChange(patternKey);
        }
    }

    updateUI() {
        const stats = this.game.getStats();
        
        //  stats displays
        this.generationDisplay.textContent = stats.generation;
        this.timestepDisplay.textContent = stats.timestep;
        
        //  play/pause button
        this.playPauseBtn.innerHTML = stats.isRunning ? '⏸ Pause' : '▶ Play';
        
        // speed display
        this.speedDisplay.textContent = `${stats.speed}ms`;
        this.speedSlider.value = stats.speed;
    }

    updatePatternInfo(patternKey) {
        if (patternKey && PATTERNS[patternKey]) {
            const pattern = PATTERNS[patternKey];
            this.patternName.textContent = pattern.name;
            this.patternDescription.textContent = pattern.description;
            this.patternInfo.classList.remove('hidden');
        } else {
            this.patternInfo.classList.add('hidden');
        }
    }

    // called when game state changes
    onGameUpdate(stats) {
        this.updateUI();
    }


    // get current pattern selection
    getSelectedPattern() {
        return this.selectedPattern;
    }

    // set pattern selection
    setSelectedPattern(patternKey) {
        this.selectedPattern = patternKey;
        this.game.setSelectedPattern(patternKey);
        this.updatePatternInfo(patternKey);
    }

    // toggle ui elements on/off
    setEnabled(enabled) {
        const elements = [
            this.playPauseBtn,
            this.clearBtn,
            this.randomBtn,
            this.speedSlider
        ];
        
        elements.forEach(element => {
            if (element) {
                element.disabled = !enabled;
            }
        });
    }

    // show/hide ui panels
    togglePanel(panelId, show) {
        const panel = document.getElementById(panelId);
        if (panel) {
            if (show) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }
    }

    // add notification system
    showNotification(message, type = 'info', duration = 3000) {
        // create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 ${
            type === 'error' ? 'bg-destructive text-destructive-foreground' :
            type === 'success' ? 'bg-green-600 text-white' :
            'bg-primary text-primary-foreground'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // remove notification after duration
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, duration);
    }

    // export current state as url parameters (for sharing)
    exportState() {
        const stats = this.game.getStats();
        const params = new URLSearchParams({
            generation: stats.generation,
            speed: stats.speed,
            pattern: this.getSelectedPattern() || ''
        });
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }

    // import state from url parameters
    importState() {
        const params = new URLSearchParams(window.location.search);
        
        if (params.has('speed')) {
            const speed = parseInt(params.get('speed'));
            if (speed >= 50 && speed <= 1000) {
                this.game.setSpeed(speed);
            }
        }
        
        if (params.has('pattern')) {
            const pattern = params.get('pattern');
            if (PATTERNS[pattern]) {
                this.setSelectedPattern(pattern);
            }
        }
    }

    // toggle ui visibility -- excludes stats panel
    toggleUI() {
        this.uiVisible = !this.uiVisible;
        
        const uiPanels = document.querySelectorAll('.ui-panel');
        uiPanels.forEach(panel => {
            if (this.uiVisible) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        });
        
        // hide pattern dropdown 
        if (!this.uiVisible) {
            this.hidePatternDropdown();
        }
    }

    // get ui state
    isUIVisible() {
        return this.uiVisible;
    }
}
