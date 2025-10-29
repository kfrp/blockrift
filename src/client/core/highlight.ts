// [highlight.ts] - REFACTORED

import * as THREE from "three";
import Terrain from "../terrain";

/**
 * BlockHighlight - Handles the visual highlight of the block under the crosshair. It raycasts directly against the actual, rendered terrain meshes.
 */
export default class BlockHighlight {
  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    terrain: Terrain
  ) {
    this.camera = camera;
    this.scene = scene;
    this.terrain = terrain;

    // Raycaster for detecting which block is under crosshair
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 8; // Maximum reach distance (same as control.ts)
  }

  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrain: Terrain;
  raycaster: THREE.Raycaster;
  block: THREE.Intersection | null = null; // Currently highlighted block

  // The actual visible highlight box rendered in the scene
  geometry = new THREE.BoxGeometry(1.01, 1.01, 1.01); // Slightly larger
  material = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0.25,
  });
  mesh = new THREE.Mesh(this.geometry, this.material);

  /**
   * Update highlight every frame.
   * This is now much simpler and more efficient.
   */
  update() {
    // Always remove the previous highlight from the scene.
    this.scene.remove(this.mesh);

    // Raycast from the center of the screen against the ACTUAL terrain blocks.
    this.raycaster.setFromCamera({ x: 0, y: 0 } as THREE.Vector2, this.camera);

    // Intersect against the array of all block meshes in the terrain.
    // This is the single source of truth for the rendered world.
    // Pass recursive=false since blocks array contains InstancedMesh objects (not groups)
    // Pass intersectTransparent=true to detect glass blocks
    const intersections = this.raycaster.intersectObjects(
      this.terrain.blocks,
      false
    );
    this.block = intersections[0] || null;

    // If we hit a block, create and position the highlight mesh.
    if (
      this.block &&
      this.block.object instanceof THREE.InstancedMesh &&
      typeof this.block.instanceId === "number"
    ) {
      // Get the position of the hit block instance.
      let matrix = new THREE.Matrix4();
      this.block.object.getMatrixAt(this.block.instanceId, matrix);
      const position = new THREE.Vector3().setFromMatrixPosition(matrix);

      // Position the highlight mesh at the block's location.
      this.mesh.position.set(position.x, position.y, position.z);
      this.scene.add(this.mesh);
    }
  }
}
