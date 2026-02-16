
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Trophy, ShoppingBag, Zap, Wind, Target, Skull, RotateCcw } from 'lucide-react';

// --- TYPES ---
type GameState = 'title' | 'intro' | 'racing' | 'end' | 'shop' | 'victory' | 'gameover';

interface UpgradeLevels {
  speed: number;
  acceleration: number;
  combat: number;
}

interface Point {
  world: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}

interface Scenery {
  type: 'tree' | 'light' | 'sign';
  side: -1 | 1;
  offset: number;
}

class RoadSegment {
  index: number;
  p1: Point;
  p2: Point;
  curve: number;
  y: number;
  color: { road: string; grass: string; rumble: string; lane: string };
  scenery: Scenery | null;

  constructor(index: number, z: number, y: number, curve: number, segmentLength: number) {
    this.index = index;
    this.curve = curve;
    this.y = y;
    this.p1 = { world: { x: 0, y: 0, z: z }, screen: { x: 0, y: 0, w: 0, scale: 0 } };
    this.p2 = { world: { x: 0, y: y, z: z + segmentLength }, screen: { x: 0, y: 0, w: 0, scale: 0 } };
    
    const isDark = Math.floor(index / 3) % 2 === 0;
    this.color = {
      road: isDark ? '#2a2a2a' : '#333333',
      grass: isDark ? '#0a8a0a' : '#10AA10',
      rumble: isDark ? '#444' : '#eee',
      lane: '#aaa'
    };

    // Randomly add scenery
    this.scenery = null;
    if (index % 15 === 0) {
      this.scenery = {
        type: index % 30 === 0 ? 'light' : 'tree',
        side: Math.random() > 0.5 ? 1 : -1,
        offset: 1.5 + Math.random() * 0.5
      };
    }
  }
}

// --- CONSTANTS ---
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 768;
const ROAD_WIDTH = 2000;
const SEGMENT_LENGTH = 200;
const FIELD_OF_VIEW = 100;
const CAMERA_HEIGHT = 1200;
const DRAW_DISTANCE = 300;

const STAGES = [
  { name: 'DESERT HIGHWAY', length: 30000, traffic: 0.02, color: '#e2711d' },
  { name: 'NEON CITY', length: 45000, traffic: 0.05, color: '#1a1a2e' },
  { name: 'MOUNTAIN PASS', length: 60000, traffic: 0.03, color: '#1a4d6d' },
  { name: 'COASTAL RUN', length: 80000, traffic: 0.06, color: '#0077be' },
  { name: 'WASTELAND ROAD', length: 100000, traffic: 0.08, color: '#4a3728' }
];

// --- UTILS ---
const wrap = (i: number, max: number) => ((i % max) + max) % max;

function lightenColor(color: string, percent: number) {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// --- OVERLAYS ---
const ScreenOverlay: React.FC<{ children: React.ReactNode; zIndex?: string }> = ({ children, zIndex = "z-50" }) => (
  <div className={`absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white ${zIndex} p-6 text-center font-orbitron backdrop-blur-sm`}>
    {children}
  </div>
);

// --- MAIN APP ---
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('title');
  const [currentStage, setCurrentStage] = useState(0);
  const [money, setMoney] = useState(500);
  const [score, setScore] = useState(0);
  const [upgrades, setUpgrades] = useState<UpgradeLevels>({ speed: 1, acceleration: 1, combat: 1 });
  
  const segmentsRef = useRef<RoadSegment[]>([]);
  const cameraZRef = useRef(0);
  const playerRef = useRef({
    x: 0,
    z: 0,
    speed: 0,
    maxSpeed: 200,
    accel: 15,
    health: 100,
    lean: 0,
    attackType: 'normal',
    attackTime: 0,
    finishPos: 0
  });
  
  const keysRef = useRef<Record<string, boolean>>({});
  const opponentsRef = useRef<any[]>([]);
  const trafficRef = useRef<any[]>([]);
  const particlesRef = useRef<any[]>([]);
  const lastTimeRef = useRef(0);

  // --- RENDERING HELPERS ---

  const drawScenery = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, type: string, side: number) => {
    const w = 200 * scale;
    const h = 400 * scale;
    ctx.save();
    ctx.translate(x, y);
    
    if (type === 'tree') {
      // Trunk
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(-w * 0.1, -h * 0.2, w * 0.2, h * 0.2);
      // Leaves
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.lineTo(-w * 0.6, -h * 0.2);
      ctx.lineTo(w * 0.6, -h * 0.2);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'light') {
      ctx.fillStyle = '#444';
      ctx.fillRect(-w * 0.05, -h, w * 0.1, h);
      ctx.fillStyle = '#ffd600';
      ctx.beginPath();
      ctx.arc(side * w * 0.2, -h, w * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }, []);

  const drawDetailedBike = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, type: string, leanAngle = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(leanAngle * 0.2);
    
    const w = width;
    const h = height;
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath(); ctx.ellipse(0, h * 0.05, w * 0.5, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    
    // Wheels
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-w * 0.25, -h * 0.12, w * 0.15, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.25, -h * 0.12, w * 0.15, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    
    // Rims/Glow
    ctx.strokeStyle = lightenColor(color, 40);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-w * 0.25, -h * 0.12, w * 0.08, h * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * 0.25, -h * 0.12, w * 0.08, h * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
    
    // Frame
    ctx.fillStyle = '#222';
    ctx.fillRect(-w * 0.35, -h * 0.4, w * 0.7, h * 0.3);
    
    // Fairing / Color Part
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h * 0.4);
    ctx.lineTo(-w * 0.2, -h * 0.6);
    ctx.lineTo(w * 0.3, -h * 0.6);
    ctx.lineTo(w * 0.5, -h * 0.4);
    ctx.closePath();
    ctx.fill();
    
    // Highlights
    const grad = ctx.createLinearGradient(-w * 0.4, -h * 0.6, w * 0.5, -h * 0.4);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Rider
    ctx.fillStyle = '#111'; // Suit
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, -h * 0.5);
    ctx.lineTo(-w * 0.2, -h * 0.8);
    ctx.lineTo(w * 0.2, -h * 0.8);
    ctx.lineTo(w * 0.1, -h * 0.5);
    ctx.closePath();
    ctx.fill();

    // Helmet
    ctx.fillStyle = lightenColor(color, 20);
    ctx.beginPath(); ctx.arc(0, -h * 0.9, w * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; // Visor
    ctx.fillRect(-w * 0.1, -h * 0.95, w * 0.2, h * 0.08);

    // Combat Anim
    if (type === 'punchLeft') {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-w * 0.1, -h * 0.7); ctx.lineTo(-w * 0.6, -h * 0.65); ctx.stroke();
    } else if (type === 'punchRight') {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.1, -h * 0.7); ctx.lineTo(w * 0.6, -h * 0.65); ctx.stroke();
    }
    
    ctx.restore();
  }, []);

  const drawDetailedCar = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, type: string) => {
    ctx.save();
    ctx.translate(x, y);
    const w = width; const h = height;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-w * 0.5, h * 0.05, w, h * 0.1);
    
    ctx.fillStyle = color;
    ctx.fillRect(-w * 0.45, -h * 0.5, w * 0.9, h * 0.4);
    ctx.fillStyle = lightenColor(color, 20);
    ctx.fillRect(-w * 0.4, -h * 0.8, w * 0.8, h * 0.4);
    
    // Windows
    ctx.fillStyle = '#1a3a5a';
    ctx.fillRect(-w * 0.35, -h * 0.75, w * 0.7, h * 0.2);
    
    // Tail lights
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-w * 0.4, -h * 0.45, w * 0.15, h * 0.1);
    ctx.fillRect(w * 0.25, -h * 0.45, w * 0.15, h * 0.1);
    
    ctx.restore();
  }, []);

  const createParticle = useCallback((x: number, z: number, type: 'smoke' | 'spark' | 'dust') => {
    const p = {
      x, z,
      vx: (Math.random() - 0.5) * 0.1,
      vz: type === 'smoke' ? -0.2 : 0,
      life: 1.0,
      size: type === 'smoke' ? 10 : 5,
      color: type === 'smoke' ? 'rgba(100,100,100,0.5)' : (type === 'spark' ? '#f39c12' : '#8d6e63'),
      type
    };
    particlesRef.current.push(p);
  }, []);

  const checkCombat = useCallback((type: string) => {
    const p = playerRef.current;
    const combatBoost = upgrades.combat;
    opponentsRef.current.forEach(o => {
      if (o.state !== 'racing') return;
      if (Math.abs(o.z - p.z) < 250) {
        const dx = o.x - p.x;
        const isHit = (type === 'punchLeft' && dx < -0.1 && dx > -0.7) ||
                      (type === 'punchRight' && dx > 0.1 && dx < 0.7) ||
                      (type === 'kick' && Math.abs(dx) < 0.6);
        if (isHit) {
          o.health -= 25 * combatBoost;
          setScore(s => s + 200);
          for (let i = 0; i < 10; i++) createParticle(o.x, o.z, 'spark');
          if (o.health <= 0) {
            o.state = 'down';
            o.stateTimer = 3;
            setScore(s => s + 1000);
          }
        }
      }
    });
  }, [upgrades.combat, createParticle]);

  const initRace = useCallback(() => {
    const stage = STAGES[currentStage];
    const newSegments: RoadSegment[] = [];
    let curY = 0, curCurve = 0;
    
    for (let i = 0; i < (stage.length / SEGMENT_LENGTH) + DRAW_DISTANCE; i++) {
      if (i > 100 && i % 250 === 0) {
        curCurve = (Math.random() - 0.5) * 5;
        curY = (Math.random() - 0.5) * 2000;
      }
      const curve = (i < 100) ? 0 : Math.sin(i / 50) * curCurve;
      const y = (i < 50) ? 0 : Math.cos(i / 100) * curY;
      newSegments.push(new RoadSegment(i, i * SEGMENT_LENGTH, y, curve, SEGMENT_LENGTH));
    }
    
    for (let i = 1; i < newSegments.length; i++) newSegments[i].p1.world.y = newSegments[i-1].p2.world.y;
    segmentsRef.current = newSegments;

    playerRef.current = {
      x: 0, z: 0, speed: 0,
      maxSpeed: 200 + upgrades.speed * 25,
      accel: 15 + upgrades.acceleration * 5,
      health: 100, lean: 0, attackType: 'normal', attackTime: 0, finishPos: 0
    };

    opponentsRef.current = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'].map((c, i) => ({
      id: i, color: c, x: (i % 2 === 0 ? 0.7 : -0.7), z: 2000 + i * 1200,
      speed: 180 + i * 10, maxSpeed: 190 + i * 10,
      health: 100, state: 'racing', stateTimer: 0, attackType: 'normal', attackTime: 0
    }));

    trafficRef.current = Array.from({ length: 100 }).map((_, i) => ({
      id: i, x: (Math.random() - 0.5) * 1.7,
      z: 5000 + Math.random() * (stage.length - 10000),
      speed: 80 + Math.random() * 40,
      type: Math.random() > 0.8 ? 'truck' : 'sedan',
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    }));

    cameraZRef.current = 0;
    particlesRef.current = [];
    setGameState('racing');
  }, [currentStage, upgrades]);

  const update = useCallback((dt: number) => {
    const p = playerRef.current;
    const keys = keysRef.current;
    const stage = STAGES[currentStage];

    // Physics
    if (keys['arrowup'] || keys['w']) p.speed = Math.min(p.maxSpeed, p.speed + p.accel * dt);
    else if (keys['arrowdown'] || keys['s']) p.speed = Math.max(0, p.speed - p.accel * 4 * dt);
    else p.speed = Math.max(0, p.speed - p.accel * 0.5 * dt);

    if (keys['arrowleft'] || keys['a']) {
      p.x -= 2.0 * (p.speed / p.maxSpeed) * dt;
      p.lean = Math.max(-1, p.lean - 6 * dt);
    } else if (keys['arrowright'] || keys['d']) {
      p.x += 2.0 * (p.speed / p.maxSpeed) * dt;
      p.lean = Math.min(1, p.lean + 6 * dt);
    } else {
      p.lean *= 0.85;
    }

    p.x = Math.max(-1.9, Math.min(1.9, p.x));
    const segments = segmentsRef.current;
    const curIdx = wrap(Math.floor(p.z / SEGMENT_LENGTH), segments.length);
    const curSeg = segments[curIdx];
    if (curSeg) p.x -= (p.speed / p.maxSpeed) * curSeg.curve * 0.08;

    p.z += p.speed * dt * 100;
    cameraZRef.current = p.z - 300;

    // Grass effect
    if (Math.abs(p.x) > 1.0) {
      p.speed *= 0.98;
      if (Math.random() > 0.6) createParticle(p.x, p.z, 'dust');
    }

    // Particles
    if (p.speed > 20 && Math.random() > 0.7) createParticle(p.x, p.z, 'smoke');
    particlesRef.current.forEach(pt => {
      pt.z += pt.vz * p.speed * dt * 10;
      pt.x += pt.vx;
      pt.life -= dt;
    });
    particlesRef.current = particlesRef.current.filter(pt => pt.life > 0);

    // Combat
    if (p.attackTime > 0) p.attackTime -= dt;
    else {
      p.attackType = 'normal';
      if (keys['z']) { p.attackType = 'punchLeft'; p.attackTime = 0.4; checkCombat('punchLeft'); }
      if (keys['x']) { p.attackType = 'punchRight'; p.attackTime = 0.4; checkCombat('punchRight'); }
    }

    // AI & Traffic
    opponentsRef.current.forEach(o => {
      if (o.state === 'racing') {
        o.speed = Math.min(o.maxSpeed, o.speed + 10 * dt);
        if (Math.abs(o.z - p.z) < 2000) {
          o.x += (p.x - o.x) * 0.02;
          // Opponent Attack
          if (Math.abs(o.z - p.z) < 200 && Math.abs(o.x - p.x) < 0.5 && Math.random() > 0.98) {
            p.health -= 10;
            for (let i = 0; i < 5; i++) createParticle(p.x, p.z, 'spark');
          }
        }
      } else {
        o.speed *= 0.9;
        o.stateTimer -= dt;
        if (o.stateTimer <= 0) { o.state = 'racing'; o.health = 50; }
      }
      o.z += o.speed * dt * 100;
    });

    trafficRef.current.forEach(t => {
      t.z += t.speed * dt * 100;
      if (Math.abs(p.z - t.z) < 200 && Math.abs(p.x - t.x) < 0.5) {
        p.speed *= 0.3; p.health -= 15;
        for (let i = 0; i < 10; i++) createParticle(p.x, p.z, 'spark');
      }
    });

    if (p.z >= stage.length) {
      p.finishPos = opponentsRef.current.filter(o => o.z > p.z).length + 1;
      setGameState('end');
    }
    if (p.health <= 0) setGameState('gameover');
  }, [currentStage, checkCombat, createParticle]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !canvas.getContext('2d')) return;
    const ctx = canvas.getContext('2d')!;
    const segments = segmentsRef.current; if (segments.length === 0) return;
    const p = playerRef.current;
    const camZ = cameraZRef.current;
    const camD = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
    
    const baseIdx = Math.floor(camZ / SEGMENT_LENGTH);
    const baseSeg = segments[wrap(baseIdx, segments.length)];
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Sky
    const skyG = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT * 0.5);
    skyG.addColorStop(0, '#000033'); skyG.addColorStop(1, '#1a1a4a');
    ctx.fillStyle = skyG; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Mountains
    ctx.fillStyle = '#0a0a20'; ctx.beginPath(); ctx.moveTo(0, CANVAS_HEIGHT * 0.5);
    for (let i = 0; i <= 10; i++) ctx.lineTo((CANVAS_WIDTH / 10) * i, CANVAS_HEIGHT * 0.5 - 40 - Math.sin(i + camZ / 10000) * 100);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT * 0.5); ctx.fill();

    // Road Engine
    let maxY = CANVAS_HEIGHT, curveX = 0, curveDX = -(baseSeg.curve * ((camZ % SEGMENT_LENGTH) / SEGMENT_LENGTH));
    
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const idx = wrap(baseIdx + n, segments.length);
      const seg = segments[idx];
      const project = (pt: Point, offset: number) => {
        const wZ = Math.max(1, pt.world.z - (camZ - offset));
        const sc = camD / wZ;
        pt.screen.x = (CANVAS_WIDTH / 2) + (sc * (pt.world.x - curveX) * CANVAS_WIDTH / 2);
        pt.screen.y = (CANVAS_HEIGHT / 2) - (sc * (pt.world.y - CAMERA_HEIGHT) * CANVAS_HEIGHT / 2);
        pt.screen.w = sc * ROAD_WIDTH * CANVAS_WIDTH / 2;
        pt.screen.scale = sc;
      };

      const offset = (seg.index < baseIdx ? segments.length * SEGMENT_LENGTH : 0);
      project(seg.p1, offset);
      project(seg.p2, offset);
      curveX += curveDX; curveDX += seg.curve;

      if (seg.p1.screen.y <= seg.p2.screen.y || seg.p1.screen.y > maxY) continue;

      const s1 = seg.p1.screen, s2 = seg.p2.screen;
      // Grass
      ctx.fillStyle = seg.color.grass;
      ctx.fillRect(0, s2.y, CANVAS_WIDTH, s1.y - s2.y);
      // Rumble
      const r1 = s1.w * 0.1, r2 = s2.w * 0.1;
      ctx.fillStyle = seg.color.rumble;
      ctx.beginPath(); ctx.moveTo(s1.x - s1.w - r1, s1.y); ctx.lineTo(s2.x - s2.w - r2, s2.y); ctx.lineTo(s2.x - s2.w, s2.y); ctx.lineTo(s1.x - s1.w, s1.y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s1.x + s1.w + r1, s1.y); ctx.lineTo(s2.x + s2.w + r2, s2.y); ctx.lineTo(s2.x + s2.w, s2.y); ctx.lineTo(s1.x + s1.w, s1.y); ctx.fill();
      // Road
      ctx.fillStyle = seg.color.road;
      ctx.beginPath(); ctx.moveTo(s1.x - s1.w, s1.y); ctx.lineTo(s2.x - s2.w, s2.y); ctx.lineTo(s2.x + s2.w, s2.y); ctx.lineTo(s1.x + s1.w, s1.y); ctx.fill();
      // Lanes
      if (seg.index % 6 < 3) {
        ctx.fillStyle = '#eee';
        const lw1 = s1.w * 0.05, lw2 = s2.w * 0.05;
        ctx.beginPath(); ctx.moveTo(s1.x - lw1, s1.y); ctx.lineTo(s2.x - lw2, s2.y); ctx.lineTo(s2.x + lw2, s2.y); ctx.lineTo(s1.x + lw1, s1.y); ctx.fill();
      }
      
      // Scenery
      if (seg.scenery) {
        const sx = s1.x + (seg.scenery.side * seg.scenery.offset * s1.w);
        drawScenery(ctx, sx, s1.y, s1.scale, seg.scenery.type, seg.scenery.side);
      }

      maxY = s1.y;
    }

    // Sprites (Sorting)
    const sprites = [
      ...opponentsRef.current.map(o => ({ ...o, type: 'bike' })),
      ...trafficRef.current.map(t => ({ ...t, type: 'car' }))
    ].filter(s => s.z > camZ && s.z < camZ + DRAW_DISTANCE * SEGMENT_LENGTH).sort((a, b) => b.z - a.z);

    sprites.forEach(s => {
      const sc = camD / (s.z - camZ);
      const sx = (CANVAS_WIDTH / 2) + (sc * (s.x * ROAD_WIDTH - curveX) * CANVAS_WIDTH / 2); // Approximation of curveX for sprites is hard, keeping it simple
      const sy = (CANVAS_HEIGHT / 2) - (sc * (-CAMERA_HEIGHT) * CANVAS_HEIGHT / 2);
      const w = sc * ROAD_WIDTH * 0.15 * (CANVAS_WIDTH / 2);
      if (s.type === 'bike') drawDetailedBike(ctx, sx, sy, w, w * 1.2, s.color, s.attackType, 0);
      else drawDetailedCar(ctx, sx, sy, w * 1.6, w * 0.9, s.color, s.type);
    });

    // Particles
    particlesRef.current.forEach(pt => {
      const sc = camD / Math.max(1, pt.z - camZ);
      if (sc > 0) {
        const px = (CANVAS_WIDTH/2) + (sc * (pt.x * ROAD_WIDTH) * CANVAS_WIDTH/2);
        const py = (CANVAS_HEIGHT/2) - (sc * (-CAMERA_HEIGHT) * CANVAS_HEIGHT/2);
        ctx.fillStyle = pt.color; ctx.globalAlpha = pt.life;
        ctx.beginPath(); ctx.arc(px, py, pt.size * sc, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
      }
    });

    // Player Bike
    drawDetailedBike(ctx, CANVAS_WIDTH/2, CANVAS_HEIGHT - 120, 280, 320, '#00ffff', p.attackType, p.lean);
    
    // UI
    const W = CANVAS_WIDTH;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(20, 20, 250, 140);
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.strokeRect(20, 20, 250, 140);
    ctx.fillStyle = '#fff'; ctx.font = '24px Orbitron'; ctx.fillText(`SPEED: ${Math.floor(p.speed)}`, 40, 60);
    ctx.fillStyle = '#f1c40f'; ctx.fillText(`SCORE: ${score}`, 40, 100);
    ctx.fillStyle = '#e74c3c'; ctx.fillText(`HEALTH:`, 40, 140);
    ctx.fillStyle = '#222'; ctx.fillRect(160, 122, 100, 15);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(162, 124, 96 * (p.health / 100), 11);

    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(W - 270, 20, 250, 60);
    ctx.fillStyle = '#00ff00'; ctx.font = '32px Orbitron'; ctx.textAlign = 'center'; ctx.fillText(`$${money}`, W - 145, 60); ctx.textAlign = 'left';

  }, [currentStage, score, money, drawDetailedBike, drawDetailedCar, drawScenery]);

  useEffect(() => {
    let animId: number;
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - lastTimeRef.current) / 1000);
      lastTimeRef.current = t;
      if (gameState === 'racing') { update(dt); draw(); }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, draw, update]);

  useEffect(() => {
    const onK = (e: KeyboardEvent, d: boolean) => keysRef.current[e.key.toLowerCase()] = d;
    window.addEventListener('keydown', e => onK(e, true));
    window.addEventListener('keyup', e => onK(e, false));
    return () => {
      window.removeEventListener('keydown', e => onK(e, true));
      window.removeEventListener('keyup', e => onK(e, false));
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="bg-black shadow-2xl rounded-sm" />
      
      {gameState === 'title' && (
        <ScreenOverlay>
          <div className="mb-12 space-y-2">
            <h1 className="text-8xl md:text-9xl font-black italic tracking-tighter text-cyan-400 drop-shadow-[0_0_40px_rgba(34,211,238,0.8)] glitch">NEURAL RUSH</h1>
            <p className="text-2xl text-rose-500 font-bold tracking-[0.5em] uppercase">Road Rage Riders</p>
          </div>
          <button onClick={() => initRace()} className="group relative px-20 py-8 border-4 border-cyan-400 text-cyan-400 font-black text-4xl hover:bg-cyan-400 hover:text-black transition-all transform hover:scale-105">
            IGNITION
          </button>
          <div className="mt-20 flex gap-16 text-zinc-500 font-bold text-sm tracking-widest uppercase">
            <p>ARROWS / WASD: DRIVE</p>
            <p>Z / X: PUNCHES</p>
          </div>
        </ScreenOverlay>
      )}

      {gameState === 'end' && (
        <ScreenOverlay>
          <h2 className="text-7xl font-black text-cyan-400 mb-4 italic uppercase">RACE FINISHED</h2>
          <div className="text-4xl mb-12 font-bold space-y-4">
            <p className="text-amber-400">POSITION: {playerRef.current.finishPos} / 6</p>
            <p className="text-green-400">REWARD: +${[1500, 1000, 500, 200, 100, 50][playerRef.current.finishPos - 1]}</p>
          </div>
          <button onClick={() => { 
            const prize = [1500, 1000, 500, 200, 100, 50][playerRef.current.finishPos - 1];
            setMoney(m => m + prize);
            setGameState('shop');
          }} className="px-20 py-8 bg-cyan-500 text-black font-black text-3xl hover:bg-white transition-all shadow-xl">
            GARAGE
          </button>
        </ScreenOverlay>
      )}

      {gameState === 'shop' && (
        <ScreenOverlay>
          <h2 className="text-6xl font-black text-amber-500 mb-2 italic">THE NEURAL GARAGE</h2>
          <div className="text-4xl text-green-400 font-black mb-12 bg-black/60 px-10 py-4 rounded-full border-2 border-green-500/30">CASH: ${money}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl mb-16">
            {[
              { id: 'speed', name: 'TURBOCORE', cost: 500 * upgrades.speed, level: upgrades.speed, icon: <Zap className="w-10 h-10"/> },
              { id: 'acceleration', name: 'SLICK TIRES', cost: 400 * upgrades.acceleration, level: upgrades.acceleration, icon: <Wind className="w-10 h-10" /> },
              { id: 'combat', name: 'SPIKED ARMOR', cost: 300 * upgrades.combat, level: upgrades.combat, icon: <Target className="w-10 h-10" /> }
            ].map(item => (
              <div key={item.id} className="bg-zinc-900/90 p-10 rounded-3xl border-2 border-zinc-800 flex flex-col items-center gap-6 group hover:border-amber-500 transition-all">
                <div className="text-amber-500 p-4 bg-black rounded-full shadow-inner">{item.icon}</div>
                <div className="text-2xl font-black text-white">{item.name}</div>
                <div className="flex gap-2">
                  {[...Array(5)].map((_, i) => <div key={i} className={`h-2 w-6 rounded-full ${i < item.level ? 'bg-amber-500' : 'bg-zinc-800'}`} />)}
                </div>
                <button 
                  disabled={money < item.cost || item.level >= 5}
                  onClick={() => { setMoney(m => m - item.cost); setUpgrades(p => ({ ...p, [item.id]: (p as any)[item.id] + 1 })); }}
                  className={`w-full py-5 rounded-2xl font-black text-xl transition-all ${money >= item.cost && item.level < 5 ? 'bg-amber-500 text-black hover:scale-105' : 'bg-zinc-800 text-zinc-600'}`}
                >
                  {item.level >= 5 ? 'MAXED' : `UPGRADE $${item.cost}`}
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => { if (currentStage < STAGES.length - 1) { setCurrentStage(s => s + 1); initRace(); } else setGameState('victory'); }}
            className="px-32 py-10 bg-cyan-500 text-black font-black text-4xl rounded-full hover:scale-110 transition-all shadow-[0_20px_50px_rgba(6,182,212,0.4)]">
            NEXT STAGE
          </button>
        </ScreenOverlay>
      )}

      {gameState === 'gameover' && (
        <ScreenOverlay>
          <Skull className="w-32 h-32 text-rose-600 mb-8 animate-pulse" />
          <h2 className="text-[10rem] font-black text-rose-600 mb-6 italic leading-none drop-shadow-[0_0_30px_rgba(225,29,72,0.6)]">WASTED</h2>
          <button onClick={() => window.location.reload()} className="px-16 py-8 border-4 border-white text-white font-black text-3xl hover:bg-white hover:text-black transition-all">
            <RotateCcw className="inline mr-4 w-8 h-8" /> REBOOT
          </button>
        </ScreenOverlay>
      )}

      {gameState === 'victory' && (
        <ScreenOverlay>
          <Trophy className="w-40 h-40 text-amber-500 mb-10 animate-bounce" />
          <h1 className="text-8xl font-black text-cyan-400 mb-10 italic">WORLD CHAMPION</h1>
          <button onClick={() => window.location.reload()} className="px-20 py-10 bg-white text-black font-black text-4xl hover:bg-cyan-400 transition-all shadow-2xl">
            NEW CAREER
          </button>
        </ScreenOverlay>
      )}
    </div>
  );
}
