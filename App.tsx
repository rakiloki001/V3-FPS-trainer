import React, { useState, useEffect } from 'react';
import { GameState, GameStats } from './types';
import { GameCanvas } from './components/GameCanvas';
import { CyberButton } from './components/CyberButton';
import { generateBriefing, generateDebrief } from './services/geminiService';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [briefing, setBriefing] = useState<string>("Initializing Neural Link...");
  const [debrief, setDebrief] = useState<string>("");
  const [stats, setStats] = useState<GameStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load briefing on mount
  useEffect(() => {
    const initBriefing = async () => {
      const text = await generateBriefing();
      setBriefing(text);
    };
    initBriefing();
  }, []);

  const handleStartGame = () => {
    setGameState(GameState.PLAYING);
  };

  const handleGameOver = async (finalStats: GameStats) => {
    setStats(finalStats);
    setGameState(GameState.GAME_OVER);
    setIsLoading(true);
    const text = await generateDebrief(finalStats);
    setDebrief(text);
    setIsLoading(false);
  };

  const handleRestart = () => {
    setGameState(GameState.MENU);
    setStats(null);
    setDebrief("");
    // Optionally fetch new briefing
    generateBriefing().then(setBriefing);
  };

  return (
    <div className="w-full h-screen bg-neon-dark text-neon-blue font-mono relative overflow-hidden flex flex-col items-center justify-center">
      
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 via-black to-black opacity-80 z-0"></div>
      
      {/* Content Container */}
      <div className="relative z-10 w-full max-w-4xl p-6">
        
        {/* Header */}
        <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-20 pointer-events-none">
          <h1 className="text-4xl font-cyber font-bold text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
            NEON<span className="text-white">SIGHT</span>
          </h1>
          <div className="text-xs text-neon-pink animate-pulse">SYSTEM: ONLINE</div>
        </header>

        {/* MENU STATE */}
        {gameState === GameState.MENU && (
          <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
            <div className="border border-neon-blue bg-black/50 p-6 max-w-lg shadow-[0_0_20px_rgba(0,255,255,0.2)] backdrop-blur-sm">
              <h2 className="text-xl text-neon-yellow mb-2 font-bold tracking-widest border-b border-neon-yellow/30 pb-2">
                MISSION BRIEFING
              </h2>
              <p className="text-lg leading-relaxed text-white/90 font-mono typing-effect">
                {briefing}
              </p>
            </div>

            <div className="space-y-4">
               <div className="text-sm text-gray-400 mb-4 bg-black/40 p-4 border-l-2 border-neon-pink">
                 <strong className="text-neon-pink block mb-2">TACTICAL OVERRIDE:</strong>
                 Enable Camera. Punch or wave at the <strong>Holographic Targets</strong>.<br/>
                 <span className="text-neon-yellow">HEAD (Circle):</span> 3 PTS (Instakill)<br/>
                 <span className="text-neon-blue">BODY (Torso):</span> 1 PT (3 Hits to Kill)
               </div>
               <CyberButton onClick={handleStartGame}>INITIATE LINK</CyberButton>
            </div>
          </div>
        )}

        {/* PLAYING STATE */}
        {gameState === GameState.PLAYING && (
           <div className="fixed inset-0 z-50 bg-black">
             <GameCanvas onGameOver={handleGameOver} />
             <button 
               onClick={() => setGameState(GameState.MENU)}
               className="absolute top-4 right-4 text-red-500 border border-red-500 px-4 py-1 hover:bg-red-500 hover:text-white transition z-50 bg-black/50"
             >
               ABORT
             </button>
           </div>
        )}

        {/* GAME OVER STATE */}
        {gameState === GameState.GAME_OVER && stats && (
          <div className="flex flex-col items-center space-y-8 animate-fade-in-up">
             <h2 className="text-6xl font-cyber text-neon-pink glitch-text mb-4">
               SESSION TERMINATED
             </h2>

             <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
               {/* Stats Card */}
               <div className="bg-black/80 border-l-4 border-neon-blue p-6 shadow-lg">
                 <h3 className="text-neon-blue text-xl mb-4 border-b border-gray-700 pb-2">METRICS</h3>
                 <div className="space-y-2 text-xl">
                   <div className="flex justify-between"><span>SCORE:</span> <span className="text-white">{stats.score}</span></div>
                   <div className="flex justify-between"><span>KILLS:</span> <span className="text-white">{stats.enemiesDestroyed} / {stats.enemiesSpawned}</span></div>
                   <div className="flex justify-between text-neon-pink"><span>HEADSHOTS:</span> <span>{stats.headshots}</span></div>
                   <div className="flex justify-between text-neon-blue"><span>BODYSHOTS:</span> <span>{stats.bodyshots}</span></div>
                 </div>
               </div>

               {/* AI Feedback Card */}
               <div className="bg-black/80 border-r-4 border-neon-pink p-6 shadow-lg flex flex-col justify-center relative min-h-[200px]">
                  <h3 className="text-neon-pink text-xl mb-4 border-b border-gray-700 pb-2">INSTRUCTOR AI</h3>
                  {isLoading ? (
                    <div className="text-center animate-pulse text-neon-yellow">
                      ANALYZING COMBAT DATA...
                    </div>
                  ) : (
                    <p className="text-lg italic text-white/90">
                      "{debrief}"
                    </p>
                  )}
                  {/* Decorative corner */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-neon-pink/20"></div>
               </div>
             </div>

             <div className="mt-8">
               <CyberButton onClick={handleRestart} variant="secondary">
                 REBOOT SYSTEM
               </CyberButton>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;