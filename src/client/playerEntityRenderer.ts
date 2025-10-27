/** PlayerEntityRenderer - Renders and animates voxel-based player characters **/
import * as THREE from "three";
import { Rotation } from "./multiplayer";

/**
 * PlayerColors - Defines the configurable colors for a player character
 */
export interface PlayerColors {
  hair: THREE.Color | string | number;
  skin: THREE.Color | string | number;
  shirt: THREE.Color | string | number;
  shorts: THREE.Color | string | number;
}

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
  public head: THREE.Group; // Changed to Group to include hair and eyes
  public torso: THREE.Mesh;
  public leftArm: THREE.Group; // Changed to Group for sleeved arms
  public rightArm: THREE.Group; // Changed to Group for sleeved arms
  public leftLeg: THREE.Group; // Changed to Group for shorts
  public rightLeg: THREE.Group; // Changed to Group for shorts
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
  private headBaseY: number = 1.7; // Base Y position for the head for animations

  constructor(
    username: string,
    initialPosition: THREE.Vector3,
    colors?: Partial<PlayerColors>
  ) {
    // Generate a random skin tone between light and dark
    const skinHue = 0.07 + Math.random() * 0.03; // ~25-36 degrees
    const skinSaturation = 0.6 + Math.random() * 0.3; // 0.6 - 0.9
    const skinLightness = 0.5 + Math.random() * 0.3; // 0.5 - 0.8
    const randomSkinColor = new THREE.Color().setHSL(
      skinHue,
      skinSaturation,
      skinLightness
    );

    // Generate a random natural hair color (from black to blond via red/brown)
    const hairHue = Math.random() * 0.1; // Range from red (0) to orange-yellow (0.1)
    const hairSaturation = 0.5 + Math.random() * 0.4; // Saturation from 0.5 to 0.9 for richness
    const hairLightness = 0.2 + Math.random() * 0.6; // Lightness from dark (0.2) to light (0.8)
    const randomHairColor = new THREE.Color().setHSL(
      hairHue,
      hairSaturation,
      hairLightness
    );

    // Define default colors with randomization
    const finalColors: PlayerColors = {
      hair: randomHairColor,
      skin: randomSkinColor,
      shirt: new THREE.Color().setHSL(Math.random(), 0.8, 0.6), // Random vibrant color
      shorts: new THREE.Color().setHSL(Math.random(), 0.8, 0.5), // Random vibrant color
      ...colors,
    };

    // Initialize body part references
    this.head = new THREE.Group();
    this.torso = new THREE.Mesh();
    this.leftArm = new THREE.Group();
    this.rightArm = new THREE.Group();
    this.leftLeg = new THREE.Group();
    this.rightLeg = new THREE.Group();
    this.label = new THREE.Sprite();

    // Initialize target state
    this.targetPosition = initialPosition.clone();
    this.targetRotation = new THREE.Euler(0, 0, 0);

    // Initialize ground state tracking
    this.lastGroundY = initialPosition.y;

    // Build the voxel character
    this.group = this.buildVoxelCharacter(username, finalColors);
    this.group.position.copy(initialPosition);
  }

  /**
   * Update method with smooth interpolation for position and rotation
   */
  public update(deltaTime: number): void {
    // Always interpolate rotation smoothly
    const lerpFactor = Math.min(deltaTime * 10, 1.0);

    // Handle angle wrapping: ensure target is within ±π of current angle
    let targetY = this.targetRotation.y;
    let currentY = this.group.rotation.y;
    let diff = targetY - currentY;

    // Normalize the difference to [-π, π]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    // Interpolate using the normalized difference
    this.group.rotation.y = currentY + diff * lerpFactor;

    // Always interpolate position smoothly
    const positionLerpFactor = Math.min(deltaTime * 12, 1.0);
    this.group.position.x = THREE.MathUtils.lerp(
      this.group.position.x,
      this.targetPosition.x,
      positionLerpFactor
    );
    this.group.position.y = THREE.MathUtils.lerp(
      this.group.position.y,
      this.targetPosition.y,
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
    const positionChanged = distance > 0.05;

    // Detect Ground State
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

    // Detect Jump
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
    if (this.isJumping) {
      // Jump animation
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
      this.head.position.y = this.headBaseY;
      return;
    }

    if (isMoving) {
      // Walking animation
      this.walkTime += deltaTime * 10;
      const swingAngle = Math.sin(this.walkTime) * 0.8;
      this.leftArm.rotation.x = swingAngle;
      this.rightArm.rotation.x = -swingAngle;
      this.leftLeg.rotation.x = -swingAngle;
      this.rightLeg.rotation.x = swingAngle;

      // Head bob
      this.head.position.y =
        this.headBaseY + Math.abs(Math.sin(this.walkTime * 0.5)) * 0.08;
    } else {
      // Idle animation: return to rest
      this.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.leftArm.rotation.x,
        0,
        0.1
      );
      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        0,
        0.1
      );
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(
        this.leftLeg.rotation.x,
        0,
        0.1
      );
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(
        this.rightLeg.rotation.x,
        0,
        0.1
      );

      // Reset head position
      this.head.position.y = THREE.MathUtils.lerp(
        this.head.position.y,
        this.headBaseY,
        0.1
      );
    }
  }

  /**
   * Build the voxel character structure with distinct parts and colors
   */
  private buildVoxelCharacter(
    username: string,
    colors: PlayerColors
  ): THREE.Group {
    const group = new THREE.Group();

    // Create materials from the color configuration
    const skinMaterial = new THREE.MeshStandardMaterial({ color: colors.skin });
    const shirtMaterial = new THREE.MeshStandardMaterial({
      color: colors.shirt,
    });
    const shortsMaterial = new THREE.MeshStandardMaterial({
      color: colors.shorts,
    });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: colors.hair });
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x00a0a0 });

    // Torso (Shirt)
    const torsoGeometry = new THREE.BoxGeometry(0.7, 0.6, 0.35);
    this.torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
    this.torso.position.set(0, 1.1, 0); // Positioned above legs
    group.add(this.torso);

    // Head Group (Head, Hair, Eyes)
    this.head = new THREE.Group();
    this.head.position.set(0, this.headBaseY, 0); // Base position for animations

    const headBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      skinMaterial
    );
    this.head.add(headBlock);

    // Hair
    const mainHair = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.25, 0.65),
      hairMaterial
    );
    mainHair.position.y = 0.3; // On top of head
    this.head.add(mainHair);
    const frontHair = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.15, 0.1),
      hairMaterial
    );
    // Position on the front of the face (+Z)
    frontHair.position.set(0, 0.2, 0.28);
    this.head.add(frontHair);

    // Eyes
    const eyeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.05);
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    // Position on the front of the face (+Z)
    leftEye.position.set(-0.15, 0.05, 0.3);
    this.head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    // Position on the front of the face (+Z)
    rightEye.position.set(0.15, 0.05, 0.3);
    this.head.add(rightEye);
    group.add(this.head);

    // Arms (Sleeved)
    const armPivotY = 1.4; // Shoulder height
    const armX = 0.475; // Distance from center
    this.leftArm = this.createArm(shirtMaterial, skinMaterial);
    this.leftArm.position.set(-armX, armPivotY, 0);
    group.add(this.leftArm);
    this.rightArm = this.createArm(shirtMaterial, skinMaterial);
    this.rightArm.position.set(armX, armPivotY, 0);
    group.add(this.rightArm);

    // Legs (with Shorts)
    const legPivotY = 0.8; // Hip height
    const legX = 0.18; // Distance from center
    this.leftLeg = this.createLeg(shortsMaterial, skinMaterial);
    this.leftLeg.position.set(-legX, legPivotY, 0);
    group.add(this.leftLeg);
    this.rightLeg = this.createLeg(shortsMaterial, skinMaterial);
    this.rightLeg.position.set(legX, legPivotY, 0);
    group.add(this.rightLeg);

    // Username label
    this.label = this.createUsernameLabel(username);
    group.add(this.label);

    return group;
  }

  /** Helper method to create a sleeved arm */
  private createArm(
    sleeveMaterial: THREE.Material,
    skinMaterial: THREE.Material
  ): THREE.Group {
    const armGroup = new THREE.Group();
    const upperArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.3, 0.25),
      sleeveMaterial
    );
    upperArm.position.y = -0.15;
    const lowerArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.3, 0.25),
      skinMaterial
    );
    lowerArm.position.y = -0.45;
    armGroup.add(upperArm);
    armGroup.add(lowerArm);
    return armGroup;
  }

  /** Helper method to create a leg with shorts */
  private createLeg(
    shortsMaterial: THREE.Material,
    skinMaterial: THREE.Material
  ): THREE.Group {
    const legGroup = new THREE.Group();
    const upperLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.4, 0.25),
      shortsMaterial
    );
    upperLeg.position.y = -0.2;
    const lowerLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.4, 0.25),
      skinMaterial
    );
    lowerLeg.position.y = -0.6;
    legGroup.add(upperLeg);
    legGroup.add(lowerLeg);
    return legGroup;
  }

  /**
   * Create a username label sprite
   */
  private createUsernameLabel(username: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 64;
    context.fillStyle = "rgba(0, 0, 0, 0.6)";
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = "white";
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(username, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = 2.5; // Positioned above head
    return sprite;
  }

  /**
   * Set target state for interpolation
   */
  public setTargetState(
    position: THREE.Vector3,
    rotation: Rotation,
    username: string
  ): void {
    this.targetPosition.copy(position);
    this.targetRotation.y = rotation.y;
  }
}
