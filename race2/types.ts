
export enum Archetype {
  Predator = 'Predator',
  Strategist = 'Strategist',
  ChaosAgent = 'Chaos Agent',
  Loyalist = 'Loyalist'
}

export type EmotionalState = 'Confident' | 'Furious' | 'Desperate' | 'Calculating' | 'Fearful' | 'Vengeful' | 'Smug';

export interface Player {
  name: string;
  reputation: number;
  fear: number;
  respect: number;
  money: number;
  health: number;
  speed: number;
  z: number;
  x: number;
  maxSpeed: number;
  acceleration: number;
  combatPower: number;
  upgrades: {
    speed: number;
    accel: number;
    combat: number;
  };
  attacking?: boolean;
  attackType?: string;
  attackCooldown?: number;
}

export interface Opponent {
  id: string;
  name: string;
  color: string;
  difficulty: number;
  x: number;
  z: number;
  speed: number;
  maxSpeed: number;
  health: number;
  state: 'racing' | 'attacking' | 'down' | 'recovering';
  stateTimer: number;
  targetX: number;
  attacking: boolean;
  attackType: string;
  archetype: Archetype;
}

export interface TrafficVehicle {
  id: string;
  type: 'sedan' | 'truck' | 'sports';
  x: number;
  z: number;
  speed: number;
  color: string;
  width: number;
}

export interface Obstacle {
  id: string;
  type: 'oil' | 'rock' | 'cone' | 'pothole';
  x: number;
  z: number;
  active: boolean;
}

export interface SceneryObject {
  type: 'tree' | 'billboard' | 'streetlight' | 'building';
  x: number; // Offset from road center (-2 to 2 typically)
  z: number;
  scale: number;
  color?: string;
}

export interface RoadSegment {
  index: number;
  z: number;
  y: number;
  curve: number;
  p1: { world: { x: number; y: number; z: number }; screen: { x: number; y: number; w: number; z: number; scale: number } };
  p2: { world: { x: number; y: number; z: number }; screen: { x: number; y: number; w: number; z: number; scale: number } };
  color: { road: string; grass: string; rumble: string; lane: string };
  scenery: SceneryObject[];
}

export interface Bounty {
  id: string;
  initiatorId: string;
  targetId: string;
  amount: number;
  visibility: 'public' | 'secret';
  condition: 'crash' | 'block' | 'finishBelow';
  acceptedBy: string[];
  status: 'active' | 'complete' | 'failed';
}

export interface EventLogEntry {
  type: string;
  actor: string;
  target?: string;
  tick: number;
  description?: string;
}

export interface RaceState {
  lap: number;
  positions: string[];
  heatLevel: number;
  eventLog: EventLogEntry[];
  activeBounties: Bounty[];
  allianceMap: Record<string, boolean>;
}

export type GamePhase = 'title' | 'raceIntro' | 'racing' | 'raceEnd' | 'shop' | 'gameOver' | 'victory';
