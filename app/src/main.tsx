import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Canvas } from './canvas'

function App() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-4">
          LCR-Cellular Automata
        </h1>
        <p className="text-gray-400">
          Conway's Game of Life powered by WebGPU compute shaders
        </p>
      </div>
      
      <Canvas width={1200} height={800} cellSize={2} />
      
      <div className="mt-8 text-center text-sm text-gray-500">
        <p>Click cells to toggle • Space to play/pause • R to randomize</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
