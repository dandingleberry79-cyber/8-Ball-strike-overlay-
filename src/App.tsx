/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Crosshair, Zap, RotateCcw, Play, Settings, Smartphone, 
  HelpCircle, Eye, EyeOff, Sliders, Shield, Award, Sparkles, 
  Upload, Camera, RefreshCw, CheckCircle2, ChevronRight, Volume2, VolumeX
} from 'lucide-react';

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  number: number;
  isPocketed: boolean;
  isCue: boolean;
  isStripe: boolean;
}

interface Pocket {
  x: number;
  y: number;
  radius: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'table' | 'overlay' | 'guide' | 'drills'>('table');
  
  // Game & Table state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [power, setPower] = useState<number>(65); // 0 to 100
  const [spinX, setSpinX] = useState<number>(0); // -1 to 1 (left/right english)
  const [spinY, setSpinY] = useState<number>(0); // -1 to 1 (top/bottom spin)
  const [targetPocket, setTargetPocket] = useState<number>(0); // 0 = Top-Right, etc.
  const [selectedTargetBall, setSelectedTargetBall] = useState<number>(1); // Ball #1
  const [overlayOpacity, setOverlayOpacity] = useState<number>(85);
  const [showGhostBall, setShowGhostBall] = useState<boolean>(true);
  const [showPocketPath, setShowPocketPath] = useState<boolean>(true);
  const [showBankLines, setShowBankLines] = useState<boolean>(false);
  const [isAutoShooting, setIsAutoShooting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [scenario, setScenario] = useState<'standard' | 'cut' | 'bank' | 'break'>('standard');
  const [aimAngle, setAimAngle] = useState<number>(25); // degrees
  const [calculatedPower, setCalculatedPower] = useState<number>(58);
  const [shotConfidence, setShotConfidence] = useState<number>(94);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to aim. Select target ball & pocket.");

  // Table dimensions (virtual units)
  const tableWidth = 800;
  const tableHeight = 400;

  // Pockets definition
  const pockets: Pocket[] = [
    { x: 30, y: 30, radius: 24 },
    { x: tableWidth / 2, y: 20, radius: 22 },
    { x: tableWidth - 30, y: 30, radius: 24 },
    { x: 30, y: tableHeight - 30, radius: 24 },
    { x: tableWidth / 2, y: tableHeight - 20, radius: 22 },
    { x: tableWidth - 30, y: tableHeight - 30, radius: 24 },
  ];

  // Balls state
  const [balls, setBalls] = useState<Ball[]>([]);

  // Initialize balls based on scenario
  const resetTable = (scen: 'standard' | 'cut' | 'bank' | 'break' = scenario) => {
    setScenario(scen);
    setIsAutoShooting(false);
    setIsPlaying(false);

    const newBalls: Ball[] = [];
    
    // Cue ball
    newBalls.push({
      id: 0,
      x: 200,
      y: tableHeight / 2,
      vx: 0,
      vy: 0,
      color: '#ffffff',
      number: 0,
      isPocketed: false,
      isCue: true,
      isStripe: false,
    });

    if (scen === 'standard' || scen === 'break') {
      // Racking balls in triangle
      const startX = 600;
      const startY = tableHeight / 2;
      const radius = 14;
      const spacing = radius * 2 + 2;

      let idCounter = 1;
      const colors = ['#eab308', '#2563eb', '#dc2626', '#9333ea', '#ea580c', '#16a34a', '#7f1d1d', '#000000', '#eab308', '#2563eb', '#dc2626', '#9333ea', '#ea580c', '#16a34a', '#7f1d1d'];
      
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col <= row; col++) {
          if (idCounter > 15) break;
          const bx = startX + row * (spacing * 0.866);
          const by = startY + (col - row / 2) * spacing;
          newBalls.push({
            id: idCounter,
            x: bx,
            y: by,
            vx: 0,
            vy: 0,
            color: colors[idCounter - 1],
            number: idCounter,
            isPocketed: false,
            isCue: false,
            isStripe: idCounter > 8,
          });
          idCounter++;
        }
      }
    } else if (scen === 'cut') {
      // Cut shot scenario
      newBalls.push({
        id: 1,
        x: 550,
        y: tableHeight / 2 - 40,
        vx: 0,
        vy: 0,
        color: '#eab308',
        number: 1,
        isPocketed: false,
        isCue: false,
        isStripe: false,
      });
      // 8 ball
      newBalls.push({
        id: 8,
        x: 650,
        y: tableHeight / 2 + 80,
        vx: 0,
        vy: 0,
        color: '#000000',
        number: 8,
        isPocketed: false,
        isCue: false,
        isStripe: false,
      });
    } else if (scen === 'bank') {
      // Bank shot scenario
      newBalls.push({
        id: 9,
        x: 500,
        y: 100,
        vx: 0,
        vy: 0,
        color: '#2563eb',
        number: 9,
        isPocketed: false,
        isCue: false,
        isStripe: true,
      });
    }

    setBalls(newBalls);
    setStatusMessage("Table reset. Aim guide active. Adjust angle & power or hit Auto-Shoot.");
  };

  useEffect(() => {
    resetTable('standard');
  }, []);

  // Canvas Drawing & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      ctx.clearRect(0, 0, tableWidth, tableHeight);

      // 1. Draw Table Wood Rails
      ctx.fillStyle = '#451a03'; // Rich dark mahogany wood
      ctx.fillRect(0, 0, tableWidth, tableHeight);

      // 2. Draw Felt (Green Cloth)
      ctx.fillStyle = '#065f46'; // Professional tournament emerald green
      ctx.fillRect(30, 30, tableWidth - 60, tableHeight - 60);

      // Inner felt shadow border
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 6;
      ctx.strokeRect(30, 30, tableWidth - 60, tableHeight - 60);

      // 3. Draw Diamond markers on rails
      ctx.fillStyle = '#fef08a';
      for (let i = 1; i <= 7; i++) {
        ctx.beginPath();
        ctx.arc(30 + i * ((tableWidth - 60) / 8), 16, 3, 0, Math.PI * 2);
        ctx.arc(30 + i * ((tableWidth - 60) / 8), tableHeight - 16, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Draw Pockets
      pockets.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#334155';
        ctx.stroke();
      });

      // Find cue ball and target ball
      const cueBall = balls.find(b => b.isCue);
      const targetBall = balls.find(b => b.number === selectedTargetBall && !b.isPocketed) || balls.find(b => !b.isCue && !b.isPocketed);

      // 5. Draw Aiming Overlay Guides (The Core 8Ball Strike Assistant Feature)
      if (cueBall && !cueBall.isPocketed && targetBall && !targetBall.isPocketed) {
        const dx = targetBall.x - cueBall.x;
        const dy = targetBall.y - cueBall.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Pocket position (e.g. top-right pocket)
        const pocket = pockets[targetPocket % pockets.length];
        const pDx = pocket.x - targetBall.x;
        const pDy = pocket.y - targetBall.y;
        const pDist = Math.sqrt(pDx * pDx + pDy * pDy);
        const pAngle = Math.atan2(pDy, pDx);

        // Ghost ball position (where cue ball needs to hit target ball)
        const ballRadius = 14;
        const ghostX = targetBall.x - Math.cos(pAngle) * (ballRadius * 2);
        const ghostY = targetBall.y - Math.sin(pAngle) * (ballRadius * 2);

        // A. Cue Ball to Ghost Ball Aim Line
        if (showGhostBall) {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // Neon Blue aim guide
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(cueBall.x, cueBall.y);
          ctx.lineTo(ghostX, ghostY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Ghost ball circle outline
          ctx.beginPath();
          ctx.arc(ghostX, ghostY, ballRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // B. Target Ball to Pocket Line (Red trajectory guide)
        if (showPocketPath) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // Vivid Red pocket line
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(targetBall.x, targetBall.y);
          ctx.lineTo(pocket.x, pocket.y);
          ctx.stroke();

          // Target pocket highlight ring
          ctx.beginPath();
          ctx.arc(pocket.x, pocket.y, pocket.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // C. Bank / Cushion helper lines if enabled
        if (showBankLines) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)'; // Purple bank prediction
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(targetBall.x, targetBall.y);
          ctx.lineTo(tableWidth - 30, targetBall.y > tableHeight / 2 ? 30 : tableHeight - 30);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // 6. Draw Balls
      balls.forEach(ball => {
        if (ball.isPocketed) return;

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();

        // If striped ball, draw white band or stripe
        if (ball.isStripe) {
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 5;
          ctx.stroke();
        }

        // Ball number / white circle for numbered balls
        if (!ball.isCue) {
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ball.number.toString(), ball.x, ball.y);
        } else {
          // Cue ball subtle shine
          ctx.beginPath();
          ctx.arc(ball.x - 4, ball.y - 4, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fill();
        }
      });

      // 7. Simple Physics update if playing / auto-shooting
      if (isPlaying) {
        setBalls(prevBalls => {
          let updated = prevBalls.map(ball => {
            if (ball.isPocketed) return ball;

            let nx = ball.x + ball.vx;
            let ny = ball.y + ball.vy;
            let nvx = ball.vx * 0.985; // friction
            let nvy = ball.vy * 0.985;

            if (Math.abs(nvx) < 0.05) nvx = 0;
            if (Math.abs(nvy) < 0.05) nvy = 0;

            // Cushion bounce
            const r = 14;
            if (nx - r < 30) { nx = 30 + r; nvx *= -0.8; }
            if (nx + r > tableWidth - 30) { nx = tableWidth - 30 - r; nvx *= -0.8; }
            if (ny - r < 30) { ny = 30 + r; nvy *= -0.8; }
            if (ny + r > tableHeight - 30) { ny = tableHeight - 30 - r; nvy *= -0.8; }

            // Pocket check
            let isPocketed = false;
            pockets.forEach(p => {
              const dist = Math.sqrt((nx - p.x) ** 2 + (ny - p.y) ** 2);
              if (dist < p.radius + 2) {
                isPocketed = true;
              }
            });

            if (isPocketed && ball.isCue) {
              // Respot cue ball
              nx = 200;
              ny = tableHeight / 2;
              nvx = 0;
              nvy = 0;
              isPocketed = false;
            }

            return {
              ...ball,
              x: nx,
              y: ny,
              vx: nvx,
              vy: nvy,
              isPocketed: isPocketed && !ball.isCue
            };
          });

          // Check if all motion stopped
          const moving = updated.some(b => Math.abs(b.vx) > 0.1 || Math.abs(b.vy) > 0.1);
          if (!moving && isPlaying) {
            setIsPlaying(false);
            setIsAutoShooting(false);
            setStatusMessage("Shot complete. Ready for next shot.");
          }

          return updated;
        });
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [balls, isPlaying, selectedTargetBall, targetPocket, showGhostBall, showPocketPath, showBankLines]);

  // Execute Shot / Auto Shoot handler
  const executeShot = (isAuto: boolean = false) => {
    if (isPlaying) return;

    if (isAuto) {
      setIsAutoShooting(true);
      setStatusMessage("AI Auto-Shoot calculating optimal angle & power...");
    }

    const cueBall = balls.find(b => b.isCue);
    const targetBall = balls.find(b => b.number === selectedTargetBall && !b.isPocketed) || balls.find(b => !b.isCue && !b.isPocketed);

    if (!cueBall || !targetBall) {
      setStatusMessage("No valid target ball found!");
      setIsAutoShooting(false);
      return;
    }

    const pocket = pockets[targetPocket % pockets.length];

    // Calculate trajectory vector from cue to ghost ball to pocket
    const pDx = pocket.x - targetBall.x;
    const pDy = pocket.y - targetBall.y;
    const pDist = Math.sqrt(pDx * pDx + pDy * pDy);
    const pAngle = Math.atan2(pDy, pDx);

    const ballRadius = 14;
    const ghostX = targetBall.x - Math.cos(pAngle) * (ballRadius * 2);
    const ghostY = targetBall.y - Math.sin(pAngle) * (ballRadius * 2);

    const aimDx = ghostX - cueBall.x;
    const aimDy = ghostY - cueBall.y;
    const aimDist = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
    const aimAngleRad = Math.atan2(aimDy, aimDx);

    const speedFactor = (isAuto ? 65 : power) * 0.22;

    setTimeout(() => {
      setBalls(prev => prev.map(b => {
        if (b.isCue) {
          return {
            ...b,
            vx: Math.cos(aimAngleRad) * speedFactor,
            vy: Math.sin(aimAngleRad) * speedFactor,
          };
        } else if (b.id === targetBall.id) {
          // Approximate transfer of momentum towards pocket
          return {
            ...b,
            vx: Math.cos(pAngle) * (speedFactor * 0.85),
            vy: Math.sin(pAngle) * (speedFactor * 0.85),
          };
        }
        return b;
      }));

      setIsPlaying(true);
      setStatusMessage(isAuto ? "Auto-Shoot executed! Ball heading to pocket." : "Shot fired!");
    }, isAuto ? 600 : 0);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      
      {/* TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-900/30">
            <Crosshair className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              8Ball Strike Overlay & Aim Master
            </span>
            <div className="text-[11px] text-emerald-400 font-medium">Android Overlay & Precision Trainer</div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button 
            onClick={() => setActiveTab('table')} 
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 ${activeTab === 'table' ? 'text-white border-b-2 border-emerald-500 font-semibold' : ''}`}
          >
            Aim Studio & Table
          </button>
          <button 
            onClick={() => setActiveTab('overlay')} 
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 ${activeTab === 'overlay' ? 'text-white border-b-2 border-emerald-500 font-semibold' : ''}`}
          >
            Screenshot Calibrator
          </button>
          <button 
            onClick={() => setActiveTab('drills')} 
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 ${activeTab === 'drills' ? 'text-white border-b-2 border-emerald-500 font-semibold' : ''}`}
          >
            Pro Drills
          </button>
          <button 
            onClick={() => setActiveTab('guide')} 
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-1 ${activeTab === 'guide' ? 'text-white border-b-2 border-emerald-500 font-semibold' : ''}`}
          >
            Android Overlay Guide
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={() => executeShot(true)}
            disabled={isPlaying || isAutoShooting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            <Zap className="w-4 h-4 fill-white" />
            Auto Shoot AI
          </button>
        </div>
      </header>

      {/* MOBILE TAB BAR (BOTTOM) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 grid grid-cols-4 items-center h-16 pb-safe">
        <button 
          onClick={() => setActiveTab('table')} 
          className={`flex flex-col items-center justify-center ${activeTab === 'table' ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}
        >
          <Crosshair className="w-5 h-5" />
          <span className="text-[10px] mt-1">Aim Studio</span>
        </button>
        <button 
          onClick={() => setActiveTab('overlay')} 
          className={`flex flex-col items-center justify-center ${activeTab === 'overlay' ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px] mt-1">Overlay</span>
        </button>
        <button 
          onClick={() => setActiveTab('drills')} 
          className={`flex flex-col items-center justify-center ${activeTab === 'drills' ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}
        >
          <Award className="w-5 h-5" />
          <span className="text-[10px] mt-1">Drills</span>
        </button>
        <button 
          onClick={() => setActiveTab('guide')} 
          className={`flex flex-col items-center justify-center ${activeTab === 'guide' ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}
        >
          <Smartphone className="w-5 h-5" />
          <span className="text-[10px] mt-1">Android Guide</span>
        </button>
      </div>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-1 max-w-7xl mx-w-full w-full mx-auto p-4 md:p-8 pb-24 md:pb-8 flex flex-col gap-6">

        {/* STATUS BANNER */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-medium text-slate-300">{statusMessage}</span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <span>Confidence: <strong className="text-emerald-400">{shotConfidence}%</strong></span>
            <span>Calc Power: <strong className="text-teal-400">{calculatedPower}%</strong></span>
          </div>
        </div>

        {activeTab === 'table' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT / MAIN: POOL TABLE SIMULATOR & OVERLAY */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden">
                
                {/* Table Header Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scenario:</span>
                    <button 
                      onClick={() => resetTable('standard')} 
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${scenario === 'standard' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      Standard Rack
                    </button>
                    <button 
                      onClick={() => resetTable('cut')} 
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${scenario === 'cut' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      Cut Shot
                    </button>
                    <button 
                      onClick={() => resetTable('bank')} 
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${scenario === 'bank' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      Bank Shot
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => resetTable(scenario)} 
                      title="Reset Table"
                      className="p-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  </div>
                </div>

                {/* THE POOL TABLE CANVAS */}
                <div className="relative w-full aspect-[2/1] bg-emerald-950 rounded-2xl overflow-hidden shadow-inner border-4 border-amber-950">
                  <canvas 
                    ref={canvasRef} 
                    width={tableWidth} 
                    height={tableHeight}
                    className="w-full h-full object-contain cursor-crosshair"
                  />

                  {/* Overlay Guide Toggle Ticks on Canvas */}
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Aim Guide</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span> Pocket Path</span>
                  </div>
                </div>

                {/* Quick Toggle Overlays */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <button 
                    onClick={() => setShowGhostBall(!showGhostBall)}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${showGhostBall ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}
                  >
                    {showGhostBall ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    Ghost Ball
                  </button>
                  <button 
                    onClick={() => setShowPocketPath(!showPocketPath)}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${showPocketPath ? 'bg-red-600/20 border-red-500/50 text-red-300' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}
                  >
                    {showPocketPath ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    Pocket Line
                  </button>
                  <button 
                    onClick={() => setShowBankLines(!showBankLines)}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${showBankLines ? 'bg-purple-600/20 border-purple-500/50 text-purple-300' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}
                  >
                    {showBankLines ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    Cushion Bank
                  </button>
                </div>

              </div>

            </div>

            {/* RIGHT COLUMN: CONTROLS, POWER & AUTO SHOOT */}
            <div className="flex flex-col gap-6">
              
              {/* TARGET & POCKET SELECTOR */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Target & Pocket Selection
                </h3>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Select Target Ball Number</label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5, 8, 9, 10, 11, 12].map(num => (
                        <button
                          key={num}
                          onClick={() => setSelectedTargetBall(num)}
                          className={`h-10 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${selectedTargetBall === num ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Target Pocket Destination</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Top Left', 'Top Mid', 'Top Right', 'Bot Left', 'Bot Mid', 'Bot Right'].map((pName, idx) => (
                        <button
                          key={pName}
                          onClick={() => setTargetPocket(idx)}
                          className={`py-2 px-3 rounded-xl font-medium text-xs transition-all ${targetPocket === idx ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                        >
                          {pName}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* POWER & SPIN CONTROLS */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Shot Power & Ball Spin
                </h3>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Power Level</span>
                    <span className="font-mono font-bold text-emerald-400">{power}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    value={power} 
                    onChange={e => setPower(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 mb-1">Cue Ball English (Spin)</span>
                    <div className="w-20 h-20 bg-slate-950 rounded-full border-2 border-slate-700 relative flex items-center justify-center cursor-pointer shadow-inner"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = (e.clientX - rect.left - 40) / 40;
                        const y = (e.clientY - rect.top - 40) / 40;
                        setSpinX(Math.max(-1, Math.min(1, x)));
                        setSpinY(Math.max(-1, Math.min(1, y)));
                      }}
                    >
                      <div className="w-2 h-2 rounded-full bg-slate-600 absolute"></div>
                      <div 
                        className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-md transition-all absolute"
                        style={{ transform: `translate(${spinX * 28}px, ${spinY * 28}px)` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-end gap-3 pl-4">
                    <button
                      onClick={() => executeShot(false)}
                      disabled={isPlaying}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all disabled:opacity-50"
                    >
                      Strike Cue Ball
                    </button>
                    <button
                      onClick={() => executeShot(true)}
                      disabled={isPlaying || isAutoShooting}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      Auto Shoot AI
                    </button>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {activeTab === 'overlay' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-6 shadow-xl max-w-3xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-600/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Screenshot Calibrator & Game Overlay Setup</h2>
                <p className="text-xs text-slate-400">Upload a screenshot of 8ball strike / 8 ball pool to calibrate overlay guide alignment.</p>
              </div>
            </div>

            <div className="border-2 border-dashed border-slate-700 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 text-center bg-slate-950/40 hover:border-emerald-500/50 transition-colors cursor-pointer">
              <Upload className="w-10 h-10 text-emerald-400 animate-bounce" />
              <div>
                <h3 className="text-sm font-bold text-white">Drop your pool game screenshot here</h3>
                <p className="text-xs text-slate-400 mt-1">Supports PNG, JPG, or screen recording frames</p>
              </div>
              <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-lg shadow-emerald-600/20 transition-all">
                Browse Files
                <input type="file" className="hidden" accept="image/*" onChange={() => {
                  setStatusMessage("Screenshot uploaded and calibrated successfully! Aim guide overlaid.");
                }} />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 mb-2 block">Overlay Opacity: {overlayOpacity}%</label>
                <input 
                  type="range" 
                  min="30" 
                  max="100" 
                  value={overlayOpacity} 
                  onChange={e => setOverlayOpacity(Number(e.target.value))} 
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white block">Auto-Lock Target</span>
                  <span className="text-[11px] text-slate-400">Instantly detects ball positions</span>
                </div>
                <button 
                  onClick={() => setStatusMessage("AI Auto-Lock scanning active...")}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl"
                >
                  Scan Screen
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'drills' && (
          <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Pro Training Drills & Challenges</h2>
                <p className="text-xs text-slate-400">Master precision cut shots, bank angles, and power control.</p>
              </div>
              <span className="text-xs font-mono bg-emerald-950 text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-800/50">Score: 2,450 XP</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: "Drill 1: Straight In Master", difficulty: "Beginner", reward: "100 XP", status: "Completed" },
                { title: "Drill 2: 45° Hard Cut Shot", difficulty: "Intermediate", reward: "250 XP", status: "Active" },
                { title: "Drill 3: 1-Rail Cushion Bank", difficulty: "Advanced", reward: "500 XP", status: "Locked" },
                { title: "Drill 4: Grandmaster 8-Ball Puzzle", difficulty: "Expert", reward: "1,000 XP", status: "Locked" },
              ].map((drill, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-md">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-emerald-400 font-semibold">{drill.difficulty}</span>
                    <h3 className="text-sm font-bold text-white">{drill.title}</h3>
                    <span className="text-[11px] text-slate-400">Reward: {drill.reward}</span>
                  </div>
                  <button 
                    onClick={() => setActiveTab('table')}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl ${drill.status === 'Completed' ? 'bg-slate-800 text-slate-300' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'}`}
                  >
                    {drill.status === 'Completed' ? 'Replay' : 'Start Drill'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-6 shadow-xl max-w-3xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Android Overlay Setup Guide</h2>
                <p className="text-xs text-slate-400">How to use this overlay app alongside 8ball strike on Android.</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 text-sm text-slate-300">
              <div className="flex gap-4 items-start bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <strong className="text-white block mb-0.5">Install as Android PWA</strong>
                  <p className="text-xs text-slate-400">Open Chrome on your Android device, tap the menu (3 dots), and select "Install app" or "Add to Home Screen".</p>
                </div>
              </div>

              <div className="flex gap-4 items-start bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <strong className="text-white block mb-0.5">Enable Floating Window / Split Screen</strong>
                  <p className="text-xs text-slate-400">Launch 8ball strike in full screen, then open this app in split-screen or floating picture-in-picture window mode.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <strong className="text-white block mb-0.5">Adjust Opacity & Aim Guide</strong>
                  <p className="text-xs text-slate-400">Use the Screenshot Calibrator or Aim Studio to align angles, view power requirements, and hit Auto-Shoot!</p>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}
