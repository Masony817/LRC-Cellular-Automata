import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Canvas } from './canvas'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import type { CanvasHandler } from './canvas'
import type { Stats } from './gpu'
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
} from './components/ui/sidebar'

function SidebarHotkeys() {
  const { toggleSidebar } = useSidebar()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyI') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleSidebar])
  return null
}

function App() {

  const canvasRef = useRef<CanvasHandler>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(1200);
  const [canvasHeight, setCanvasHeight] = useState(800);
  //const [cellSize, setCellSize] = useState(2);
  const [mode, setMode] = useState<'LCR' | 'Conway'>('LCR');




  return (
    <SidebarProvider>
      <Sidebar side="right" variant="sidebar" collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-sidebar-foreground/80">
              Generation: {stats?.generation ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => canvasRef.current?.toggle()}
                aria-label={stats?.isRunning ? 'Pause' : 'Play'}
              >
                {stats?.isRunning ? 'Pause' : 'Play'}
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
            <SidebarGroupLabel>Grid Size</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className='flex items-center gap-2'>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-sidebar-foreground/80">Width</span>
                  <Input
                    type="number"
                    value={canvasWidth}
                    onChange={(e)=> setCanvasWidth(Math.max(100, parseInt(e.target.value || "0", 10)))}
                    className="w-24"/>
                  </div>
                  <div className="flex items-center gap-2">
                  <span className="text-xs text-sidebar-foreground/80">Height</span>
                  <Input
                    type="number"
                    value={canvasHeight}
                    onChange={(e)=> setCanvasHeight(Math.max(100, parseInt(e.target.value || "0", 10)))}
                    className="w-24"/>
                  </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Rule Set</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={mode === "LCR" ? "default" : "outline"}
                  onClick={() => {
                    setMode("LCR");
                    canvasRef.current?.setMode("LCR");
                  }}
                >
                  LCR
                </Button>
                <Button
                  size="sm"
                  variant={mode === "Conway" ? "default" : "outline"}
                  onClick={() => {
                    setMode("Conway");
                    canvasRef.current?.setMode("Conway");
                  }}
                >
                  Conway
                </Button>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter />
      </Sidebar>

      <SidebarInset className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <Canvas 
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          cellSize={2}
          mode={mode}
          onStatsUpdate={setStats}
        />

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Click cells to toggle • Space to play/pause • R to randomize • I to toggle sidebar</p>
        </div>
      </SidebarInset>

      <SidebarHotkeys />
    </SidebarProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
