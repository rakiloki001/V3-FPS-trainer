import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Enemy, Particle, FloatingText, GameStats } from '../types';

interface GameCanvasProps {
  onGameOver: (stats: GameStats) => void;
}

const MOTION_THRESHOLD = 40; // Pixel brightness diff threshold (Higher = less sensitive to subtle light changes)
const HIT_PIXEL_COUNT_THRESHOLD = 25; // How many moving pixels needed to register a hit (Higher = requires bigger movement)
const GRID_SCALE = 8; // Downscale factor for motion detection
const ENEMY_SPAWN_RATE_MS = 1500;
const ENEMY_LIFESPAN_MS = 5000;
const GAME_DURATION_SEC = 60;

export const GameCanvas: React.FC<GameCanvasProps> = ({ onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const headshotsRef = useRef<number>(0);
  const bodyshotsRef = useRef<number>(0);
  const enemiesDestroyedRef = useRef<number>(0);
  const enemiesSpawnedRef = useRef<number>(0);

  // Game State Refs (using refs for performance in loop)
  const enemiesRef = useRef<Enemy[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const textsRef = useRef<FloatingText[]>([]);
  const lastSpawnTimeRef = useRef<number>(0);
  const gameStartTimeRef = useRef<number>(0);
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  
  // Cursor Tracking Ref
  const cursorRef = useRef<{x: number, y: number} | null>(null);

  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SEC);
  const [score, setScore] = useState(0);

  // Initialize Video
  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480, facingMode: 'user' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera error:", err);
        alert("Camera permission denied. The game requires a camera to detect motion.");
      }
    };
    startVideo();

    return () => {
      // Cleanup stream
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  // Helper: Spawn Particle
  const spawnExplosion = (x: number, y: number, color: string, count: number = 10) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random().toString(36).substr(2, 9),
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1.0,
        maxLife: 1.0,
        color,
        size: Math.random() * 4 + 2
      });
    }
  };

  // Helper: Floating Text
  const spawnText = (x: number, y: number, text: string, color: string) => {
    textsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      text,
      color,
      life: 1.0,
      opacity: 1.0
    });
  };

  const updateGameState = useCallback((timestamp: number, width: number, height: number) => {
    // 1. Spawning
    if (timestamp - lastSpawnTimeRef.current > ENEMY_SPAWN_RATE_MS) {
      const size = 80 + Math.random() * 40;
      enemiesRef.current.push({
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * (width - size),
        y: Math.random() * (height - size),
        width: size,
        height: size * 1.6, // Taller aspect ratio for humanoids
        hp: 3,
        maxHp: 3,
        spawnTime: timestamp,
        lastHitTime: 0,
        isHit: false
      });
      enemiesSpawnedRef.current++;
      lastSpawnTimeRef.current = timestamp;
    }

    // 2. Update Particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      p.size *= 0.95;
    });

    // 3. Update Texts
    textsRef.current = textsRef.current.filter(t => t.life > 0);
    textsRef.current.forEach(t => {
      t.y -= 1; // Float up
      t.life -= 0.02;
      t.opacity = t.life;
    });

    // 4. Update Enemies (Cleanup dead/hit effects)
    enemiesRef.current.forEach(e => {
      if (e.isHit && timestamp - e.lastHitTime > 100) {
        e.isHit = false;
      }
    });

    // Remove dead OR expired enemies
    enemiesRef.current = enemiesRef.current.filter(e => {
      const isDead = e.hp <= 0;
      const isExpired = (timestamp - e.spawnTime) > ENEMY_LIFESPAN_MS;
      
      // Visual flair for expiration (optional: could spawn a 'MISSED' text)
      if (isExpired && !isDead) {
        // Maybe spawn a small 'fizzle' effect?
      }
      
      return !isDead && !isExpired;
    });

    // Time Check
    const elapsed = (timestamp - gameStartTimeRef.current) / 1000;
    const remain = Math.max(0, GAME_DURATION_SEC - elapsed);
    setTimeLeft(remain);

    if (remain <= 0) {
      onGameOver({
        score: scoreRef.current,
        headshots: headshotsRef.current,
        bodyshots: bodyshotsRef.current,
        enemiesSpawned: enemiesSpawnedRef.current,
        enemiesDestroyed: enemiesDestroyedRef.current
      });
      return false; // Stop loop
    }

    return true; // Continue loop
  }, [onGameOver]);

  const detectMotionAndCollisions = useCallback((
    ctx: CanvasRenderingContext2D, 
    video: HTMLVideoElement, 
    width: number, 
    height: number,
    timestamp: number
  ) => {
    // We use a small offscreen canvas for motion processing to save CPU
    const mCanvas = motionCanvasRef.current;
    if (!mCanvas) return;
    
    const mw = width / GRID_SCALE;
    const mh = height / GRID_SCALE;
    
    if (mCanvas.width !== mw) {
      mCanvas.width = mw;
      mCanvas.height = mh;
    }
    
    const mCtx = mCanvas.getContext('2d', { willReadFrequently: true });
    if (!mCtx) return;

    // Draw current video frame scaled down (mirrored)
    mCtx.save();
    mCtx.scale(-1, 1);
    mCtx.translate(-mw, 0);
    mCtx.drawImage(video, 0, 0, mw, mh);
    mCtx.restore();

    const frame = mCtx.getImageData(0, 0, mw, mh);
    const data = frame.data;
    const len = data.length;
    
    // If no previous frame, just store and exit
    if (!prevFrameDataRef.current || prevFrameDataRef.current.length !== len) {
      prevFrameDataRef.current = new Uint8ClampedArray(data);
      return;
    }

    const prevData = prevFrameDataRef.current;
    const activePixels: {x: number, y: number}[] = [];

    // Compare pixels
    for (let i = 0; i < len; i += 4) {
      // Simple grayscale diff
      const rDiff = Math.abs(data[i] - prevData[i]);
      const gDiff = Math.abs(data[i+1] - prevData[i+1]);
      const bDiff = Math.abs(data[i+2] - prevData[i+2]);
      
      if ((rDiff + gDiff + bDiff) > MOTION_THRESHOLD * 3) {
        // Pixel is moving
        const pixelIdx = i / 4;
        const x = (pixelIdx % mw) * GRID_SCALE;
        const y = Math.floor(pixelIdx / mw) * GRID_SCALE;
        activePixels.push({x, y});
      }
    }

    // Save current as prev
    prevFrameDataRef.current.set(data);

    // Update Cursor Position (Centroid of motion)
    if (activePixels.length > 0) {
      let totalX = 0;
      let totalY = 0;
      for (const p of activePixels) {
        totalX += p.x;
        totalY += p.y;
      }
      const avgX = totalX / activePixels.length;
      const avgY = totalY / activePixels.length;

      // Smooth cursor movement
      if (cursorRef.current) {
        const smoothFactor = 0.5;
        cursorRef.current.x = cursorRef.current.x * smoothFactor + avgX * (1 - smoothFactor);
        cursorRef.current.y = cursorRef.current.y * smoothFactor + avgY * (1 - smoothFactor);
      } else {
        cursorRef.current = { x: avgX, y: avgY };
      }
    } else {
      cursorRef.current = null;
    }

    // Collision Detection
    enemiesRef.current.forEach((enemy, index) => {
      // Simple cooldown prevents rapid-fire hits from one gesture
      if (timestamp - enemy.lastHitTime < 400) return;

      let hitsInRect = 0;
      let hitYSum = 0;

      // Filter active pixels that are inside this enemy
      for (const p of activePixels) {
        if (p.x >= enemy.x && p.x <= enemy.x + enemy.width &&
            p.y >= enemy.y && p.y <= enemy.y + enemy.height) {
          hitsInRect++;
          hitYSum += p.y;
        }
      }

      if (hitsInRect > HIT_PIXEL_COUNT_THRESHOLD) {
        // Confirm Hit
        const avgY = hitYSum / hitsInRect;
        // Head is top 25% logic
        const headThreshold = enemy.y + (enemy.height * 0.25);
        const isHeadshot = avgY < headThreshold;

        if (isHeadshot) {
          // Headshot logic
          enemy.hp = 0; // Instant kill
          scoreRef.current += 3;
          headshotsRef.current++;
          spawnText(enemy.x + enemy.width/2, enemy.y, "CRITICAL +3", "#ff00ff");
          spawnExplosion(enemy.x + enemy.width/2, enemy.y + enemy.height*0.1, "#ff00ff", 20);
        } else {
          // Bodyshot logic
          enemy.hp -= 1;
          scoreRef.current += 1;
          bodyshotsRef.current++;
          spawnText(enemy.x + enemy.width/2, enemy.y + enemy.height/2, "BODY +1", "#00ffff");
          spawnExplosion(enemy.x + enemy.width/2, avgY, "#00ffff", 8);
        }

        enemy.lastHitTime = timestamp;
        enemy.isHit = true;

        if (enemy.hp <= 0) {
          enemiesDestroyedRef.current++;
        }
        
        setScore(scoreRef.current);
      }
    });

  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, timestamp: number) => {
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Enemies as Humanoid Holograms
    enemiesRef.current.forEach(enemy => {
      const isLowHp = enemy.hp === 1;
      const age = timestamp - enemy.spawnTime;
      const lifeRatio = 1 - (age / ENEMY_LIFESPAN_MS);
      
      // Visual warning if about to expire
      const isExpiring = lifeRatio < 0.2;
      const flicker = isExpiring && Math.floor(timestamp / 50) % 2 === 0;

      if (flicker) {
        // Skip drawing on flicker frames for glitch effect
        return; 
      }

      const baseColor = enemy.isHit ? '#ffffff' : (isLowHp ? '#ff0055' : (isExpiring ? '#ffff00' : '#00ffff'));
      
      const centerX = enemy.x + enemy.width / 2;
      const topY = enemy.y;
      const bottomY = enemy.y + enemy.height;
      
      // Calculate proportions based on hitbox logic (Top 25% is head zone)
      const headZoneHeight = enemy.height * 0.25;
      const headRadius = (headZoneHeight * 0.8) / 2;
      const headCenterY = topY + (headZoneHeight / 2);
      
      const shoulderY = topY + headZoneHeight;
      const shoulderWidth = enemy.width;
      const hipWidth = enemy.width * 0.6;
      
      ctx.save();
      
      // Glow and Line Style
      ctx.shadowBlur = isExpiring ? 5 : 15;
      ctx.shadowColor = baseColor;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      
      // Draw Head
      ctx.beginPath();
      ctx.arc(centerX, headCenterY, headRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw Neck/Connect
      ctx.beginPath();
      ctx.moveTo(centerX, headCenterY + headRadius);
      ctx.lineTo(centerX, shoulderY);
      ctx.stroke();

      // Draw Body Outline (Shoulders to Hips)
      ctx.beginPath();
      ctx.moveTo(centerX - shoulderWidth / 2, shoulderY); // Left Shoulder
      ctx.lineTo(centerX + shoulderWidth / 2, shoulderY); // Right Shoulder
      ctx.lineTo(centerX + hipWidth / 2, bottomY); // Right Hip
      ctx.lineTo(centerX - hipWidth / 2, bottomY); // Left Hip
      ctx.closePath();
      ctx.stroke();

      // Internal Hologram Scanline Effect
      ctx.clip(); // Clip to body shape
      
      // Fill with semi-transparent background
      ctx.fillStyle = enemy.isHit ? 'rgba(255,255,255,0.4)' : (isLowHp ? 'rgba(255,0,80,0.2)' : 'rgba(0,255,255,0.1)');
      ctx.fill();

      // Animated Scanlines
      const scanSpeed = 0.05;
      const scanY = (timestamp * scanSpeed) % (enemy.height);
      const absScanY = enemy.y + scanY;

      // Draw grid lines inside body
      ctx.fillStyle = baseColor;
      for (let ly = enemy.y; ly < bottomY; ly += 6) {
        // Make the moving scanline brighter
        const dist = Math.abs(ly - absScanY);
        const alpha = dist < 10 ? 0.8 : 0.1;
        ctx.globalAlpha = alpha;
        ctx.fillRect(enemy.x, ly, enemy.width, 1);
      }
      
      ctx.restore();

      // Draw HP indicators (Floating bits above head)
      const hpWidth = 20;
      const hpGap = 4;
      const totalHpWidth = (3 * hpWidth) + (2 * hpGap);
      const startX = centerX - (totalHpWidth / 2);
      
      for(let i=0; i<3; i++) {
        ctx.fillStyle = i < enemy.hp ? baseColor : '#333333';
        ctx.fillRect(startX + i*(hpWidth+hpGap), topY - 15, hpWidth, 4);
      }

      // Draw Timeout Bar (Optional, but helpful)
      const barWidth = enemy.width;
      ctx.fillStyle = '#333';
      ctx.fillRect(enemy.x, bottomY + 5, barWidth, 4);
      ctx.fillStyle = isExpiring ? '#ffff00' : '#00ffff';
      ctx.fillRect(enemy.x, bottomY + 5, barWidth * lifeRatio, 4);
      
    });

    // 2. Draw Particles
    particlesRef.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 3. Draw Floating Texts
    textsRef.current.forEach(t => {
      ctx.save();
      ctx.globalAlpha = t.opacity;
      ctx.fillStyle = t.color;
      ctx.font = "bold 20px 'Share Tech Mono'";
      ctx.shadowBlur = 0; // Text is clearer without heavy blur
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });

    // 4. Draw Cursor (Tracking Indicator)
    if (cursorRef.current) {
      const { x, y } = cursorRef.current;
      ctx.save();
      ctx.strokeStyle = '#39ff14'; // Bright neon green for cursor
      ctx.fillStyle = 'rgba(57, 255, 20, 0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#39ff14';
      ctx.lineWidth = 2;

      // Draw Crosshair
      ctx.beginPath();
      const s = 15; // size
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      ctx.stroke();

      // Draw Circle
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw "Detected" Label
      ctx.font = "10px 'Share Tech Mono'";
      ctx.fillStyle = '#39ff14';
      ctx.fillText("TRK", x + 10, y - 10);
      
      ctx.restore();
    }

  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    if (!gameStartTimeRef.current) gameStartTimeRef.current = timestamp;

    const canvas = canvasRef.current;
    if (canvas && videoRef.current && videoRef.current.readyState === 4) {
      // Resize canvas to match video if needed
      if (canvas.width !== videoRef.current.videoWidth) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw video background (Mirrored + Cyberpunk Tint)
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        // Cool blueish tint for "Tactical Visor" feel
        ctx.filter = "contrast(1.1) brightness(0.9) sepia(1) hue-rotate(180deg) saturate(1.5)"; 
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        // Add a scanline overlay to the camera feed itself
        ctx.fillStyle = "rgba(0, 20, 40, 0.2)";
        ctx.fillRect(0,0, canvas.width, canvas.height);
        
        ctx.restore();

        // Game Logic
        const isRunning = updateGameState(timestamp, canvas.width, canvas.height);
        
        // Detect Motion
        detectMotionAndCollisions(ctx, videoRef.current, canvas.width, canvas.height, timestamp);

        // Render Game Objects
        draw(ctx, canvas.width, canvas.height, timestamp);

        if (!isRunning) return; // Stop loop if game over
      }
    }
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [detectMotionAndCollisions, draw, updateGameState]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameLoop]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
      
      {/* Pilot Feed (Bottom Left Mini Camera) */}
      <div className="absolute bottom-6 left-6 z-30 flex flex-col items-start pointer-events-none">
        <div className="text-xs text-neon-blue bg-black/50 px-2 border-t border-l border-neon-blue mb-1 font-mono tracking-widest">
          PILOT_FEED
        </div>
        <video 
          ref={videoRef} 
          className="w-48 h-auto border-2 border-neon-blue/50 shadow-[0_0_10px_rgba(0,255,255,0.3)] scale-x-[-1] opacity-90 rounded-sm"
          playsInline 
          muted 
        />
      </div>
      
      {/* Hidden Motion Canvas */}
      <canvas ref={motionCanvasRef} className="hidden" />

      {/* Main Game Canvas */}
      <canvas 
        ref={canvasRef} 
        className="max-w-full max-h-full border-y-2 border-neon-blue shadow-[0_0_20px_rgba(0,255,255,0.3)]"
      />

      {/* In-Game HUD Overlay */}
      <div className="absolute top-4 left-4 font-mono text-neon-blue text-2xl z-10 pointer-events-none drop-shadow-lg bg-black/40 p-2 border-l-4 border-neon-pink">
        <div className="text-sm text-neon-pink mb-1">TARGET_LOCK_SYSTEM</div>
        <div>SCORE: {score.toString().padStart(4, '0')}</div>
        <div className={`${timeLeft < 10 ? 'text-neon-pink animate-pulse' : ''}`}>
          TIME: {timeLeft.toFixed(1)}s
        </div>
      </div>
    </div>
  );
};