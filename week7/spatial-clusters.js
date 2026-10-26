import * as THREE from 'three';

export const DEBUG_SPATIAL_CLUSTERS = false;
export const CLUSTER_ANCHOR_STRENGTH = 0.06;
export const CLUSTER_REPULSION_STRENGTH = 0.18;
export const CLUSTER_SEPARATION_GAP = 2.0;
export const LOCAL_REPULSION_STRENGTH = 0.10;
export const LOCAL_SEPARATION_GAP = 0.75;
export const SPATIAL_MAX_ACCELERATION = 0.45;
export const SPATIAL_MAX_SPEED = 0.45;
export const SPATIAL_DAMPING = 1.4;
// Covers the existing 60-unit drag range plus anchors and cluster extent.
export const SPATIAL_MAX_OFFSET = 80;
export const DRAFT_SPATIAL_RESUME_SECONDS = 1.2;
const clamp = THREE.MathUtils.clamp;
const EMPTY_IDS = new Set();
const pairKey = (a, b) => JSON.stringify(a < b ? [a, b] : [b, a]);
const publicGoo = goo => Boolean(goo?.data && goo.data.type !== 'pending' && goo.source?.type !== 'pending');

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
const sample = text => hash(text) / 4294967295;

export function clusterAnchor(ids, out = new THREE.Vector3()) {
  const key = JSON.stringify([...ids].map(String).sort());
  const z = -5 + sample(`${key}:z`) * 8.5;
  // The original camera is at z=18. Keep near anchors inside its narrower view.
  const fit = clamp((18 - z) / 20, 0.72, 1);
  return out.set((sample(`${key}:x`) * 14 - 7) * fit,
    (sample(`${key}:y`) * 8 - 4) * fit, z);
}

export function semanticSpringSettings(similarity) {
  const value = clamp(similarity, 0.70, 1);
  if (value >= 0.82) {
    const amount = (value - 0.82) / 0.18;
    return { gap: 1.5 - 0.5 * amount, stiffness: 0.14 + 0.04 * amount };
  }
  if (value >= 0.76) {
    const amount = (value - 0.76) / 0.06;
    return { gap: 2.2 - 0.7 * amount, stiffness: 0.09 + 0.04 * amount };
  }
  const amount = (value - 0.70) / 0.06;
  return { gap: 2.8 - 0.7 * amount, stiffness: 0.05 + 0.03 * amount };
}

/** Local offsets only. The scene retains all movement, collision and data ownership. */
export class SpatialClusters {
  constructor({ scene } = {}) {
    this.scene = scene;
    this.nodes = new Map();
    this.clusters = [];
    this.edges = [];
    this.edgeKeys = new Set();
    this.signature = null;
    this.direction = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.debug = null;
    this.disposed = false;
    this.stats = { clusters: 0, edges: 0, maxAcceleration: 0, maxSpeed: 0 };
  }

  refresh(goos, acceptedEdges = []) {
    if (this.disposed) return;
    const ids = [...goos].filter(([, goo]) => publicGoo(goo)).map(([id]) => id).sort();
    const visible = new Set(ids), seen = new Set(), edges = [];
    // These are already accepted by the application; never infer extra edges.
    for (const pair of acceptedEdges) {
      if (!pair || pair.aId === pair.bId || !visible.has(pair.aId) || !visible.has(pair.bId) ||
        !Number.isFinite(pair.similarity) || pair.similarity < 0.70 || pair.similarity > 1) continue;
      const key = pairKey(pair.aId, pair.bId);
      if (seen.has(key)) continue;
      seen.add(key);
      const aId = pair.aId < pair.bId ? pair.aId : pair.bId;
      const bId = aId === pair.aId ? pair.bId : pair.aId;
      edges.push({ key, aId, bId, similarity: pair.similarity });
    }
    edges.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const signature = JSON.stringify([ids, edges.map(edge => [edge.key, edge.similarity])]);
    for (const id of this.nodes.keys()) if (!visible.has(id)) this.nodes.delete(id);
    for (const id of ids) {
      const goo = goos.get(id);
      if (!goo.spatialOffset) goo.spatialOffset = new THREE.Vector3();
      if (!goo.spatialVelocity) goo.spatialVelocity = new THREE.Vector3();
      let node = this.nodes.get(id);
      if (!node || node.goo !== goo) {
        node = { id, goo, force: new THREE.Vector3(), mobility: 1, draftResume: 1, clusterKey: null };
        this.nodes.set(id, node);
      }
    }
    if (signature === this.signature) return;
    const oldEdges = this.edgeKeys;
    for (const edge of this.edges) if (!seen.has(edge.key)) {
      this.nodes.get(edge.aId)?.goo.spatialVelocity.set(0, 0, 0);
      this.nodes.get(edge.bId)?.goo.spatialVelocity.set(0, 0, 0);
    }
    for (const edge of edges) if (!oldEdges.has(edge.key)) {
      this.nodes.get(edge.aId)?.goo.spatialVelocity.set(0, 0, 0);
      this.nodes.get(edge.bId)?.goo.spatialVelocity.set(0, 0, 0);
    }
    const adjacency = new Map(ids.map(id => [id, []]));
    for (const edge of edges) {
      adjacency.get(edge.aId).push(edge.bId); adjacency.get(edge.bId).push(edge.aId);
      Object.assign(edge, semanticSpringSettings(edge.similarity));
    }
    const visited = new Set(), prior = new Map(this.clusters.map(cluster => [cluster.key, cluster]));
    const clusters = [];
    for (const id of ids) {
      if (visited.has(id)) continue;
      const members = [], queue = [id]; visited.add(id);
      while (queue.length) {
        const current = queue.pop(); members.push(current);
        for (const next of adjacency.get(current)) if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
      members.sort();
      const key = JSON.stringify(members);
      const cluster = prior.get(key) || { key, ids: members, anchor: clusterAnchor(members),
        centroid: new THREE.Vector3(), radius: 0, separationRadius: 0, mobility: 1 };
      for (const member of members) {
        const node = this.nodes.get(member);
        if (node.clusterKey !== key) node.goo.spatialVelocity.set(0, 0, 0);
        node.clusterKey = key;
      }
      clusters.push(cluster);
    }
    this.clusters = clusters; this.edges = edges; this.edgeKeys = seen; this.signature = signature;
    this.stats.clusters = clusters.length; this.stats.edges = edges.length;
    if (DEBUG_SPATIAL_CLUSTERS) this.rebuildDebug();
  }

  stableDirection(key, out) {
    out.set(sample(`${key}:dx`) * 2 - 1, sample(`${key}:dy`) * 2 - 1, sample(`${key}:dz`) * 2 - 1);
    if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
    return out.normalize();
  }

  update({ goos, acceptedEdges = [], dt = 0, mobility = () => 1, draftIds = EMPTY_IDS, enabled = true }) {
    if (this.disposed) return;
    this.refresh(goos, acceptedEdges);
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    this.stats.maxAcceleration = this.stats.maxSpeed = 0;
    for (const node of this.nodes.values()) {
      node.force.set(0, 0, 0);
      if (draftIds.has(node.id)) node.draftResume = 0;
      else node.draftResume = Math.min(1, node.draftResume + dt / DRAFT_SPATIAL_RESUME_SECONDS);
      const available = mobility(node.goo);
      node.mobility = enabled && Number.isFinite(available) ? clamp(available, 0, 1) * node.draftResume : 0;
      if (!node.mobility) node.goo.spatialVelocity.set(0, 0, 0);
    }
    for (const cluster of this.clusters) {
      cluster.centroid.set(0, 0, 0); cluster.mobility = 1;
      for (const id of cluster.ids) {
        const node = this.nodes.get(id);
        cluster.centroid.add(node.goo.position);
        cluster.mobility = Math.min(cluster.mobility, node.mobility);
      }
      cluster.centroid.multiplyScalar(1 / cluster.ids.length);
      cluster.radius = 0;
      for (const id of cluster.ids) {
        const node = this.nodes.get(id), goo = node.goo;
        cluster.radius = Math.max(cluster.radius, goo.position.distanceTo(cluster.centroid) + goo.collisionRadius);
        if (node.mobility) node.force.addScaledVector(this.direction.subVectors(cluster.anchor, goo.position), CLUSTER_ANCHOR_STRENGTH);
      }
      // A temporarily scattered group must not acquire an enormous repulsion halo.
      cluster.separationRadius = Math.min(cluster.radius, 1.4 + 0.65 * Math.sqrt(cluster.ids.length));
    }
    for (const edge of this.edges) {
      const a = this.nodes.get(edge.aId), b = this.nodes.get(edge.bId), available = Math.min(a.mobility, b.mobility);
      if (!available) continue;
      const distance = this.direction.subVectors(b.goo.position, a.goo.position).length();
      if (distance < 1e-6) this.stableDirection(edge.key, this.direction);
      else this.direction.multiplyScalar(1 / distance);
      const rest = a.goo.collisionRadius + b.goo.collisionRadius + edge.gap;
      this.force.copy(this.direction).multiplyScalar((distance - rest) * edge.stiffness * available);
      a.force.add(this.force); b.force.sub(this.force);
    }
    for (let i = 0; i < this.clusters.length; i++) for (let j = i + 1; j < this.clusters.length; j++) {
      const a = this.clusters[i], b = this.clusters[j], available = Math.min(a.mobility, b.mobility);
      if (!available) continue;
      const distance = this.direction.subVectors(b.centroid, a.centroid).length();
      const minimum = a.separationRadius + b.separationRadius + CLUSTER_SEPARATION_GAP;
      if (distance >= minimum) continue;
      if (distance < 1e-6) this.stableDirection(`${a.key}|${b.key}`, this.direction);
      else this.direction.multiplyScalar(1 / distance);
      this.force.copy(this.direction).multiplyScalar((minimum - distance) * CLUSTER_REPULSION_STRENGTH * available);
      for (const id of a.ids) this.nodes.get(id).force.sub(this.force);
      for (const id of b.ids) this.nodes.get(id).force.add(this.force);
    }
    const nodes = [...this.nodes.values()];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], available = Math.min(a.mobility, b.mobility);
      if (!available || this.edgeKeys.has(pairKey(a.id, b.id))) continue;
      const distance = this.direction.subVectors(b.goo.position, a.goo.position).length();
      const minimum = a.goo.collisionRadius + b.goo.collisionRadius + LOCAL_SEPARATION_GAP;
      if (distance >= minimum) continue;
      if (distance < 1e-6) this.stableDirection(pairKey(a.id, b.id), this.direction);
      else this.direction.multiplyScalar(1 / distance);
      this.force.copy(this.direction).multiplyScalar(LOCAL_REPULSION_STRENGTH * clamp((minimum - distance) / LOCAL_SEPARATION_GAP, 0, 1) * available);
      a.force.sub(this.force); b.force.add(this.force);
    }
    for (const node of this.nodes.values()) {
      if (!node.mobility) continue;
      node.force.clampLength(0, SPATIAL_MAX_ACCELERATION);
      this.stats.maxAcceleration = Math.max(this.stats.maxAcceleration, node.force.length());
      const goo = node.goo;
      goo.spatialVelocity.addScaledVector(node.force, dt * node.mobility);
      goo.spatialVelocity.multiplyScalar(Math.exp(-SPATIAL_DAMPING * dt)).clampLength(0, SPATIAL_MAX_SPEED);
      goo.spatialOffset.addScaledVector(goo.spatialVelocity, dt * node.mobility).clampLength(0, SPATIAL_MAX_OFFSET);
      this.stats.maxSpeed = Math.max(this.stats.maxSpeed, goo.spatialVelocity.length());
    }
    if (DEBUG_SPATIAL_CLUSTERS) this.updateDebug(enabled);
  }

  reset(goo) {
    if (!goo) return;
    if (!goo.spatialOffset) goo.spatialOffset = new THREE.Vector3();
    if (!goo.spatialVelocity) goo.spatialVelocity = new THREE.Vector3();
    goo.spatialOffset.set(0, 0, 0); goo.spatialVelocity.set(0, 0, 0);
    const node = this.nodes.get(goo?.data?.id);
    if (node) { node.force.set(0, 0, 0); node.draftResume = 1; }
  }

  remove(id) { this.nodes.delete(id); this.signature = null; }

  rebuildDebug() {
    if (!this.scene) return;
    this.disposeDebug();
    const group = new THREE.Group(); group.name = 'spatial-cluster-debug';
    const sphere = new THREE.SphereGeometry(1, 12, 8);
    const points = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    const wire = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false });
    const lines = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false });
    const entries = this.clusters.map(cluster => {
      const anchor = new THREE.Mesh(sphere, points), centroid = new THREE.Mesh(sphere, points), bounds = new THREE.Mesh(sphere, wire);
      anchor.scale.setScalar(0.09); centroid.scale.setScalar(0.05);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cluster.ids.length * 6), 3));
      const rays = new THREE.LineSegments(geometry, lines); rays.frustumCulled = false;
      group.add(anchor, centroid, bounds, rays);
      return { cluster, anchor, centroid, bounds, rays, geometry };
    });
    this.scene.add(group); this.debug = { group, sphere, points, wire, lines, entries };
  }

  updateDebug(enabled) {
    if (!this.debug) return;
    this.debug.group.visible = enabled;
    for (const item of this.debug.entries) {
      const { cluster } = item;
      item.anchor.position.copy(cluster.anchor); item.centroid.position.copy(cluster.centroid);
      item.bounds.position.copy(cluster.centroid); item.bounds.scale.setScalar(cluster.radius);
      const position = item.geometry.attributes.position;
      cluster.ids.forEach((id, index) => {
        const point = this.nodes.get(id).goo.position;
        position.setXYZ(index * 2, point.x, point.y, point.z);
        position.setXYZ(index * 2 + 1, cluster.anchor.x, cluster.anchor.y, cluster.anchor.z);
      });
      position.needsUpdate = true;
    }
  }

  disposeDebug() {
    if (!this.debug) return;
    for (const item of this.debug.entries) item.geometry.dispose();
    this.debug.group.removeFromParent(); this.debug.sphere.dispose();
    this.debug.points.dispose(); this.debug.wire.dispose(); this.debug.lines.dispose(); this.debug = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.disposeDebug(); this.nodes.clear(); this.clusters.length = this.edges.length = 0;
    this.edgeKeys.clear(); this.signature = null;
  }
}
