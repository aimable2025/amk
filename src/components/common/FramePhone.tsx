import React, { createContext, useContext, useEffect, useState } from 'react';
import { BatteryCharging, Monitor, Signal, Smartphone, Wifi, WifiOff } from 'lucide-react';

export type ViewportDisplayMode = 'phone' | 'desktop';

interface ViewportModeContextValue {
  displayMode: ViewportDisplayMode;
  setDisplayMode: (mode: ViewportDisplayMode) => void;
  toggleDisplayMode: () => void;
}

const ViewportModeContext = createContext<ViewportModeContextValue>({
  displayMode: 'phone',
  setDisplayMode: () => {},
  toggleDisplayMode: () => {},
});

export const useViewportMode = () => useContext(ViewportModeContext);

const VIEWPORT_MODE_STORAGE_KEY = 'ets_amani_viewport_display_mode';

export interface FramePhoneProps {
  children: React.ReactNode;
  appName?: string;
}

export const FramePhone: React.FC<FramePhoneProps> = ({
  children,
  appName = 'Ets AMANI',
}) => {
  const [displayMode, setDisplayModeState] = useState<ViewportDisplayMode>(() => {
    try {
      const saved = localStorage.getItem(VIEWPORT_MODE_STORAGE_KEY);
      if (saved === 'desktop' || saved === 'phone') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'phone';
  });

  const setDisplayMode = (mode: ViewportDisplayMode) => {
    setDisplayModeState(mode);
    try {
      localStorage.setItem(VIEWPORT_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const toggleDisplayMode = () => {
    setDisplayMode(displayMode === 'phone' ? 'desktop' : 'phone');
  };

  const [currentTime, setCurrentTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };

    const timer = setInterval(updateClock, 15000);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isDesktopFullscreen = displayMode === 'desktop';

  return (
    <ViewportModeContext.Provider
      value={{ displayMode, setDisplayMode, toggleDisplayMode }}
    >
      <div
        className={
          isDesktopFullscreen
            ? 'min-h-screen w-full bg-slate-50 flex flex-col'
            : 'min-h-screen w-full bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black flex items-center justify-center sm:py-6 sm:px-4'
        }
      >
        {/* Commutateur flottant Desktop : Mode Smartphone (420px) <-> Mode Bureau Plein Écran */}
        <div className="no-print hidden sm:flex fixed bottom-4 right-4 z-[90] items-center gap-1 rounded-2xl border border-slate-700/80 bg-slate-900/95 p-1 text-xs font-bold text-white shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setDisplayMode('phone')}
            title="Afficher dans le châssis Smartphone (420px)"
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition ${
              !isDesktopFullscreen
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>Mobile</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('desktop')}
            title="Afficher en mode Bureau Plein Écran (100%)"
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition ${
              isDesktopFullscreen
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>Bureau 100%</span>
          </button>
        </div>

        {isDesktopFullscreen ? (
          /* Mode Bureau Plein Écran (100% largeur & hauteur) */
          <div className="relative flex-1 w-full min-h-screen flex flex-col bg-slate-50">
            {children}
          </div>
        ) : (
          /* Conteneur externe du châssis Smartphone (s'efface sur vrai mobile < 640px, visible sur Desktop/Tablette) */
          <div className="relative w-full h-dvh sm:h-[min(860px,93vh)] sm:w-[420px] sm:max-w-[420px] flex flex-col">
            {/* Boutons physiques latéraux gauche (Silencieux, Volume +, Volume -) — Desktop uniquement */}
            <div
              aria-hidden="true"
              className="no-print hidden sm:block absolute -left-[3px] top-28 w-[3px] h-7 bg-gradient-to-b from-slate-500 to-slate-700 rounded-l-md shadow-sm"
            />
            <div
              aria-hidden="true"
              className="no-print hidden sm:block absolute -left-[3px] top-40 w-[3px] h-12 bg-gradient-to-b from-slate-500 to-slate-700 rounded-l-md shadow-sm"
            />
            <div
              aria-hidden="true"
              className="no-print hidden sm:block absolute -left-[3px] top-56 w-[3px] h-12 bg-gradient-to-b from-slate-500 to-slate-700 rounded-l-md shadow-sm"
            />

            {/* Bouton physique latéral droit (Power / Verrouillage) — Desktop uniquement */}
            <div
              aria-hidden="true"
              className="no-print hidden sm:block absolute -right-[3px] top-44 w-[3px] h-16 bg-gradient-to-b from-slate-500 to-slate-700 rounded-r-md shadow-sm"
            />

            {/* Châssis métallique du smartphone sur Desktop / Transparent 100% sur Mobile */}
            <div className="relative w-full h-full flex flex-col sm:rounded-[52px] sm:p-[11px] sm:bg-gradient-to-b sm:from-slate-700 sm:via-slate-800 sm:to-slate-900 sm:shadow-[0_30px_90px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.14)]">
              {/* Écran intérieur du smartphone */}
              <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-50 sm:rounded-[41px] sm:ring-1 sm:ring-black/60">
                {/* Barre d'état supérieure & Îlot Dynamique (Dynamic Island) — visible uniquement sur Desktop/Tablette */}
                <div className="no-print hidden sm:flex relative w-full h-11 bg-slate-950 text-white px-6 items-center justify-between text-[11px] font-semibold select-none shrink-0 z-[80] border-b border-white/5">
                  {/* Heure & Nom de l'application */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="tabular-nums font-bold tracking-tight text-white">
                      {currentTime}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="truncate text-[10px] font-medium text-slate-300 max-w-[72px]">
                      {appName}
                    </span>
                  </div>

                  {/* Dynamic Island / Encoche centrale */}
                  <div
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-28 rounded-full bg-black border border-white/10 shadow-inner flex items-center justify-between px-2.5"
                  >
                    <div className="h-2 w-2 rounded-full bg-slate-800 ring-1 ring-slate-700/80" />
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                        }`}
                      />
                      <div className="h-2.5 w-2.5 rounded-full bg-indigo-950/90 ring-1 ring-indigo-500/30" />
                    </div>
                  </div>

                  {/* Indicateurs système (Réseau, Wi-Fi, Batterie) */}
                  <div className="flex items-center gap-1.5 text-slate-200">
                    <Signal className="h-3 w-3 text-slate-300" />
                    {isOnline ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                    )}
                    <BatteryCharging className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                </div>

                {/* Conteneur d'application avec confinement des éléments fixed */}
                <div className="relative flex-1 w-full overflow-hidden flex flex-col [transform:translateZ(0)]">
                  {/* Zone de défilement principale confinée à l'écran du téléphone */}
                  <div className="flex-1 w-full overflow-y-auto overflow-x-hidden bg-slate-50 relative flex flex-col scroll-smooth">
                    {children}
                  </div>
                </div>

                {/* Barre d'accueil inférieure (Home Indicator) — visible uniquement sur Desktop/Tablette */}
                <div
                  aria-hidden="true"
                  className="no-print hidden sm:flex w-full bg-white/95 border-t border-slate-200/70 py-1.5 justify-center items-center shrink-0 z-[80]"
                >
                  <div className="w-32 h-1 rounded-full bg-slate-900/30" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ViewportModeContext.Provider>
  );
};

export default FramePhone;
