// 곧장 이으면 남의 상자를 뚫거나, 원본이 일부러 크게 돌린 줄기의 길.
// 열쇠는 JSON 파일 이름 → `<fromId>><toId>`.
//
// ★566p 의 두 줄기(제204조② · 제205조② → 제208조①)는 원본이 도해를 가로지르지 않으려고
//   아래·오른쪽으로 크게 돌린 길이다. 자동으로 이으면 가운데를 가로질러 버린다.
const BUS_X = 10952301, BUS_Y = 6642333, LEFT_X = 4380000;
const LANE_X = 4500000, LANE_X2 = 5400000, LANE_Y = 2700000, LANE_Y2 = 2570000;

export const DETOURS = {
  note566: {
    "99>106": (p0, p1) => [p0, [LEFT_X, p0[1]], [LEFT_X, BUS_Y], [BUS_X, BUS_Y], [BUS_X, p1[1]], p1],
    "103>106": (p0, p1) => [p0, [BUS_X, p0[1]], [BUS_X, p1[1]], p1],
    "95>8": (p0, p1) => [p0, [LANE_X, p0[1]], [LANE_X, LANE_Y], [p1[0], LANE_Y], p1],
    "73>94": (p0, p1) => [p0, [p0[0], LANE_Y2], [LANE_X2, LANE_Y2], [LANE_X2, p1[1]], p1],
  },
  "note-p45": {},
  "note-p46": {},
};
