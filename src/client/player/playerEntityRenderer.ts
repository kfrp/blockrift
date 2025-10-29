/** PlayerEntityRenderer - Renders and animates voxel-based player characters **/
import * as THREE from "three";
import { Rotation } from "../state/multiplayer";

/**
 * PlayerColors - Defines the colors for the Snoo-inspired alien character.
 */
export interface PlayerColors {
  head: THREE.Color | string | number;
  body: THREE.Color | string | number;
  limbs: THREE.Color | string | number; // For arms and legs
  antenna: THREE.Color | string | number; // For antenna (always orange)
}

/**
 * PlayerEntityRenderer - Handles rendering and animation of the Snoo-inspired alien.
 */
export default class PlayerEntityRenderer {
  // === Voxel Mesh ===
  public group: THREE.Group;
  public head: THREE.Group;
  public torso: THREE.Mesh;
  public leftArm: THREE.Mesh;
  public rightArm: THREE.Mesh;
  public leftLeg: THREE.Mesh;
  public rightLeg: THREE.Mesh;
  public label: THREE.Sprite;

  // === State for Interpolation & Responsiveness ===
  public targetPosition: THREE.Vector3;
  public targetRotation: THREE.Euler;

  // === Ground State Tracking ===
  private isGrounded: boolean = false;
  private lastGroundY: number;
  private positionStableTime: number = 0;
  private isJumping: boolean = false;
  private previousTargetY: number;

  // === Constants ===
  // Eye height must match player.body.height (1.8) for proper ground alignment
  // The model's visual eye position is at 1.45, but we use 1.8 to match physics
  private readonly EYE_HEIGHT = 1.8;

  // === Animation Properties ===
  private walkTime: number = 0;
  private headBaseY: number = 1.35; // Head center position (not eye level)

  constructor(
    username: string,
    initialPosition: THREE.Vector3, // This is the eye-level position from the server
    colors?: Partial<PlayerColors>
  ) {
    // Generate a random pleasant color for limbs
    const randomLimbColor = this.generatePleasantColor();

    // Define the classic Snoo-alien color scheme
    const finalColors: PlayerColors = {
      head: 0xcadde0, // Light blue-gray
      body: 0xffffff, // White
      limbs: randomLimbColor, // Random pleasant color
      antenna: 0xff862a, // Orange (Reddit Snoo)
      ...colors,
    };

    // Initialize body part references
    this.head = new THREE.Group();
    this.torso = new THREE.Mesh();
    this.leftArm = new THREE.Mesh();
    this.rightArm = new THREE.Mesh();
    this.leftLeg = new THREE.Mesh();
    this.rightLeg = new THREE.Mesh();
    this.label = new THREE.Sprite();

    // The target position remains the "eye-level" data from the server.
    this.targetPosition = initialPosition.clone();
    this.targetRotation = new THREE.Euler(0, 0, 0);

    this.lastGroundY = initialPosition.y;
    this.previousTargetY = initialPosition.y;

    // Build the character
    this.group = this.buildVoxelCharacter(username, finalColors);

    // Set the initial visual position correctly by offsetting from the eye-level data.
    const initialFootPosition = initialPosition.clone();
    initialFootPosition.y -= this.EYE_HEIGHT;
    this.group.position.copy(initialFootPosition);
  }

  /**
   * Generate a random pleasant color for player limbs
   */
  private generatePleasantColor(): number {
    const pleasantColors = [
      0xff6b6b, // Coral red
      0x4ecdc4, // Turquoise
      0x45b7d1, // Sky blue
      0xf7b731, // Golden yellow
      0x5f27cd, // Purple
      0x00d2d3, // Cyan
      0xff9ff3, // Pink
      0x48dbfb, // Light blue
      0x1dd1a1, // Mint green
      0xfeca57, // Warm yellow
      0xee5a6f, // Rose
      0xc44569, // Magenta
      0x54a0ff, // Dodger blue
      0x00d8d6, // Aqua
      0xff6348, // Tomato
    ];
    return pleasantColors[Math.floor(Math.random() * pleasantColors.length)]!;
  }

  /**
   * Update method with smooth interpolation for position and rotation.
   */
  public update(deltaTime: number): void {
    // --- Rotation Interpolation ---
    const lerpFactor = Math.min(deltaTime * 10, 1.0);
    let targetY = this.targetRotation.y;
    let currentY = this.group.rotation.y;
    let diff = targetY - currentY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y = currentY + diff * lerpFactor;

    // --- Position Interpolation ---
    const targetFootPosition = this.targetPosition.clone();
    targetFootPosition.y -= this.EYE_HEIGHT;
    const horizontalLerpFactor = Math.min(deltaTime * 12, 1.0);
    const verticalLerpFactor = Math.min(deltaTime * 20, 1.0);
    this.group.position.x = THREE.MathUtils.lerp(
      this.group.position.x,
      targetFootPosition.x,
      horizontalLerpFactor
    );
    this.group.position.z = THREE.MathUtils.lerp(
      this.group.position.z,
      targetFootPosition.z,
      horizontalLerpFactor
    );
    this.group.position.y = THREE.MathUtils.lerp(
      this.group.position.y,
      targetFootPosition.y,
      verticalLerpFactor
    );

    // --- Animation State Logic (FIXED) ---
    const isMovingHorizontally =
      new THREE.Vector2(
        this.group.position.x,
        this.group.position.z
      ).distanceTo(
        new THREE.Vector2(this.targetPosition.x, this.targetPosition.z)
      ) > 0.05;

    // Check for vertical stability to determine if grounded.
    const yVelocity = this.targetPosition.y - this.previousTargetY;

    if (Math.abs(yVelocity) < 0.01) {
      // Y position is stable
      this.positionStableTime += deltaTime;
      // After being stable for a short period, we are officially grounded.
      if (this.positionStableTime > 0.1) {
        if (!this.isGrounded) {
          // This is the moment we transition from air to ground.
          this.lastGroundY = this.targetPosition.y;
        }
        this.isGrounded = true;
        this.isJumping = false; // If grounded, we are not jumping.
      }
    } else {
      // Y position is changing, so we are in the air.
      this.positionStableTime = 0;
      this.isGrounded = false;
    }

    // Detect the start of a jump: a sharp upward movement.
    if (this.targetPosition.y > this.lastGroundY + 0.2 && yVelocity > 0.05) {
      this.isJumping = true;
      this.isGrounded = false;
    }

    // Update the previous Y position for the next frame's calculation.
    this.previousTargetY = this.targetPosition.y;

    this.applyAnimations(deltaTime, isMovingHorizontally);
  }

  /**
   * Apply walking or idle animations based on movement state.
   */
  private applyAnimations(deltaTime: number, isMoving: boolean): void {
    if (this.isJumping) {
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
      this.walkTime += deltaTime * 10;
      const swingAngle = Math.sin(this.walkTime) * 0.8;
      this.leftArm.rotation.x = swingAngle;
      this.rightArm.rotation.x = -swingAngle;
      this.leftLeg.rotation.x = -swingAngle;
      this.rightLeg.rotation.x = swingAngle;
      this.head.position.y =
        this.headBaseY + Math.abs(Math.sin(this.walkTime * 0.5)) * 0.08;
    } else {
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
      this.head.position.y = THREE.MathUtils.lerp(
        this.head.position.y,
        this.headBaseY,
        0.1
      );
    }
  }

  /**
   * Build the Snoo-inspired voxel alien character.
   */
  private buildVoxelCharacter(
    username: string,
    colors: PlayerColors
  ): THREE.Group {
    const group = new THREE.Group();

    const headMaterial = new THREE.MeshStandardMaterial({ color: colors.head });
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: colors.body });
    const limbsMaterial = new THREE.MeshStandardMaterial({
      color: colors.limbs,
    });
    const antennaMaterial = new THREE.MeshStandardMaterial({
      color: colors.antenna,
    });
    const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });

    // Body
    const bodyGeometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    this.torso = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.torso.position.set(0, 0.65, 0);
    group.add(this.torso);

    // Head Group (Head, Face, Antenna)
    this.head = new THREE.Group();
    this.head.position.set(0, this.headBaseY, 0);
    const headBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.7, 0.8),
      headMaterial
    );
    this.head.add(headBlock);

    // Face
    const eyeGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.1);
    const leftEye = new THREE.Mesh(eyeGeometry, faceMaterial);
    leftEye.position.set(-0.2, 0.1, 0.4);
    this.head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, faceMaterial);
    rightEye.position.set(0.2, 0.1, 0.4);
    this.head.add(rightEye);

    // A more pronounced U-shaped smile
    const mouthSideGeometry = new THREE.BoxGeometry(0.05, 0.1, 0.1);
    const mouthLeft = new THREE.Mesh(mouthSideGeometry, faceMaterial);
    mouthLeft.position.set(-0.1, -0.08, 0.4);
    this.head.add(mouthLeft);

    const mouthRight = new THREE.Mesh(mouthSideGeometry, faceMaterial);
    mouthRight.position.set(0.1, -0.08, 0.4);
    this.head.add(mouthRight);

    const mouthBottom = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.05, 0.1),
      faceMaterial
    );
    mouthBottom.position.set(0, -0.13, 0.4);
    this.head.add(mouthBottom);

    // Antenna (always orange)
    const antenna = this.createAntenna(antennaMaterial);
    antenna.position.set(0, 0.35, 0); // Centered on the head
    this.head.add(antenna);
    group.add(this.head);

    // Arms (random color)
    const armGeometry = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    armGeometry.translate(0, -0.2, 0); // Set pivot to top
    this.leftArm = new THREE.Mesh(armGeometry, limbsMaterial);
    this.leftArm.position.set(-0.42, 0.8, 0);
    group.add(this.leftArm);
    this.rightArm = new THREE.Mesh(armGeometry, limbsMaterial);
    this.rightArm.position.set(0.42, 0.8, 0);
    group.add(this.rightArm);

    // Legs (random color, 0.3 height, pivot at top, positioned so feet touch ground at y=0)
    const legGeometry = new THREE.BoxGeometry(0.2, 0.3, 0.2);
    legGeometry.translate(0, -0.15, 0); // Set pivot to top (moves box down so it extends from 0 to -0.3)
    this.leftLeg = new THREE.Mesh(legGeometry, limbsMaterial);
    this.leftLeg.position.set(-0.18, 0.3, 0); // Position pivot at 0.3, so bottom is at 0.0
    group.add(this.leftLeg);
    this.rightLeg = new THREE.Mesh(legGeometry, limbsMaterial);
    this.rightLeg.position.set(0.18, 0.3, 0); // Position pivot at 0.3, so bottom is at 0.0
    group.add(this.rightLeg);

    // Username label (with limb color as background)
    this.label = this.createUsernameLabel(username, colors.limbs);
    group.add(this.label);

    return group;
  }

  /** Helper method to create the alien's antenna */
  private createAntenna(material: THREE.Material): THREE.Group {
    const antennaGroup = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.5, 0.08),
      material
    );
    stem.position.y = 0.25;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), material);
    tip.position.y = 0.5;
    antennaGroup.add(stem);
    antennaGroup.add(tip);
    return antennaGroup;
  }

  /**
   * Create a username label sprite with colored background.
   */
  private createUsernameLabel(
    username: string,
    backgroundColor: THREE.Color | string | number
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 64;

    // Convert color to hex string for canvas
    const color = new THREE.Color(backgroundColor);
    const hexColor = `#${color.getHexString()}`;

    // Draw background with player's limb color
    context.fillStyle = hexColor;
    context.fillRect(0, 0, 256, 64);

    // Draw username text
    context.fillStyle = "white";
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(username, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.8, 0.2, 1);
    sprite.position.y = 2.5;
    return sprite;
  }

  /**
   * Set target state for interpolation.
   */
  public setTargetState(position: THREE.Vector3, rotation: Rotation): void {
    this.targetPosition.copy(position);
    this.targetRotation.y = rotation.y;
  }
}
