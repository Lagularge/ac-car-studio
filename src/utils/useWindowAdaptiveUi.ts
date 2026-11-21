import { useCallback, useEffect, useState } from 'react';

export interface WindowAdaptiveUiState {
  windowWidth: number;
  windowHeight: number;
  autoScale: boolean;
  manualScale: number;
  effectiveScale: number;
  isCompactWidth: boolean;
  setAutoScale: (enabled: boolean) => void;
  setManualScale: (scale: number) => void;
  resetScale: () => void;
}

const BASE_REF_WIDTH = 1440;
const BASE_REF_HEIGHT = 880;

function computeAutoScaleFactor(width: number, height: number): number {
  const wRatio = width / BASE_REF_WIDTH;
  const hRatio = height / BASE_REF_HEIGHT;
  // Blend min ratio & geometric mean so ultra-wide or narrow split windows scale gracefully
  const raw = Math.min(wRatio, hRatio) * 0.72 + Math.sqrt(wRatio * hRatio) * 0.28;
  return Number(Math.max(0.76, Math.min(1.16, raw)).toFixed(2));
}

export function useWindowAdaptiveUi(
  controlledAutoScale?: boolean,
  controlledManualScale?: number
): WindowAdaptiveUiState {
  const [dims, setDims] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : BASE_REF_WIDTH,
    height: typeof window !== 'undefined' ? window.innerHeight : BASE_REF_HEIGHT,
  }));
  const [internalAutoScale, setInternalAutoScale] = useState<boolean>(true);
  const [internalManualScale, setInternalManualScale] = useState<number>(1.0);

  const autoScale = controlledAutoScale ?? internalAutoScale;
  const manualScale = controlledManualScale ?? internalManualScale;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setDims({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const effectiveScale = autoScale
    ? computeAutoScaleFactor(dims.width, dims.height)
    : Number(Math.max(0.75, Math.min(1.25, manualScale)).toFixed(2));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // Scale root rem so all Tailwind rem-based spacing, typography, and controls adapt automatically
    root.style.fontSize = `${(16 * effectiveScale).toFixed(2)}px`;
    root.style.setProperty('--accs-ui-scale', String(effectiveScale));
    root.style.setProperty('--accs-win-w', `${dims.width}px`);
    root.style.setProperty('--accs-win-h', `${dims.height}px`);

    // Compute available vertical height for studio split workspaces (3D Model, Livery, Engine Sim)
    const studioHeightPx = Math.max(420, Math.round(dims.height - 164 * effectiveScale));
    root.style.setProperty('--accs-studio-h', `${studioHeightPx}px`);
  }, [dims.width, dims.height, effectiveScale]);

  const resetScale = useCallback(() => {
    setInternalAutoScale(true);
    setInternalManualScale(1.0);
  }, []);

  return {
    windowWidth: dims.width,
    windowHeight: dims.height,
    autoScale,
    manualScale,
    effectiveScale,
    isCompactWidth: dims.width < 1140,
    setAutoScale: setInternalAutoScale,
    setManualScale: setInternalManualScale,
    resetScale,
  };
}
