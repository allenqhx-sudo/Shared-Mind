import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ThoughtGoo3D, createGooResources } from './thought-goo-3d.js';
import { firebaseThoughtTo3DData, worldPositionToLegacy } from './thought-data-adapter.js';
import { SpatialClusters } from './spatial-clusters.js';
import { SemanticGooStrand } from './semantic-goo-strands.js';

const INITIAL_CAMERA = new THREE.Vector3(0, 0, 18);
const INITIAL_TARGET = new THREE.Vector3(0, 0, 0);
const MAX_DRAFT_TENTACLES = 4;
const DRAG_THRESHOLD = 5;
const SEMANTIC_RESUME_MS = 1800;
const clamp = THREE.MathUtils.clamp;
const smooth = value => value * value * (3 - 2 * value);
const plain = vector => ({ x: vector.x, y: vector.y, z: vector.z });
const finitePosition = value => value && ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));

export class ThoughtSpace3D {
  constructor({ container, input, resetButton, getState, onSelect, onDragStart, onDragEnd, onFrame, onError, visualParityDebug = false }) {
    this.container = container;
    this.visualParityDebug = visualParityDebug;
    this.input = input;
    this.resetButton = resetButton;
    this.getState = getState;
    this.onSelect = onSelect || (() => {});
    this.onDragStart = onDragStart || (() => {});
    this.onDragEnd = onDragEnd || (() => {});
    this.onFrame = onFrame || (() => {});
    this.onError = onError || (error => console.error(error));
    this.goos = new Map();
    this.semanticStrands = new Map();
    this.semanticComponents = [];
    this.manualPreviewTargetId = null;
    this.resumeAt = new Map();
    this.pulses = new Map();
    this.pickableBodies = [];
    this.projections = new Map();
    this.drag = null;
    this.fusion = null;
    this.transition = null;
    this.hovered = null;
    this.pointerInside = false;
    this.pointerDown = null;
    this.activePointers = new Set();
    this.keyboardIndex = -1;
    this.disposed = false;
    this.failed = false;
    this.enabled = false;
    this.elapsed = 0;
    this.lastTime = null;
    this.frameId = null;
    this.listeners = [];
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.scene = new THREE.Scene();
    this.spatialClusters = new SpatialClusters({ scene: this.scene });
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 180);
    this.camera.position.copy(INITIAL_CAMERA);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'thought-space-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '3D thought space. Drag empty space to orbit, scroll to zoom. Arrow keys browse thoughts, Enter focuses, Escape clears selection, R resets the view.');
    this.canvas.style.cursor = 'grab';
    container.append(this.canvas);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(INITIAL_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 48;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotate = false;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x695444, 1.8));
    this.resources = createGooResources();
    this.strandMaterial = this.resources.bodyMaterial.clone();
    this.strandMaterial.roughness = 0.65;
    this.strandMaterial.metalness = 0;
    this.strandMaterial.transparent = false;
    this.strandMaterial.opacity = 1;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pupilPointer = new THREE.Vector2();
    this.intersections = [];
    this.dragPlane = new THREE.Plane();
    this.anchor = new THREE.Vector3();
    this.scratch = Array.from({ length: 12 }, () => new THREE.Vector3());
    this.draftTentacles = Array.from({ length: MAX_DRAFT_TENTACLES }, (_, slot) => {
      const connection = new SemanticGooStrand({ scene: this.scene, material: this.strandMaterial,
        key: `draft-input:${slot}`, kind: 'draft' });
      return { slot, targetId: null, similarity: 0, progress: 0, desired: false, attachedAt: null,
        connection, object: connection.object };
    });
    this.manualStrand = new SemanticGooStrand({ scene: this.scene, material: this.strandMaterial,
      key: 'manual-combine', kind: 'manual' });
    this.installEvents();
    this.resize();
    this.tick = now => this.animate(now);
    this.frameId = requestAnimationFrame(this.tick);
  }

  listen(target, event, callback, options) {
    target?.addEventListener(event, callback, options);
    this.listeners.push(() => target?.removeEventListener(event, callback, options));
  }

  add(data, { newborn = false } = {}) {
    if (this.goos.has(data.id)) { this.update(data); return this.goos.get(data.id); }
    const goo = new ThoughtGoo3D(firebaseThoughtTo3DData(data, data.id), this.resources);
    // Application records never enter the visual class. Callbacks keep their
    // original record through this scene-owned association instead.
    goo.source = data;
    goo.homePosition = goo.basePosition.clone();
    this.spatialClusters.reset(goo);
    goo.draftOffset = new THREE.Vector3();
    goo.draftVelocity = new THREE.Vector3();
    if (newborn) goo.age = 0;
    this.goos.set(data.id, goo);
    this.scene.add(goo.group);
    this.pickableBodies.push(goo.body);
    this.syncSpatial(goo);
    return goo;
  }

  update(data, { position } = {}) {
    let goo = this.goos.get(data.id);
    if (!goo) return this.add(data);
    goo.source = data;
    goo.updateData(firebaseThoughtTo3DData(data, data.id));
    if (finitePosition(position) && this.drag?.goo !== goo && !this.isFusing(goo)) {
      goo.setPosition(position);
      this.reanchor(goo);
    }
    this.syncSpatial(goo);
    return goo;
  }

  reanchor(goo) {
    goo.homePosition.copy(goo.position);
    goo.basePosition.copy(goo.position);
    this.spatialClusters.reset(goo);
    goo.draftOffset.set(0, 0, 0); goo.draftVelocity.set(0, 0, 0);
    goo.velocity.set(0, 0, 0);
  }

  remove(id) {
    const goo = this.goos.get(id);
    if (!goo) return;
    if (this.drag?.goo === goo) this.cancelDrag();
    if (this.isFusing(goo)) this.cancelFusion();
    if (this.hovered === goo) this.hovered = null;
    if (this.manualPreviewTargetId === id) {
      this.manualStrand.hide();
      this.manualPreviewTargetId = null;
    }
    for (const [key, strand] of this.semanticStrands) {
      if (strand.aId === id || strand.bId === id) { strand.dispose(); this.semanticStrands.delete(key); }
    }
    for (const tentacle of this.draftTentacles) if (tentacle.targetId === id) this.resetTentacle(tentacle);
    const index = this.pickableBodies.indexOf(goo.body);
    if (index !== -1) this.pickableBodies.splice(index, 1);
    goo.dispose();
    this.goos.delete(id);
    this.spatialClusters.remove(id);
    this.resumeAt.delete(id);
    this.pulses.delete(id);
    this.projections.delete(id);
  }

  syncSpatial(goo) {
    const spatial = goo.source.spatial || (goo.source.spatial = {});
    spatial.x = goo.position.x; spatial.y = goo.position.y; spatial.z = goo.position.z;
  }

  legacyPosition(spatial) { return worldPositionToLegacy(spatial); }

  inputAnchor(out, fraction = 0.5) {
    const field = this.input.getBoundingClientRect(), rect = this.canvas.getBoundingClientRect();
    const point = this.scratch[8].set(
      ((field.left + field.width * fraction - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((field.top + Math.min(field.height * 0.28, 9) - rect.top) / Math.max(1, rect.height)) * 2 + 1, 0.5);
    this.camera.updateMatrixWorld();
    point.unproject(this.camera).sub(this.camera.position).normalize();
    const forward = this.camera.getWorldDirection(this.scratch[9]);
    return out.copy(this.camera.position).addScaledVector(point, 10 / Math.max(0.1, point.dot(forward)));
  }

  spawnPosition() {
    // Exact prototype spawn plane and small random right/up offsets.
    const position = this.camera.position.clone().addScaledVector(this.camera.getWorldDirection(this.scratch[0]), 7);
    position.addScaledVector(this.scratch[0].set(1, 0, 0).applyQuaternion(this.camera.quaternion), (Math.random() - 0.5) * 1.2);
    position.addScaledVector(this.scratch[0].set(0, 1, 0).applyQuaternion(this.camera.quaternion), (Math.random() - 0.5) * 0.8);
    return plain(position);
  }

  pendingPosition(a, b) {
    const one = this.goos.get(typeof a === 'string' ? a : a?.id);
    const two = this.goos.get(typeof b === 'string' ? b : b?.id);
    if (!one || !two) return this.spawnPosition('pending');
    const midpoint = new THREE.Vector3().addVectors(one.position, two.position).multiplyScalar(0.5);
    midpoint.addScaledVector(this.scratch[0].subVectors(this.camera.position, midpoint).normalize(), 1.3);
    return plain(midpoint);
  }

  pulse(id) { if (this.goos.has(id)) this.pulses.set(id, performance.now()); }
  get draftCount() { return this.draftTentacles.filter(tentacle => tentacle.desired && tentacle.targetId).length; }
  isFusing(goo) { return this.fusion && (this.fusion.a === goo || this.fusion.b === goo); }

  mobility(goo, state, now) {
    if (this.drag?.goo === goo || this.isFusing(goo) || state.isPaused?.(goo.source)) return 0;
    return clamp((now - (this.resumeAt.get(goo.data.id) ?? -Infinity)) / SEMANTIC_RESUME_MS, 0, 1);
  }

  resize() {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth), height = Math.max(1, rect.height || window.innerHeight);
    this.width = width; this.height = height;
    this.camera.aspect = width / height;
    this.camera.fov = Math.max(44, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(22)) * 1.18 / Math.min(this.camera.aspect, 1.18))));
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
  }

  updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.pupilPointer.copy(this.pointer);
  }

  pick(exclude = null) {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.pickableBodies, false, this.intersections);
    for (const hit of this.intersections) {
      const goo = this.goos.get(hit.object.userData.thoughtId);
      if (goo && goo !== exclude) return goo;
    }
    return null;
  }

  installEvents() {
    const capture = { capture: true };
    this.listen(this.canvas, 'pointerdown', event => {
      const state = this.getState();
      if (!state.enabled) return;
      if (this.transition) { this.transition = null; this.controls.enabled = true; }
      this.activePointers.add(event.pointerId);
      if (this.drag) { event.stopImmediatePropagation(); event.preventDefault(); return; }
      this.updatePointer(event);
      this.pointerInside = true;
      const goo = event.button === 0 && this.activePointers.size === 1 ? this.pick() : null;
      this.pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: this.activePointers.size > 1 };
      this.canvas.focus({ preventScroll: true });
      if (!goo) { this.canvas.style.cursor = 'grabbing'; return; }
      event.stopImmediatePropagation(); event.preventDefault();
      if (state.isPaused?.(goo.source)) {
        this.pointerDown.pausedGoo = goo;
        this.canvas.setPointerCapture(event.pointerId);
        return;
      }
      this.controls.enabled = false;
      this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(this.scratch[0]), goo.position);
      this.raycaster.ray.intersectPlane(this.dragPlane, this.scratch[1]);
      this.drag = { goo, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
        offset: goo.position.clone().sub(this.scratch[1]), target: goo.position.clone(), start: goo.position.clone() };
      goo.velocity.set(0, 0, 0);
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.style.cursor = 'grabbing';
      this.onDragStart(goo.source);
    }, capture);
    this.listen(this.canvas, 'pointermove', event => {
      this.updatePointer(event); this.pointerInside = true;
      if (this.pointerDown && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > DRAG_THRESHOLD) this.pointerDown.moved = true;
      const drag = this.drag;
      if (!drag || drag.id !== event.pointerId) return;
      event.stopImmediatePropagation(); event.preventDefault();
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > DRAG_THRESHOLD) drag.moved = true;
      if (drag.moved) this.updateDragTarget();
    }, capture);
    this.listen(this.canvas, 'pointerup', event => {
      this.activePointers.delete(event.pointerId);
      this.updatePointer(event);
      if (this.pointerDown?.id === event.pointerId && this.pointerDown.pausedGoo) {
        event.stopImmediatePropagation(); event.preventDefault();
        if (!this.pointerDown.moved) this.onSelect(this.pointerDown.pausedGoo.source);
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      } else if (this.drag?.id === event.pointerId) {
        event.stopImmediatePropagation(); event.preventDefault();
        const drag = this.drag;
        if (drag.moved) { this.updateDragTarget(); drag.goo.position.copy(drag.target); this.syncSpatial(drag.goo); }
        const target = drag.moved ? this.findCombineTarget(drag.goo) : null;
        this.finishDrag(true, target);
        if (!drag.moved) this.onSelect(drag.goo.source);
      } else if (this.pointerDown?.id === event.pointerId && !this.pointerDown.moved && this.activePointers.size === 0 && event.button === 0) {
        this.onSelect(null);
      }
      if (!this.activePointers.size) this.pointerDown = null;
      this.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
    }, capture);
    this.listen(this.canvas, 'pointercancel', event => {
      this.activePointers.delete(event.pointerId);
      if (this.drag?.id === event.pointerId) { event.stopImmediatePropagation(); this.cancelDrag(); }
      this.pointerDown = null;
    }, capture);
    this.listen(this.canvas, 'lostpointercapture', event => { if (this.drag?.id === event.pointerId) this.cancelDrag(); });
    this.listen(this.canvas, 'pointerleave', () => { if (!this.drag) { this.pointerInside = false; this.hovered = null; } });
    this.listen(this.canvas, 'dblclick', event => {
      if (!this.getState().enabled || this.pointerDown?.moved) return;
      this.updatePointer(event);
      const goo = this.pick();
      if (goo) this.focus(goo.data.id);
    });
    this.listen(this.canvas, 'keydown', event => {
      if (!this.getState().enabled || event.isComposing) return;
      const ids = [...this.goos.keys()];
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key) && ids.length) {
        event.preventDefault();
        const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        this.keyboardIndex = (this.keyboardIndex + direction + ids.length) % ids.length;
        const goo = this.goos.get(ids[this.keyboardIndex]);
        this.onSelect(goo.source);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = this.getState().selectedIds;
        const id = Array.isArray(selected) ? selected.at(-1) : [...(selected || [])].at(-1);
        if (id) this.focus(id);
      } else if (event.key === 'Escape') { this.cancelDrag(); this.onSelect(null); }
      else if (event.key.toLowerCase() === 'r') this.resetView();
    });
    this.listen(this.resetButton, 'click', () => this.resetView());
    this.listen(window, 'resize', () => this.resize());
    this.listen(window, 'pointermove', event => {
      const rect = this.canvas.getBoundingClientRect();
      // Authentication hides the canvas. A hidden 0×0 rectangle is not a
      // coordinate system: keep the last valid pointer until the space opens.
      if (!rect.width || !rect.height) return;
      this.pupilPointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    }, { passive: true });
    this.listen(window, 'blur', () => { this.cancelDrag(); this.activePointers.clear(); this.pointerDown = null; this.pointerInside = false; });
    this.listen(document, 'visibilitychange', () => { this.lastTime = null; if (document.hidden) this.cancelDrag(); });
    this.listen(window, 'pagehide', event => { if (!event.persisted) this.dispose(); });
    this.listen(this.canvas, 'webglcontextlost', event => {
      event.preventDefault(); this.fail(new Error('The graphics connection was interrupted. Reload to reopen the 3D thought space.'));
    });
  }

  updateDragTarget() {
    const drag = this.drag;
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.scratch[0])) {
      drag.target.copy(this.scratch[0]).add(drag.offset);
      if (drag.target.length() > 60) drag.target.setLength(60);
    }
  }

  findCombineTarget(goo) {
    const state = this.getState();
    let best = null, distance = Infinity;
    for (const other of this.goos.values()) {
      if (other === goo || !state.canCombine?.(goo.source, other.source)) continue;
      const gap = goo.position.distanceTo(other.position);
      if (gap <= (goo.radius + other.radius) * 0.65 && gap < distance) { best = other; distance = gap; }
    }
    if (best) return best.source;
    // A camera-facing plane has fixed depth. A deliberate deep silhouette overlap
    // plus a real target ray hit also permits combining thoughts at different depths.
    const hit = this.pick(goo);
    if (!hit || !state.canCombine?.(goo.source, hit.source)) return null;
    const a = this.project(goo.data.id), b = this.project(hit.data.id);
    return a?.visible && b?.visible && Math.hypot(a.x - b.x, a.y - b.y) <= (a.radius + b.radius) * 0.5 ? hit.source : null;
  }

  finishDrag(released, target = null) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    this.manualStrand.hide();
    this.manualPreviewTargetId = null;
    this.controls.enabled = this.getState().enabled && !this.transition;
    if (!released) drag.goo.position.copy(drag.start);
    if (released && drag.moved) this.reanchor(drag.goo);
    drag.goo.velocity.set(0, 0, 0);
    this.syncSpatial(drag.goo);
    this.resumeAt.set(drag.goo.data.id, performance.now());
    if (this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id);
    this.onDragEnd(drag.goo.source, { moved: drag.moved, released, target });
  }

  cancelDrag() {
    this.finishDrag(false);
    this.activePointers.clear();
    this.pointerDown = null;
  }

  startFusion(a, b) {
    const one = this.goos.get(typeof a === 'string' ? a : a?.id), two = this.goos.get(typeof b === 'string' ? b : b?.id);
    if (!one || !two || one === two) return Promise.resolve(false);
    this.cancelFusion();
    return new Promise(resolve => {
      this.fusion = { a: one, b: two, fromA: one.position.clone(), fromB: two.position.clone(),
        midpoint: new THREE.Vector3().addVectors(one.position, two.position).multiplyScalar(0.5), elapsed: 0, compression: 0, resolve };
      one.velocity.set(0, 0, 0); two.velocity.set(0, 0, 0);
    });
  }

  cancelFusion() {
    const fusion = this.fusion;
    if (!fusion) return;
    this.fusion = null;
    for (const [goo, from] of [[fusion.a, fusion.fromA], [fusion.b, fusion.fromB]]) {
      goo.position.copy(from); goo.velocity.set(0, 0, 0); this.syncSpatial(goo);
      this.resumeAt.set(goo.data.id, performance.now());
    }
    this.manualStrand.hide();
    fusion.resolve(false);
  }

  advanceFusion(dt, now) {
    const fusion = this.fusion;
    if (!fusion) return;
    fusion.elapsed += dt;
    const amount = fusion.elapsed <= 0.7 ? smooth(clamp(fusion.elapsed / 0.7, 0, 1)) : 1 - smooth(clamp((fusion.elapsed - 0.7) / 0.6, 0, 1));
    fusion.a.position.copy(fusion.fromA).lerp(fusion.midpoint, amount * 0.33);
    fusion.b.position.copy(fusion.fromB).lerp(fusion.midpoint, amount * 0.33);
    fusion.compression = amount * 0.24;
    // The same wobble and completion trigger; only its temporary rendering changes.
    fusion.strandAmount = amount;
    if (fusion.elapsed >= 1.3) {
      this.fusion = null;
      fusion.a.position.copy(fusion.fromA); fusion.b.position.copy(fusion.fromB);
      this.syncSpatial(fusion.a); this.syncSpatial(fusion.b);
      this.resumeAt.set(fusion.a.data.id, now); this.resumeAt.set(fusion.b.data.id, now);
      this.manualStrand.hide();
      fusion.resolve(true);
    }
  }

  moveView(target, position) {
    if (this.drag) this.cancelDrag();
    const fromCamera = this.camera.position.clone(), fromTarget = this.controls.target.clone();
    this.controls.enabled = false;
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.copy(fromCamera); this.controls.target.copy(fromTarget); this.controls.update();
    this.controls.enableDamping = damping;
    const fromOrbit = new THREE.Spherical().setFromVector3(fromCamera.sub(fromTarget));
    const toOrbit = new THREE.Spherical().setFromVector3(this.scratch[0].subVectors(position, target));
    toOrbit.theta = fromOrbit.theta + THREE.MathUtils.euclideanModulo(toOrbit.theta - fromOrbit.theta + Math.PI, 2 * Math.PI) - Math.PI;
    this.transition = { elapsed: 0, duration: this.reducedMotion.matches ? 0.15 : 0.85,
      fromTarget, toTarget: target.clone(), fromOrbit, toOrbit };
  }

  focus(id) {
    const goo = this.goos.get(id);
    if (!goo) return;
    const selected = this.getState().selectedIds;
    if (!(selected?.includes?.(id) || selected?.has?.(id))) this.onSelect(goo.source);
    const position = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize().multiplyScalar(9).add(goo.position);
    this.moveView(goo.position, position);
  }

  resetView() { this.onSelect(null); this.moveView(INITIAL_TARGET, INITIAL_CAMERA); }

  advanceCamera(dt) {
    const transition = this.transition;
    if (transition) {
      transition.elapsed = Math.min(transition.duration, transition.elapsed + dt);
      const amount = smooth(transition.elapsed / transition.duration);
      this.controls.target.lerpVectors(transition.fromTarget, transition.toTarget, amount);
      const offset = this.scratch[0].setFromSphericalCoords(
        THREE.MathUtils.lerp(transition.fromOrbit.radius, transition.toOrbit.radius, amount),
        THREE.MathUtils.lerp(transition.fromOrbit.phi, transition.toOrbit.phi, amount),
        THREE.MathUtils.lerp(transition.fromOrbit.theta, transition.toOrbit.theta, amount));
      this.camera.position.copy(this.controls.target).add(offset);
      if (transition.elapsed >= transition.duration) { this.transition = null; this.controls.enabled = this.enabled && !this.drag; }
    }
    this.controls.update();
    this.camera.updateMatrixWorld();
  }

  resetTentacle(tentacle) {
    tentacle.targetId = null; tentacle.progress = 0; tentacle.desired = false; tentacle.attachedAt = null;
    tentacle.connection.hide();
  }

  advanceTentacles(state, dt, now) {
    const targets = state.draftActive ? [...(state.draftTargets || new Map())].filter(([id]) => this.goos.has(id))
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, MAX_DRAFT_TENTACLES) : [];
    const desired = new Map(targets);
    for (const tentacle of this.draftTentacles) {
      tentacle.desired = Boolean(tentacle.targetId && desired.has(tentacle.targetId));
      if (tentacle.desired) tentacle.similarity = desired.get(tentacle.targetId);
      else if (tentacle.targetId) {
        tentacle.attachedAt = null;
        tentacle.progress = Math.max(0, tentacle.progress - dt / 0.3);
        if (!tentacle.progress || !this.goos.has(tentacle.targetId)) this.resetTentacle(tentacle);
      }
    }
    for (const [id, similarity] of targets) {
      if (this.draftTentacles.some(tentacle => tentacle.targetId === id)) continue;
      const slot = this.draftTentacles.find(tentacle => !tentacle.targetId);
      if (!slot) break;
      slot.targetId = id; slot.similarity = similarity; slot.desired = true;
    }
    for (const tentacle of this.draftTentacles) {
      if (!tentacle.targetId) continue;
      if (tentacle.desired) tentacle.progress = Math.min(1, tentacle.progress + dt / 0.45);
      if (tentacle.desired && tentacle.progress >= 1 && tentacle.attachedAt === null) {
        tentacle.attachedAt = now; this.pulse(tentacle.targetId);
      }
    }
  }

  isPublicGoo(goo) {
    return Boolean(goo?.source && goo.source.type !== 'pending' && goo.data.type !== 'pending');
  }

  acceptedSemanticEdges(state) {
    // Every consumer checks the application's final graph again. Distance,
    // debug fixtures and stale pair objects can never grant a semantic edge.
    if (typeof state.isSemanticEdgeAccepted !== 'function') return [];
    const minimum = Math.max(0.70, Number.isFinite(state.semanticMinSimilarity) ? state.semanticMinSimilarity : 0.70);
    const strongMinimum = Math.max(minimum, 0.82,
      Number.isFinite(state.semanticStrongSimilarity) ? state.semanticStrongSimilarity : 0.82);
    const accepted = [], seen = new Set();
    for (const pair of state.semanticPairs || []) {
      if (!pair || pair.active !== true || typeof pair.key !== 'string' || pair.aId === pair.bId ||
          !Number.isFinite(pair.similarity) || pair.similarity < minimum || pair.similarity > 1 ||
          !(pair.mutual === true || (pair.strong === true && pair.similarity >= strongMinimum))) continue;
      if (!this.isPublicGoo(this.goos.get(pair.aId)) || !this.isPublicGoo(this.goos.get(pair.bId))) continue;
      if (state.isSemanticEdgeAccepted(pair) !== true) continue;
      const endpoints = JSON.stringify([pair.aId, pair.bId].sort());
      if (seen.has(endpoints)) continue;
      seen.add(endpoints);
      accepted.push(pair);
    }
    return accepted;
  }

  refreshSemanticGraph(state) {
    // Filtering stays in the existing application. The layout and original
    // relationship renderer consume only these final accepted edges.
    const edges = this.acceptedSemanticEdges(state);
    this.spatialClusters.refresh(this.goos, edges);
    this.semanticComponents = this.spatialClusters.clusters.map(cluster => cluster.ids);
    return edges;
  }

  applyForces(state, dt, now) {
    const edges = this.refreshSemanticGraph(state);
    const activeDraftIds = new Set();
    if (state.draftActive) {
      this.inputAnchor(this.anchor);
      for (const tentacle of this.draftTentacles) {
        const goo = this.goos.get(tentacle.targetId);
        if (!goo || !tentacle.desired || tentacle.attachedAt === null) continue;
        activeDraftIds.add(goo.data.id);
        const direction = this.scratch[0].subVectors(this.anchor, goo.position), distance = direction.length();
        const gap = distance - (goo.collisionRadius + 1.25);
        if (gap <= 0 || distance < 0.001) continue;
        const force = 0.65 * tentacle.similarity * clamp(gap / 5, 0, 1) * clamp((now - tentacle.attachedAt) / 400, 0, 1);
        goo.draftVelocity.addScaledVector(direction.multiplyScalar(1 / distance), force * this.mobility(goo, state, now) * dt);
      }
    }
    this.spatialClusters.update({ goos: this.goos, acceptedEdges: edges, dt,
      mobility: goo => this.mobility(goo, state, now), draftIds: activeDraftIds, enabled: state.enabled });
    for (const goo of this.goos.values()) {
      const mobility = this.mobility(goo, state, now);
      if (!mobility) {
        goo.draftVelocity.set(0, 0, 0);
        continue;
      }
      // Draft influence remains temporary and local. Cluster forces yield
      // while it is active, then ease back without moving the saved position.
      if (!activeDraftIds.has(goo.data.id)) goo.draftVelocity.addScaledVector(goo.draftOffset, -1.8 * dt);
      goo.draftVelocity.multiplyScalar(Math.exp(-2.2 * dt)).clampLength(0, 0.4);
      goo.draftOffset.addScaledVector(goo.draftVelocity, dt * mobility).clampLength(0, 2.4);
    }
  }

  moveGoos(state, dt, now) {
    for (const goo of this.goos.values()) {
      if (this.drag?.goo === goo) {
        if (this.drag.moved) goo.position.lerp(this.drag.target, 1 - Math.exp(-24 * dt));
        continue;
      }
      const mobility = this.mobility(goo, state, now);
      if (!mobility) { goo.velocity.set(0, 0, 0); continue; }
      goo.basePosition.copy(goo.homePosition).add(goo.spatialOffset).add(goo.draftOffset);
      goo.applyFloat(this.elapsed, dt, this.reducedMotion.matches);
      // The prototype float stays below this safety ceiling. External forces
      // cannot turn its slow movement into an accelerating drift.
      goo.velocity.clampLength(0, 0.65);
      goo.position.addScaledVector(goo.velocity, dt);
    }
    const goos = [...this.goos.values()];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < goos.length; i++) for (let j = i + 1; j < goos.length; j++) {
      const a = goos[i], b = goos[j];
      // User overlap is intentional and must survive until release. Automatic
      // overlap only repels, and never calls the manual-combine callback.
      if (this.drag?.goo === a || this.drag?.goo === b || this.isFusing(a) || this.isFusing(b)) continue;
      const direction = this.scratch[0].subVectors(b.position, a.position);
      const distance = direction.length(), minimum = a.collisionRadius + b.collisionRadius + 0.04;
      if (distance >= minimum) continue;
      if (distance < 0.00001) direction.set(1, 0, 0);
      else direction.multiplyScalar(1 / distance);
      const ma = this.mobility(a, state, now), mb = this.mobility(b, state, now), total = ma + mb;
      if (!total) continue;
      const overlap = minimum - distance, correction = overlap * (1 - Math.exp(-12 * dt));
      a.position.addScaledVector(direction, -correction * ma / total);
      b.position.addScaledVector(direction, correction * mb / total);
      if (pass === 0) {
        a.velocity.addScaledVector(direction, -overlap * dt * 1.8 * ma);
        b.velocity.addScaledVector(direction, overlap * dt * 1.8 * mb);
      }
    }
  }

  renderManualPreview(state, dt = 0) {
    if (!state.enabled) {
      this.manualStrand.hide(); this.manualPreviewTargetId = null;
      return;
    }
    let a, b, strength;
    if (this.fusion) {
      a = this.fusion.a; b = this.fusion.b;
      strength = 0.86 + 0.14 * (this.fusion.strandAmount || 0);
    } else if (this.drag?.moved && this.goos.has(this.drag.goo.data.id)) {
      a = this.drag.goo;
      const target = this.findCombineTarget(a);
      b = target && this.goos.get(target.id);
      // This wider range is a visual preview only. Releasing still uses the
      // original intentional overlap test in findCombineTarget/onDragEnd.
      if (!b) {
        let nearestGap = 2.4;
        for (const other of this.goos.values()) {
          if (other === a || !state.canCombine?.(a.source, other.source)) continue;
          const gap = a.position.distanceTo(other.position) - a.collisionRadius - other.collisionRadius;
          if (gap < nearestGap) { nearestGap = gap; b = other; }
        }
      }
      if (b) {
        const gap = a.position.distanceTo(b.position) - a.collisionRadius - b.collisionRadius;
        strength = 0.25 + 0.75 * (1 - clamp(gap / 2.4, 0, 1));
      }
    }
    if (!a || !b || a === b) {
      this.manualStrand.hide(); this.manualPreviewTargetId = null;
      return;
    }
    if (this.manualPreviewTargetId !== b.data.id) this.manualStrand.hide();
    this.manualPreviewTargetId = b.data.id;
    this.manualStrand.aId = a.data.id; this.manualStrand.bId = b.data.id;
    this.manualStrand.update({ a: a.position, b: b.position, gooA: a, gooB: b,
      radiusA: a.radius, radiusB: b.radius, strength, dt, active: true,
      reducedMotion: this.reducedMotion.matches });
  }

  renderStrands(state, dt = 0) {
    this.renderManualPreview(state, dt);
    const used = new Set();
    // Exactly one permanent renderer, fed only by the accepted semantic graph.
    for (const pair of this.refreshSemanticGraph(state)) {
      const a = this.goos.get(pair.aId), b = this.goos.get(pair.bId);
      if (!a || !b) continue;
      const key = pair.key;
      used.add(key);
      let strand = this.semanticStrands.get(key);
      if (!strand) {
        strand = new SemanticGooStrand({ scene: this.scene, material: this.strandMaterial, key, kind: 'semantic' });
        strand.aId = pair.aId; strand.bId = pair.bId;
        this.semanticStrands.set(key, strand);
      }
      const manualOwnsPair = this.manualPreviewTargetId !== null &&
        ((this.manualStrand.aId === pair.aId && this.manualStrand.bId === pair.bId) ||
         (this.manualStrand.aId === pair.bId && this.manualStrand.bId === pair.aId));
      strand.update({ a: a.position, b: b.position, gooA: a, gooB: b,
        radiusA: a.radius, radiusB: b.radius, strength: pair.similarity, dt,
        active: Boolean(state.enabled) && !manualOwnsPair, reducedMotion: this.reducedMotion.matches });
    }
    for (const [key, strand] of this.semanticStrands) if (!used.has(key)) {
      strand.dispose(); this.semanticStrands.delete(key);
    }
    for (const tentacle of this.draftTentacles) {
      const goo = this.goos.get(tentacle.targetId);
      if (!goo || tentacle.progress <= 0) { tentacle.connection.hide(); continue; }
      const origin = this.inputAnchor(this.scratch[0], [0.18, 0.40, 0.62, 0.84][tentacle.slot]);
      tentacle.connection.update({ a: origin, b: goo.position, gooA: null, gooB: goo,
        radiusA: 0, radiusB: goo.radius, strength: tentacle.similarity, dt,
        progress: tentacle.progress, active: Boolean(state.enabled), reducedMotion: this.reducedMotion.matches });
    }
  }

  project(id) {
    const goo = this.goos.get(id);
    if (!goo) return null;
    const rect = this.canvas.getBoundingClientRect();
    const point = this.scratch[10].copy(goo.position).project(this.camera);
    const side = this.scratch[11].set(1, 0, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(goo.collisionRadius).add(goo.position).project(this.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2,
      y: rect.top + (1 - point.y) * rect.height / 2,
      radius: Math.abs(side.x - point.x) * rect.width / 2,
      visible: point.z >= -1 && point.z <= 1 && point.x > -1.25 && point.x < 1.25 && point.y > -1.25 && point.y < 1.25 };
  }

  animate(now) {
    if (this.disposed || this.failed) return;
    try {
      const dt = this.lastTime === null ? 0 : Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.04);
      this.lastTime = now; this.elapsed += dt;
      const state = this.getState();
      this.enabled = Boolean(state.enabled);
      this.controls.enabled = this.enabled && !this.drag && !this.transition;
      if (!this.enabled) { this.cancelDrag(); this.cancelFusion(); }
      this.advanceCamera(dt);
      this.advanceTentacles(this.enabled ? state : { draftActive: false }, dt, now);
      if (this.enabled) { if (!this.visualParityDebug) this.applyForces(state, dt, now); this.moveGoos(state, dt, now); this.advanceFusion(dt, now); }
      this.projections.clear();
      for (const goo of this.goos.values()) {
        this.syncSpatial(goo);
        const start = this.pulses.get(goo.data.id), pulse = start === undefined ? 0 : Math.max(0, 1 - (now - start) / 440);
        if (start !== undefined && !pulse) this.pulses.delete(goo.data.id);
        const selected = state.selectedIds?.includes?.(goo.data.id) || state.selectedIds?.has?.(goo.data.id) || false;
        goo.render(this.elapsed, dt, this.camera, { hovered: this.hovered === goo, selected, pointer: this.pupilPointer,
          reducedMotion: this.reducedMotion.matches, pulse: this.visualParityDebug ? 0 : pulse, compression: this.isFusing(goo) ? this.fusion.compression : 0 });
        this.projections.set(goo.data.id, this.project(goo.data.id));
      }
      this.renderStrands(state, dt);
      if (this.enabled && this.pointerInside && !this.drag && !this.pointerDown) {
        this.hovered = this.pick(); this.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
      }
      this.onFrame(dt, now, this.projections);
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(this.tick);
    } catch (error) { this.fail(error); }
  }

  fail(error) {
    if (this.failed || this.disposed) return;
    this.failed = true;
    cancelAnimationFrame(this.frameId);
    this.cancelDrag(); this.cancelFusion(); this.controls.enabled = false;
    this.onError(error);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.cancelDrag(); this.cancelFusion();
    this.listeners.forEach(remove => remove());
    this.listeners.length = 0;
    this.controls.dispose();
    for (const goo of this.goos.values()) goo.dispose();
    this.goos.clear(); this.pickableBodies.length = 0;
    for (const strand of this.semanticStrands.values()) strand.dispose();
    this.semanticStrands.clear();
    this.spatialClusters.dispose(); this.semanticComponents.length = 0;
    for (const tentacle of this.draftTentacles) tentacle.connection.dispose();
    this.manualStrand.dispose(); this.strandMaterial.dispose();
    this.resources.dispose(); this.renderer.dispose(); this.canvas.remove();
    this.resumeAt.clear(); this.pulses.clear(); this.projections.clear();
  }
}
