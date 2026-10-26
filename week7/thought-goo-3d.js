import * as THREE from "three";

const EYE_LAYOUTS = {
  1: [[0.03, 0.10]],
  2: [[-0.25, 0.12], [0.25, 0.16]],
  3: [[-0.36, 0.08], [0, 0.26], [0.36, 0.08]],
};

function hashId(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function unitAmount(value) {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
}

// One set per scene. Individual Goos never change or dispose these resources.
export function createGooResources() {
  const bodyGeometry = new THREE.SphereGeometry(1, 40, 28);
  const vertices = bodyGeometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < vertices.count; i++) {
    vertex.fromBufferAttribute(vertices, i);
    const ripple = 1 + 0.045 * Math.sin(vertex.x * 5 + 0.8) * Math.cos(vertex.y * 4)
      + 0.025 * Math.sin(vertex.z * 5 + vertex.y * 3);
    vertices.setXYZ(i, vertex.x * ripple, vertex.y * ripple, vertex.z * ripple);
  }
  bodyGeometry.computeVertexNormals();
  bodyGeometry.computeBoundingSphere();

  const resources = {
    bodyGeometry,
    eyeGeometry: new THREE.SphereGeometry(1, 20, 14),
    bodyMaterial: new THREE.MeshStandardMaterial({ color: 0x11100f, roughness: 1, metalness: 0 }),
    whiteMaterial: new THREE.MeshBasicMaterial({ color: 0xfffdf6 }),
    pupilMaterial: new THREE.MeshBasicMaterial({ color: 0x080807 }),
    pendingRingGeometry: new THREE.TorusGeometry(1, 0.007, 6, 96),
    pendingRingMaterial: new THREE.MeshBasicMaterial({
      color: 0x11100f, transparent: true, opacity: 0.38, depthWrite: false,
    }),
  };
  let disposed = false;
  resources.dispose = () => {
    if (disposed) return;
    disposed = true;
    resources.bodyGeometry.dispose();
    resources.eyeGeometry.dispose();
    resources.bodyMaterial.dispose();
    resources.whiteMaterial.dispose();
    resources.pupilMaterial.dispose();
    resources.pendingRingGeometry.dispose();
    resources.pendingRingMaterial.dispose();
  };
  return resources;
}

// The adapter supplies world-unit radius and position. Floating follows the
// standalone prototype; the owning scene integrates velocity and app offsets.
export class ThoughtGoo3D {
  constructor(data, resources, appearing = false) {
    this.data = data;
    this.resources = resources;
    this.basePosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    this.currentPosition = this.basePosition.clone();
    this.position = this.currentPosition;
    this.velocity = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.shape = new THREE.Vector3();
    this.age = appearing ? 0 : 1;
    this.hoverScale = 1;
    this._disposed = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.currentPosition);
    this.group.userData.thoughtId = data.id;
    this.group.userData.thought = data;
    this.character = new THREE.Group();
    this.group.add(this.character);
    this.body = new THREE.Mesh(resources.bodyGeometry, resources.bodyMaterial);
    this.body.userData.thoughtId = data.id;
    this.character.add(this.body);
    this.eyes = [];
    this.pupils = [];

    this.pendingRing = new THREE.Mesh(resources.pendingRingGeometry, resources.pendingRingMaterial);
    this.group.add(this.pendingRing);
    this.updateData(data);
  }

  updateEyes(seed) {
    for (const eye of this.eyes) eye.removeFromParent();
    this.eyes.length = 0;
    this.pupils.length = 0;
    this.phase = (seed % 1000) / 1000 * Math.PI * 2;
    this.wobbleSpeed = 0.45 + (seed % 11) * 0.027;
    this.shape.set(1 + (seed % 7) * 0.015, 0.91 + (seed % 5) * 0.04, 0.92);
    this.eyeCount = 1 + seed % 3;
    const resources = this.resources;
    for (const [x, y] of EYE_LAYOUTS[this.eyeCount]) {
      const eyeSize = this.eyeCount === 1 ? 0.25 : 0.195;
      const white = new THREE.Mesh(resources.eyeGeometry, resources.whiteMaterial);
      white.position.set(x, y, Math.sqrt(1 - x * x - y * y) * 0.98);
      white.scale.set(eyeSize * 0.91, eyeSize * 1.1, eyeSize * 0.62);
      this.character.add(white);

      const pupil = new THREE.Mesh(resources.eyeGeometry, resources.pupilMaterial);
      pupil.position.copy(white.position);
      pupil.position.z += eyeSize * 0.58;
      pupil.scale.setScalar(eyeSize * 0.37);
      pupil.userData.restX = x;
      pupil.userData.restY = y;
      this.character.add(pupil);
      this.eyes.push(white, pupil);
      this.pupils.push(pupil);
    }
  }

  get collisionRadius() {
    // Exact prototype collision envelope, independent of hover scaling.
    return this.radius * Math.max(this.shape.x, this.shape.y) * 1.09;
  }

  updateData(data) {
    if (this._disposed) return;
    this.data = data;
    this.group.userData.thoughtId = data.id;
    this.group.userData.thought = data;
    this.body.userData.thoughtId = data.id;
    this.radius = data.radius;
    const eyeSeed = String(data.eyeSeed ?? data.id);
    if (this.eyeSeed !== eyeSeed) {
      this.eyeSeed = eyeSeed;
      this.updateEyes(hashId(eyeSeed));
    }
    this.pendingRing.visible = data.type === "pending";
    this.pendingRing.scale.setScalar(this.collisionRadius * 1.07);
    // Deliberately leave position and velocity unchanged on Firebase updates.
  }

  setPosition(position) {
    if (this._disposed) return;
    this.currentPosition.set(position.x, position.y, position.z);
    this.basePosition.copy(this.currentPosition);
    this.group.position.copy(this.currentPosition);
    this.velocity.set(0, 0, 0);
  }

  applyFloat(time, dt, reducedMotion = false) {
    const motion = reducedMotion ? 0 : 1;
    const t = time * this.wobbleSpeed + this.phase;
    this.desiredPosition.copy(this.basePosition);
    this.desiredPosition.x += Math.sin(t * 0.83) * 0.15 * motion;
    this.desiredPosition.y += Math.sin(t) * 0.22 * motion;
    this.desiredPosition.z += Math.cos(t * 0.69) * 0.16 * motion;
    // Spring toward a fixed neighborhood, then damp velocity.
    this.velocity.addScaledVector(this.desiredPosition.sub(this.currentPosition), dt * 2.6);
    this.velocity.multiplyScalar(Math.exp(-3.8 * dt));
  }

  render(time, dt, camera, options = {}) {
    if (this._disposed) return;
    const { hovered = false, selected = false, pointer, reducedMotion = false } = options;
    this.age = Math.min(1, this.age + dt / 0.65);
    const appear = reducedMotion ? 1 : 1 - (1 - this.age) ** 3;
    this.hoverScale = THREE.MathUtils.damp(this.hoverScale, hovered ? 1.065 : selected ? 1.025 : 1, 10, dt);
    const breath = reducedMotion ? 0 : Math.sin(time * 0.9 + this.phase) * 0.018;
    // These two additions are zero outside the existing live interaction effects.
    const pulse = reducedMotion ? 0 : unitAmount(options.pulse) * 0.035;
    const compression = reducedMotion ? 0 : unitAmount(options.compression) * 0.10;
    const scale = this.radius * appear * this.hoverScale * (1 + pulse);
    this.character.scale.set(
      this.shape.x * scale * (1 + breath + compression),
      this.shape.y * scale * (1 - breath - compression),
      this.shape.z * scale,
    );
    this.character.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.36 + this.phase) * 0.045;
    this.group.position.copy(this.currentPosition);
    // Exact prototype billboard; the scene adds each Goo to its root group.
    this.group.quaternion.copy(camera.quaternion);
    const pointerX = Number.isFinite(pointer?.x) ? pointer.x : 0;
    const pointerY = Number.isFinite(pointer?.y) ? pointer.y : 0;
    for (const pupil of this.pupils) {
      const x = pupil.userData.restX + pointerX * 0.026;
      const y = pupil.userData.restY + pointerY * 0.022;
      pupil.position.x = THREE.MathUtils.damp(pupil.position.x, x, 5, dt);
      pupil.position.y = THREE.MathUtils.damp(pupil.position.y, y, 5, dt);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.group.removeFromParent();
    this.character.clear();
    this.group.clear();
    this.eyes.length = 0;
    this.pupils.length = 0;
    // Meshes only reference shared geometry/materials; their owner disposes them.
  }
}
