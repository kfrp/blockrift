import * as THREE from "three";
import stone from "../assets/textures/block/stone.png";
import coal_ore from "../assets/textures/block/coal_ore.png";
import iron_ore from "../assets/textures/block/iron_ore.png";
import grass_side from "../assets/textures/grass.png";
import grass_top_green from "../assets/textures/block/lime_concrete_powder.png";
import dirt from "../assets/textures/block/coarse_dirt.png";
import oak_log from "../assets/textures/block/stripped_oak_log.png";
import oak_log_top from "../assets/textures/block/oak_log_top.png";
import oak_leaves from "../assets/textures/block/flowering_azalea_leaves.png";
import sand from "../assets/textures/block/suspicious_sand_0.png";
// import water from '../../assets/textures/block/water.png'
import oak_wood from "../assets/textures/block/mangrove_planks.png";
import diamond from "../assets/textures/block/deepslate_diamond_ore.png";
import quartz from "../assets/textures/block/quartz_bricks.png";
import glass from "../assets/textures/block/light_gray_stained_glass.png";
import bedrock from "../assets/textures/block/bedrock.png";

export enum MaterialType {
  grass = "grass",
  dirt = "dirt",
  tree = "tree",
  leaf = "leaf",
  sand = "sand",
  // water = 'water',
  stone = "stone",
  coal = "coal",
  wood = "wood",
  diamond = "diamond",
  quartz = "quartz",
  glass = "glass",
  bedrock = "bedrock",
}
let loader = new THREE.TextureLoader();

// load texture
const grassTopMaterial = loader.load(grass_top_green);
const grassMaterial = loader.load(grass_side);
const treeMaterial = loader.load(oak_log);
const treeTopMaterial = loader.load(oak_log_top);
const dirtMaterial = loader.load(dirt);
const stoneMaterial = loader.load(stone);
const coalMaterial = loader.load(coal_ore);
const ironMaterial = loader.load(iron_ore);
const leafMaterial = loader.load(oak_leaves);
const sandMaterial = loader.load(sand);
// const waterMaterial = loader.load(water)
const woodMaterial = loader.load(oak_wood);
const diamondMaterial = loader.load(diamond);
const quartzMaterial = loader.load(quartz);
const glassMaterial = loader.load(glass);
const bedrockMaterial = loader.load(bedrock);

// pixelate texture
grassTopMaterial.magFilter = THREE.NearestFilter;
grassMaterial.magFilter = THREE.NearestFilter;
treeMaterial.magFilter = THREE.NearestFilter;
treeTopMaterial.magFilter = THREE.NearestFilter;
dirtMaterial.magFilter = THREE.NearestFilter;
stoneMaterial.magFilter = THREE.NearestFilter;
coalMaterial.magFilter = THREE.NearestFilter;
ironMaterial.magFilter = THREE.NearestFilter;
leafMaterial.magFilter = THREE.NearestFilter;
sandMaterial.magFilter = THREE.NearestFilter;
// waterMaterial.magFilter = THREE.NearestFilter
woodMaterial.magFilter = THREE.NearestFilter;
diamondMaterial.magFilter = THREE.NearestFilter;
quartzMaterial.magFilter = THREE.NearestFilter;
glassMaterial.magFilter = THREE.NearestFilter;
bedrockMaterial.magFilter = THREE.NearestFilter;

export default class Materials {
  materials = {
    grass: [
      new THREE.MeshStandardMaterial({ map: grassMaterial }),
      new THREE.MeshStandardMaterial({ map: grassMaterial }),
      new THREE.MeshStandardMaterial({
        map: grassTopMaterial,
      }),
      new THREE.MeshStandardMaterial({ map: dirtMaterial }),
      new THREE.MeshStandardMaterial({ map: grassMaterial }),
      new THREE.MeshStandardMaterial({ map: grassMaterial }),
    ],
    dirt: new THREE.MeshStandardMaterial({ map: dirtMaterial }),
    sand: new THREE.MeshStandardMaterial({ map: sandMaterial }),
    tree: [
      new THREE.MeshStandardMaterial({ map: treeMaterial }),
      new THREE.MeshStandardMaterial({ map: treeMaterial }),
      new THREE.MeshStandardMaterial({ map: treeTopMaterial }),
      new THREE.MeshStandardMaterial({ map: treeTopMaterial }),
      new THREE.MeshStandardMaterial({ map: treeMaterial }),
      new THREE.MeshStandardMaterial({ map: treeMaterial }),
    ],
    leaf: new THREE.MeshStandardMaterial({
      map: leafMaterial,
      //      color: new THREE.Color(0, 1, 0),
      transparent: true,
    }),
    // water: new THREE.MeshStandardMaterial({
    //   map: waterMaterial,
    //   transparent: true,
    //   opacity: 0.7
    // }),
    stone: new THREE.MeshStandardMaterial({ map: stoneMaterial }),
    coal: new THREE.MeshStandardMaterial({ map: coalMaterial }),
    wood: new THREE.MeshStandardMaterial({ map: woodMaterial }),
    diamond: new THREE.MeshStandardMaterial({ map: diamondMaterial }),
    quartz: new THREE.MeshStandardMaterial({ map: quartzMaterial }),
    glass: new THREE.MeshStandardMaterial({
      map: glassMaterial,
      transparent: true,
      opacity: 0.7,
    }),
    bedrock: new THREE.MeshStandardMaterial({ map: bedrockMaterial }),
  };

  get = (
    type: MaterialType
  ): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] => {
    return this.materials[type];
  };
}
