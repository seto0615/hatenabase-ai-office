import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { AgentCard } from "../types";

/**
 * 3Dオフィスの静的な造作（部屋・机・人・壁の装飾）を素のthree.jsで組む。
 * アニメーションは runtime.ts、Reactとの接続は Office3D.tsx が担当する。
 */

export const COLORS = {
  wall: 0xefe5d4,
  wallDark: 0xe2d3b8,
  floor: 0xe2d5bc,
  wood: 0xcda06a,
  woodDark: 0xa97f4e,
  leg: 0x8f6b3d,
  skin: 0xf7efe1,
  hair: 0x3a2f26,
  chair: 0x6f6357,
  laptop: 0x2f2a24,
};

export const ROOM = { width: 26, depth: 24, wallZ: -7.6, wallHeight: 6.2 };

function mat(color: number, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** 夕景の窓テクスチャ。 */
function sunsetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const g = canvas.getContext("2d")!;

  const grad = g.createLinearGradient(0, 0, 0, 384);
  grad.addColorStop(0, "#fce0b4");
  grad.addColorStop(0.5, "#f5ab72");
  grad.addColorStop(1, "#e0795e");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 384);

  g.fillStyle = "rgba(255,242,208,0.92)";
  g.beginPath();
  g.arc(660, 232, 46, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = "#c07a5c";
  for (let x = -10; x < 1024; x += 46) {
    const h = 56 + ((x * 37) % 96);
    g.fillRect(x, 384 - h, 34, h);
  }
  g.fillStyle = "#a55f47";
  for (let x = 14; x < 1024; x += 62) {
    const h = 38 + ((x * 53) % 74);
    g.fillRect(x, 384 - h, 28, h);
    g.fillStyle = "rgba(255,228,170,0.5)";
    for (let wy = 384 - h + 8; wy < 380; wy += 12) {
      for (let wx = x + 5; wx < x + 24; wx += 9) {
        if ((wx + wy) % 3 === 0) g.fillRect(wx, wy, 3, 5);
      }
    }
    g.fillStyle = "#a55f47";
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoom(scene: THREE.Scene): void {
  const halfW = ROOM.width / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    mat(COLORS.floor, 0.95),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 2);
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(box(ROOM.width, ROOM.wallHeight, 0.4, mat(COLORS.wall, 1), 0, ROOM.wallHeight / 2, ROOM.wallZ));
  scene.add(box(ROOM.width, 0.32, 0.12, mat(COLORS.wallDark, 1), 0, 0.16, ROOM.wallZ + 0.22));

  for (const side of [-1, 1]) {
    scene.add(
      box(0.4, ROOM.wallHeight, ROOM.depth - 4, mat(COLORS.wallDark, 1), side * halfW, ROOM.wallHeight / 2, ROOM.wallZ + ROOM.depth / 2 - 2),
    );
  }

  // 窓
  const window_ = new THREE.Mesh(
    new THREE.PlaneGeometry(13.2, 3.5),
    new THREE.MeshBasicMaterial({ map: sunsetTexture(), toneMapped: false }),
  );
  window_.position.set(0, 3.1, ROOM.wallZ + 0.22);
  scene.add(window_);

  const sash = mat(0xf7f1e6, 0.8);
  scene.add(box(13.7, 0.24, 0.1, sash, 0, 3.1, ROOM.wallZ + 0.25));
  scene.add(box(13.7, 0.26, 0.1, sash, 0, 4.96, ROOM.wallZ + 0.25));
  scene.add(box(13.7, 0.26, 0.1, sash, 0, 1.24, ROOM.wallZ + 0.25));
  for (const x of [-4.4, 0, 4.4]) {
    scene.add(box(0.14, 3.6, 0.1, sash, x, 3.1, ROOM.wallZ + 0.25));
  }

  // 観葉植物
  for (const x of [-10.4, 10.4]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.68, 12), mat(0xb98f5e));
    pot.position.set(x, 0.34, ROOM.wallZ + 2.4);
    pot.castShadow = true;
    scene.add(pot);

    const leaf = new THREE.MeshStandardMaterial({ color: 0x7ba05b, roughness: 0.9, flatShading: true });
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 0), leaf);
    bush.position.set(x, 1.25, ROOM.wallZ + 2.4);
    bush.castShadow = true;
    scene.add(bush);

    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8fb36b, roughness: 0.9, flatShading: true }));
    top.position.set(x + 0.34, 1.9, ROOM.wallZ + 2.5);
    top.castShadow = true;
    scene.add(top);
  }

  // 本棚
  scene.add(box(0.6, 2.2, 3.4, mat(COLORS.woodDark), -11.6, 1.1, -2.2));
  for (const y of [0.55, 1.15, 1.75]) {
    scene.add(box(0.52, 0.06, 3.2, mat(COLORS.wood), -11.54, y, -2.2));
  }
}

/** CSS2D のラベルを作る。 */
export function label(html: string, className: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = className;
  el.innerHTML = html;
  const obj = new CSS2DObject(el);
  return obj;
}

export function buildWallDecor(scene: THREE.Scene): {
  boardPhase: HTMLElement;
  boardNote: HTMLElement;
} {
  // 掛け軸
  const principles: [number, string][] = [
    [-5.0, "一次情報に当たる"],
    [-3.4, "推測と事実を分ける"],
    [3.4, "数字には根拠を"],
  ];
  for (const [x, text] of principles) {
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 3.1), mat(0xfbf6ec, 1));
    paper.position.set(x, 3.35, ROOM.wallZ + 0.24);
    scene.add(paper);
    scene.add(box(0.98, 0.16, 0.08, mat(0x4a3a2a, 0.8), x, 4.95, ROOM.wallZ + 0.26));
    scene.add(box(0.98, 0.16, 0.08, mat(0x4a3a2a, 0.8), x, 1.75, ROOM.wallZ + 0.26));

    const l = label(text, "scroll3d");
    l.position.set(x, 3.35, ROOM.wallZ + 0.3);
    scene.add(l);
  }

  // 会社看板
  const signBase = box(5.4, 1.1, 0.14, mat(0xf8f2e6), -8.2, 4.7, ROOM.wallZ + 0.26);
  scene.add(signBase);
  const sign = label('HATENABASE<em>AI OFFICE</em>', "sign3d");
  sign.position.set(-8.2, 4.7, ROOM.wallZ + 0.34);
  scene.add(sign);

  // 業務ボード
  const board = box(5.2, 2.4, 0.16, mat(0x2f2921, 0.85), 8.6, 3.5, ROOM.wallZ + 0.28);
  scene.add(board);
  const boardEl = document.createElement("div");
  boardEl.className = "board3d";
  boardEl.innerHTML =
    '<span class="board3dHead">業務ボード</span><b data-phase>待機中</b><span class="board3dNote" data-note>指示をお待ちしています</span>';
  const boardLabel = new CSS2DObject(boardEl);
  boardLabel.position.set(8.6, 3.5, ROOM.wallZ + 0.4);
  scene.add(boardLabel);

  return {
    boardPhase: boardEl.querySelector("[data-phase]")!,
    boardNote: boardEl.querySelector("[data-note]")!,
  };
}

export interface CharacterParts {
  /** 座席から動く本体（体・頭・書類・ラベル） */
  group: THREE.Group;
  paper: THREE.Mesh;
  screenGlow: THREE.Mesh;
  tagEl: HTMLElement;
  sayEl: HTMLElement;
  sayBody: HTMLElement;
}

/** 机と椅子（動かない）＋キャラクター本体（動く）を作る。 */
export function buildSeat(
  scene: THREE.Scene,
  member: AgentCard,
  pos: THREE.Vector3,
  isPm: boolean,
): CharacterParts {
  const deskGroup = new THREE.Group();
  deskGroup.position.set(pos.x, 0, pos.z + 0.95);
  scene.add(deskGroup);

  const woodM = mat(COLORS.wood, 0.8);
  deskGroup.add(box(1.86, 0.08, 0.98, woodM, 0, 0.74, 0));
  deskGroup.add(box(1.9, 0.06, 1.02, mat(COLORS.woodDark, 0.85), 0, 0.68, 0));
  for (const [lx, lz] of [
    [-0.82, -0.4],
    [0.82, -0.4],
    [-0.82, 0.4],
    [0.82, 0.4],
  ]) {
    deskGroup.add(box(0.08, 0.68, 0.08, mat(COLORS.leg), lx, 0.34, lz));
  }

  // ノートPC
  deskGroup.add(box(0.52, 0.03, 0.36, mat(0x3b352e, 0.6), 0, 0.8, -0.02));
  const lid = box(0.52, 0.34, 0.025, mat(COLORS.laptop, 0.5), 0, 0.96, -0.19);
  lid.rotation.x = -0.32;
  deskGroup.add(lid);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.28),
    new THREE.MeshBasicMaterial({ color: 0xffb774, transparent: true, opacity: 0, toneMapped: false }),
  );
  glow.position.set(0, 0.965, -0.165);
  glow.rotation.x = -0.32;
  deskGroup.add(glow);

  // 小物
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.14, 10), mat(0xe07a5f, 0.7));
  mug.position.set(0.62, 0.83, 0.16);
  mug.castShadow = true;
  deskGroup.add(mug);
  const memo = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), mat(0xfbf7ef, 1));
  memo.rotation.set(-Math.PI / 2, 0, 0.2);
  memo.position.set(-0.6, 0.785, 0.2);
  deskGroup.add(memo);

  // 椅子
  deskGroup.add(box(0.62, 0.08, 0.6, mat(COLORS.chair, 0.85), 0, 0.44, 1.0));
  deskGroup.add(box(0.6, 0.6, 0.08, mat(COLORS.chair, 0.85), 0, 0.78, 1.28));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), mat(0x4d453c, 0.7));
  pole.position.set(0, 0.2, 1.0);
  deskGroup.add(pole);

  /* ---- キャラクター本体 ---- */
  const group = new THREE.Group();
  group.position.copy(pos);
  const scale = isPm ? 1.06 : 1;
  group.scale.setScalar(scale);
  scene.add(group);

  const bodyColor = new THREE.Color(member.color).lerp(new THREE.Color("#ffffff"), 0.45);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.42, 4, 12),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75 }),
  );
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), mat(COLORS.skin, 0.85));
  head.position.y = 1.24;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.315, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.44),
    mat(COLORS.hair),
  );
  hair.position.y = 1.28;
  group.add(hair);

  for (const x of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(COLORS.hair, 0.5));
    eye.position.set(x, 1.21, 0.268);
    group.add(eye);
  }

  // 運ぶ書類
  const paper = box(0.26, 0.34, 0.02, mat(0xfbf7ef), 0.3, 0.86, 0.26);
  paper.visible = false;
  group.add(paper);

  // 名札
  const tagEl = document.createElement("div");
  tagEl.className = "tag3d";
  tagEl.innerHTML = `<b>${member.person}</b><span>${member.role}</span>`;
  const tag = new CSS2DObject(tagEl);
  tag.position.set(0, 1.86, 0);
  group.add(tag);

  // 吹き出し
  const sayEl = document.createElement("div");
  sayEl.className = `say3d${isPm ? " say3d--pm" : ""}`;
  sayEl.style.display = "none";
  sayEl.innerHTML = `<b>${member.person}</b><span data-line></span>`;
  const say = new CSS2DObject(sayEl);
  say.position.set(0, 2.62, 0);
  group.add(say);

  return {
    group,
    paper,
    screenGlow: glow,
    tagEl,
    sayEl,
    sayBody: sayEl.querySelector("[data-line]")!,
  };
}

/** 部署の島の床サイン。 */
export function buildIslandSign(scene: THREE.Scene, pos: THREE.Vector3, text: string): void {
  const l = label(text, "islandSign3d");
  l.position.copy(pos);
  scene.add(l);
}
