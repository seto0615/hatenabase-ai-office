import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildIslandSign,
  buildRoom,
  buildSeat,
  buildWallDecor,
  type CharacterParts,
} from "./build";
import type { AgentCard, AgentRuntime, Island } from "../types";

/** 座席配置 */
const PM_SEAT = new THREE.Vector3(0, 0, -5.2);
const DELIVER_POINT = new THREE.Vector3(0, 0, -2.9);
const ROW_Z = [-2.0, 0.6, 3.2, 5.8];
const ROW_GAP = 3.4;

const OVERVIEW_POS = new THREE.Vector3(0, 9.4, 17.4);
const OVERVIEW_TARGET = new THREE.Vector3(0, 1.0, -0.4);

const DELIVER_SECONDS = 3.4;

interface CharacterState {
  member: AgentCard;
  parts: CharacterParts;
  seat: THREE.Vector3;
  runtime: AgentRuntime;
  fallbackLine: string | null;
  walkProgress: number;
  lastWalkKey?: number;
  seed: number;
}

export interface OfficeUpdate {
  statuses: Record<string, AgentRuntime>;
  running: boolean;
  pmStatus: string;
  phase: string;
}

/**
 * 素のthree.jsで動くオフィス。Reactからは create → update → dispose だけを呼ぶ。
 */
export class OfficeStage {
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private characters = new Map<string, CharacterState>();
  private board: { boardPhase: HTMLElement; boardNote: HTMLElement };
  private raf = 0;
  private observer: ResizeObserver;
  private container: HTMLElement;
  private autoCamera = true;
  private running = false;
  private camPos = OVERVIEW_POS.clone();
  private camTarget = OVERVIEW_TARGET.clone();
  private disposed = false;

  constructor(container: HTMLElement, islands: Island[], pm: AgentCard) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = "officeCanvas";
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = "officeLabels";
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 160);
    this.camera.position.copy(OVERVIEW_POS);
    this.camera.lookAt(OVERVIEW_TARGET);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(OVERVIEW_TARGET);
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 30;
    this.controls.enableDamping = true;
    this.controls.enabled = false;

    this.scene.background = new THREE.Color(0xf0e7d8);

    const ambient = new THREE.AmbientLight(0xfff3e2, 1.15);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe6c2, 2.1);
    sun.position.set(7, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    this.scene.add(sun);

    const sunset = new THREE.DirectionalLight(0xff9d5c, 1.1);
    sunset.position.set(-3, 5, -10);
    this.scene.add(sunset);

    buildRoom(this.scene);
    this.board = buildWallDecor(this.scene);

    // PM席
    this.addCharacter(pm, PM_SEAT, true);

    // 島ごとの座席
    islands.forEach((island, row) => {
      const z = ROW_Z[Math.min(row, ROW_Z.length - 1)];
      const count = island.members.length;
      island.members.forEach((member, col) => {
        const x = (col - (count - 1) / 2) * ROW_GAP;
        this.addCharacter(member, new THREE.Vector3(x, 0, z), false);
      });
      buildIslandSign(
        this.scene,
        new THREE.Vector3(-((count - 1) / 2) * ROW_GAP - 2.7, 0.6, z + 0.6),
        island.room,
      );
    });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private addCharacter(member: AgentCard, seat: THREE.Vector3, isPm: boolean): void {
    const parts = buildSeat(this.scene, member, seat, isPm);
    this.characters.set(member.id, {
      member,
      parts,
      seat: seat.clone(),
      runtime: { status: "idle", chars: 0 },
      fallbackLine: null,
      walkProgress: 1,
      seed: member.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 100,
    });
  }

  /** Reactの状態を流し込む。毎フレームではなく状態変化時に呼ばれる。 */
  update(update: OfficeUpdate): void {
    this.running = update.running;
    this.board.boardPhase.textContent = update.running ? update.phase : "待機中";
    this.board.boardNote.textContent = update.running
      ? update.pmStatus
      : "指示をお待ちしています";

    for (const [id, ch] of this.characters) {
      const runtime = update.statuses[id] ?? { status: "idle" as const, chars: 0 };
      if (ch.runtime.walkKey !== runtime.walkKey && runtime.walkKey !== undefined) {
        ch.walkProgress = 0;
      }
      ch.runtime = runtime;
      ch.fallbackLine = id === "pm" && update.running ? update.pmStatus : null;
      this.applyBubble(ch);
    }
  }

  setAutoCamera(auto: boolean): void {
    this.autoCamera = auto;
    this.controls.enabled = !auto;
    if (!auto) {
      this.controls.target.copy(this.camTarget);
      this.controls.update();
    }
  }

  private applyBubble(ch: CharacterState): void {
    const line = this.bubbleLine(ch);
    if (line) {
      ch.parts.sayEl.style.display = "";
      ch.parts.sayBody.textContent = line;
    } else {
      ch.parts.sayEl.style.display = "none";
    }
    ch.parts.tagEl.classList.toggle("is-working", ch.runtime.status === "working");
  }

  private bubbleLine(ch: CharacterState): string | null {
    switch (ch.runtime.status) {
      case "working":
        return ch.runtime.notice || ch.runtime.snippet || ch.member.greeting;
      case "queued":
        return "指示を確認しています";
      case "done":
        return ch.member.report;
      case "error":
        return ch.runtime.message || "手が止まりました";
      default:
        return ch.fallbackLine;
    }
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  private loop(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const delta = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    let focusSeat: THREE.Vector3 | null = null;
    let delivering = false;

    for (const ch of this.characters.values()) {
      this.animateCharacter(ch, t, delta);
      if (!focusSeat && ch.runtime.status === "working" && ch.member.id !== "pm") {
        focusSeat = ch.seat;
      }
      if (ch.runtime.walkKey !== undefined && ch.walkProgress < 1) delivering = true;
    }

    this.animateCamera(t, delta, focusSeat, delivering);

    this.controls.enabled = !this.autoCamera;
    if (!this.autoCamera) this.controls.update();

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private animateCharacter(ch: CharacterState, t: number, delta: number): void {
    const { group, paper, screenGlow } = ch.parts;
    const { runtime, seat, seed } = ch;

    if (runtime.walkKey !== undefined && ch.walkProgress < 1) {
      ch.walkProgress = Math.min(1, ch.walkProgress + delta / DELIVER_SECONDS);
    }
    const p = ch.walkProgress;

    // 席 → PMデスク → 席 の折り返し
    let mix = 0;
    if (runtime.walkKey !== undefined) {
      if (p < 0.12) mix = 0;
      else if (p < 0.42) mix = (p - 0.12) / 0.3;
      else if (p < 0.58) mix = 1;
      else if (p < 0.88) mix = 1 - (p - 0.58) / 0.3;
      else mix = 0;
    }
    const walking = mix > 0 && mix < 1;
    const standing = runtime.walkKey !== undefined && p > 0.06 && p < 0.94;

    group.position.lerpVectors(seat, DELIVER_POINT, easeInOut(mix));

    const wantY = standing ? 0.3 : 0;
    group.position.y += (wantY - group.position.y) * Math.min(1, delta * 8);
    if (walking) group.position.y += Math.abs(Math.sin(t * 9 + seed)) * 0.06;

    if (walking) {
      const dir = new THREE.Vector3().subVectors(DELIVER_POINT, seat);
      const face = Math.atan2(dir.x, dir.z) + (p > 0.5 ? Math.PI : 0);
      group.rotation.y += (face - group.rotation.y) * Math.min(1, delta * 5);
    } else {
      group.rotation.y += (0 - group.rotation.y) * Math.min(1, delta * 4);
    }

    if (runtime.status === "working") {
      group.position.y += Math.sin(t * 7 + seed) * 0.02;
      group.rotation.z = Math.sin(t * 3.4 + seed) * 0.02;
    } else {
      group.rotation.z = Math.sin(t * 0.9 + seed) * 0.012;
    }

    paper.visible = standing;
    if (standing) paper.rotation.z = Math.sin(t * 9) * 0.22;

    const glowMat = screenGlow.material as THREE.MeshBasicMaterial;
    const wantOpacity = runtime.status === "working" ? 0.55 + Math.sin(t * 5 + seed) * 0.18 : 0;
    glowMat.opacity += (wantOpacity - glowMat.opacity) * Math.min(1, delta * 6);
  }

  private animateCamera(
    t: number,
    delta: number,
    focusSeat: THREE.Vector3 | null,
    delivering: boolean,
  ): void {
    if (!this.autoCamera) return;

    const wantPos = new THREE.Vector3();
    const wantTarget = new THREE.Vector3();

    if (delivering) {
      // 報告を届けに行く動きは少し引いた位置から追う
      wantPos.set(3.4, 5.2, 6.4);
      wantTarget.set(0, 1.0, -3.4);
    } else if (focusSeat) {
      wantPos.set(focusSeat.x * 0.55, 3.7, focusSeat.z + 6.8);
      wantTarget.set(focusSeat.x, 1.2, focusSeat.z + 0.2);
      wantPos.x += Math.sin(t * 0.25) * 0.5;
    } else if (this.running) {
      wantPos.set(Math.sin(t * 0.11) * 2.4, 6.4, 11.6);
      wantTarget.set(0, 1.1, -3.0);
    } else {
      wantPos.copy(OVERVIEW_POS);
      wantPos.x += Math.sin(t * 0.09) * 3.0;
      wantPos.y += Math.sin(t * 0.06) * 0.4;
      wantTarget.copy(OVERVIEW_TARGET);
    }

    const k = 1 - Math.pow(0.0022, delta);
    this.camPos.lerp(wantPos, k);
    this.camTarget.lerp(wantTarget, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}

function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
