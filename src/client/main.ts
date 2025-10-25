import Core from "./core";
import Control from "./control";
import Player from "./player";
import Terrain from "./terrain";
import UI from "./ui";
import Audio from "./ui/audio";
import { testRealtime } from "./realtime-test";

console.log(testRealtime);
const core = new Core();
const camera = core.camera;
const scene = core.scene;
const renderer = core.renderer;

const player = new Player();
const audio = new Audio(camera);

const terrain = new Terrain(scene, camera);
const control = new Control(scene, camera, player, terrain, audio);

new UI(terrain, control);

// animation
(function animate() {
  // let p1 = performance.now()
  requestAnimationFrame(animate);

  control.update();
  terrain.update();

  renderer.render(scene, camera);
  // console.log(performance.now()-p1)
})();
