import * as THREE from 'three';

export const MAIN_END_RADIUS = 0.075;
export const MAIN_CENTER_RADIUS = 0.018;
export const SECONDARY_END_RADIUS = 0.038;
export const SECONDARY_CENTER_RADIUS = 0.008;
export const STRAND_SEGMENTS = 20;
export const STRAND_RADIAL_SEGMENTS = 6;
export const SURFACE_OVERLAP = 0.08;
export const SECONDARY_BREAK_STRETCH = 1.8;
export const MAIN_BREAK_STRETCH = 2.2;
export const REATTACH_STRETCH = 1.55;
const UPDATE_INTERVAL = 1 / 30;
const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);

function keySeed(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

function createStrand(group, material, name) {
  const ringSize = STRAND_RADIAL_SEGMENTS + 1;
  const ringVertices = (STRAND_SEGMENTS + 1) * ringSize;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ringVertices + 2) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((ringVertices + 2) * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const index = new Uint16Array(STRAND_SEGMENTS * STRAND_RADIAL_SEGMENTS * 6 + STRAND_RADIAL_SEGMENTS * 6);
  let cursor = 0;
  for (let ring = 0; ring < STRAND_SEGMENTS; ring++) for (let side = 0; side < STRAND_RADIAL_SEGMENTS; side++) {
    const a = ring * ringSize + side, b = a + 1, c = a + ringSize, d = c + 1;
    index[cursor++] = a; index[cursor++] = b; index[cursor++] = c;
    index[cursor++] = b; index[cursor++] = d; index[cursor++] = c;
  }
  for (let side = 0; side < STRAND_RADIAL_SEGMENTS; side++) {
    index[cursor++] = ringVertices; index[cursor++] = side + 1; index[cursor++] = side;
    index[cursor++] = ringVertices + 1;
    index[cursor++] = STRAND_SEGMENTS * ringSize + side;
    index[cursor++] = STRAND_SEGMENTS * ringSize + side + 1;
  }
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name; mesh.visible = false; mesh.frustumCulled = false;
  group.add(mesh);
  return { mesh, geometry, curve: new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()),
    centerRadius: 0, endRadiusA: 0, endRadiusB: 0, lastShape: new Float64Array(16).fill(NaN) };
}

/** Visual only. Two persistent tapered tubes; no body deformation or forces. */
export class SemanticGooStrand {
  constructor({ scene, material, key = 'semantic-strand', kind = 'semantic' }) {
    if (!scene || !material) throw new Error('SemanticGooStrand needs a scene and shared material.');
    this.key = String(key); this.kind = kind;
    this.group = new THREE.Group(); this.object = this.group;
    this.group.name = `soft-${kind}:${this.key}`; this.group.visible = false;
    scene.add(this.group);
    this.main = createStrand(this.group, material, 'soft-main');
    this.secondary = createStrand(this.group, material, 'soft-secondary');
    this.strands = [this.main, this.secondary];
    this.seed = keySeed(this.key); this.seedAngle = this.seed * Math.PI * 2;
    this.aSurface = new THREE.Vector3(); this.bSurface = new THREE.Vector3();
    this.axis = new THREE.Vector3(1, 0, 0);
    this.frameUp = new THREE.Vector3(0, 1, 0); this.frameSide = new THREE.Vector3(0, 0, 1);
    this.offset = new THREE.Vector3(); this.inverseBody = new THREE.Matrix4();
    this.point = new THREE.Vector3(); this.tangent = new THREE.Vector3();
    this.normal = new THREE.Vector3(); this.binormal = new THREE.Vector3();
    this.shapeValues = new Float64Array(16);
    this.active = false; this.enabled = true; this.disposed = false;
    this.broken = false; this.secondaryBroken = false;
    this.appearance = 0; this.secondaryAppearance = 0;
    this.preferredDistance = 0; this.geometryAge = Infinity; this.forceUpdate = true;
    this.stats = { phase: 'inactive', stretch: 0, mainVisible: false, secondaryCount: 0,
      visibleStrands: 0, centerRadius: 0, endRadius: 0, secondaryCenterRadius: 0,
      secondaryEndRadius: 0, sag: 0, progress: 0, updates: 0 };
  }

  setVisible(visible) { this.enabled = Boolean(visible); if (!visible) this.hide(); }

  hideVisual() {
    this.group.visible = this.main.mesh.visible = this.secondary.mesh.visible = false;
    this.stats.mainVisible = false; this.stats.secondaryCount = this.stats.visibleStrands = 0;
    this.stats.centerRadius = this.stats.endRadius = this.stats.secondaryCenterRadius = this.stats.secondaryEndRadius = 0;
    this.forceUpdate = true;
  }

  hide() {
    this.hideVisual(); this.active = this.broken = this.secondaryBroken = false;
    this.appearance = this.secondaryAppearance = this.preferredDistance = 0;
    this.stats.phase = 'inactive'; this.stats.progress = 0; this.geometryAge = Infinity;
  }

  surfaceRadius(goo, fallback) {
    if (!goo?.body?.matrixWorld) return Math.max(0, fallback);
    // Read the existing body's current ellipsoid, including its billboard,
    // breathing and appear scale. The original mesh and material stay untouched.
    goo.body.updateWorldMatrix(true, false);
    if (Math.abs(goo.body.matrixWorld.determinant()) < 1e-12) return 0;
    this.inverseBody.copy(goo.body.matrixWorld).invert();
    const m = this.inverseBody.elements, x = this.axis.x, y = this.axis.y, z = this.axis.z;
    const inverseRadius = Math.hypot(m[0] * x + m[4] * y + m[8] * z,
      m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z);
    return Number.isFinite(inverseRadius) && inverseRadius > 0 ? 1 / inverseRadius : 0;
  }

  update({ a, b, gooA = null, gooB = null, radiusA = 0, radiusB = 0, strength = 1,
    dt = 0, active = true, progress = 1, reducedMotion = false } = {}) {
    if (this.disposed) return this.stats;
    strength = clamp(finite(strength), 0, 1); progress = clamp(finite(progress), 0, 1);
    if (!this.enabled || active !== true || !finitePoint(a) || !finitePoint(b) || progress <= 0 ||
        (this.kind === 'semantic' && strength < 0.70)) { this.hide(); return this.stats; }
    dt = clamp(finite(dt), 0, 0.1); this.geometryAge += dt;
    radiusA = Math.max(0, finite(radiusA)); radiusB = Math.max(0, finite(radiusB));
    const distance = this.axis.subVectors(b, a).length();
    if (distance < 1e-6) { this.hideVisual(); return this.stats; }
    this.axis.multiplyScalar(1 / distance);
    const draft = this.kind === 'draft', manual = this.kind === 'manual';
    const size = Math.max(0.0001, draft ? radiusB : Math.min(radiusA, radiusB));
    if (size <= 0.0001) { this.hideVisual(); return this.stats; }
    const directionalA = draft ? 0 : this.surfaceRadius(gooA, radiusA);
    const directionalB = this.surfaceRadius(gooB, radiusB);
    this.aSurface.copy(a).addScaledVector(this.axis, directionalA * (1 - SURFACE_OVERLAP));
    this.bSurface.copy(b).addScaledVector(this.axis, -directionalB * (1 - SURFACE_OVERLAP));
    const span = this.point.subVectors(this.bSurface, this.aSurface).dot(this.axis);
    // Deep user overlap is already inside the bodies. Do not invert a tube.
    if (span <= 0.015) { this.hideVisual(); return this.stats; }

    if (!this.active) {
      this.active = true; this.appearance = this.secondaryAppearance = 0;
      this.preferredDistance = draft ? Math.max(distance, radiusB + 2.5) : radiusA + radiusB + 2.5;
      this.broken = false; this.secondaryBroken = false;
    }
    const preferred = draft ? this.preferredDistance : radiusA + radiusB + 2.5;
    const stretch = distance / Math.max(0.1, preferred);
    this.stats.stretch = stretch; this.stats.progress = progress;
    if (stretch >= MAIN_BREAK_STRETCH) this.broken = true;
    else if (this.broken && stretch < REATTACH_STRETCH) {
      this.broken = false; this.appearance = this.secondaryAppearance = 0;
    }
    if (this.broken) { this.stats.phase = 'broken'; this.hideVisual(); return this.stats; }
    if (stretch >= SECONDARY_BREAK_STRETCH) this.secondaryBroken = true;
    else if (this.secondaryBroken && stretch < REATTACH_STRETCH) {
      this.secondaryBroken = false; this.secondaryAppearance = 0;
    }
    this.appearance = Math.min(1, this.appearance + dt / (reducedMotion ? 0.12 : 0.28));
    const strong = draft ? strength > 0.94 : manual ? strength >= 0.86 : strength >= 0.82;
    if (strong && !this.secondaryBroken && this.appearance >= 0.72) {
      this.secondaryAppearance = Math.min(1, this.secondaryAppearance + dt / (reducedMotion ? 0.12 : 0.25));
    } else this.secondaryAppearance = 0;
    this.stats.phase = this.appearance < 1 ? 'reattaching' : stretch >= 1.8 ? 'near-break' : stretch > 1.1 ? 'stretched' : 'attached';

    // Parallel transport avoids a sudden side change as the connection turns
    // through a vertical direction. Gravity itself always remains world-down.
    this.frameUp.addScaledVector(this.axis, -this.frameUp.dot(this.axis));
    if (this.frameUp.lengthSq() < 1e-8) this.frameUp.copy(this.frameSide).addScaledVector(this.axis, -this.frameSide.dot(this.axis));
    this.frameUp.normalize(); this.frameSide.crossVectors(this.axis, this.frameUp).normalize();
    this.offset.copy(this.frameUp).multiplyScalar(Math.cos(this.seedAngle)).addScaledVector(this.frameSide, Math.sin(this.seedAngle));
    const sagRatio = 0.04 + 0.018 * clamp(stretch - 1, 0, 1.5);
    const sag = Math.min(distance * sagRatio, span * 0.18, size * 0.55) * (draft ? 0.65 : manual ? 1 - strength * 0.45 : 1);
    this.stats.sag = sag;
    const relaxed = clamp(1 / Math.pow(Math.max(0.82, stretch), 0.8), 0.40, 1.17);
    const thinning = smooth((MAIN_BREAK_STRETCH - stretch) / 0.44);
    const mainGrowth = smooth(this.appearance);
    const medium = strength >= 0.76;
    let mainEnd = strong ? MAIN_END_RADIUS : medium ? 0.055 : 0.035;
    let mainCenter = strong ? MAIN_CENTER_RADIUS : medium ? 0.014 : 0.009;
    if (manual) { mainEnd = 0.028 + 0.047 * smooth(strength); mainCenter = 0.009 + 0.009 * smooth(strength); }
    if (draft) { mainEnd = 0.026; mainCenter = 0.008; }
    this.main.centerRadius = mainCenter * size * relaxed * thinning * mainGrowth;
    this.main.endRadiusA = (draft ? 0.014 : mainEnd * radiusA) * mainGrowth * (0.45 + 0.55 * thinning);
    this.main.endRadiusB = mainEnd * radiusB * mainGrowth * (0.45 + 0.55 * thinning);
    const secondaryGrowth = smooth(this.secondaryAppearance) * smooth((SECONDARY_BREAK_STRETCH - stretch) / 0.24);
    this.secondary.centerRadius = (draft ? 0.0035 : SECONDARY_CENTER_RADIUS) * size * relaxed * secondaryGrowth;
    this.secondary.endRadiusA = (draft ? 0.009 : SECONDARY_END_RADIUS * radiusA) * secondaryGrowth;
    this.secondary.endRadiusB = (draft ? 0.016 : SECONDARY_END_RADIUS) * radiusB * secondaryGrowth;
    const showMain = this.main.centerRadius > 0.00001;
    const showSecondary = showMain && strong && !this.secondaryBroken && this.secondary.centerRadius > 0.00001;
    if (showMain !== this.main.mesh.visible || showSecondary !== this.secondary.mesh.visible) this.forceUpdate = true;
    this.main.mesh.visible = showMain; this.secondary.mesh.visible = showSecondary;
    this.group.visible = showMain;
    this.stats.mainVisible = showMain; this.stats.secondaryCount = showSecondary ? 1 : 0;
    this.stats.visibleStrands = (showMain ? 1 : 0) + (showSecondary ? 1 : 0);
    this.stats.centerRadius = showMain ? this.main.centerRadius : 0;
    this.stats.endRadius = showMain ? Math.max(this.main.endRadiusA, this.main.endRadiusB) : 0;
    this.stats.secondaryCenterRadius = showSecondary ? this.secondary.centerRadius : 0;
    this.stats.secondaryEndRadius = showSecondary ? Math.max(this.secondary.endRadiusA, this.secondary.endRadiusB) : 0;

    let rebuilt = false;
    for (let i = 0; i < this.strands.length; i++) {
      const strand = this.strands[i];
      if (!strand.mesh.visible) continue;
      const curve = strand.curve;
      curve.v0.copy(this.aSurface); curve.v3.copy(this.bSurface);
      if (i) {
        curve.v0.addScaledVector(this.offset, size * 0.012);
        curve.v3.addScaledVector(this.offset, size * 0.009);
      }
      curve.v1.lerpVectors(curve.v0, curve.v3, 1 / 3);
      curve.v2.lerpVectors(curve.v0, curve.v3, 2 / 3);
      const drop = sag * 4 / 3 * (i ? 0.72 + this.seed * 0.10 : 1);
      curve.v1.y -= drop; curve.v2.y -= drop;
      if (i) {
        curve.v1.addScaledVector(this.frameUp, size * 0.08).addScaledVector(this.frameSide, size * (this.seed * 2 - 1) * 0.03);
        curve.v2.addScaledVector(this.frameUp, size * 0.10).addScaledVector(this.frameSide, size * (this.seed * 2 - 1) * 0.04);
      }
      const values = this.shapeValues;
      for (let p = 0; p < 4; p++) {
        const point = p === 0 ? curve.v0 : p === 1 ? curve.v1 : p === 2 ? curve.v2 : curve.v3;
        values[p * 3] = point.x; values[p * 3 + 1] = point.y; values[p * 3 + 2] = point.z;
      }
      values[12] = strand.centerRadius; values[13] = strand.endRadiusA;
      values[14] = strand.endRadiusB; values[15] = progress;
      let changed = false;
      for (let p = 0; p < values.length; p++) if (!Number.isFinite(strand.lastShape[p]) || Math.abs(values[p] - strand.lastShape[p]) > 0.00001) { changed = true; break; }
      if (this.forceUpdate || (changed && this.geometryAge >= UPDATE_INTERVAL)) {
        this.writeGeometry(strand, progress); strand.lastShape.set(values); rebuilt = true;
      }
    }
    if (rebuilt) { this.geometryAge = 0; this.forceUpdate = false; this.stats.updates++; }
    return this.stats;
  }

  writeGeometry(strand, progress) {
    const positions = strand.geometry.attributes.position, normals = strand.geometry.attributes.normal;
    const curve = strand.curve, ringSize = STRAND_RADIAL_SEGMENTS + 1;
    const extent = smooth(progress);
    for (let ring = 0; ring <= STRAND_SEGMENTS; ring++) {
      const u = ring / STRAND_SEGMENTS, t = u * extent, v = 1 - t;
      curve.getPoint(t, this.point);
      this.tangent.set(3 * v * v * (curve.v1.x - curve.v0.x) + 6 * v * t * (curve.v2.x - curve.v1.x) + 3 * t * t * (curve.v3.x - curve.v2.x),
        3 * v * v * (curve.v1.y - curve.v0.y) + 6 * v * t * (curve.v2.y - curve.v1.y) + 3 * t * t * (curve.v3.y - curve.v2.y),
        3 * v * v * (curve.v1.z - curve.v0.z) + 6 * v * t * (curve.v2.z - curve.v1.z) + 3 * t * t * (curve.v3.z - curve.v2.z));
      const speed = Math.max(0.000001, this.tangent.length()); this.tangent.multiplyScalar(1 / speed);
      this.normal.copy(this.frameUp).addScaledVector(this.tangent, -this.frameUp.dot(this.tangent)).normalize();
      this.binormal.crossVectors(this.tangent, this.normal).normalize();
      const qa = clamp(t / 0.22, 0, 1), qb = clamp((1 - t) / 0.22, 0, 1);
      const wa = 1 - smooth(qa), wb = 1 - smooth(qb);
      const da = strand.endRadiusA - strand.centerRadius, db = strand.endRadiusB - strand.centerRadius;
      const tipScale = progress < 0.999 ? 1 - smooth((u - 0.86) / 0.14) * 0.96 : 1;
      const radius = (strand.centerRadius + da * wa * wa + db * wb * wb) * tipScale;
      const slope = (-12 * da * wa * qa * (1 - qa) + 12 * db * wb * qb * (1 - qb)) / (0.22 * speed);
      const normalScale = 1 / Math.sqrt(1 + slope * slope);
      for (let side = 0; side <= STRAND_RADIAL_SEGMENTS; side++) {
        const angle = side / STRAND_RADIAL_SEGMENTS * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
        const nx = this.normal.x * c + this.binormal.x * s, ny = this.normal.y * c + this.binormal.y * s, nz = this.normal.z * c + this.binormal.z * s;
        const index = ring * ringSize + side;
        positions.setXYZ(index, this.point.x + nx * radius, this.point.y + ny * radius, this.point.z + nz * radius);
        normals.setXYZ(index, (nx - this.tangent.x * slope) * normalScale,
          (ny - this.tangent.y * slope) * normalScale, (nz - this.tangent.z * slope) * normalScale);
      }
    }
    const cap = (STRAND_SEGMENTS + 1) * ringSize;
    positions.setXYZ(cap, curve.v0.x, curve.v0.y, curve.v0.z);
    curve.getPoint(extent, this.point); positions.setXYZ(cap + 1, this.point.x, this.point.y, this.point.z);
    this.tangent.subVectors(curve.v1, curve.v0).normalize(); normals.setXYZ(cap, -this.tangent.x, -this.tangent.y, -this.tangent.z);
    this.tangent.subVectors(curve.v3, curve.v2).normalize(); normals.setXYZ(cap + 1, this.tangent.x, this.tangent.y, this.tangent.z);
    positions.needsUpdate = normals.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent();
    this.main.geometry.dispose(); this.secondary.geometry.dispose(); this.group.clear();
  }
}
