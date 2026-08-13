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

/** フローリングのテクスチャ。 */
function floorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#e3d5ba";
  g.fillRect(0, 0, 512, 512);
  const tones = ["#dfd0b2", "#e7d9c0", "#dbcbab", "#e3d5ba"];
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 128;
    for (let col = -1; col < 5; col++) {
      g.fillStyle = tones[(row * 3 + col + 4) % tones.length];
      g.fillRect(col * 128 + offset + 1, row * 64 + 1, 126, 62);
    }
  }
  g.strokeStyle = "rgba(140, 110, 70, 0.18)";
  for (let y = 0; y <= 512; y += 64) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export function buildRoom(scene: THREE.Scene): void {
  const halfW = ROOM.width / 2;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.9 }),
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

  // 本棚と本
  scene.add(box(0.6, 2.2, 3.4, mat(COLORS.woodDark), -11.6, 1.1, -2.2));
  const bookColors = [0xc75b4a, 0x3f7d6c, 0xd9a441, 0x50648c, 0x8c5a74, 0x6f8f4f];
  for (const y of [0.55, 1.15, 1.75]) {
    scene.add(box(0.52, 0.06, 3.2, mat(COLORS.wood), -11.54, y, -2.2));
    let bz = -3.65;
    let i = 0;
    while (bz < -0.9) {
      const h = 0.3 + ((i * 7) % 3) * 0.05;
      const w = 0.1 + ((i * 5) % 3) * 0.03;
      scene.add(box(0.4, h, w, mat(bookColors[i % bookColors.length], 0.85), -11.5, y + 0.04 + h / 2, bz));
      bz += w + 0.035;
      i++;
    }
  }

  buildPendants(scene);
  buildLounge(scene);
  buildCoffeeBar(scene);
}

/** 吊り下げ照明。暖色の点光源つき。 */
function buildPendants(scene: THREE.Scene): void {
  for (const x of [-6.5, 0, 6.5]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), mat(0x3a2f26, 0.8));
    cord.position.set(x, 5.9, 0.4);
    scene.add(cord);

    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 24, 1, true), 
      new THREE.MeshStandardMaterial({ color: 0x2f2921, roughness: 0.6, side: THREE.DoubleSide }));
    shade.position.set(x, 4.75, 0.4);
    scene.add(shade);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdca8, toneMapped: false }));
    bulb.position.set(x, 4.62, 0.4);
    scene.add(bulb);

    const light = new THREE.PointLight(0xffd9a0, 14, 10, 1.8);
    light.position.set(x, 4.5, 0.4);
    scene.add(light);
  }
}

/** 窓際右のラウンジ。ソファ＋ローテーブル＋フロアランプ。 */
function buildLounge(scene: THREE.Scene): void {
  const g = new THREE.Group();
  g.position.set(9.6, 0, -3.6);
  g.rotation.y = -0.5;
  scene.add(g);

  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.2, 28), mat(0xcbb595, 0.95));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.015;
  g.add(rug);

  const sofaM = mat(0x6c8577, 0.9);
  g.add(box(2.3, 0.42, 0.9, sofaM, 0, 0.21, -0.9));
  g.add(box(2.3, 0.55, 0.22, sofaM, 0, 0.62, -1.28));
  g.add(box(0.24, 0.52, 0.9, sofaM, -1.15, 0.47, -0.9));
  g.add(box(0.24, 0.52, 0.9, sofaM, 1.15, 0.47, -0.9));
  g.add(box(0.5, 0.14, 0.5, mat(0xd9a441, 0.9), -0.55, 0.49, -0.95));
  g.add(box(0.5, 0.14, 0.5, mat(0xc75b4a, 0.9), 0.5, 0.49, -0.98));

  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.07, 20), mat(COLORS.wood, 0.7));
  table.position.set(0, 0.42, 0.35);
  table.castShadow = true;
  g.add(table);
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 10), mat(COLORS.leg));
  tleg.position.set(0, 0.2, 0.35);
  g.add(tleg);

  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8), mat(0x3a2f26));
  lampPole.position.set(1.7, 0.85, -0.3);
  g.add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.34, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf3e2c2, roughness: 0.8, side: THREE.DoubleSide }));
  lampShade.position.set(1.7, 1.78, -0.3);
  g.add(lampShade);
  const lampLight = new THREE.PointLight(0xffe0b0, 6, 6, 1.8);
  lampLight.position.set(1.7, 1.7, -0.3);
  g.add(lampLight);
}

/** 左手前のコーヒーカウンター。 */
function buildCoffeeBar(scene: THREE.Scene): void {
  const g = new THREE.Group();
  g.position.set(-10.2, 0, 4.6);
  g.rotation.y = 0.9;
  scene.add(g);

  g.add(box(2.4, 0.95, 0.8, mat(COLORS.woodDark, 0.85), 0, 0.475, 0));
  g.add(box(2.5, 0.07, 0.9, mat(COLORS.wood, 0.7), 0, 0.985, 0));

  // コーヒーマシン
  g.add(box(0.42, 0.5, 0.4, mat(0x2f2a24, 0.5), -0.6, 1.27, 0));
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), mat(0x1f1b16, 0.5));
  spout.position.set(-0.6, 1.1, 0.16);
  g.add(spout);

  // カップの列
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.11, 10), 
      mat([0xe07a5f, 0xf3e2c2, 0x6c8577][i], 0.7));
    cup.position.set(0.25 + i * 0.28, 1.08, 0.12);
    cup.castShadow = true;
    g.add(cup);
  }

  // スツール
  for (const dx of [-0.5, 0.5]) {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 14), mat(0xc75b4a, 0.85));
    seat.position.set(dx, 0.62, 0.95);
    seat.castShadow = true;
    g.add(seat);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 8), mat(0x3a2f26));
    pole.position.set(dx, 0.31, 0.95);
    g.add(pole);
  }
}

/** 部署の島の下に敷くラグ。 */
export function buildRug(
  scene: THREE.Scene,
  center: THREE.Vector3,
  width: number,
  color: string,
): void {
  const c = new THREE.Color(color).lerp(new THREE.Color("#e3d5ba"), 0.72);
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 3.1),
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(center.x, 0.012, center.z + 0.9);
  rug.receiveShadow = true;
  scene.add(rug);
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

  // 幾何学アート（名刺モチーフ）を2枚
  for (const [x, seedBase] of [[-11.2, 0], [11.2, 5]] as [number, number][]) {
    const art = document.createElement("canvas");
    art.width = 128; art.height = 160;
    const g = art.getContext("2d")!;
    g.fillStyle = "#f6efdf";
    g.fillRect(0, 0, 128, 160);
    const navy = ["#12365C", "#1B4A79", "#255C90", "#0A2846"];
    for (let i = 0; i < 7; i++) {
      const seed = seedBase + i;
      g.fillStyle = navy[seed % navy.length];
      const px = (seed * 37) % 88 + 10;
      const py = (seed * 53) % 110 + 14;
      const sz = 22 + (seed * 13) % 26;
      g.beginPath();
      if (seed % 2) { g.moveTo(px, py + sz); g.lineTo(px + sz / 2, py); g.lineTo(px + sz, py + sz); }
      else { g.moveTo(px, py); g.lineTo(px + sz, py); g.lineTo(px + sz / 2, py + sz); }
      g.closePath(); g.fill();
    }
    const tex = new THREE.CanvasTexture(art);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frame = box(1.3, 1.62, 0.08, mat(0x4a3a2a, 0.7), x, 3.5, ROOM.wallZ + 0.24);
    scene.add(frame);
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 1.44),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    paint.position.set(x, 3.5, ROOM.wallZ + 0.29);
    scene.add(paint);
  }

  // 壁時計（夕方5:40）
  const clockG = new THREE.Group();
  clockG.position.set(6.1, 4.9, ROOM.wallZ + 0.26);
  scene.add(clockG);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24), mat(0xf8f2e6, 0.6));
  face.rotation.x = Math.PI / 2;
  clockG.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 24), mat(0x3a2f26, 0.6));
  clockG.add(ring);
  const hourHand = box(0.045, 0.2, 0.02, mat(0x2f2a24, 0.5), 0, 0.08, 0.05);
  hourHand.rotation.z = -2.9;
  clockG.add(hourHand);
  const minHand = box(0.035, 0.3, 0.02, mat(0x2f2a24, 0.5), 0, 0.12, 0.05);
  minHand.rotation.z = 2.1;
  clockG.add(minHand);

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

  // 椅子（座面と背もたれは社員カラーを落ち着かせた色）
  const chairColor = new THREE.Color(member.color).lerp(new THREE.Color("#6f6357"), 0.55);
  const chairM = new THREE.MeshStandardMaterial({ color: chairColor, roughness: 0.85 });
  deskGroup.add(box(0.62, 0.08, 0.6, chairM, 0, 0.44, 1.0));
  deskGroup.add(box(0.6, 0.6, 0.08, chairM, 0, 0.78, 1.28));
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
