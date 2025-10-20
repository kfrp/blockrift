import * as THREE from "three";

export default class Core {
  constructor() {
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = new THREE.WebGLRenderer();
    this.scene = new THREE.Scene();
    this.initScene();
    this.initRenderer();
    this.initCamera();
  }

  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;

  initCamera = () => {
    this.camera.fov = 50;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.near = 0.01;
    this.camera.far = 500;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(8, 50, 8);

    this.camera.lookAt(100, 30, 100);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  };

  initScene = () => {
    this.scene = new THREE.Scene();
    const backgroundColor = 0x87ceeb;

    this.scene.fog = new THREE.Fog(backgroundColor, 1, 96);
    this.scene.background = new THREE.Color(backgroundColor);

    // DirectionalLight is better for sunlight and more performant than PointLight
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(500, 500, 500);
    this.scene.add(sunLight);

    const sunLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight2.position.set(-500, 500, -500);
    this.scene.add(sunLight2);

    // Ambient light for fill
    const reflectionLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(reflectionLight);
  };

  initRenderer = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Set color space to match Three.js 0.137.0 behavior
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    document.body.appendChild(this.renderer.domElement);

    window.addEventListener("resize", () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  };
}
