import {useState, useRef, useEffect, useCallback} from 'react'
import type { LucideIcon } from 'lucide-react'
import React from 'react'

export const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

type DraggableNumericInputProps = {
    width: number
    value: number
    min: number
    max: number
    step?: number
    dragScale?: number
    displayValue?: string
    onChange: (value: number) => void
    onTextCommit?: (text: string) => boolean
    ariaLabel: string
    label?: string | LucideIcon
    labelClassName?: string
}

export function DraggableNumericInput({
    width,
    value, 
    min,
    max, 
    step = 1,
    dragScale = 1,
    displayValue,
    onChange,
    onTextCommit,
    ariaLabel,
    label,
    labelClassName,
}: DraggableNumericInputProps){
    const [draft, setDraft] = useState(() =>
        displayValue ?? Math.round(value).toString(),
      )
    const [isDragging, setIsDragging] = useState(false)
    const startXRef = useRef(0)
    const startValueRef = useRef(value)

    useEffect(() => {
      if (!isDragging) {
        setDraft(displayValue ?? Math.round(value).toString())
      }
    }, [value, displayValue, isDragging])

    const commit = useCallback(
      (text: string) => {
        if (onTextCommit?.(text)) return
        const parsed = Number.parseFloat(text)
        if (Number.isNaN(parsed)) {
          setDraft(displayValue ?? Math.round(value).toString())
          return
        }
        const next = clamp(Math.round(parsed / step) * step, min, max)
        onChange(next)
        setDraft(displayValue ?? Math.round(next).toString())
      },
      [displayValue, min, max, onChange, onTextCommit, step, value],
    )

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      startXRef.current = event.clientX
      startValueRef.current = value
      setIsDragging(true)
      document.body.style.cursor = 'ew-resize'
    }, [value])

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
      if (!isDragging) return
      const diff = event.clientX - startXRef.current
      const next = clamp(
        Math.round(startValueRef.current + diff * dragScale),
        min,
        max,
      )
      onChange(next)
      setDraft(displayValue ?? Math.round(next).toString())
    }, [displayValue, dragScale, isDragging, max, min, onChange])

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLInputElement>) => {
      if (!isDragging) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      setIsDragging(false)
      document.body.style.cursor = ''
      setDraft(displayValue ?? Math.round(value).toString())
    }, [displayValue, isDragging, value])

    return (
      <div className={`${width ? `w-${width}` : 'w-24'} rounded-sm border border-input bg-sidebar-foreground/2 px-2 py-1 text-xs flex items-center gap-1 ${isDragging ? 'cursor-ew-resize' : 'hover:cursor-pointer'}`}>
        {label && (
          <span className={`text-xs ${labelClassName || 'text-sidebar-foreground/60'} flex items-center`}>
            {typeof label === 'string' ? label : React.createElement(label)}
          </span>
        )}
        <input
          aria-label={ariaLabel}
          className="bg-transparent outline-none flex-1 min-w-0"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit(event.currentTarget.value)
              event.currentTarget.blur()
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
    )
}