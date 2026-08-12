import type { AgentCard, Island } from "@/lib/types";

/** 3Dオフィスの座標系（1ユニット ≒ 1メートル）。 */

export const ROOM = {
  width: 26,
  depth: 24,
  wallZ: -7.6,
  wallHeight: 6.2,
};

/** PMは奥の一人席。全員の報告がここに集まる */
export const PM_SEAT: [number, number, number] = [0, 0, -5.2];

const ROW_Z = [-2.5, -0.2, 2.1, 4.4];
const ROW_GAP = 3.2;

export interface Seat {
  member: AgentCard;
  pos: [number, number, number];
  row: number;
}

export function seatsFor(islands: Island[]): Seat[] {
  const seats: Seat[] = [];
  islands.forEach((island, row) => {
    const z = ROW_Z[Math.min(row, ROW_Z.length - 1)];
    const count = island.members.length;
    island.members.forEach((member, col) => {
      seats.push({
        member,
        pos: [(col - (count - 1) / 2) * ROW_GAP, 0, z],
        row,
      });
    });
  });
  return seats;
}

export function islandSignPos(islands: Island[], row: number): [number, number, number] {
  const z = ROW_Z[Math.min(row, ROW_Z.length - 1)];
  const count = islands[row]?.members.length ?? 1;
  return [-((count - 1) / 2) * ROW_GAP - 2.9, 0.02, z + 0.4];
}

/* --------------------------------------------------------------- カメラ */

export const OVERVIEW_POS: [number, number, number] = [0, 10.2, 19.5];
export const OVERVIEW_TARGET: [number, number, number] = [0, 1.1, -0.2];

/** 注目している社員に寄るカメラ位置。 */
export function focusView(pos: [number, number, number]): {
  camera: [number, number, number];
  target: [number, number, number];
} {
  const [x, , z] = pos;
  return {
    camera: [x * 0.55, 3.6, z + 6.6],
    target: [x, 1.25, z + 0.2],
  };
}
