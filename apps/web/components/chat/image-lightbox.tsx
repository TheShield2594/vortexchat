"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface ImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
  /** Additional images for navigation. Each entry is { src, alt }. */
  images?: Array<{ src: string; alt: string }>
  /** Index within images array to start at. Defaults to 0. */
  initialIndex?: number
}

/**
 * Full-screen image lightbox rendered via a React portal.
 * Supports zoom (click, scroll wheel, +/- keys), pan when zoomed,
 * left/right arrow navigation between images, and Escape to close.
 */
export function ImageLightbox({ src, alt, onClose, images, initialIndex = 0 }: ImageLightboxProps) {
  const imageList = images ?? [{ src, alt }]
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [panOrigin, setPanOrigin] = useState({ x: 50, y: 50 })
  const backdropRef = useRef<HTMLDivElement>(null)

  const current = imageList[currentIndex] ?? imageList[0]

  const resetZoom = useCallback(() => {
    setZoom(1)
    setPanOrigin({ x: 50, y: 50 })
  }, [])

  const move = useCallback((direction: 1 | -1) => {
    setCurrentIndex((prev) => (prev + direction + imageList.length) % imageList.length)
    resetZoom()
  }, [imageList.length, resetZoom])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "Escape":
          e.preventDefault()
          onClose()
          break
        case "ArrowRight":
          e.preventDefault()
          if (imageList.length > 1) move(1)
          break
        case "ArrowLeft":
          e.preventDefault()
          if (imageList.length > 1) move(-1)
          break
        case "+":
        case "=":
          e.preventDefault()
          setZoom((prev) => Math.min(5, prev + 0.5))
          break
        case "-":
          e.preventDefault()
          setZoom((prev) => Math.max(1, prev - 0.5))
          break
        case "0":
          e.preventDefault()
          resetZoom()
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose, move, imageList.length, resetZoom])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose()
    }
  }, [onClose])

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (zoom === 1) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setPanOrigin({ x, y })
      setZoom(2)
    } else {
      resetZoom()
    }
  }, [zoom, resetZoom])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPanOrigin({ x, y })
  }, [zoom])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation()
    setZoom((prev) => {
      const next = prev + (e.deltaY < 0 ? 0.5 : -0.5)
      return Math.max(1, Math.min(5, next))
    })
  }, [])

  const lightbox = (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.85)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${current.alt}`}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        style={{ color: "white" }}
        aria-label="Close lightbox"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="4" x2="16" y2="16" />
          <line x1="16" y1="4" x2="4" y2="16" />
        </svg>
      </button>

      {/* Navigation arrows */}
      {imageList.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); move(-1) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ color: "white" }}
            aria-label="Previous image"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="12,4 6,10 12,16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); move(1) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ color: "white" }}
            aria-label="Next image"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8,4 14,10 8,16" />
            </svg>
          </button>
        </>
      )}

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[85vh] overflow-hidden"
        style={{ cursor: zoom > 1 ? "zoom-out" : "zoom-in" }}
        onClick={handleImageClick}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        <img
          src={current.src}
          alt={current.alt}
          className="max-w-[90vw] max-h-[85vh] object-contain select-none"
          draggable={false}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: `${panOrigin.x}% ${panOrigin.y}%`,
            transition: zoom === 1 ? "transform 0.2s ease-out" : "none",
          }}
        />
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-xs px-4 py-2 rounded-full" style={{ color: "rgba(255,255,255,0.7)", background: "rgba(0,0,0,0.5)" }}>
        <span>{current.alt}</span>
        {imageList.length > 1 && (
          <span>{currentIndex + 1} / {imageList.length}</span>
        )}
        {zoom > 1 && (
          <span>{Math.round(zoom * 100)}%</span>
        )}
      </div>
    </div>
  )

  if (typeof document === "undefined") return null
  return createPortal(lightbox, document.body)
}
