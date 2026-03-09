import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Play, RotateCcw, Trophy, Volume2, VolumeX, Zap, Pause, Home, Gift, Crown } from 'lucide-react';
import { yandexGames } from './lib/yandexGames';

/* =========================
   Types
========================= */
type Phase = 'boot' | 'menu' | 'playing' | 'paused' | 'summary';
type SpecialType = 'none' | 'golden' | 'frozen';
type HazardVariant = 'std' | 'pulse';
type EntityType =
  | 'watermelon'
  | 'orange'
  | 'lemon'
  | 'apple'
  | 'peach'
  | 'dragonfruit'
  | 'pomegranate'
  | 'coconut'
  | 'tomato'
  | 'cucumber'
  | 'carrot'
  | 'pumpkin'
  | 'bomb';

type Vec = { x: number; y: number };
type TrailPoint = Vec & { life: number };

type EntityConfig = {
  c: string;
  ic: string;
  rc: string;
  r: number;
  sc: number;
  w: number;
  n: string;
  elongated?: boolean;
};

type Entity = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rot: number;
  rs: number;
  type: EntityType;
  color: string;
  ic: string;
  rc: string;
  active: boolean;
  sliced: boolean;
  isHalf: boolean;
  scale: number;
  spec: SpecialType;
  hv: HazardVariant;
  pp: number;
  gt: number;
  elongated: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
  gs: number;
  glow: boolean;
  mist?: boolean;
};

type FloatText = {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  vy: number;
  life: number;
  decay: number;
};

type Flash = {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  decay: number;
};

type RunStats = {
  totalSlices: number;
  perfects: number;
  maxCombo: number;
  fruitsSliced: Partial<Record<EntityType, number>>;
  bombHit: boolean;
};

type GameState = {
  score: number;
  strikes: number;
  highScore: number;
  multiplier: number;
};

type SaveData = {
  highScore: number;
  totalXP: number;
  soundOn: boolean;
  bestCombo: number;
  sessions: number;
  revives: number;
};

type Rank = { min: number; name: string; cl: string };

/* =========================
   Audio
========================= */
class AudioEngine {
  private ctx: AudioContext | null = null;
  enabled = true;

  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {}
    }
  }

  play(type: 'slice' | 'combo' | 'bomb' | 'perfect' | 'golden' | 'gameover' | 'start' | 'click' | 'revive') {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    try {
      if (type === 'slice') this.sliceSound(t);
      if (type === 'combo') this.comboSound(t);
      if (type === 'bomb') this.bombSound(t);
      if (type === 'perfect') this.perfectSound(t);
      if (type === 'golden') this.goldenSound(t);
      if (type === 'gameover') this.gameOverSound(t);
      if (type === 'start') this.startSound(t);
      if (type === 'click') this.clickSound(t);
      if (type === 'revive') this.reviveSound(t);
    } catch {}
  }

  private tone(freq: number, start: number, dur: number, vol = 0.15, wave: OscillatorType = 'sine') {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(start);
    o.stop(start + dur);
  }

  private noise(start: number, dur: number, vol = 0.08) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.ctx.destination);
    src.start(start);
    src.stop(start + dur);
  }

  private sliceSound(t: number) {
    this.noise(t, 0.06, 0.12);
    this.tone(920, t, 0.05, 0.08, 'triangle');
  }
  private comboSound(t: number) {
    this.tone(560, t, 0.05, 0.1);
    this.tone(880, t + 0.04, 0.08, 0.09);
  }
  private perfectSound(t: number) {
    this.tone(1200, t, 0.05, 0.09);
    this.tone(1600, t + 0.04, 0.07, 0.09);
    this.tone(2200, t + 0.08, 0.11, 0.07);
  }
  private goldenSound(t: number) {
    [900, 1200, 1450, 1800].forEach((f, i) => this.tone(f, t + i * 0.05, 0.12, 0.08));
  }
  private bombSound(t: number) {
    this.tone(90, t, 0.28, 0.2, 'sawtooth');
    this.noise(t, 0.22, 0.22);
    this.tone(40, t + 0.1, 0.45, 0.12, 'square');
  }
  private gameOverSound(t: number) {
    this.tone(420, t, 0.12, 0.12, 'sawtooth');
    this.tone(210, t + 0.14, 0.24, 0.11, 'sawtooth');
    this.tone(110, t + 0.32, 0.45, 0.1, 'sawtooth');
  }
  private startSound(t: number) {
    this.tone(380, t, 0.08, 0.1);
    this.tone(600, t + 0.06, 0.08, 0.1);
    this.tone(860, t + 0.12, 0.12, 0.1);
  }
  private clickSound(t: number) {
    this.tone(720, t, 0.04, 0.06, 'triangle');
  }
  private reviveSound(t: number) {
    [420, 560, 720, 940].forEach((f, i) => this.tone(f, t + i * 0.05, 0.09, 0.08, 'triangle'));
  }
}

const audio = new AudioEngine();

/* =========================
   Constants
========================= */
const G = 0.105;
const BLADE_CLR = '#00e5ff';
const BLADE_GLOW = '#7c4dff';
const BW = 9;
const TLEN = 20;
const COMBO_MS = 850;
const MAX_STR = 3;
const PERF_R = 15;
const LOCAL_SAVE_KEY = 'nb_yg_save_v1';
const LEADERBOARD_NAME = 'nexus_blade_score';

const CFG: Record<EntityType, EntityConfig> = {
  watermelon: { c: '#1b7a3d', ic: '#ff1744', rc: '#00e676', r: 42, sc: 1, w: 1.15, n: 'Арбуз' },
  orange: { c: '#ef6c00', ic: '#ffa726', rc: '#ffab40', r: 30, sc: 1, w: 0.9, n: 'Апельсин' },
  lemon: { c: '#f9a825', ic: '#fff9c4', rc: '#c0ca33', r: 28, sc: 1, w: 0.82, n: 'Лимон' },
  apple: { c: '#b71c1c', ic: '#ffcdd2', rc: '#ef5350', r: 28, sc: 1, w: 0.88, n: 'Яблоко' },
  peach: { c: '#d84315', ic: '#ffab91', rc: '#ff8a65', r: 30, sc: 1, w: 0.9, n: 'Персик' },
  dragonfruit: { c: '#ad1457', ic: '#fce4ec', rc: '#e040fb', r: 35, sc: 5, w: 0.9, n: 'Драконий фрукт' },
  pomegranate: { c: '#880e4f', ic: '#c62828', rc: '#f50057', r: 32, sc: 3, w: 1, n: 'Гранат' },
  coconut: { c: '#3e2723', ic: '#eceff1', rc: '#8d6e63', r: 38, sc: 2, w: 1.35, n: 'Кокос' },
  tomato: { c: '#c62828', ic: '#ff5252', rc: '#ff8a80', r: 27, sc: 1, w: 0.8, n: 'Помидор' },
  cucumber: { c: '#2e7d32', ic: '#a5d6a7', rc: '#66bb6a', r: 20, sc: 1, w: 0.75, n: 'Огурец', elongated: true },
  carrot: { c: '#e65100', ic: '#ffcc02', rc: '#ff9800', r: 18, sc: 1, w: 0.7, n: 'Морковь', elongated: true },
  pumpkin: { c: '#e65100', ic: '#ffb74d', rc: '#ff9800', r: 44, sc: 2, w: 1.4, n: 'Тыква' },
  bomb: { c: '#1a1a1a', ic: '#ff1744', rc: '#ff0000', r: 40, sc: 0, w: 1, n: 'Аномалия' },
};

const RANKS: Rank[] = [
  { min: 1, name: '', cl: '#00e5ff' },
  { min: 3, name: 'СЕРИЯ', cl: '#00e5ff' },
  { min: 6, name: 'ПОТОК', cl: '#7c4dff' },
  { min: 10, name: 'МОЩЬ', cl: '#e040fb' },
  { min: 15, name: 'ПЕРЕГРУЗКА', cl: '#ff9100' },
  { min: 21, name: 'НЕКСУС', cl: '#ffd740' },
];

const LEVEL_XP = [0, 30, 80, 150, 250, 400, 600, 850, 1200, 1600, 2100, 2700, 3500, 4500, 6000];
const BOOT_MSGS = [
  'Инициализация ядра...',
  'Калибровка кинематики...',
  'Подготовка визуальных модулей...',
  'Подключение платформенных сервисов...',
  'Загрузка боевого профиля...',
  'Активация аудио-контура...',
  'Система готова.',
];

/* =========================
   Utils
========================= */
const rr = (a: number, b: number) => Math.random() * (b - a) + a;
const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const seg = (p1: Vec, p2: Vec, c: { x: number; y: number; radius: number }) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return { hit: false, dist: Number.MAX_SAFE_INTEGER };
  const t = cl(((c.x - p1.x) * dx + (c.y - p1.y) * dy) / l2, 0, 1);
  const d = Math.hypot(p1.x + t * dx - c.x, p1.y + t * dy - c.y);
  return { hit: d <= c.radius, dist: d };
};
const shade = (hex: string, amt: number) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return `rgb(${cl((n >> 16) + amt, 0, 255)},${cl(((n >> 8) & 255) + amt, 0, 255)},${cl((n & 255) + amt, 0, 255)})`;
};
const pickCommon = (): EntityType => {
  const list: EntityType[] = ['watermelon', 'orange', 'lemon', 'apple', 'peach', 'tomato', 'cucumber', 'carrot'];
  return list[Math.floor(Math.random() * list.length)];
};
const pickAdvanced = (): EntityType => {
  const r = Math.random();
  if (r > 0.96) return 'dragonfruit';
  if (r > 0.9) return 'pomegranate';
  if (r > 0.83) return 'coconut';
  if (r > 0.78) return 'pumpkin';
  return pickCommon();
};
const getRank = (comboCount: number) => {
  let out = RANKS[0];
  for (const rank of RANKS) if (comboCount >= rank.min) out = rank;
  return out;
};
const getLevelForXP = (xp: number) => {
  let lv = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) lv = i + 1;
    else break;
  }
  return lv;
};
const getXPProgress = (xp: number) => {
  const lv = getLevelForXP(xp);
  const prev = LEVEL_XP[lv - 1] ?? 0;
  const next = LEVEL_XP[lv] ?? prev + 500;
  return (xp - prev) / (next - prev);
};
const initialStats = (): RunStats => ({ totalSlices: 0, perfects: 0, maxCombo: 0, fruitsSliced: {}, bombHit: false });
const initialSave = (): SaveData => ({ highScore: 0, totalXP: 0, soundOn: true, bestCombo: 0, sessions: 0, revives: 1 });
const safeLocalLoad = (): SaveData => {
  try {
    const raw = localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return initialSave();
    return { ...initialSave(), ...JSON.parse(raw) } as SaveData;
  } catch {
    return initialSave();
  }
};
const safeLocalSave = (data: SaveData) => {
  try {
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(data));
  } catch {}
};

/* =========================
   Yandex-aware save helpers
========================= */
async function loadSave(): Promise<SaveData> {
  const local = safeLocalLoad();
  try {
    const remote = await yandexGames.loadGameData<Partial<SaveData>>(['highScore', 'totalXP', 'soundOn', 'bestCombo', 'sessions', 'revives']);
    if (remote && Object.keys(remote).length > 0) {
      const merged = { ...local, ...remote };
      safeLocalSave(merged);
      return merged;
    }
  } catch {}
  return local;
}

async function persistSave(data: SaveData) {
  safeLocalSave(data);
  try {
    await yandexGames.saveGameData(data);
    await yandexGames.saveStats({ highScore: data.highScore, totalXP: data.totalXP, bestCombo: data.bestCombo });
  } catch {}
}

/* =========================
   Visual background
========================= */
function AnimatedBG() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const req = useRef<number | null>(null);
  const t = useRef(0);
  const dots = useRef(Array.from({ length: 120 }, () => ({
    x: Math.random() * 3000,
    y: Math.random() * 3000,
    sz: rr(0.4, 2.5),
    sp: rr(0.05, 0.35),
    a: rr(0.04, 0.25),
    drift: rr(-0.15, 0.15),
    c: ['#00e5ff', '#e040fb', '#7c4dff', '#00e676', '#ffd740', '#ff1744'][Math.floor(Math.random() * 6)],
  })));

  const loop = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    t.current += 0.01;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04040c');
    bg.addColorStop(0.5, '#080b21');
    bg.addColorStop(1, '#130822');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0,229,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 46) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    dots.current.forEach((d) => {
      d.y -= d.sp;
      d.x += Math.sin(t.current + d.y * 0.01) * d.drift;
      if (d.y < -10) {
        d.y = h + 10;
        d.x = Math.random() * w;
      }
      ctx.globalAlpha = d.a;
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.sz, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    const ringAlpha = 0.02 + Math.sin(t.current) * 0.01;
    ctx.strokeStyle = `rgba(0,229,255,${ringAlpha})`;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.32 + Math.sin(t.current * 0.7) * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(224,64,251,${ringAlpha})`;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.46 + Math.cos(t.current * 0.5) * 12, 0, Math.PI * 2);
    ctx.stroke();

    req.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const resize = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    req.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      if (req.current) cancelAnimationFrame(req.current);
    };
  }, [loop]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />;
}

/* =========================
   HUD and screens
========================= */
function StrikeIndicator({ active }: { active: boolean }) {
  return (
    <div className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all duration-300 ${active ? 'border-red-500 bg-red-500/20 shadow-[0_0_12px_rgba(255,23,68,0.6)]' : 'border-gray-700/40 bg-gray-900/20'}`}>
      {active ? <AlertTriangle size={13} className="text-red-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-gray-700/30" />}
    </div>
  );
}

function TopHUD({ score, strikes, highScore, multiplier, level, xpProg, soundOn, onToggleSound, onPause }: {
  score: number;
  strikes: number;
  highScore: number;
  multiplier: number;
  level: number;
  xpProg: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onPause: () => void;
}) {
  const rank = (() => {
    const c = multiplier > 1 ? (multiplier - 1) * 3 + 1 : 0;
    return getRank(c);
  })();

   return (
    <div className="absolute top-0 left-0 w-full p-3 md:p-4 flex justify-between items-start z-20 select-none pointer-events-none">
      <div className="flex flex-col gap-1">
        {/* Compact level badge */}
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold text-white"
            style={{ fontFamily: "'JetBrains Mono', monospace", background: 'linear-gradient(135deg, #7c4dff, #e040fb)', boxShadow: '0 0 8px rgba(124,77,255,0.3)' }}>
            {level}
          </div>
          <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${cl(xpProg, 0, 1) * 100}%` }} />
          </div>
        </div>
        <div className="text-[8px] tracking-[0.2em] text-cyan-400/35 font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>СЧЁТ</div>
        <div className="text-4xl md:text-5xl font-bold leading-none tracking-wider text-cyan-300" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: '0 0 18px rgba(0,229,255,0.45), 0 3px 6px rgba(0,0,0,0.7)' }}>{score}</div>
        <div className="flex items-center gap-2 text-[10px] text-yellow-200/55" style={{ fontFamily: "'JetBrains Mono', monospace" }}><Trophy size={11} className="text-yellow-400/60" /> ЛУЧШИЙ: {highScore}</div>
      </div>

      <div className="flex flex-col items-center gap-3">
        {multiplier > 1 && (
          <div className="text-center animate-pulse" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <div className="flex items-center justify-center gap-1" style={{ color: rank.cl, textShadow: `0 0 14px ${rank.cl}` }}>
              <Zap size={16} fill="currentColor" />
              <span className="text-2xl font-bold italic">{multiplier}x</span>
            </div>
            {rank.name && <div className="text-[8px] tracking-[0.25em] opacity-75">{rank.name}</div>}
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <button onClick={onToggleSound} className="w-9 h-9 rounded-lg border border-white/8 bg-black/20 flex items-center justify-center text-cyan-200/70 hover:bg-white/10 transition-colors active:scale-90">
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={onPause} className="w-9 h-9 rounded-lg border border-white/8 bg-black/20 flex items-center justify-center text-cyan-200/70 hover:bg-white/10 transition-colors active:scale-90">
            <Pause size={14} />
          </button>
        </div>
        <div className="text-[7px] tracking-[0.15em] text-red-400/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>ЦЕЛОСТНОСТЬ</div>
        <div className="flex gap-1.5">{[1, 2, 3].map((i) => <StrikeIndicator key={i} active={strikes >= i} />)}</div>
      </div>
    </div>
  );
}

function LoadingScreen({ onDone, sdkReady }: { onDone: () => void; sdkReady: boolean }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    let p = 0;
    const iv = window.setInterval(() => {
      p += rr(5, 11);
      if (sdkReady) p += 3;
      if (p > 100) p = 100;
      setProgress(p);
      setMsgIdx(Math.min(BOOT_MSGS.length - 1, Math.floor((p / 100) * BOOT_MSGS.length)));
      if (p >= 100) {
        window.clearInterval(iv);
        window.setTimeout(() => {
          setDone(true);
          window.setTimeout(onDone, 350);
        }, 300);
      }
    }, 160);
    return () => window.clearInterval(iv);
  }, [onDone, sdkReady]);

  return (
    <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center transition-opacity duration-500 ${done ? 'opacity-0' : 'opacity-100'}`} style={{ background: 'radial-gradient(ellipse at center, rgba(8,12,34,0.92) 0%, rgba(4,4,12,0.96) 100%)' }}>
      <h1 className="text-4xl md:text-5xl font-bold tracking-[0.15em] text-cyan-300" style={{ fontFamily: 'JetBrains Mono, monospace', textShadow: '0 0 30px rgba(0,229,255,0.4)' }}>NEXUS BLADE</h1>
      <p className="text-[10px] tracking-[0.4em] text-cyan-300/25 mb-8" style={{ fontFamily: 'JetBrains Mono, monospace' }}>ЗАГРУЗКА СИСТЕМЫ</p>
      <div className="w-72 md:w-96">
        <div className="h-2 bg-slate-800/70 rounded-full overflow-hidden border border-cyan-500/10">
          <div className="h-full rounded-full transition-all duration-200 bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" style={{ width: `${progress}%`, boxShadow: '0 0 16px rgba(0,229,255,0.5)' }} />
        </div>
        <div className="flex justify-between mt-2.5 text-[9px] text-cyan-300/45" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          <span>{BOOT_MSGS[msgIdx]}</span>
          <span>{Math.floor(progress)}%</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// ЗАМЕНИ функцию MenuScreen (строки 590-658) в App.tsx на эту:
// ═══════════════════════════════════════════════

function MenuScreen({ highScore, level, xpProg, soundOn, onToggleSound, onStart, topEntries, onOpenAuth }: {
  highScore: number;
  level: number;
  xpProg: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onStart: () => void;
  topEntries: Array<{ rank: number; name: string; score: number }>;
  onOpenAuth: () => void;
}) {
  const F = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-start px-4 pt-16 pb-6 overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(15,20,60,0.75) 0%, rgba(4,4,12,0.88) 60%)' }}>

      {/* Top bar: level + sound — compact, не перекрывает */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2.5"
        style={{ background: 'linear-gradient(180deg, rgba(4,4,12,0.95) 0%, rgba(4,4,12,0) 100%)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-lg"
          style={{ ...F, background: 'linear-gradient(135deg, #7c4dff, #e040fb)', boxShadow: '0 0 12px rgba(124,77,255,0.4)' }}>
          {level}
        </div>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700 menu-xp-shimmer"
            style={{ width: `${cl(xpProg, 0, 1) * 100}%`, background: 'linear-gradient(90deg, #7c4dff, #e040fb, #7c4dff)', backgroundSize: '200% 100%' }} />
        </div>
        <button onClick={onToggleSound}
          className="w-8 h-8 rounded-lg border border-white/8 bg-white/5 flex items-center justify-center text-cyan-200/70 hover:bg-white/10 transition-all duration-200 active:scale-90">
          {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      </div>

      {/* Title — с анимированным переливом */}
      <div className="text-center mt-4 mb-6">
        <h1 className="text-5xl md:text-7xl font-bold tracking-[0.1em] leading-none menu-title-glow"
          style={{ ...F, background: 'linear-gradient(135deg, #00e5ff 0%, #7c4dff 35%, #e040fb 65%, #ff1744 100%)',
            backgroundSize: '300% 300%',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'gradientShift 4s ease infinite' }}>
          NEXUS
        </h1>
        <h2 className="text-3xl md:text-5xl font-bold tracking-[0.3em] leading-none mt-1"
          style={{ ...F, background: 'linear-gradient(135deg, #e040fb 0%, #ff1744 50%, #ffd740 100%)',
            backgroundSize: '300% 300%',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'gradientShift 4s ease infinite reverse' }}>
          BLADE
        </h2>
        <p className="text-white/15 text-[9px] tracking-[0.35em] uppercase mt-3" style={F}>
          Симуляция разреза
        </p>
      </div>

      {/* Основная панель */}
      <div className="w-full max-w-md rounded-2xl p-5 md:p-6 menu-panel"
        style={{
          background: 'linear-gradient(160deg, rgba(12,8,25,0.85) 0%, rgba(6,4,14,0.9) 100%)',
          border: '1px solid rgba(0,229,255,0.1)',
          boxShadow: '0 0 50px rgba(0,229,255,0.04), 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}>

        {/* Лучший счёт — крупно */}
        {highScore > 0 && (
          <div className="flex items-center justify-center gap-2.5 mb-4 py-2.5 rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(255,215,64,0.06), rgba(255,215,64,0.02))' }}>
            <Trophy size={18} className="text-yellow-400/70" />
            <span className="text-sm text-yellow-200/60" style={F}>Лучший счёт:</span>
            <span className="text-xl font-bold text-yellow-100/90" style={{ ...F, textShadow: '0 0 12px rgba(255,215,64,0.3)' }}>{highScore}</span>
          </div>
        )}

        {/* Кнопка СТАРТ — главный акцент */}
        <button onClick={onStart}
          className="group relative w-full py-4 rounded-xl font-bold text-base tracking-[0.12em] transition-all duration-300 hover:scale-[1.02] active:scale-95 overflow-hidden mb-3 menu-start-btn"
          style={{ ...F, background: 'linear-gradient(135deg, #00e5ff 0%, #7c4dff 50%, #e040fb 100%)',
            backgroundSize: '200% 200%', animation: 'gradientShift 3s ease infinite',
            color: '#06060f', boxShadow: '0 0 30px rgba(0,229,255,0.2), 0 4px 15px rgba(0,0,0,0.3)' }}>
          <span className="absolute inset-0 bg-white/20 translate-x-[-110%] group-hover:translate-x-[110%] transition-transform duration-700 skew-x-12" />
          <div className="relative flex items-center justify-center gap-2.5">
            <Play fill="currentColor" size={18} /> НАЧАТЬ ЗАБЕГ
          </div>
        </button>

        {/* Авторизация */}
        <button onClick={onOpenAuth}
          className="w-full py-3 rounded-xl text-sm tracking-[0.08em] transition-all duration-200 hover:bg-white/8 active:scale-95 mb-4"
          style={{ ...F, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(200,180,255,0.7)' }}>
          Войти и сохранять прогресс
        </button>

        {/* Разделитель */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/12 to-transparent mb-4" />

        {/* Лидерборд — компактный */}
        {topEntries.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Crown size={13} className="text-yellow-400/60" />
              <span className="text-[10px] tracking-[0.2em] text-yellow-200/45 uppercase" style={F}>Топ игроков</span>
            </div>
            <div className="space-y-1.5">
              {topEntries.map((entry) => (
                <div key={`${entry.rank}-${entry.name}`}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg transition-colors hover:bg-white/3"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <span className="w-5 text-cyan-300/50 text-xs" style={F}>#{entry.rank}</span>
                    <span className="truncate max-w-[140px]">{entry.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-yellow-200/65" style={F}>{entry.score}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center text-[10px] text-white/20 py-2" style={F}>
            Лидерборд загрузится при подключении к платформе
          </div>
        )}
      </div>

      {/* Подсказка */}
      <p className="mt-5 text-white/10 text-[9px] tracking-[0.3em] animate-pulse" style={F}>
        ПРОВЕДИ ПАЛЬЦЕМ ДЛЯ РАЗРЕЗА
      </p>
    </div>
  );
}

function PauseScreen({ onResume, onMenu }: { onResume: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-cyan-400/10 bg-slate-950/80 p-6 text-center">
        <div className="text-2xl font-bold text-cyan-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>ПАУЗА</div>
        <div className="mt-2 text-sm text-slate-300/70">Клинок замер. Даже кибер-ниндзя иногда дышат.</div>
        <div className="mt-5 flex flex-col gap-3">
          <button onClick={onResume} className="w-full py-3 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-slate-950 font-bold">ПРОДОЛЖИТЬ</button>
          <button onClick={onMenu} className="w-full py-3 rounded-xl bg-slate-900/70 border border-white/5 text-slate-100 font-semibold">В МЕНЮ</button>
        </div>
      </div>
    </div>
  );
}

function SummaryScreen({
  score,
  highScore,
  stats,
  totalXP,
  canRevive,
  onContinue,
  onMenu,
  onRevive,
}: {
  score: number;
  highScore: number;
  stats: RunStats;
  totalXP: number;
  canRevive: boolean;
  onContinue: () => void;
  onMenu: () => void;
  onRevive: () => void;
}) {
  const level = getLevelForXP(totalXP);
  const xpProg = getXPProgress(totalXP);
  const comboBonus = Math.floor(stats.maxCombo * 1.5);
  const perfectBonus = stats.perfects * 3;
  const total = score + comboBonus + perfectBonus;
  const isNew = score >= highScore && score > 0;
  const F = { fontFamily: "'JetBrains Mono', monospace" } as const;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-start pt-6 pb-6 px-4 overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at center, rgba(8,12,34,0.9) 0%, rgba(3,3,8,0.96) 100%)', backdropFilter: 'blur(8px)' }}>

      {/* Compact level + xp in one line */}
      <div className="flex items-center gap-2 mb-4 w-full max-w-md">
        <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ ...F, background: 'linear-gradient(135deg, #7c4dff, #e040fb)', boxShadow: '0 0 10px rgba(124,77,255,0.3)' }}>
          {level}
        </div>
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full rounded-full menu-xp-shimmer"
            style={{ width: `${xpProg * 100}%`, background: 'linear-gradient(90deg, #7c4dff, #e040fb, #7c4dff)', backgroundSize: '200% 100%' }} />
        </div>
        <span className="text-[8px] text-purple-300/40 shrink-0" style={F}>УР. {level}</span>
      </div>

      {/* Title */}
      <div className="text-2xl md:text-3xl font-bold tracking-[0.08em] mb-4"
        style={{ ...F, color: '#ffd740', textShadow: '0 0 25px rgba(255,215,64,0.3), 0 2px 6px rgba(0,0,0,0.7)' }}>
        ★ РЕЗУЛЬТАТЫ ★
      </div>

      {/* Main panel */}
      <div className="w-full max-w-md rounded-2xl p-5 md:p-6 menu-panel"
        style={{
          background: 'linear-gradient(160deg, rgba(12,8,25,0.92) 0%, rgba(6,4,14,0.94) 100%)',
          border: '1px solid rgba(0,229,255,0.12)',
          boxShadow: '0 0 50px rgba(0,229,255,0.04), 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}>
        {/* Top accent */}
        <div className="absolute top-0 left-3 right-3 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent rounded-full" />

        {/* Score */}
        <div className="text-center mb-3">
          <div className="text-[9px] tracking-[0.25em] text-white/30 mb-1" style={F}>ИТОГОВЫЙ СЧЁТ</div>
          <div className="text-5xl md:text-6xl font-bold text-cyan-300"
            style={{ ...F, textShadow: '0 0 25px rgba(0,229,255,0.5)' }}>{score}</div>
          {isNew && (
            <div className="mt-2 text-yellow-300/80 text-xs tracking-[0.15em] font-bold" style={F}>
              ★ НОВЫЙ РЕКОРД ★
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatCard label="Разрезов" value={stats.totalSlices} />
          <StatCard label="Идеальных" value={stats.perfects} />
          <StatCard label="Макс. комбо" value={stats.maxCombo} />
          <StatCard label="Лучший счёт" value={highScore} />
        </div>

        {/* Bonus breakdown */}
        <div className="space-y-1.5 mb-3">
          <BonusRow label="Очки забега" value={score} />
          <BonusRow label="Бонус за комбо" value={comboBonus} />
          <BonusRow label="Бонус за идеальность" value={perfectBonus} />
          <div className="flex items-center justify-between w-full px-3 py-2 rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.06), rgba(124,77,255,0.06))', border: '1px solid rgba(0,229,255,0.1)' }}>
            <span className="text-xs text-cyan-200/60 font-bold" style={F}>ВСЕГО XP</span>
            <span className="text-lg font-bold text-cyan-300" style={{ ...F, textShadow: '0 0 10px rgba(0,229,255,0.4)' }}>+{total}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2.5">
          {canRevive && (
            <button onClick={onRevive}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-[0.12em] transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
              style={{ ...F, background: 'linear-gradient(135deg, #ffd740, #ff9100)', color: '#1a0a00', boxShadow: '0 0 20px rgba(255,215,64,0.2)' }}>
              <Gift size={15} /> ВОСКРЕСНУТЬ ЗА РЕКЛАМУ
            </button>
          )}
          <button onClick={onContinue}
            className="w-full py-3 rounded-xl font-bold text-sm tracking-[0.12em] transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 menu-start-btn"
            style={{ ...F, background: 'linear-gradient(135deg, #00e5ff, #7c4dff, #e040fb)', backgroundSize: '200% 200%',
              color: '#06060f', boxShadow: '0 0 25px rgba(0,229,255,0.2)' }}>
            <RotateCcw size={14} /> ЕЩЁ ОДИН ЗАБЕГ
          </button>
          <button onClick={onMenu}
            className="text-[10px] text-white/25 hover:text-white/50 transition-colors tracking-widest py-1 flex items-center justify-center gap-1.5"
            style={F}>
            <Home size={12} /> В МЕНЮ
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-3">
      <div className="text-[10px] tracking-[0.16em] text-cyan-400/30" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-100" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}

function BonusRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-sm">
      <span className="text-slate-300/70">{label}</span>
      <span className="font-bold text-yellow-200/80">+{value}</span>
    </div>
  );
}

/* =========================
   Game canvas
========================= */
function GameCanvas({
  isRunning,
  soundOn,
  onScoreChange,
  onGameOver,
  reviveSignal,
}: {
  isRunning: boolean;
  soundOn: boolean;
  onScoreChange: (score: number, strikes: number, multiplier: number) => void;
  onGameOver: (stats: RunStats) => void;
  reviveSignal: number;
}) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const reqRef = useRef<number | null>(null);
  const entities = useRef<Entity[]>([]);
  const parts = useRef<Particle[]>([]);
  const trail = useRef<TrailPoint[]>([]);
  const floats = useRef<FloatText[]>([]);
  const flashes = useRef<Flash[]>([]);
  const bgP = useRef(Array.from({ length: 90 }, () => ({
    x: Math.random() * 3000,
    y: Math.random() * 3000,
    sz: rr(0.3, 2),
    sp: rr(0.06, 0.35),
    a: rr(0.06, 0.3),
    c: ['#00e5ff', '#e040fb', '#7c4dff', '#00e676', '#ffd740'][Math.floor(Math.random() * 5)],
  })));
  const scoreRef = useRef(0);
  const strikesRef = useRef(0);
  const comboRef = useRef(0);
  const frameRef = useRef(0);
  const overRef = useRef(false);
  const mdRef = useRef(false);
  const lastSliceRef = useRef(0);
  const shake = useRef({ x: 0, y: 0, i: 0 });
  const pauseFrames = useRef(0);
  const overdrive = useRef(0);
  const spawnTimer = useRef(0);
  const frozen = useRef(0);
  const maxCombo = useRef(0);
  const runStats = useRef<RunStats>(initialStats());

  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  const addFloat = (x: number, y: number, text: string, color = '#00e5ff', size = 20) => {
    floats.current.push({ x, y, text, color, size, vy: -2, life: 1, decay: 0.016 });
  };

  const addFlash = (x: number, y: number, radius = 30, color = '#fff') => {
    flashes.current.push({ x, y, radius, color, life: 1, decay: 0.065 });
  };

  const triggerShake = (i = 4) => {
    shake.current.i = i;
  };

  const onScoreRef = useRef(onScoreChange);
  useEffect(() => { onScoreRef.current = onScoreChange; }, [onScoreChange]);
  const onOverRef = useRef(onGameOver);
  useEffect(() => { onOverRef.current = onGameOver; }, [onGameOver]);

  const notify = () => onScoreRef.current(scoreRef.current, strikesRef.current, Math.max(1, Math.floor(comboRef.current / 3) + 1));

  const reset = useCallback(() => {
    entities.current = [];
    parts.current = [];
    trail.current = [];
    floats.current = [];
    flashes.current = [];
    scoreRef.current = 0;
    strikesRef.current = 0;
    comboRef.current = 0;
    frameRef.current = 0;
    overRef.current = false;
    lastSliceRef.current = 0;
    shake.current = { x: 0, y: 0, i: 0 };
    pauseFrames.current = 0;
    overdrive.current = 0;
    spawnTimer.current = 0;
    frozen.current = 0;
    maxCombo.current = 0;
    runStats.current = initialStats();
    notify();
  }, []);

  useEffect(() => {
    audio.setEnabled(soundOn);
  }, [soundOn]);

  // Reset game when isRunning becomes true (new game starts)
  const prevRunning = useRef(false);
  useEffect(() => {
    if (isRunning && !prevRunning.current) {
      reset();
    }
    prevRunning.current = isRunning;
  }, [isRunning, reset]);

  useEffect(() => {
    if (!reviveSignal || !overRef.current) return;
    overRef.current = false;
    strikesRef.current = Math.max(0, MAX_STR - 2);
    comboRef.current = 0;
    frozen.current = 60;
    addFloat(window.innerWidth / 2, window.innerHeight / 2, 'ВОЗВРАЩЕНИЕ', '#ffd740', 30);
    addFlash(window.innerWidth / 2, window.innerHeight / 2, 90, '#ffd740');
    audio.play('revive');
    notify();
  }, [reviveSignal]);

  const burst = (x: number, y: number, col: string, type: 'juice' | 'bomb' | 'golden' = 'juice', fruitType?: EntityType, n?: number) => {
    const cnt = n ?? (type === 'bomb' ? 55 : type === 'golden' ? 40 : 28);
    for (let i = 0; i < cnt; i++) {
      const a = rr(0, Math.PI * 2);
      const sp = type === 'bomb' ? rr(4, 18) : type === 'golden' ? rr(3, 14) : rr(1.5, 9);
      let pc = col;
      let ps = type === 'bomb' ? rr(1.5, 3.5) : rr(1.5, 5.5);
      if (fruitType === 'dragonfruit' && type === 'juice') {
        if (Math.random() < 0.3) {
          pc = '#1a1a1a';
          ps = rr(1, 2.5);
        } else if (Math.random() < 0.25) pc = '#e040fb';
      }
      if (fruitType === 'tomato' && type === 'juice' && Math.random() < 0.25) {
        pc = '#ffcdd2';
        ps = rr(1, 2);
      }
      parts.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rr(0.01, 0.032), color: pc, size: ps, gs: type === 'bomb' ? 0.1 : 0.45, glow: type !== 'juice' || fruitType === 'dragonfruit' });
    }
    if (type === 'juice') {
      for (let i = 0; i < 6; i++) {
        const a = rr(0, Math.PI * 2);
        const sp = rr(0.8, 3.5);
        parts.current.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: rr(0.007, 0.015), color: col, size: rr(5, 10), gs: 0.65, glow: false });
      }
    }
  };

  const spawn = (w: number, h: number, type: EntityType, spec: SpecialType = 'none', hv: HazardVariant = 'std', xo: number | null = null) => {
    const cfg = CFG[type];
    const x = xo ?? rr(80, w - 80);
    const y = h + 60;
    const diff = cl(scoreRef.current / 220, 0, 1);
    const sm = 1 + diff * 0.15;
    const wt = cfg.w;
    const vx = (w / 2 - x) * rr(0.004, 0.009) + rr(-1, 1);
    const vy = rr(-8.5 * sm, -11.5 * sm) / Math.sqrt(wt);
    entities.current.push({
      id: Math.random(),
      x,
      y,
      vx,
      vy,
      radius: cfg.r * (spec === 'golden' ? 1.12 : 1),
      rot: 0,
      rs: rr(-0.06, 0.06) * sm,
      type,
      color: cfg.c,
      ic: cfg.ic,
      rc: cfg.rc,
      active: true,
      sliced: false,
      isHalf: false,
      scale: 1,
      spec,
      hv,
      pp: Math.random() * Math.PI * 2,
      gt: 0,
      elongated: Boolean(cfg.elongated),
    });
  };

  const buildWave = (w: number, h: number, diff: number) => {
    const safe = scoreRef.current < 5;
    const score = scoreRef.current;
    const bombOk = !safe;
    const pick = () => (bombOk && Math.random() < 0.04 + diff * 0.18 ? 'bomb' : pickAdvanced());
    const specialRoll = (): SpecialType => {
      if (Math.random() < 0.025) return 'golden';
      if (Math.random() < 0.035) return 'frozen';
      return 'none';
    };

    let waveType: 'single' | 'twin' | 'trio' | 'burst' | 'hazard' | 'rare' | 'trap';
    const r = Math.random();
    if (score < 12) waveType = 'single';
    else if (score < 25) waveType = r < 0.6 ? 'single' : 'twin';
    else if (score < 45) waveType = r < 0.3 ? 'single' : r < 0.7 ? 'twin' : 'trio';
    else if (score < 70) waveType = r < 0.1 ? 'single' : r < 0.35 ? 'twin' : r < 0.6 ? 'trio' : r < 0.82 ? 'burst' : 'hazard';
    else if (score < 110) waveType = r < 0.05 ? 'single' : r < 0.2 ? 'twin' : r < 0.4 ? 'trio' : r < 0.6 ? 'burst' : r < 0.75 ? 'hazard' : r < 0.88 ? 'rare' : 'trap';
    else {
      const waves = ['single', 'twin', 'trio', 'burst', 'hazard', 'rare', 'trap'] as const;
      waveType = waves[Math.floor(r * waves.length)];
    }

    const cx = w / 2;
    switch (waveType) {
      case 'single':
        spawn(w, h, pick(), specialRoll());
        break;
      case 'twin':
        spawn(w, h, pick(), specialRoll(), 'std', cx - rr(60, 130));
        spawn(w, h, pick(), specialRoll(), 'std', cx + rr(60, 130));
        break;
      case 'trio':
        for (let i = -1; i <= 1; i++) spawn(w, h, pick(), specialRoll(), 'std', cx + i * rr(80, 130));
        break;
      case 'burst':
        for (let i = 0; i < 2 + Math.floor(diff * 2); i++) spawn(w, h, pick(), specialRoll(), 'std', cx + rr(-110, 110));
        break;
      case 'hazard':
        spawn(w, h, pickAdvanced(), specialRoll());
        if (bombOk) spawn(w, h, 'bomb', 'none', Math.random() < 0.3 ? 'pulse' : 'std');
        spawn(w, h, pickAdvanced(), specialRoll());
        break;
      case 'rare':
        spawn(w, h, 'dragonfruit');
        spawn(w, h, pickCommon());
        spawn(w, h, pickCommon());
        break;
      case 'trap':
        if (bombOk) {
          spawn(w, h, 'bomb', 'none', 'pulse', cx - rr(30, 80));
          spawn(w, h, 'bomb', 'none', 'std', cx + rr(30, 80));
        }
        spawn(w, h, pickAdvanced(), 'golden', 'std', cx);
        break;
    }
  };

  const triggerOver = () => {
    if (overRef.current) return;
    overRef.current = true;
    audio.play('gameover');
    onOverRef.current({ ...runStats.current, maxCombo: maxCombo.current });
  };

  const sliceEntity = (entity: Entity, dist: number) => {
    entity.sliced = true;
    const now = Date.now();

    if (entity.type === 'bomb') {
      runStats.current.bombHit = true;
      burst(entity.x, entity.y, '#fff', 'bomb');
      burst(entity.x, entity.y, '#ff1744', 'bomb');
      addFlash(entity.x, entity.y, 140, '#ff1744');
      triggerShake(15);
      pauseFrames.current = 10;
      addFloat(entity.x, entity.y - 30, 'СИСТЕМА НАРУШЕНА', '#ff1744', 26);
      entity.active = false;
      audio.play('bomb');
      triggerOver();
      return;
    }

    audio.play('slice');
    runStats.current.totalSlices += 1;
    runStats.current.fruitsSliced[entity.type] = (runStats.current.fruitsSliced[entity.type] ?? 0) + 1;

    if (now - lastSliceRef.current < COMBO_MS) comboRef.current += 1;
    else comboRef.current = 1;
    lastSliceRef.current = now;
    maxCombo.current = Math.max(maxCombo.current, comboRef.current);

    const mult = Math.max(1, Math.floor(comboRef.current / 3) + 1);
    const base = CFG[entity.type].sc;
    let bonus = 0;
    const perfect = dist < PERF_R;

    if (perfect) {
      bonus += base;
      runStats.current.perfects += 1;
      addFloat(entity.x, entity.y - 35, 'ИДЕАЛЬНЫЙ РАЗРЕЗ', '#e040fb', 18);
      overdrive.current = cl(overdrive.current + 0.06, 0, 1);
      audio.play('perfect');
    }

    if (entity.spec === 'golden') {
      bonus += 8;
      addFloat(entity.x, entity.y - 55, 'ЗОЛОТОЕ ЯДРО +8', '#ffd740', 24);
      burst(entity.x, entity.y, '#ffd740', 'golden');
      audio.play('golden');
    }
    if (entity.spec === 'frozen') {
      frozen.current = 200;
      addFloat(entity.x, entity.y - 55, 'ЗАМОРОЗКА', '#80deea', 22);
      burst(entity.x, entity.y, '#80deea', 'juice', entity.type, 35);
    }

    if (mult > 1) audio.play('combo');
    const odMult = overdrive.current > 0.8 ? 1.5 : 1;
    const total = Math.ceil((base + bonus) * mult * odMult);
    scoreRef.current += total;
    overdrive.current = cl(overdrive.current + 0.02 + (mult > 1 ? 0.012 * mult : 0), 0, 1);

    if (mult > 1) {
      const rank = getRank(comboRef.current);
      if (rank.name) addFloat(entity.x, entity.y - 50, `${rank.name} x${comboRef.current}`, rank.cl, 15 + mult * 2);
    }
    if (total >= 3) addFloat(entity.x + 22, entity.y - 12, `+${total}`, '#ffd740', 19);

    burst(entity.x, entity.y, entity.color, 'juice', entity.type);
    burst(entity.x, entity.y, entity.ic, 'juice', entity.type);
    addFlash(entity.x, entity.y, entity.radius + 14, entity.rc);
    triggerShake(mult > 2 ? 8 : perfect ? 5 : 3);
    pauseFrames.current = mult > 2 ? 4 : 2;

    const splitSpeed = 2.8;
    entities.current.push({ ...entity, id: Math.random(), vx: entity.vx - splitSpeed, vy: entity.vy - 2, isHalf: true, active: true, sliced: true });
    entities.current.push({ ...entity, id: Math.random(), vx: entity.vx + splitSpeed, vy: entity.vy - 2, isHalf: true, active: true, sliced: true, rot: entity.rot + Math.PI });
    entity.active = false;
    notify();
  };

  const update = (w: number, h: number) => {
    if (overRef.current || !isRunningRef.current) return;
    if (pauseFrames.current > 0) {
      pauseFrames.current -= 1;
      return;
    }
    frameRef.current += 1;
    const diff = cl(scoreRef.current / 200, 0, 1);
    const frozenFactor = frozen.current > 0 ? 0.35 : 1;
    if (frozen.current > 0) frozen.current -= 1;

    if (comboRef.current > 0 && Date.now() - lastSliceRef.current > COMBO_MS) {
      comboRef.current = 0;
      notify();
    }
    overdrive.current = Math.max(0, overdrive.current - 0.0007);

    spawnTimer.current += 1;
    const interval = Math.max(24, 100 - diff * 68) * (frozen.current > 0 ? 1.5 : 1);
    if (spawnTimer.current >= interval) {
      spawnTimer.current = 0;
      buildWave(w, h, diff);
    }

    entities.current.forEach((e) => {
      const wt = CFG[e.type].w;
      if (e.type === 'bomb' && e.hv === 'pulse' && !e.sliced) {
        e.gt += 1;
        if (e.gt % 20 < 3) e.x += rr(-5, 5);
      }
      const fm = frozen.current > 0 && e.type !== 'bomb' ? 0.35 : 1;
      e.x += e.vx * fm;
      e.y += e.vy * fm;
      e.vy += G * wt * frozenFactor;
      e.rot += e.rs * (frozen.current > 0 ? 0.35 : 1);
      e.pp += 0.15;
    });

    if (trail.current.length >= 2) {
      entities.current.forEach((e) => {
        if (e.active && !e.sliced && !e.isHalf) {
          for (let i = 0; i < trail.current.length - 1; i++) {
            const res = seg(trail.current[i], trail.current[i + 1], e);
            if (res.hit) {
              sliceEntity(e, res.dist);
              break;
            }
          }
        }
      });
    }

    entities.current.forEach((e) => {
      if (e.active && e.y > h + 110) {
        e.active = false;
        if (e.type !== 'bomb' && !e.isHalf && !e.sliced) {
          strikesRef.current += 1;
          notify();
          if (strikesRef.current >= MAX_STR) triggerOver();
        }
      }
    });
    entities.current = entities.current.filter((e) => e.active);

    parts.current.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += G * p.gs * frozenFactor;
      p.vx *= 0.965;
      p.vy *= 0.965;
      p.life -= p.decay;
    });
    parts.current = parts.current.filter((p) => p.life > 0);

    trail.current.forEach((p) => { p.life -= 0.075; });
    trail.current = trail.current.filter((p) => p.life > 0);

    floats.current.forEach((f) => { f.y += f.vy; f.life -= f.decay; });
    floats.current = floats.current.filter((f) => f.life > 0);

    flashes.current.forEach((f) => { f.life -= f.decay; });
    flashes.current = flashes.current.filter((f) => f.life > 0);

    if (shake.current.i > 0) {
      shake.current.x = (Math.random() - 0.5) * shake.current.i * 2;
      shake.current.y = (Math.random() - 0.5) * shake.current.i * 2;
      shake.current.i *= 0.83;
      if (shake.current.i < 0.3) shake.current.i = 0;
    }

    bgP.current.forEach((p) => {
      p.y -= p.sp;
      if (p.y < -10) {
        p.y = h + 10;
        p.x = Math.random() * w;
      }
    });
  };

  const drawEntity = (ctx: CanvasRenderingContext2D, e: Entity) => {
    const r = e.radius;
    const cfg = CFG[e.type];
    const isOD = overdrive.current > 0.8;

    if (e.type === 'bomb') {
      const p = Math.sin(e.pp) * 0.5 + 0.5;
      ctx.shadowBlur = 25 + p * 30 + (e.hv === 'pulse' ? 15 : 0);
      ctx.shadowColor = `rgba(255,23,68,${0.5 + p * 0.5})`;
      const bg2 = ctx.createRadialGradient(-r * 0.15, -r * 0.15, r * 0.05, 0, 0, r);
      bg2.addColorStop(0, '#424242');
      bg2.addColorStop(0.6, '#1a1a1a');
      bg2.addColorStop(1, '#000');
      ctx.fillStyle = bg2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (e.hv === 'pulse') {
        ctx.strokeStyle = `rgba(255,23,68,${0.12 + p * 0.18})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 10 + p * 15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(10, -r - 14, 20, -r - 9);
      ctx.stroke();
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffff00';
      ctx.fillStyle = Math.random() > 0.3 ? '#fff' : '#ffeb3b';
      ctx.beginPath();
      ctx.arc(20, -r - 9, 3 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,23,68,${0.24 + p * 0.18})`;
      ctx.font = "bold 14px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('⚠', 0, -2);
      return;
    }

    if (e.spec === 'golden') {
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffd740';
      ctx.strokeStyle = 'rgba(255,215,64,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 7 + Math.sin(e.pp) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (e.spec === 'frozen') {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#80deea';
      ctx.strokeStyle = 'rgba(128,222,234,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.shadowBlur = isOD ? 22 : 14;
    ctx.shadowColor = cfg.rc;

    if (e.elongated) {
      const rw = r;
      const rh = r * 2;
      const g = ctx.createRadialGradient(0, 0, rw * 0.1, 0, 0, rw);
      g.addColorStop(0, cfg.ic);
      g.addColorStop(0.5, cfg.c);
      g.addColorStop(1, shade(cfg.c, -30));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rw * 0.7, rh * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (e.type === 'carrot') {
        ctx.fillStyle = 'rgba(76,175,80,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, -rh * 0.45, 4, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.08, 0, 0, r);
    g.addColorStop(0, cfg.ic);
    g.addColorStop(0.4, cfg.c);
    g.addColorStop(1, shade(cfg.c, -35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (e.type === 'watermelon') {
      ctx.strokeStyle = 'rgba(0,230,118,0.18)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15);
        ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
    }
    if (e.type === 'apple') {
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, -r + 2);
      ctx.lineTo(2, -r - 8);
      ctx.stroke();
    }
    if (e.type === 'dragonfruit') {
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#e040fb';
      ctx.strokeStyle = 'rgba(224,64,251,0.2)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (e.type === 'coconut') {
      ctx.fillStyle = 'rgba(62,39,35,0.45)';
      ctx.beginPath();
      ctx.arc(-6, 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 10, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = cfg.rc;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r - 1.5, -Math.PI * 0.75, Math.PI * 0.05);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const hl = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, -r * 0.3, -r * 0.3, r * 0.42);
    hl.addColorStop(0, 'rgba(255,255,255,0.52)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawHalf = (ctx: CanvasRenderingContext2D, e: Entity) => {
    const r = e.radius;
    const cfg = CFG[e.type];
    if (e.elongated) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.7, r, 0, 0, Math.PI, true);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI, true);
      ctx.closePath();
    }
    const g = ctx.createLinearGradient(0, -r, 0, r * 0.5);
    g.addColorStop(0, cfg.c);
    g.addColorStop(1, shade(cfg.c, -20));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = cfg.ic;
    if (e.elongated) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.55, r - 4, 0, 0, Math.PI, true);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r - 4, 0, Math.PI, true);
      ctx.closePath();
    }
    ctx.fill();
  };

  const drawBlade = (ctx: CanvasRenderingContext2D) => {
    if (trail.current.length < 2) return;
    const isOD = overdrive.current > 0.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 16;
    ctx.shadowColor = isOD ? '#e040fb' : BLADE_CLR;
    for (let i = 0; i < trail.current.length - 1; i++) {
      const p1 = trail.current[i];
      const p2 = trail.current[i + 1];
      ctx.globalAlpha = p1.life * 0.3;
      ctx.strokeStyle = isOD ? '#e040fb' : BLADE_CLR;
      ctx.lineWidth = p1.life * (BW + 7);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 6;
    ctx.shadowColor = BLADE_GLOW;
    for (let i = 0; i < trail.current.length - 1; i++) {
      const p1 = trail.current[i];
      const p2 = trail.current[i + 1];
      ctx.globalAlpha = p1.life * 0.55;
      ctx.strokeStyle = BLADE_GLOW;
      ctx.lineWidth = p1.life * BW * 0.55;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const sx = shake.current.x || 0;
    const sy = shake.current.y || 0;
    ctx.save();
    ctx.translate(sx, sy);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#05050d');
    bg.addColorStop(0.5, '#090c24');
    bg.addColorStop(1, '#130822');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    ctx.strokeStyle = 'rgba(0,229,255,0.02)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 50) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += 50) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    if (frozen.current > 0) {
      ctx.fillStyle = `rgba(128,222,234,${cl(frozen.current / 200, 0, 1) * 0.1})`;
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }

    bgP.current.forEach((p) => {
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    flashes.current.forEach((f) => {
      ctx.globalAlpha = f.life * 0.5;
      ctx.shadowBlur = 25;
      ctx.shadowColor = f.color;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * (1 + (1 - f.life) * 2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    parts.current.forEach((p) => {
      ctx.globalAlpha = p.life * (p.mist ? 0.3 : 1);
      if (p.glow) {
        ctx.shadowBlur = p.mist ? p.size : 5;
        ctx.shadowColor = p.color;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, p.size * (p.mist ? 1 : p.life)), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    entities.current.forEach((e) => {
      if (!e.active) return;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      ctx.scale(e.scale, e.scale);
      if (e.isHalf) drawHalf(ctx, e);
      else drawEntity(ctx, e);
      ctx.restore();
    });

    drawBlade(ctx);

    floats.current.forEach((f) => {
      ctx.globalAlpha = f.life;
      ctx.shadowBlur = 8;
      ctx.shadowColor = f.color;
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.size}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    if (overdrive.current > 0.01) {
      const bw = 170;
      const bh = 4;
      const bx = w / 2 - bw / 2;
      const by = h - 24;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const og = ctx.createLinearGradient(bx, by, bx + bw * overdrive.current, by);
      og.addColorStop(0, '#00e5ff');
      og.addColorStop(1, '#e040fb');
      ctx.fillStyle = og;
      ctx.fillRect(bx, by, bw * overdrive.current, bh);
      ctx.fillStyle = 'rgba(0,229,255,0.4)';
      ctx.font = "bold 7px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('ПЕРЕГРУЗКА', w / 2, by - 3);
    }

    ctx.restore();
  };

  const loop = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    update(cv.width, cv.height);
    draw(ctx, cv.width, cv.height);
    reqRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const resize = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    reqRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [loop]);

  const down = () => {
    mdRef.current = true;
    trail.current = [];
  };
  const up = () => {
    mdRef.current = false;
    trail.current = [];
  };
  const move = (x: number, y: number) => {
    if (!mdRef.current || !isRunning) return;
    trail.current.push({ x, y, life: 1 });
    if (trail.current.length > TLEN) trail.current.shift();
  };

  return (
    <canvas
      ref={cvRef}
      className="absolute top-0 left-0 w-full h-full z-10"
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      onMouseDown={() => down()}
      onMouseUp={() => up()}
      onMouseLeave={() => up()}
      onMouseMove={(e) => move(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        down();
        move(e.touches[0].clientX, e.touches[0].clientY);
      }}
      onTouchEnd={() => up()}
      onTouchMove={(e) => {
        e.preventDefault();
        move(e.touches[0].clientX, e.touches[0].clientY);
      }}
    />
  );
}

/* =========================
   App
========================= */
export default function NexusBladeYandexTS() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [gameState, setGameState] = useState<GameState>({ score: 0, strikes: 0, highScore: 0, multiplier: 1 });
  const [lastStats, setLastStats] = useState<RunStats | null>(null);
  const [save, setSave] = useState<SaveData>(initialSave());
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkPlayerName, setSdkPlayerName] = useState('Игрок');
  const [topEntries, setTopEntries] = useState<Array<{ rank: number; name: string; score: number }>>([]);
  const [reviveCounter, setReviveCounter] = useState(0);
  const [usedReviveThisRun, setUsedReviveThisRun] = useState(false);

  const level = useMemo(() => getLevelForXP(save.totalXP), [save.totalXP]);
  const xpProg = useMemo(() => getXPProgress(save.totalXP), [save.totalXP]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const loaded = await loadSave();
      if (!mounted) return;
      setSave(loaded);
      setGameState((p) => ({ ...p, highScore: loaded.highScore }));
      audio.init();
      audio.setEnabled(loaded.soundOn);
      const sdk = await yandexGames.init();
      if (!mounted) return;
      setSdkReady(sdk.ready);
      if (sdk.playerName) setSdkPlayerName(sdk.playerName);
      await yandexGames.markReady();
      const lb = await yandexGames.getLeaderboardEntries(LEADERBOARD_NAME, 5);
      if (!mounted) return;
      setTopEntries(lb);
    })();

    const onVisibility = () => {
      if (document.hidden && phase === 'playing') {
        setPhase('paused');
        yandexGames.stopGameplay();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const updateSave = useCallback(async (patch: Partial<SaveData>) => {
    setSave((prev) => {
      const next = { ...prev, ...patch };
      void persistSave(next);
      return next;
    });
  }, []);

  const toggleSound = async () => {
    audio.play('click');
    const next = !save.soundOn;
    audio.setEnabled(next);
    await updateSave({ soundOn: next });
  };

  const startRun = async () => {
    audio.init();
    await audio.resume();
    audio.play('start');
    await yandexGames.startGameplay();
    setUsedReviveThisRun(false);
    setGameState((p) => ({ ...p, score: 0, strikes: 0, multiplier: 1 }));
    setPhase('playing');
  };

  const openAuth = async () => {
    audio.play('click');
    const ok = await yandexGames.openAuthDialog();
    if (ok) {
      const name = await yandexGames.refreshPlayerName();
      if (name) setSdkPlayerName(name);
    }
  };

  const handleScoreChange = (score: number, strikes: number, multiplier: number) => {
    setGameState((p) => ({ ...p, score, strikes, multiplier }));
  };

  const handleGameOver = async (stats: RunStats) => {
    await yandexGames.stopGameplay();
    await yandexGames.showFullscreenAd();
    const comboBonus = Math.floor(stats.maxCombo * 1.5);
    const perfectBonus = stats.perfects * 3;
    const gained = gameState.score + comboBonus + perfectBonus;
    const nextHigh = Math.max(gameState.score, save.highScore);
    const nextTotalXP = save.totalXP + gained;
    const nextBestCombo = Math.max(save.bestCombo, stats.maxCombo);

    setLastStats(stats);
    setGameState((p) => ({ ...p, highScore: nextHigh }));
    await updateSave({
      highScore: nextHigh,
      totalXP: nextTotalXP,
      bestCombo: nextBestCombo,
      sessions: save.sessions + 1,
    });
    await yandexGames.setLeaderboardScore(LEADERBOARD_NAME, gameState.score);
    const lb = await yandexGames.getLeaderboardEntries(LEADERBOARD_NAME, 5);
    setTopEntries(lb);
    setPhase('summary');
  };

  const revive = async () => {
  if (usedReviveThisRun || save.revives <= 0) return;
  const rewarded = await yandexGames.showRewardedAd();
  if (!rewarded) return;
  audio.play('revive');
  setUsedReviveThisRun(true);
  await updateSave({ revives: Math.max(0, save.revives - 1) });
  setReviveCounter((v) => v + 1);
  setPhase('playing');
  await yandexGames.startGameplay();
};

const goMenu = async () => {
  audio.play('click');
  await yandexGames.stopGameplay();
  setPhase('menu');
};

const resume = async () => {
  audio.play('click');
  await yandexGames.startGameplay();
  setPhase('playing');
};

return (
  <div
    className="w-full h-screen relative overflow-hidden"
    style={{ background: '#04040c', fontFamily: 'Inter, system-ui, sans-serif' }}
  >
    <AnimatedBG />

    {phase !== 'boot' && (
      <GameCanvas
        isRunning={phase === 'playing'}
        soundOn={save.soundOn}
        onScoreChange={handleScoreChange}
        onGameOver={handleGameOver}
        reviveSignal={reviveCounter}
      />
    )}

    {phase === 'boot' && (
      <LoadingScreen
        sdkReady={sdkReady}
        onDone={() => setPhase('menu')}
      />
    )}

    {phase === 'playing' && (
      <TopHUD
        score={gameState.score}
        strikes={gameState.strikes}
        highScore={gameState.highScore}
        multiplier={gameState.multiplier}
        level={level}
        xpProg={xpProg}
        soundOn={save.soundOn}
        onToggleSound={toggleSound}
        onPause={() => setPhase('paused')}
      />
    )}

    {phase === 'menu' && (
      <MenuScreen
        highScore={gameState.highScore}
        level={level}
        xpProg={xpProg}
        soundOn={save.soundOn}
        onToggleSound={toggleSound}
        onStart={startRun}
        topEntries={topEntries}
        onOpenAuth={openAuth}
      />
    )}

    {phase === 'paused' && (
      <PauseScreen
        onResume={resume}
        onMenu={goMenu}
      />
    )}

    {phase === 'summary' && lastStats && (
      <SummaryScreen
        score={gameState.score}
        highScore={gameState.highScore}
        stats={lastStats}
        totalXP={save.totalXP}
        canRevive={!usedReviveThisRun && save.revives > 0 && Boolean(yandexGames.ready)}
        onContinue={startRun}
        onMenu={goMenu}
        onRevive={revive}
      />
    )}

    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 text-[10px] text-white/18 tracking-[0.2em] text-center px-3"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {sdkReady ? 'Yandex SDK online' : 'Локальный режим'}
    </div>

    {sdkReady && sdkPlayerName && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 text-[8px] text-white/8 tracking-[0.15em]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {sdkPlayerName}
        </div>
      )}
  </div>
);
}
