/** PlayerEntityRenderer - Renders and animates voxel-based player characters **/
import * as THREE from "three";

/**
 * PlayerEntityRenderer - Handles rendering and animation of voxel player characters
 *
 * This class creates a voxel-based humanoid character with procedural animation
 * for walking, turning, and jumping. It manages the visual representation and
 * smooth interpolation of player movement.
 */
export default class PlayerEntityRenderer {
  // === Voxel Mesh ===
  public group: THREE.Group;
  public head: THREE.Mesh;
  public torso: THREE.Mesh;
  public leftArm: THREE.Mesh;
  public rightArm: THREE.Mesh;
  public leftLeg: THREE.Mesh;
  public rightLeg: THREE.Mesh;
  public label: THREE.Sprite;

  // === State for Interpolation & Responsiveness ===
  public targetPosition: THREE.Vector3; // Received from server
  public targetRotation: THREE.Euler; // Received from server

  // === Ground State Tracking ===
  private isGrounded: boolean = false; // Ground state detection
  private lastGroundY: number; // For jump detection
  private positionStableTime: number = 0; // Track Y-position stability
  private isJumping: boolean = false;

  // === Animation Properties ===
  private walkTime: number = 0; // Timer for leg/arm swing cycle

  constructor(username: string, initialPosition: THREE.Vector3) {
    // Initialize body part references (will be set in buildVoxelCharacter)
    // These MUST be initialized before buildVoxelCharacter is called
    this.head = new THREE.Mesh();
    this.torso = new THREE.Mesh();
    this.leftArm = new THREE.Mesh();
    this.rightArm = new THREE.Mesh();
    this.leftLeg = new THREE.Mesh();
    this.rightLeg = new THREE.Mesh();
    this.label = new THREE.Sprite();

    // Initialize target state
    this.targetPosition = initialPosition.clone();
    this.targetRotation = new THREE.Euler(0, 0, 0);

    // Initialize ground state tracking
    this.lastGroundY = initialPosition.y;

    // Build the voxel character (this will set the body part references)
    this.group = this.buildVoxelCharacter(username);
    this.group.position.copy(initialPosition);
  }

  /**
   * Update method with smooth interpolation for position and rotation
   */
  public update(deltaTime: number): void {
    // Always interpolate rotation smoothly
    const lerpFactor = Math.min(deltaTime * 10, 1.0);
    this.group.rotation.y = THREE.MathUtils.lerp(
      this.group.rotation.y,
      this.targetRotation.y,
      lerpFactor
    );

    // Always interpolate position smoothly (XZ only, Y is handled externally)
    const positionLerpFactor = Math.min(deltaTime * 12, 1.0);
    this.group.position.x = THREE.MathUtils.lerp(
      this.group.position.x,
      this.targetPosition.x,
      positionLerpFactor
    );
    this.group.position.z = THREE.MathUtils.lerp(
      this.group.position.z,
      this.targetPosition.z,
      positionLerpFactor
    );

    // Calculate if player is moving (for animation)
    const currentXZ = new THREE.Vector2(
      this.group.position.x,
      this.group.position.z
    );
    const targetXZ = new THREE.Vector2(
      this.targetPosition.x,
      this.targetPosition.z
    );
    const distance = currentXZ.distanceTo(targetXZ);
    const positionChanged = distance > 0.05; // Increased threshold for more reliable detection

    // Step C: Detect Ground State (position stable for 0.2s)
    const yPositionChange = Math.abs(this.targetPosition.y - this.lastGroundY);
    if (yPositionChange < 0.01) {
      this.positionStableTime += deltaTime;
      if (this.positionStableTime > 0.2) {
        this.isGrounded = true;
        this.lastGroundY = this.targetPosition.y;
      }
    } else {
      this.positionStableTime = 0;
      this.isGrounded = false;
    }

    // Step D: Detect Jump
    if (this.isGrounded && this.targetPosition.y > this.lastGroundY + 0.5) {
      this.isJumping = true;
    } else if (this.isGrounded) {
      this.isJumping = false;
    }

    // Apply animations based on movement state
    this.applyAnimations(deltaTime, positionChanged);
  }

  /**
   * Apply walking or idle animations based on movement state
   */
  private applyAnimations(deltaTime: number, isMoving: boolean): void {
    // Jump animation takes priority over walk/idle
    if (this.isJumping) {
      // Jump animation: arms slightly tucked, legs straight
      this.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.leftArm.rotation.x,
        -0.3,
        0.1
      );
      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        -0.3,
        0.1
      );
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.head.position.y = 1.6;
      return; // Skip walk/idle animations
    }

    if (isMoving) {
      // Walking animation: sinusoidal arm and leg swing
      // Increment walkTime by deltaTime * 10
      this.walkTime += deltaTime * 10;

      // Apply arm swing: leftArm.rotation.x = Math.sin(walkTime) * 0.8
      this.leftArm.rotation.x = Math.sin(this.walkTime) * 0.8;

      // Apply opposite arm swing: rightArm.rotation.x = Math.sin(walkTime + Math.PI) * 0.8
      this.rightArm.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;

      // Apply leg swing: leftLeg.rotation.x = Math.sin(walkTime + Math.PI) * 0.8
      this.leftLeg.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;

      // Apply opposite leg swing: rightLeg.rotation.x = Math.sin(walkTime) * 0.8
      this.rightLeg.rotation.x = Math.sin(this.walkTime) * 0.8;

      // Apply head bob: head.position.y = 1.6 + Math.abs(Math.sin(walkTime * 0.5)) * 0.1
      this.head.position.y =
        1.6 + Math.abs(Math.sin(this.walkTime * 0.5)) * 0.1;
    } else {
      // Idle animation: return to rest position
      // DON'T reset walkTime - keep it so animation continues from same phase
      // This prevents the "same leg forward" issue when stopping and starting

      // Lerp leftArm.rotation.x toward 0 with factor 0.1
      this.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.leftArm.rotation.x,
        0,
        0.1
      );

      // Lerp rightArm.rotation.x toward 0 with factor 0.1
      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        0,
        0.1
      );

      // Lerp leftLeg.rotation.x toward 0 with factor 0.1
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(
        this.leftLeg.rotation.x,
        0,
        0.1
      );

      // Lerp rightLeg.rotation.x toward 0 with factor 0.1
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(
        this.rightLeg.rotation.x,
        0,
        0.1
      );

      // Set head.position.y to 1.6 (rest position)
      this.head.position.y = 1.6;
    }
  }

  /**
   * Build the voxel character structure
   */
  private buildVoxelCharacter(username: string): THREE.Group {
    const group = new THREE.Group();
    const color = this.hashStringToColor(username);
    const material = new THREE.MeshStandardMaterial({ color });

    // Torso (main body) - 0.6x1.2x0.4 units at position (0, 1.2, 0)
    const torsoGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.4);
    this.torso = new THREE.Mesh(torsoGeometry, material);
    this.torso.position.set(0, 1.2, 0);
    group.add(this.torso);

    // Head - 0.5x0.5x0.5 units at position (0, 1.6, 0)
    const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.head = new THREE.Mesh(headGeometry, material);
    this.head.position.set(0, 1.6, 0);
    group.add(this.head);

    // Left Arm - 0.3x0.8x0.3 units at position (-0.4, 1.2, 0)
    // Pivot at shoulder (top)
    const armGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    this.leftArm = new THREE.Mesh(armGeometry.clone(), material);
    this.leftArm.position.set(-0.4, 1.2, 0);
    this.leftArm.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.leftArm);

    // Right Arm - 0.3x0.8x0.3 units at position (0.4, 1.2, 0)
    // Pivot at shoulder (top)
    this.rightArm = new THREE.Mesh(armGeometry.clone(), material);
    this.rightArm.position.set(0.4, 1.2, 0);
    this.rightArm.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.rightArm);

    // Left Leg - 0.3x0.8x0.3 units at position (-0.2, 0.6, 0)
    // Pivot at hip (top)
    const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    this.leftLeg = new THREE.Mesh(legGeometry.clone(), material);
    this.leftLeg.position.set(-0.2, 0.6, 0);
    this.leftLeg.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.leftLeg);

    // Right Leg - 0.3x0.8x0.3 units at position (0.2, 0.6, 0)
    // Pivot at hip (top)
    this.rightLeg = new THREE.Mesh(legGeometry.clone(), material);
    this.rightLeg.position.set(0.2, 0.6, 0);
    this.rightLeg.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.rightLeg);

    // Username label
    this.label = this.createUsernameLabel(username);
    group.add(this.label);

    return group;
  }

  /**
   * Create a username label sprite
   */
  private createUsernameLabel(username: string): THREE.Sprite {
    // Create canvas element (256x64 pixels)
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 64;

    // Draw semi-transparent black background (rgba(0, 0, 0, 0.6))
    context.fillStyle = "rgba(0, 0, 0, 0.6)";
    context.fillRect(0, 0, 256, 64);

    // Draw username text in white, bold 32px Arial, centered
    context.fillStyle = "white";
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(username, 128, 32);

    // Create THREE.CanvasTexture from canvas
    const texture = new THREE.CanvasTexture(canvas);

    // Create THREE.Sprite with texture
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);

    // Scale sprite to 2x0.5 units
    sprite.scale.set(2, 0.5, 1);

    // Position sprite at y=2.5 (above head)
    sprite.position.y = 2.5;

    return sprite;
  }

  /**
   * Set target state for interpolation
   */
  public setTargetState(position: THREE.Vector3, rotation: THREE.Euler): void {
    this.targetPosition.copy(position);
    this.targetRotation.copy(rotation);
  }

  /**
   * Generate consistent color from username
   */
  private hashStringToColor(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash & 0x00ffffff;
  }
}
