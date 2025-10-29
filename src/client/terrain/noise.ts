import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js";
// import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise'

export default class Noise {
  noise = new ImprovedNoise();
  seed: number;
  gap = 24;
  amp = 6;

  stoneSeed: number;
  stoneGap = 12;
  stoneAmp = 8;
  stoneThreshold = 3.5;

  coalSeed: number;
  coalGap = 3;
  coalAmp = 8;
  coalThreshold = 3;

  treeSeed: number;
  treeGap = 2;
  treeAmp = 6;
  treeHeight = 10;
  treeThreshold = 4;

  leafSeed: number;
  leafGap = 2;
  leafAmp = 5;
  leafThreshold = -0.03;

  constructor(seed: number) {
    // Seed is required - must come from server
    this.seed = seed;

    // Derive all other seeds from the main seed
    this.stoneSeed = this.seed * 0.4;
    this.coalSeed = this.seed * 0.5;
    this.treeSeed = this.seed * 0.7;
    this.leafSeed = this.seed * 0.8;
  }

  get = (x: number, y: number, z: number) => {
    return this.noise.noise(x, y, z);
  };
}
