import {
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  World,
  Follower,
  ScreenSpace,
  InputComponent,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  Color,
  Vector3,
  Vector2,
  Raycaster,
  AmbientLight,
  PointLight,
  DirectionalLight,
  Fog,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  EdgesGeometry,
  AdditiveBlending,
  CanvasTexture,
  SpriteMaterial,
  Sprite,
  Object3D,
} from '@iwsdk/core';

// ── Types ──────────────────────────────────────────────────────────────────

enum GS { MENU, MODE_SELECT, PRE_DUEL, STANDOFF, DRAW, RESULT, GAME_OVER }
enum GM { CAMPAIGN, QUICK_DRAW, SURVIVAL, TIME_TRIAL }
const DIFF_NAMES = ['EASY', 'NORMAL', 'HARD'] as const;
const DIFF_MULT = [1.3, 1.0, 0.7];
const CROSSHAIR_COLORS = ['#00ccff', '#00ff66', '#ff6600', '#ff0044', '#ffffff'];
const CROSSHAIR_NAMES = ['CYAN', 'GREEN', 'ORANGE', 'RED', 'WHITE'];

interface OpponentData {
  name: string;
  title: string;
  drawSpeed: number;
  bodyColor: number;
  hatColor: number;
}

const OPPONENTS: OpponentData[] = [
  { name: 'Dusty Dan',       title: 'The Slowpoke',     drawSpeed: 1500, bodyColor: 0x886644, hatColor: 0x664422 },
  { name: 'Rusty Rose',      title: 'The Drifter',      drawSpeed: 1200, bodyColor: 0xcc4444, hatColor: 0x881122 },
  { name: 'Neon Nick',       title: 'The Flasher',       drawSpeed: 1000, bodyColor: 0x00cc88, hatColor: 0x006644 },
  { name: 'Flash Morgan',    title: 'The Gunslinger',   drawSpeed: 850,  bodyColor: 0xccaa44, hatColor: 0x886622 },
  { name: 'Quick Quinn',     title: 'The Sharpshooter', drawSpeed: 700,  bodyColor: 0x4488cc, hatColor: 0x224466 },
  { name: 'Shadow Silas',    title: 'The Phantom',      drawSpeed: 600,  bodyColor: 0x444466, hatColor: 0x222233 },
  { name: 'Volt Valentina',  title: 'The Lightning',    drawSpeed: 500,  bodyColor: 0xcc44cc, hatColor: 0x662266 },
  { name: 'Thunder Thorn',   title: 'The Storm',        drawSpeed: 420,  bodyColor: 0x2266cc, hatColor: 0x113366 },
  { name: 'Lightning Lux',   title: 'The Blur',         drawSpeed: 350,  bodyColor: 0xffcc00, hatColor: 0xaa8800 },
  { name: 'The Reaper',      title: 'Death Itself',     drawSpeed: 280,  bodyColor: 0x220000, hatColor: 0x110000 },
];

interface SaveData {
  totalDuels: number;
  wins: number;
  losses: number;
  bestReaction: number;
  totalReaction: number;
  careerScore: number;
  bestStreak: number;
  campaignsWon: number;
  campaignsWonHard: number;
  playTimeMs: number;
  achievements: boolean[];
  difficulty: number;
  sfxVol: number;
  musicOn: boolean;
  crosshairIdx: number;
}

const ACH_NAMES = [
  'First Blood - Win your first duel',
  'Sharpshooter - 95%+ accuracy',
  'Lightning Draw - Under 300ms reaction',
  'Quick Silver - Under 200ms reaction',
  'Campaign Victor - Beat the campaign',
  'Streak x5 - 5 wins in a row',
  'Streak x10 - 10 wins in a row',
  'Survivor 10 - 10 rounds in survival',
  'Survivor 25 - 25 rounds in survival',
  'Time Lord - 10+ duels in time trial',
  'Perfectionist - Perfect campaign (no losses)',
  'Phantom Slayer - Beat The Reaper',
  'Score 10K - Reach 10,000 career score',
  'Score 50K - Reach 50,000 career score',
  'Duel Master - 100 total duels',
  'Hard Mode Hero - Beat campaign on Hard',
  'Bullseye - 100% accuracy in a duel',
  'Speed Demon - Average under 400ms',
  'Iron Nerves - Win after 4s standoff',
  'Untouchable - 20 survival streak',
];

// ── Audio helpers ──────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicOscs: OscillatorNode[] = [];

function ensureAudio(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.15;
    musicGain.connect(masterGain);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSFX(type: string, vol = 1.0) {
  const ctx = ensureAudio();
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.value = vol * (save.sfxVol / 100);
  g.connect(masterGain!);

  if (type === 'gunshot') {
    // White noise burst + low thump
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3000, t);
    flt.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    src.connect(flt).connect(g);
    g.gain.setValueAtTime(vol * 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.start(t);
    // Sub bass thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.15);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * 0.6, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g2).connect(masterGain!);
    osc.start(t);
    osc.stop(t + 0.25);
  } else if (type === 'draw') {
    // Sharp rising tone
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.2);
  } else if (type === 'hit') {
    // Impact thud + metallic ring
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.35);
  } else if (type === 'miss') {
    // Ricochet whizz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.4);
  } else if (type === 'win') {
    [0, 0.1, 0.2].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = [523, 659, 784][i];
      const gw = ctx.createGain();
      gw.gain.setValueAtTime(0, t + delay);
      gw.gain.linearRampToValueAtTime(0.3, t + delay + 0.05);
      gw.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.4);
      osc.connect(gw).connect(masterGain!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.5);
    });
  } else if (type === 'lose') {
    [0, 0.15].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = [300, 200][i];
      const gw = ctx.createGain();
      gw.gain.setValueAtTime(0.3, t + delay);
      gw.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.5);
      osc.connect(gw).connect(masterGain!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.6);
    });
  } else if (type === 'click') {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 800;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.06);
  } else if (type === 'countdown') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 440;
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.2);
  } else if (type === 'tension') {
    // Low rumble
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 1.1);
  } else if (type === 'achieve') {
    [0, 0.08, 0.16, 0.24].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = [523, 659, 784, 1047][i];
      const ga = ctx.createGain();
      ga.gain.setValueAtTime(0.25, t + delay);
      ga.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
      osc.connect(ga).connect(masterGain!);
      osc.start(t + delay);
      osc.stop(t + delay + 0.35);
    });
  }
}

function startMusic() {
  if (!save.musicOn) return;
  stopMusic();
  const ctx = ensureAudio();
  const t = ctx.currentTime;
  // Tension drone
  const drone = ctx.createOscillator();
  drone.type = 'sawtooth';
  drone.frequency.value = 55;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 200;
  drone.connect(droneFilter).connect(musicGain!);
  drone.start(t);
  musicOscs.push(drone);
  // Pad
  const pad = ctx.createOscillator();
  pad.type = 'sine';
  pad.frequency.value = 110;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.08;
  pad.connect(padGain).connect(musicGain!);
  pad.start(t);
  musicOscs.push(pad);
}

function stopMusic() {
  const ctx = audioCtx;
  if (!ctx) return;
  musicOscs.forEach(o => { try { o.stop(); } catch {} });
  musicOscs = [];
}

// ── Save/Load ──────────────────────────────────────────────────────────────

const DEFAULT_SAVE: SaveData = {
  totalDuels: 0, wins: 0, losses: 0, bestReaction: Infinity,
  totalReaction: 0, careerScore: 0, bestStreak: 0,
  campaignsWon: 0, campaignsWonHard: 0, playTimeMs: 0,
  achievements: new Array(20).fill(false),
  difficulty: 1, sfxVol: 100, musicOn: true, crosshairIdx: 0,
};

let save: SaveData = { ...DEFAULT_SAVE, achievements: [...DEFAULT_SAVE.achievements] };

function loadSave() {
  try {
    const raw = localStorage.getItem('neon-duel-save');
    if (raw) {
      const parsed = JSON.parse(raw);
      save = { ...DEFAULT_SAVE, ...parsed, achievements: [...DEFAULT_SAVE.achievements] };
      if (parsed.achievements) {
        for (let i = 0; i < Math.min(parsed.achievements.length, 20); i++) {
          save.achievements[i] = parsed.achievements[i];
        }
      }
    }
  } catch {}
}

function writeSave() {
  try { localStorage.setItem('neon-duel-save', JSON.stringify(save)); } catch {}
}

function unlockAch(idx: number): boolean {
  if (idx < 0 || idx >= 20 || save.achievements[idx]) return false;
  save.achievements[idx] = true;
  writeSave();
  playSFX('achieve');
  return true;
}

loadSave();

// ── 3D helpers ─────────────────────────────────────────────────────────────

function createOpponentModel(data: OpponentData): Group {
  const g = new Group();
  const bodyMat = new MeshStandardMaterial({
    color: data.bodyColor,
    emissive: data.bodyColor,
    emissiveIntensity: 0.3,
  });
  const hatMat = new MeshStandardMaterial({
    color: data.hatColor,
    emissive: data.hatColor,
    emissiveIntensity: 0.3,
  });
  const skinMat = new MeshStandardMaterial({
    color: 0xddbb99,
    emissive: 0xddbb99,
    emissiveIntensity: 0.15,
  });

  // Torso
  const torso = new Mesh(new CylinderGeometry(0.28, 0.22, 0.9, 8), bodyMat);
  torso.position.y = 0.95;
  g.add(torso);
  // Head
  const head = new Mesh(new SphereGeometry(0.16, 8, 8), skinMat);
  head.position.y = 1.55;
  g.add(head);
  // Eyes (two small glowing spheres)
  const eyeMat = new MeshBasicMaterial({ color: 0xff4400 });
  [-0.06, 0.06].forEach(x => {
    const eye = new Mesh(new SphereGeometry(0.025, 6, 6), eyeMat);
    eye.position.set(x, 1.57, 0.14);
    g.add(eye);
  });
  // Hat brim
  const brim = new Mesh(new CylinderGeometry(0.28, 0.28, 0.03, 8), hatMat);
  brim.position.y = 1.7;
  g.add(brim);
  // Hat top
  const top = new Mesh(new CylinderGeometry(0.14, 0.17, 0.2, 8), hatMat);
  top.position.y = 1.82;
  g.add(top);
  // Arms
  const armMat = bodyMat.clone();
  const leftArm = new Mesh(new CylinderGeometry(0.045, 0.04, 0.65, 6), armMat);
  leftArm.position.set(-0.35, 0.85, 0);
  leftArm.rotation.z = 0.15;
  g.add(leftArm);
  const rightArm = new Mesh(new CylinderGeometry(0.045, 0.04, 0.65, 6), armMat);
  rightArm.position.set(0.35, 0.85, 0);
  rightArm.rotation.z = -0.15;
  rightArm.name = 'rightArm';
  g.add(rightArm);
  // Legs
  const legMat = new MeshStandardMaterial({ color: 0x222233, emissive: 0x111122, emissiveIntensity: 0.2 });
  [-0.12, 0.12].forEach(x => {
    const leg = new Mesh(new CylinderGeometry(0.06, 0.055, 0.8, 6), legMat);
    leg.position.set(x, 0.4, 0);
    g.add(leg);
  });
  // Gun at hip (right side, small cylinder)
  const gunMat = new MeshStandardMaterial({ color: 0x888888, emissive: 0x444444, emissiveIntensity: 0.3 });
  const gun = new Mesh(new CylinderGeometry(0.02, 0.02, 0.18, 6), gunMat);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0.32, 0.55, 0.08);
  gun.name = 'gun';
  g.add(gun);

  return g;
}

function createMuzzleFlash(): Group {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9 });
  const flash = new Mesh(new SphereGeometry(0.08, 6, 6), mat);
  g.add(flash);
  // Rays
  for (let i = 0; i < 5; i++) {
    const ray = new Mesh(
      new CylinderGeometry(0.005, 0.005, 0.2 + Math.random() * 0.15, 4),
      new MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.7 }),
    );
    ray.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    g.add(ray);
  }
  g.visible = false;
  return g;
}

function createImpactParticles(): Group {
  const g = new Group();
  for (let i = 0; i < 12; i++) {
    const p = new Mesh(
      new BoxGeometry(0.03, 0.03, 0.03),
      new MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 }),
    );
    p.userData.vel = new Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 3,
      (Math.random() - 0.5) * 4,
    );
    g.add(p);
  }
  g.visible = false;
  return g;
}

function createFloorGrid(size: number, divisions: number, color: number): LineSegments {
  const halfSize = size / 2;
  const step = size / divisions;
  const vertices: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const pos = -halfSize + i * step;
    vertices.push(pos, 0, -halfSize, pos, 0, halfSize);
    vertices.push(-halfSize, 0, pos, halfSize, 0, pos);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return new LineSegments(geo, new LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
}

function createDrawText(): { group: Group; canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const texture = new CanvasTexture(canvas);
  const mat = new SpriteMaterial({ map: texture, transparent: true });
  const sprite = new Sprite(mat);
  sprite.scale.set(4, 2, 1);
  const group = new Group();
  group.add(sprite);
  group.visible = false;
  return { group, canvas, texture };
}

function updateDrawText(
  canvas: HTMLCanvasElement,
  texture: CanvasTexture,
  text: string,
  color: string,
  fontSize = 90,
) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.shadowBlur = 0;
  texture.needsUpdate = true;
}

// ── Tumbleweed ─────────────────────────────────────────────────────────────

function createTumbleweed(): Group {
  const g = new Group();
  const mat = new LineBasicMaterial({ color: 0x886644, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 8; i++) {
    const verts: number[] = [];
    const r = 0.15 + Math.random() * 0.1;
    const segs = 12;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const rx = r * (1 + (Math.random() - 0.5) * 0.3);
      verts.push(Math.cos(a) * rx, Math.sin(a) * rx, (Math.random() - 0.5) * 0.1);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
    const ring = new LineSegments(geo, mat);
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    g.add(ring);
  }
  return g;
}

// ── Game System ────────────────────────────────────────────────────────────

export class GameSystem extends createSystem({
  mainMenu: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/main-menu.json')] },
  modeSelect: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/mode-select.json')] },
  hud: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  result: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/result.json')] },
  gameOver: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/game-over.json')] },
  settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  achievements: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
  stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
}) {
  // State
  private state: GS = GS.MENU;
  private mode: GM = GM.CAMPAIGN;
  private campaignIdx = 0;
  private score = 0;
  private roundWins = 0;
  private roundLosses = 0;
  private lives = 3;
  private streak = 0;
  private sessionStreak = 0;
  private reactionTimes: number[] = [];
  private standoffTime = 0;
  private standoffDuration = 0;
  private drawSignalTime = 0;
  private playerShot = false;
  private opponentDrawn = false;
  private duelReaction = 0;
  private duelAccuracy = 0;
  private duelScore = 0;
  private stateTimer = 0;
  private timeTrialRemaining = 60;
  private timeTrialDuels = 0;
  private playStartTime = 0;

  // 3D
  private opponentGroup: Group | null = null;
  private opponentModel: Group | null = null;
  private muzzleFlash: Group | null = null;
  private playerMuzzle: Group | null = null;
  private impactParticles: Group | null = null;
  private drawTextObj: { group: Group; canvas: HTMLCanvasElement; texture: CanvasTexture } | null = null;
  private tumbleweeds: { group: Group; vel: Vector3; spin: Vector3 }[] = [];
  private dustParticles: Mesh[] = [];
  private ambientMotes: Mesh[] = [];
  private crosshairMesh: Mesh | null = null;

  // Panels
  private panelEntities: Record<string, any> = {};
  private panelDocs: Record<string, UIKitDocument> = {};

  // Flash effects
  private flashMesh: Mesh | null = null;
  private flashTimer = 0;

  // Mouse state
  private mouseNDC = new Vector2(0, 0);
  private mouseClicked = false;
  private raycaster = new Raycaster();

  // Achievement notification
  private achNotifyTimer = 0;
  private achNotifyGroup: Group | null = null;
  private achNotifyCanvas: HTMLCanvasElement | null = null;
  private achNotifyTexture: CanvasTexture | null = null;

  // Standoff tension effects
  private tensionTimer = 0;

  // Opponent drawing animation
  private opponentArmAnim = 0;
  private opponentGunUp = false;

  init() {
    const world = this.world as unknown as World;

    // ── Lighting ──
    const ambient = new AmbientLight(0x221111, 0.4);
    world.scene.add(ambient);
    const dir = new DirectionalLight(0xff6633, 0.6);
    dir.position.set(5, 10, 5);
    world.scene.add(dir);
    world.scene.fog = new Fog(0x050005, 10, 80);

    // ── Floor ──
    const grid = createFloorGrid(60, 30, 0xff4400);
    world.scene.add(grid);

    // ── Buildings / environment ──
    this.createEnvironment(world);

    // ── Opponent placeholder (created per duel) ──
    this.opponentGroup = new Group();
    this.opponentGroup.position.set(0, 0, -12);
    world.scene.add(this.opponentGroup);

    // ── Muzzle flashes ──
    this.muzzleFlash = createMuzzleFlash();
    world.scene.add(this.muzzleFlash);
    this.playerMuzzle = createMuzzleFlash();
    this.playerMuzzle.position.set(0, 1.2, -0.5);
    world.scene.add(this.playerMuzzle);

    // ── Impact particles ──
    this.impactParticles = createImpactParticles();
    world.scene.add(this.impactParticles);

    // ── Draw text ──
    this.drawTextObj = createDrawText();
    this.drawTextObj.group.position.set(0, 3.5, -6);
    world.scene.add(this.drawTextObj.group);

    // ── Tumbleweeds ──
    for (let i = 0; i < 3; i++) {
      const tw = createTumbleweed();
      tw.position.set(-20 + Math.random() * 40, 0.2, -5 + Math.random() * -10);
      world.scene.add(tw);
      this.tumbleweeds.push({
        group: tw,
        vel: new Vector3(0.5 + Math.random() * 1.5, 0, (Math.random() - 0.5) * 0.5),
        spin: new Vector3(Math.random() * 2, Math.random(), Math.random()),
      });
    }

    // ── Dust particles ──
    const dustMat = new MeshBasicMaterial({ color: 0x886644, transparent: true, opacity: 0.2 });
    for (let i = 0; i < 40; i++) {
      const p = new Mesh(new BoxGeometry(0.03, 0.03, 0.03), dustMat);
      p.position.set(
        (Math.random() - 0.5) * 30,
        Math.random() * 3,
        -Math.random() * 20,
      );
      p.userData.baseY = p.position.y;
      p.userData.speed = 0.2 + Math.random() * 0.5;
      p.userData.drift = Math.random() * Math.PI * 2;
      world.scene.add(p);
      this.dustParticles.push(p);
    }

    // ── Ambient motes ──
    const moteMat = new MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.15 });
    for (let i = 0; i < 20; i++) {
      const m = new Mesh(new SphereGeometry(0.02, 4, 4), moteMat);
      m.position.set(
        (Math.random() - 0.5) * 30,
        1 + Math.random() * 5,
        -Math.random() * 25,
      );
      m.userData.phase = Math.random() * Math.PI * 2;
      world.scene.add(m);
      this.ambientMotes.push(m);
    }

    // ── Crosshair (browser mode) ──
    const chMat = new MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.8, depthTest: false });
    this.crosshairMesh = new Mesh(new SphereGeometry(0.015, 8, 8), chMat);
    this.crosshairMesh.renderOrder = 999;
    this.crosshairMesh.visible = false;
    world.scene.add(this.crosshairMesh);

    // ── Flash overlay ──
    const flashMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
    this.flashMesh = new Mesh(new BoxGeometry(0.5, 0.3, 0.01), flashMat);
    this.flashMesh.renderOrder = 1000;
    this.flashMesh.position.set(0, 0, -0.3);
    world.camera.add(this.flashMesh);

    // ── Achievement notification ──
    const achCanvas = document.createElement('canvas');
    achCanvas.width = 512;
    achCanvas.height = 64;
    this.achNotifyCanvas = achCanvas;
    this.achNotifyTexture = new CanvasTexture(achCanvas);
    const achMat = new SpriteMaterial({ map: this.achNotifyTexture, transparent: true });
    const achSprite = new Sprite(achMat);
    achSprite.scale.set(2, 0.25, 1);
    this.achNotifyGroup = new Group();
    this.achNotifyGroup.add(achSprite);
    this.achNotifyGroup.position.set(0, -0.15, -0.5);
    this.achNotifyGroup.visible = false;
    world.camera.add(this.achNotifyGroup);

    // ── Mouse listeners ──
    const canvas = world.renderer.domElement;
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    canvas.addEventListener('click', () => {
      this.mouseClicked = true;
      ensureAudio();
    });

    // ── Create panels ──
    this.createPanels(world);
    this.playStartTime = Date.now();
    startMusic();
  }

  private createEnvironment(world: World) {
    const buildingMat = new MeshStandardMaterial({
      color: 0x110808,
      emissive: 0x110808,
      emissiveIntensity: 0.2,
    });
    const edgeMat = new LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4 });

    // Side buildings
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 5; i++) {
        const w = 3 + Math.random() * 2;
        const h = 3 + Math.random() * 4;
        const d = 4 + Math.random() * 3;
        const box = new BoxGeometry(w, h, d);
        const building = new Mesh(box, buildingMat);
        building.position.set(side * (6 + Math.random()), h / 2, -3 - i * 7);
        world.scene.add(building);
        const edges = new LineSegments(new EdgesGeometry(box), edgeMat);
        edges.position.copy(building.position);
        world.scene.add(edges);
      }
    }

    // Distant horizon glow
    const horizonMat = new MeshBasicMaterial({ color: 0x220808, transparent: true, opacity: 0.5 });
    const horizon = new Mesh(new BoxGeometry(100, 0.1, 100), horizonMat);
    horizon.position.y = -0.05;
    world.scene.add(horizon);

    // Street lamps
    const lampMat = new MeshStandardMaterial({ color: 0x333333 });
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const pole = new Mesh(new CylinderGeometry(0.04, 0.04, 4, 6), lampMat);
        pole.position.set(side * 4, 2, -4 - i * 8);
        world.scene.add(pole);
        const light = new PointLight(0xff6633, 0.8, 12);
        light.position.set(side * 4, 4.1, -4 - i * 8);
        world.scene.add(light);
        const bulb = new Mesh(
          new SphereGeometry(0.08, 6, 6),
          new MeshBasicMaterial({ color: 0xff8844 }),
        );
        bulb.position.copy(light.position);
        world.scene.add(bulb);
      }
    }

    // Stars
    for (let i = 0; i < 100; i++) {
      const star = new Mesh(
        new SphereGeometry(0.03 + Math.random() * 0.05, 4, 4),
        new MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.3 + Math.random() * 0.5 }),
      );
      star.position.set(
        (Math.random() - 0.5) * 100,
        15 + Math.random() * 40,
        -10 - Math.random() * 60,
      );
      world.scene.add(star);
    }
  }

  private createPanels(world: World) {
    const configs: [string, number, number, number, boolean, boolean][] = [
      ['main-menu',    0,   1.5,  -3,  false, true],
      ['mode-select',  0,   1.5,  -3,  false, false],
      ['hud',          0,   2.4,  -2.5, true,  false],
      ['result',       0,   1.5,  -3,  false, false],
      ['game-over',    0,   1.5,  -3,  false, false],
      ['settings',     0,   1.5,  -3,  false, false],
      ['achievements', 0,   1.5,  -3,  false, false],
      ['stats',        0,   1.5,  -3,  false, false],
    ];

    for (const [name, x, y, z, isHud, visible] of configs) {
      const entity = world.createTransformEntity(undefined, { persistent: true });
      entity.object3D!.position.set(x, y, z);
      entity.addComponent(PanelUI, { config: `./ui/${name}.json` });
      if (isHud) {
        entity.addComponent(Follower, { target: world.player.children[0] || world.player });
        entity.addComponent(ScreenSpace, {});
      } else {
        entity.addComponent(ScreenSpace, {});
      }
      entity.object3D!.visible = visible;
      this.panelEntities[name] = entity;
    }

    // Subscribe to qualify events
    this.queries.mainMenu.subscribe('qualify', e => this.bindMainMenu(e));
    this.queries.modeSelect.subscribe('qualify', e => this.bindModeSelect(e));
    this.queries.hud.subscribe('qualify', e => this.bindHud(e));
    this.queries.result.subscribe('qualify', e => this.bindResult(e));
    this.queries.gameOver.subscribe('qualify', e => this.bindGameOver(e));
    this.queries.settings.subscribe('qualify', e => this.bindSettings(e));
    this.queries.achievements.subscribe('qualify', e => this.bindAchievements(e));
    this.queries.stats.subscribe('qualify', e => this.bindStats(e));
  }

  private getDoc(entity: any): UIKitDocument | undefined {
    return entity.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
  }

  private setText(doc: UIKitDocument | undefined, id: string, text: string) {
    if (!doc) return;
    const el = doc.getElementById(id) as UIKit.Text | undefined;
    el?.setProperties({ text });
  }

  private showPanel(name: string) {
    for (const [key, ent] of Object.entries(this.panelEntities)) {
      if (ent?.object3D) ent.object3D.visible = (key === name || (name === 'gameplay' && key === 'hud'));
    }
  }

  private flash(color: number, duration = 0.2) {
    if (this.flashMesh) {
      (this.flashMesh.material as MeshBasicMaterial).color.set(color);
      (this.flashMesh.material as MeshBasicMaterial).opacity = 0.6;
      this.flashTimer = duration;
    }
  }

  private showAchNotify(text: string) {
    if (!this.achNotifyCanvas || !this.achNotifyTexture || !this.achNotifyGroup) return;
    const ctx = this.achNotifyCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 64);
    ctx.fillStyle = '#1a0800cc';
    ctx.fillRect(0, 0, 512, 64);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 62);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffaa00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 32);
    this.achNotifyTexture.needsUpdate = true;
    this.achNotifyGroup.visible = true;
    this.achNotifyTimer = 3.0;
  }

  // ── Panel bindings ───────────────────────────────────────────────────────

  private bindMainMenu(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['main-menu'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
    };
    btn('btn-play', () => { this.state = GS.MODE_SELECT; this.showPanel('mode-select'); });
    btn('btn-settings', () => { this.updateSettingsPanel(); this.showPanel('settings'); });
    btn('btn-achieve', () => { this.updateAchievementsPanel(); this.showPanel('achievements'); });
    btn('btn-stats', () => { this.updateStatsPanel(); this.showPanel('stats'); });
  }

  private bindModeSelect(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['mode-select'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
      // Also try container click
      const container = doc.getElementById(id);
      if (container && container !== el) {
        container.addEventListener('click', () => { playSFX('click'); cb(); });
      }
    };
    btn('btn-campaign', () => this.startMode(GM.CAMPAIGN));
    btn('btn-quickdraw', () => this.startMode(GM.QUICK_DRAW));
    btn('btn-survival', () => this.startMode(GM.SURVIVAL));
    btn('btn-timetrial', () => this.startMode(GM.TIME_TRIAL));
    btn('btn-back', () => { this.state = GS.MENU; this.showPanel('main-menu'); });
  }

  private bindHud(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['hud'] = doc;
  }

  private bindResult(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['result'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
    };
    btn('btn-next', () => this.nextDuel());
    btn('btn-menu', () => this.goToMenu());
  }

  private bindGameOver(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['game-over'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
    };
    btn('btn-retry', () => this.startMode(this.mode));
    btn('btn-menu', () => this.goToMenu());
  }

  private bindSettings(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['settings'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
    };
    btn('btn-diff', () => {
      save.difficulty = (save.difficulty + 1) % 3;
      writeSave();
      this.updateSettingsPanel();
    });
    btn('btn-sfx', () => {
      save.sfxVol = save.sfxVol <= 0 ? 100 : save.sfxVol - 25;
      writeSave();
      this.updateSettingsPanel();
    });
    btn('btn-music', () => {
      save.musicOn = !save.musicOn;
      writeSave();
      if (save.musicOn) startMusic(); else stopMusic();
      this.updateSettingsPanel();
    });
    btn('btn-crosshair', () => {
      save.crosshairIdx = (save.crosshairIdx + 1) % CROSSHAIR_COLORS.length;
      writeSave();
      if (this.crosshairMesh) {
        (this.crosshairMesh.material as MeshBasicMaterial).color.set(CROSSHAIR_COLORS[save.crosshairIdx]);
      }
      this.updateSettingsPanel();
    });
    btn('btn-back', () => { this.state = GS.MENU; this.showPanel('main-menu'); });
    this.updateSettingsPanel();
  }

  private bindAchievements(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['achievements'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
    };
    btn('btn-back', () => { this.state = GS.MENU; this.showPanel('main-menu'); });
    this.updateAchievementsPanel();
  }

  private bindStats(entity: any) {
    const doc = this.getDoc(entity);
    if (!doc) return;
    this.panelDocs['stats'] = doc;
    const btn = (id: string, cb: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playSFX('click'); cb(); });
    };
    btn('btn-back', () => { this.state = GS.MENU; this.showPanel('main-menu'); });
    this.updateStatsPanel();
  }

  private updateSettingsPanel() {
    const doc = this.panelDocs['settings'];
    if (!doc) return;
    this.setText(doc, 'btn-diff', DIFF_NAMES[save.difficulty]);
    this.setText(doc, 'btn-sfx', `${save.sfxVol}%`);
    this.setText(doc, 'btn-music', save.musicOn ? 'ON' : 'OFF');
    this.setText(doc, 'btn-crosshair', CROSSHAIR_NAMES[save.crosshairIdx]);
  }

  private updateAchievementsPanel() {
    const doc = this.panelDocs['achievements'];
    if (!doc) return;
    let unlocked = 0;
    for (let i = 0; i < 20; i++) {
      const done = save.achievements[i];
      if (done) unlocked++;
      const prefix = done ? '[*]' : '[ ]';
      const color = done ? '#ffaa00' : '#443322';
      const el = doc.getElementById(`ach-${i}`) as UIKit.Text | undefined;
      el?.setProperties({ text: `${prefix} ${ACH_NAMES[i]}`, color });
    }
    this.setText(doc, 'ach-count', `${unlocked} / 20 unlocked`);
  }

  private updateStatsPanel() {
    const doc = this.panelDocs['stats'];
    if (!doc) return;
    this.setText(doc, 'st-duels', `${save.totalDuels}`);
    this.setText(doc, 'st-record', `${save.wins} / ${save.losses}`);
    this.setText(doc, 'st-winrate', save.totalDuels > 0 ? `${Math.round(save.wins / save.totalDuels * 100)}%` : '--%');
    this.setText(doc, 'st-best', save.bestReaction < Infinity ? `${save.bestReaction.toFixed(0)}ms` : '--');
    const avg = save.totalDuels > 0 ? save.totalReaction / save.wins : 0;
    this.setText(doc, 'st-avg', avg > 0 ? `${avg.toFixed(0)}ms` : '--');
    this.setText(doc, 'st-score', `${save.careerScore}`);
    this.setText(doc, 'st-streak', `${save.bestStreak}`);
    this.setText(doc, 'st-campaigns', `${save.campaignsWon}`);
    const mins = Math.floor(save.playTimeMs / 60000);
    this.setText(doc, 'st-time', mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`);
  }

  // ── Game flow ────────────────────────────────────────────────────────────

  private startMode(mode: GM) {
    this.mode = mode;
    this.score = 0;
    this.roundWins = 0;
    this.roundLosses = 0;
    this.streak = 0;
    this.sessionStreak = 0;
    this.reactionTimes = [];
    this.campaignIdx = 0;
    this.lives = mode === GM.SURVIVAL ? 3 : 99;
    this.timeTrialRemaining = 60;
    this.timeTrialDuels = 0;
    this.startDuel();
  }

  private startDuel() {
    this.state = GS.PRE_DUEL;
    this.stateTimer = 0;
    this.playerShot = false;
    this.opponentDrawn = false;
    this.opponentGunUp = false;
    this.opponentArmAnim = 0;

    // Pick opponent
    let opponent: OpponentData;
    if (this.mode === GM.CAMPAIGN) {
      opponent = OPPONENTS[Math.min(this.campaignIdx, OPPONENTS.length - 1)];
    } else {
      // Random opponent scaled to difficulty + round
      const baseIdx = Math.min(this.roundWins, OPPONENTS.length - 1);
      opponent = OPPONENTS[baseIdx];
    }

    // Build opponent model
    if (this.opponentModel) {
      this.opponentGroup!.remove(this.opponentModel);
    }
    this.opponentModel = createOpponentModel(opponent);
    this.opponentGroup!.add(this.opponentModel);
    this.opponentGroup!.visible = true;

    // Set standoff duration (random 2-5 seconds)
    this.standoffDuration = 2000 + Math.random() * 3000;

    // Update HUD
    const hudDoc = this.panelDocs['hud'];
    if (hudDoc) {
      const modeName = ['CAMPAIGN', 'QUICK DRAW', 'SURVIVAL', 'TIME TRIAL'][this.mode];
      this.setText(hudDoc, 'mode-label', modeName);
      if (this.mode === GM.CAMPAIGN) {
        this.setText(hudDoc, 'opponent-label', `vs. ${opponent.name}`);
        this.setText(hudDoc, 'round-label', `${this.campaignIdx + 1}/10`);
        this.setText(hudDoc, 'lives-label', '---');
      } else if (this.mode === GM.SURVIVAL) {
        this.setText(hudDoc, 'opponent-label', `Round ${this.roundWins + 1}`);
        this.setText(hudDoc, 'round-label', `${this.roundWins + 1}`);
        this.setText(hudDoc, 'lives-label', 'O'.repeat(this.lives));
      } else if (this.mode === GM.TIME_TRIAL) {
        this.setText(hudDoc, 'opponent-label', 'GO!');
        this.setText(hudDoc, 'round-label', `${this.timeTrialDuels}`);
        this.setText(hudDoc, 'lives-label', '---');
      } else {
        this.setText(hudDoc, 'opponent-label', 'Quick Draw');
        this.setText(hudDoc, 'round-label', '1');
        this.setText(hudDoc, 'lives-label', '---');
      }
      this.setText(hudDoc, 'score-label', `${this.score}`);
      this.setText(hudDoc, 'timer-label', this.mode === GM.TIME_TRIAL ? `${Math.ceil(this.timeTrialRemaining)}` : '--');
    }

    this.showPanel('gameplay');

    // Hide draw text and effects
    if (this.drawTextObj) this.drawTextObj.group.visible = false;
    if (this.muzzleFlash) this.muzzleFlash.visible = false;
    if (this.playerMuzzle) this.playerMuzzle.visible = false;
    if (this.impactParticles) this.impactParticles.visible = false;
    if (this.crosshairMesh) this.crosshairMesh.visible = false;

    this.tensionTimer = 0;
  }

  private getCurrentOpponent(): OpponentData {
    if (this.mode === GM.CAMPAIGN) {
      return OPPONENTS[Math.min(this.campaignIdx, OPPONENTS.length - 1)];
    }
    return OPPONENTS[Math.min(this.roundWins, OPPONENTS.length - 1)];
  }

  private getAdjustedDrawSpeed(): number {
    const opp = this.getCurrentOpponent();
    return opp.drawSpeed * DIFF_MULT[save.difficulty];
  }

  private handleShot() {
    if (this.playerShot) return;
    this.playerShot = true;

    const now = performance.now();
    const reaction = now - this.drawSignalTime;
    this.duelReaction = reaction;

    // Calculate accuracy based on mouse position (how close to opponent center)
    const world = this.world as unknown as World;
    this.raycaster.setFromCamera(this.mouseNDC, world.camera);
    const oppPos = new Vector3();
    this.opponentGroup!.getWorldPosition(oppPos);
    oppPos.y = 1.2; // chest height

    const ray = this.raycaster.ray;
    const closest = new Vector3();
    ray.closestPointToPoint(oppPos, closest);
    const dist = closest.distanceTo(oppPos);

    // Hit if within ~0.5m of opponent center
    const hit = dist < 0.6;
    this.duelAccuracy = hit ? Math.max(0, 1 - dist / 0.6) : 0;

    // Player muzzle flash
    if (this.playerMuzzle) {
      this.playerMuzzle.visible = true;
      this.playerMuzzle.position.set(
        0,
        1.2,
        -0.5,
      );
    }

    playSFX('gunshot');
    this.flash(0xff8800, 0.1);

    const oppDrawSpeed = this.getAdjustedDrawSpeed();
    const playerFaster = reaction < oppDrawSpeed;

    if (hit && playerFaster) {
      // Player wins
      this.handleWin(reaction);
    } else if (!hit) {
      // Player missed
      playSFX('miss', 0.8);
      this.handleLoss('MISS!');
    } else {
      // Opponent was faster
      this.handleLoss('TOO SLOW!');
    }
  }

  private handleWin(reaction: number) {
    playSFX('hit', 0.8);
    playSFX('win', 0.6);
    this.flash(0x00ff66, 0.15);

    // Impact effect on opponent
    if (this.impactParticles) {
      this.impactParticles.visible = true;
      this.impactParticles.position.set(0, 1.2, -12);
      this.impactParticles.children.forEach(p => {
        p.position.set(0, 0, 0);
        ((p as Mesh).material as MeshBasicMaterial).opacity = 0.8;
      });
    }

    // Calculate score
    const speedBonus = Math.max(0, Math.floor(500 * (1 - reaction / 2000)));
    const accuracyBonus = Math.floor(this.duelAccuracy * 300);
    const streakMult = 1 + this.streak * 0.1;
    const diffMult = [0.5, 1.0, 2.0][save.difficulty];
    this.duelScore = Math.floor((1000 + speedBonus + accuracyBonus) * streakMult * diffMult);
    this.score += this.duelScore;
    this.roundWins++;
    this.streak++;
    this.sessionStreak++;

    // Stats
    save.totalDuels++;
    save.wins++;
    save.totalReaction += reaction;
    save.careerScore += this.duelScore;
    if (reaction < save.bestReaction) save.bestReaction = reaction;
    if (this.streak > save.bestStreak) save.bestStreak = this.streak;
    this.reactionTimes.push(reaction);
    writeSave();

    // Check achievements
    this.checkAchievements(reaction);

    // Show result
    this.showResult(true, reaction);
  }

  private handleLoss(reason: string) {
    playSFX('lose', 0.6);
    this.flash(0xff0000, 0.2);

    // Opponent fires
    if (this.muzzleFlash && this.opponentModel) {
      this.muzzleFlash.visible = true;
      this.muzzleFlash.position.set(0.32, 1.2, -11.7);
    }

    this.duelScore = 0;
    this.roundLosses++;
    this.streak = 0;
    if (this.mode === GM.SURVIVAL) this.lives--;

    save.totalDuels++;
    save.losses++;
    writeSave();

    this.showResult(false, this.duelReaction, reason);
  }

  private showResult(won: boolean, reaction: number, reason?: string) {
    this.state = GS.RESULT;
    this.stateTimer = 0;

    const doc = this.panelDocs['result'];
    if (!doc) return;

    this.setText(doc, 'result-title', won ? 'YOU WIN!' : 'YOU LOSE!');
    (doc.getElementById('result-title') as UIKit.Text | undefined)?.setProperties({
      color: won ? '#00ff66' : '#ff0044',
    });

    const opp = this.getCurrentOpponent();
    this.setText(doc, 'result-sub', won ? `${opp.name} defeated` : (reason || 'Outdrawn'));
    this.setText(doc, 'reaction-time', `${reaction.toFixed(0)}ms`);
    this.setText(doc, 'accuracy', `${Math.round(this.duelAccuracy * 100)}%`);

    // Speed rank
    let rank = 'SLOW';
    if (reaction < 200) rank = 'LEGENDARY';
    else if (reaction < 300) rank = 'LIGHTNING';
    else if (reaction < 400) rank = 'FAST';
    else if (reaction < 600) rank = 'NORMAL';
    this.setText(doc, 'speed-rank', rank);
    this.setText(doc, 'duel-score', won ? `+${this.duelScore}` : '0');
    this.setText(doc, 'streak', `x${this.streak}`);

    // Show/hide next button based on game state
    const isGameOver = this.checkGameOver();
    const nextBtn = doc.getElementById('btn-next') as UIKit.Text | undefined;
    if (isGameOver) {
      nextBtn?.setProperties({ text: 'CONTINUE' });
    } else {
      nextBtn?.setProperties({ text: 'NEXT DUEL' });
    }

    this.showPanel('result');
  }

  private checkGameOver(): boolean {
    if (this.mode === GM.CAMPAIGN && this.campaignIdx >= OPPONENTS.length - 1 && this.roundWins > this.campaignIdx) return true;
    if (this.mode === GM.CAMPAIGN && this.roundLosses >= 3) return true;
    if (this.mode === GM.QUICK_DRAW) return true;
    if (this.mode === GM.SURVIVAL && this.lives <= 0) return true;
    if (this.mode === GM.TIME_TRIAL && this.timeTrialRemaining <= 0) return true;
    return false;
  }

  private nextDuel() {
    if (this.checkGameOver()) {
      this.showGameOver();
      return;
    }

    if (this.mode === GM.CAMPAIGN) {
      this.campaignIdx++;
    }
    if (this.mode === GM.TIME_TRIAL) {
      this.timeTrialDuels++;
    }
    this.startDuel();
  }

  private showGameOver() {
    this.state = GS.GAME_OVER;
    const doc = this.panelDocs['game-over'];
    if (!doc) return;

    let title = 'GAME OVER';
    let sub = '';
    if (this.mode === GM.CAMPAIGN) {
      if (this.roundLosses < 3 && this.campaignIdx >= OPPONENTS.length - 1) {
        title = 'CAMPAIGN COMPLETE!';
        sub = 'All outlaws defeated!';
        save.campaignsWon++;
        if (save.difficulty === 2) save.campaignsWonHard++;
        // Achievement: Campaign Victor
        unlockAch(4);
        if (this.roundLosses === 0) unlockAch(10); // Perfectionist
        if (save.difficulty === 2) unlockAch(15); // Hard Mode Hero
      } else {
        sub = `Defeated at round ${this.campaignIdx + 1}`;
      }
    } else if (this.mode === GM.SURVIVAL) {
      sub = `Survived ${this.roundWins} rounds`;
    } else if (this.mode === GM.TIME_TRIAL) {
      sub = `${this.timeTrialDuels} duels in 60 seconds`;
    } else {
      sub = 'Quick Draw complete';
    }

    this.setText(doc, 'go-title', title);
    this.setText(doc, 'go-sub', sub);
    this.setText(doc, 'go-score', `${this.score}`);
    this.setText(doc, 'go-wins', `${this.roundWins}`);
    this.setText(doc, 'go-losses', `${this.roundLosses}`);

    const best = this.reactionTimes.length > 0 ? Math.min(...this.reactionTimes) : 0;
    const avg = this.reactionTimes.length > 0
      ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
      : 0;
    this.setText(doc, 'go-best', best > 0 ? `${best.toFixed(0)}ms` : '--');
    this.setText(doc, 'go-avg', avg > 0 ? `${avg.toFixed(0)}ms` : '--');

    // Grade
    let grade = 'F';
    const winRate = this.roundWins / Math.max(1, this.roundWins + this.roundLosses);
    if (winRate >= 0.95 && avg < 400) grade = 'S';
    else if (winRate >= 0.85 && avg < 500) grade = 'A';
    else if (winRate >= 0.7) grade = 'B';
    else if (winRate >= 0.5) grade = 'C';
    else if (winRate >= 0.3) grade = 'D';
    this.setText(doc, 'go-grade', grade);

    // Update play time
    save.playTimeMs += Date.now() - this.playStartTime;
    this.playStartTime = Date.now();
    writeSave();

    this.showPanel('game-over');
  }

  private goToMenu() {
    this.state = GS.MENU;
    if (this.opponentGroup) this.opponentGroup.visible = false;
    if (this.drawTextObj) this.drawTextObj.group.visible = false;
    if (this.crosshairMesh) this.crosshairMesh.visible = false;
    this.showPanel('main-menu');
    save.playTimeMs += Date.now() - this.playStartTime;
    this.playStartTime = Date.now();
    writeSave();
  }

  private checkAchievements(reaction: number) {
    if (save.wins >= 1) unlockAch(0); // First Blood
    if (this.duelAccuracy >= 0.95) unlockAch(1); // Sharpshooter
    if (reaction < 300) unlockAch(2); // Lightning Draw
    if (reaction < 200) unlockAch(3); // Quick Silver
    if (this.streak >= 5) unlockAch(5); // Streak x5
    if (this.streak >= 10) unlockAch(6); // Streak x10
    if (this.mode === GM.SURVIVAL && this.roundWins >= 10) unlockAch(7); // Survivor 10
    if (this.mode === GM.SURVIVAL && this.roundWins >= 25) unlockAch(8); // Survivor 25
    if (this.mode === GM.TIME_TRIAL && this.timeTrialDuels >= 10) unlockAch(9); // Time Lord
    if (this.mode === GM.CAMPAIGN && this.campaignIdx === 9 && this.roundWins > this.campaignIdx) unlockAch(11); // Phantom Slayer
    if (save.careerScore >= 10000) unlockAch(12); // Score 10K
    if (save.careerScore >= 50000) unlockAch(13); // Score 50K
    if (save.totalDuels >= 100) unlockAch(14); // Duel Master
    if (this.duelAccuracy >= 0.99) unlockAch(16); // Bullseye
    const avgReaction = save.wins > 0 ? save.totalReaction / save.wins : Infinity;
    if (avgReaction < 400 && save.wins >= 10) unlockAch(17); // Speed Demon
    if (this.standoffDuration >= 4000) unlockAch(18); // Iron Nerves
    if (this.mode === GM.SURVIVAL && this.sessionStreak >= 20) unlockAch(19); // Untouchable

    // Show notification for newly unlocked
    for (let i = 0; i < 20; i++) {
      if (save.achievements[i] && !this._prevAch?.[i]) {
        this.showAchNotify(`ACHIEVEMENT: ${ACH_NAMES[i].split(' - ')[0]}`);
        break;
      }
    }
    this._prevAch = [...save.achievements];
  }
  private _prevAch: boolean[] = [...save.achievements];

  // ── Update loop ──────────────────────────────────────────────────────────

  update(delta: number, _time: number) {
    const world = this.world as unknown as World;
    const dt = delta;
    this.stateTimer += dt;

    // ── Flash decay ──
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashMesh) {
        const mat = this.flashMesh.material as MeshBasicMaterial;
        mat.opacity = Math.max(0, this.flashTimer / 0.2 * 0.6);
      }
    }

    // ── Achievement notification decay ──
    if (this.achNotifyTimer > 0) {
      this.achNotifyTimer -= dt;
      if (this.achNotifyTimer <= 0 && this.achNotifyGroup) {
        this.achNotifyGroup.visible = false;
      }
    }

    // ── Tumbleweeds ──
    this.tumbleweeds.forEach(tw => {
      tw.group.position.x += tw.vel.x * dt;
      tw.group.position.z += tw.vel.z * dt;
      tw.group.rotation.x += tw.spin.x * dt;
      tw.group.rotation.z += tw.spin.z * dt;
      if (tw.group.position.x > 25) tw.group.position.x = -25;
      if (tw.group.position.x < -25) tw.group.position.x = 25;
    });

    // ── Dust ──
    this.dustParticles.forEach(p => {
      p.position.y = p.userData.baseY + Math.sin(_time * p.userData.speed + p.userData.drift) * 0.3;
      p.position.x += 0.1 * dt;
      if (p.position.x > 15) p.position.x = -15;
    });

    // ── Ambient motes ──
    this.ambientMotes.forEach(m => {
      m.position.y += Math.sin(_time * 0.5 + m.userData.phase) * 0.002;
    });

    // ── Muzzle flash decay ──
    if (this.muzzleFlash?.visible) {
      this.muzzleFlash.children.forEach(c => {
        const mat = (c as Mesh).material as MeshBasicMaterial;
        mat.opacity -= dt * 4;
        if (mat.opacity <= 0) this.muzzleFlash!.visible = false;
      });
    }
    if (this.playerMuzzle?.visible) {
      this.playerMuzzle.children.forEach(c => {
        const mat = (c as Mesh).material as MeshBasicMaterial;
        mat.opacity -= dt * 4;
        if (mat.opacity <= 0) this.playerMuzzle!.visible = false;
      });
    }

    // ── Impact particles ──
    if (this.impactParticles?.visible) {
      let allDone = true;
      this.impactParticles.children.forEach(c => {
        const p = c as Mesh;
        const vel = p.userData.vel as Vector3;
        p.position.x += vel.x * dt;
        p.position.y += vel.y * dt;
        p.position.z += vel.z * dt;
        vel.y -= 9.8 * dt;
        const mat = (p as Mesh).material as MeshBasicMaterial;
        mat.opacity -= dt * 1.5;
        if (mat.opacity > 0) allDone = false;
      });
      if (allDone) this.impactParticles.visible = false;
    }

    // ── State machine ──
    if (this.state === GS.PRE_DUEL) {
      // Brief pause before standoff
      if (this.stateTimer > 1.5) {
        this.state = GS.STANDOFF;
        this.standoffTime = 0;
        this.stateTimer = 0;
        playSFX('tension');
      }
    } else if (this.state === GS.STANDOFF) {
      this.standoffTime += dt * 1000;
      this.tensionTimer += dt;

      // Tension heartbeat
      if (this.tensionTimer > 1.5) {
        this.tensionTimer = 0;
        playSFX('tension');
      }

      // Opponent subtle sway
      if (this.opponentModel) {
        this.opponentModel.rotation.y = Math.sin(_time * 0.5) * 0.02;
      }

      if (this.standoffTime >= this.standoffDuration) {
        // DRAW!
        this.state = GS.DRAW;
        this.drawSignalTime = performance.now();
        this.stateTimer = 0;

        if (this.drawTextObj) {
          updateDrawText(this.drawTextObj.canvas, this.drawTextObj.texture, 'DRAW!', '#ff4400');
          this.drawTextObj.group.visible = true;
        }
        if (this.crosshairMesh) this.crosshairMesh.visible = true;

        playSFX('draw');
        this.flash(0xff6600, 0.08);
      }

      // Handle premature shot (foul)
      if (this.mouseClicked) {
        this.mouseClicked = false;
        // Fired too early - penalty
        playSFX('gunshot');
        playSFX('lose', 0.5);
        this.flash(0xff0000, 0.3);
        this.handleLoss('JUMPED THE GUN!');
      }

      // VR trigger check
      const rightGP = world.input.xr?.gamepads?.right;
      if (rightGP?.getButtonDown(InputComponent.Trigger)) {
        playSFX('gunshot');
        playSFX('lose', 0.5);
        this.flash(0xff0000, 0.3);
        this.handleLoss('JUMPED THE GUN!');
      }
    } else if (this.state === GS.DRAW) {
      // Waiting for player to shoot
      const elapsed = performance.now() - this.drawSignalTime;
      const oppDrawSpeed = this.getAdjustedDrawSpeed();

      // Opponent draw animation
      if (!this.opponentGunUp && elapsed > oppDrawSpeed * 0.6) {
        this.opponentGunUp = true;
        // Animate arm up
        if (this.opponentModel) {
          const arm = this.opponentModel.getObjectByName('rightArm');
          if (arm) {
            arm.rotation.z = -1.2;
            arm.position.set(0.35, 1.1, 0.15);
          }
          const gun = this.opponentModel.getObjectByName('gun');
          if (gun) {
            gun.position.set(0.35, 1.2, 0.2);
            gun.rotation.x = 0;
          }
        }
      }

      // Opponent shoots if player is too slow
      if (!this.playerShot && elapsed > oppDrawSpeed) {
        // Opponent fires first
        if (this.muzzleFlash && this.opponentModel) {
          this.muzzleFlash.visible = true;
          this.muzzleFlash.position.set(0, 1.3, -11.5);
          this.muzzleFlash.children.forEach(c => {
            (c as Mesh).material = new MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });
          });
        }
        playSFX('gunshot', 0.7);
        this.duelReaction = elapsed;
        this.handleLoss('TOO SLOW!');
      }

      // Update crosshair position
      if (this.crosshairMesh?.visible) {
        this.raycaster.setFromCamera(this.mouseNDC, world.camera);
        const point = new Vector3();
        this.raycaster.ray.at(12, point);
        this.crosshairMesh.position.copy(point);
      }

      // Pulsing DRAW text
      if (this.drawTextObj?.group.visible) {
        const scale = 1 + Math.sin(_time * 15) * 0.1;
        this.drawTextObj.group.scale.set(scale, scale, scale);
      }

      // Player input
      if (this.mouseClicked && !this.playerShot) {
        this.mouseClicked = false;
        this.handleShot();
      }

      // VR trigger
      const rGP = world.input.xr?.gamepads?.right;
      if (rGP?.getButtonDown(InputComponent.Trigger) && !this.playerShot) {
        this.handleShot();
      }
    } else if (this.state === GS.RESULT) {
      // Auto-hide draw text
      if (this.drawTextObj) this.drawTextObj.group.visible = false;
      if (this.crosshairMesh) this.crosshairMesh.visible = false;

      // Time trial: auto-advance after short delay
      if (this.mode === GM.TIME_TRIAL) {
        this.timeTrialRemaining -= dt;
        const hudDoc = this.panelDocs['hud'];
        if (hudDoc) this.setText(hudDoc, 'timer-label', `${Math.ceil(Math.max(0, this.timeTrialRemaining))}`);
      }
    }

    // Clear mouse click at end of frame
    this.mouseClicked = false;
  }
}
