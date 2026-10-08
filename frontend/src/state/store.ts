import { create } from 'zustand';

const DEFAULT_LAYERS = {
  satellite: true, detectionMask: true, slickGeometry: true, originRegion: true,
  hindcast: true, forecast: true, currentVectors: true, windVectors: true,
  aisVessels: true, vesselTracks: true, candidateVessel: true, uncertainty: true,
  vessels3D: true, vesselLabels: true, vesselHeadings: true,
  shippingLanes: true, bathymetry: true, coordGrid: false, flowAnimation: true,
};

export type LayerKey = keyof typeof DEFAULT_LAYERS;

const getSavedTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('oiltrace_theme') || localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  }
  return 'dark';
};

const initialTheme = getSavedTheme();
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme);
  document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  document.documentElement.classList.toggle('light', initialTheme === 'light');
}

interface AppState {
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  dataMode: string; setDataMode: (m: string) => void;
  viewMode: '2d' | '3d'; setViewMode: (m: '2d' | '3d') => void;
  selectedSpillId: string | null; setSelectedSpillId: (id: string | null) => void;
  selectedMmsi: string | null; setSelectedMmsi: (mmsi: string | null) => void;
  layers: typeof DEFAULT_LAYERS; setLayer: (k: LayerKey, v: boolean) => void;
  timelinePosition: number; setTimelinePosition: (p: number) => void;
  timelinePlaying: boolean; setTimelinePlaying: (p: boolean) => void;
  timelineSpeed: number; setTimelineSpeed: (s: number) => void;
  analysisStep: number; setAnalysisStep: (s: number) => void;
  incidentRefreshTrigger: number; triggerIncidentRefresh: () => void;
  incidentFocus: boolean; setIncidentFocus: (f: boolean) => void;
  scaleUnit: 'nm' | 'km'; setScaleUnit: (u: 'nm' | 'km') => void;
  cleanMode: boolean; setCleanMode: (c: boolean) => void;
  miniMap: boolean; setMiniMap: (m: boolean) => void;
  activeCameraPreset: string; setActiveCameraPreset: (p: string) => void;
  isBentoMatrixOpen: boolean;
  toggleBentoMatrix: () => void;
  setBentoMatrixOpen: (open: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  theme: initialTheme,
  setTheme: (t) => {
    localStorage.setItem('oiltrace_theme', t);
    localStorage.setItem('theme', t);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.documentElement.classList.toggle('light', t === 'light');
    }
    set({ theme: t });
  },
  toggleTheme: () => {
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('oiltrace_theme', next);
      localStorage.setItem('theme', next);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.classList.toggle('dark', next === 'dark');
        document.documentElement.classList.toggle('light', next === 'light');
      }
      return { theme: next };
    });
  },
  dataMode: 'simulation', setDataMode: (m) => set({ dataMode: m }),
  viewMode: '2d', setViewMode: (m) => set({ viewMode: m }),
  selectedSpillId: null, setSelectedSpillId: (id) => set({ selectedSpillId: id }),
  selectedMmsi: null, setSelectedMmsi: (mmsi) => set({ selectedMmsi: mmsi }),
  layers: DEFAULT_LAYERS, setLayer: (k, v) => set(s => ({ layers: { ...s.layers, [k]: v } })),
  timelinePosition: 0.5, setTimelinePosition: (p) => set({ timelinePosition: p }),
  timelinePlaying: false, setTimelinePlaying: (p) => set({ timelinePlaying: p }),
  timelineSpeed: 1, setTimelineSpeed: (s) => set({ timelineSpeed: s }),
  analysisStep: 0, setAnalysisStep: (s) => set({ analysisStep: s }),
  incidentRefreshTrigger: 0, triggerIncidentRefresh: () => set(s => ({ incidentRefreshTrigger: s.incidentRefreshTrigger + 1 })),
  incidentFocus: false, setIncidentFocus: (f) => set({ incidentFocus: f }),
  scaleUnit: 'nm', setScaleUnit: (u) => set({ scaleUnit: u }),
  cleanMode: false, setCleanMode: (c) => set({ cleanMode: c }),
  miniMap: false, setMiniMap: (m) => set({ miniMap: m }),
  activeCameraPreset: 'investigation', setActiveCameraPreset: (p) => set({ activeCameraPreset: p }),
  isBentoMatrixOpen: false,
  toggleBentoMatrix: () => set((s) => ({ isBentoMatrixOpen: !s.isBentoMatrixOpen })),
  setBentoMatrixOpen: (open: boolean) => set({ isBentoMatrixOpen: open }),
}));
