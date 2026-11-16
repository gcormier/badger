import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuildResult } from './geometry/pipeline';

export type ViewName = 'bottom' | 'top' | 'iso';

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private overlay = new THREE.Group();
  private caseMat = new THREE.MeshStandardMaterial({ color: 0xc92a28, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });
  private logoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private centre = new THREE.Vector3(30.6, 60.3, 2.9);
  private size = 130;
  private needsFit = true;
  showOverlay = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
    this.camera.up.set(0, 1, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.6));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.4); d1.position.set(80, 120, 160);
    const d2 = new THREE.DirectionalLight(0xffffff, 1.0); d2.position.set(-60, -40, -160);
    this.scene.add(d1, d2, this.group, this.overlay);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  setBackground(css: string) {
    this.scene.background = new THREE.Color(css);
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setColors(caseColor: string, logoColor: string) {
    this.caseMat.color.set(caseColor);
    this.logoMat.color.set(logoColor);
  }

  update(r: BuildResult) {
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    for (const c of [...this.overlay.children]) { this.overlay.remove(c); (c as THREE.Line).geometry?.dispose(); }
    const mk = (pos: Float32Array, idx: Uint32Array, mat: THREE.Material) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const flat = g.toNonIndexed();
      g.dispose();
      flat.computeVertexNormals();
      return new THREE.Mesh(flat, mat);
    };
    this.group.add(mk(r.caseMesh.positions, r.caseMesh.indices, this.caseMat));
    if (r.logoMesh) this.group.add(mk(r.logoMesh.positions, r.logoMesh.indices, this.logoMat));

    if (r.logo && this.showOverlay) {
      const z = -0.05;
      const addLoops = (polys: [number, number][][], color: number, dashed = false) => {
        for (const poly of polys) {
          if (poly.length < 2) continue;
          const pts = poly.map(([x, y]) => new THREE.Vector3(x, y, z));
          const g = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = dashed
            ? new THREE.LineDashedMaterial({ color, dashSize: 1, gapSize: 0.8, transparent: true, opacity: 0.8 })
            : new THREE.LineBasicMaterial({ color });
          const line = new THREE.LineLoop(g, mat);
          if (dashed) line.computeLineDistances();
          line.renderOrder = 10;
          this.overlay.add(line);
        }
      };
      addLoops(r.logo.allowed as [number, number][][], 0x2b8cff, true);
      addLoops(r.logo.removed as [number, number][][], 0xff00d4);
      addLoops(r.logo.clipped as [number, number][][], 0xffa000);
    }

    const [x0, y0, z0] = r.bbox.min, [x1, y1, z1] = r.bbox.max;
    this.centre.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.size = Math.max(x1 - x0, y1 - y0);
    if (this.needsFit) { this.setView('bottom'); this.needsFit = false; }
  }

  setView(v: ViewName) {
    const dist = (this.size / 2) / Math.tan((this.camera.fov * Math.PI) / 360) * 1.25;
    const c = this.centre;
    this.camera.up.set(0, 1, 0);
    if (v === 'bottom') this.camera.position.set(c.x, c.y, c.z - dist);
    else if (v === 'top') this.camera.position.set(c.x, c.y, c.z + dist);
    else this.camera.position.set(c.x + dist * 0.55, c.y - dist * 0.35, c.z + dist * 0.75);
    this.controls.target.copy(c);
    this.camera.lookAt(c);
    this.controls.update();
  }

  snapshot(): string {
    return this.renderer.domElement.toDataURL('image/png');
  }
}
