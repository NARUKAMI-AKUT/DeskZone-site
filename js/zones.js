// ゾーンモデル(純ロジック)。ゾーンは列・行インデックス(0始まり、両端含む)で表現する。
export const DEFAULT_LABEL = {
	style: "outline-text", // 'outline-text'(文字のみ縁取り) | 'badge'(角丸バッジ)
	position: "top-left", // 'top-left' | 'top-center' | 'top-right'
	font: "sans-serif",
	size: 28,
	color: "#FFFFFF",
};

let nextId = 1;

export function createZone(name, c0, r0, c1, r1) {
	return {
		id: String(nextId++),
		name,
		cols: [Math.min(c0, c1), Math.max(c0, c1)],
		rows: [Math.min(r0, r1), Math.max(r0, r1)],
		style: null, // null = 全体デフォルトの枠スタイルを使う
		label: { ...DEFAULT_LABEL },
	};
}

export function zoneFromDrag(start, end) {
	return {
		cols: [Math.min(start.col, end.col), Math.max(start.col, end.col)],
		rows: [Math.min(start.row, end.row), Math.max(start.row, end.row)],
	};
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export function clampZone(zone, grid) {
	return {
		...zone,
		cols: [
			clamp(zone.cols[0], 0, grid.cols - 1),
			clamp(zone.cols[1], 0, grid.cols - 1),
		],
		rows: [
			clamp(zone.rows[0], 0, grid.rows - 1),
			clamp(zone.rows[1], 0, grid.rows - 1),
		],
	};
}

export function zonesOverlap(a, b) {
	return (
		a.cols[0] <= b.cols[1] &&
		b.cols[0] <= a.cols[1] &&
		a.rows[0] <= b.rows[1] &&
		b.rows[0] <= a.rows[1]
	);
}

export function findZoneAt(zones, col, row) {
	for (let i = zones.length - 1; i >= 0; i--) {
		const z = zones[i];
		if (
			col >= z.cols[0] &&
			col <= z.cols[1] &&
			row >= z.rows[0] &&
			row <= z.rows[1]
		) {
			return z;
		}
	}
	return null;
}

// 指定した1辺方向について、接している隣接ゾーンを押し出す計画を立てる。
// 押し出すと隣接ゾーンが消滅する(幅/高さが0以下になる)場合は null を返す。
function planPushEdge(zones, movingZone, next, edge) {
	const patches = [];
	for (const z of zones) {
		if (z.id === movingZone.id) continue;
		if (edge === "right" || edge === "left") {
			const rowsOverlap =
				z.rows[0] <= next.rows[1] && next.rows[0] <= z.rows[1];
			if (!rowsOverlap) continue;
			if (
				edge === "right" &&
				z.cols[0] > movingZone.cols[1] &&
				z.cols[0] <= next.cols[1]
			) {
				const newLeft = next.cols[1] + 1;
				if (newLeft > z.cols[1]) return null;
				patches.push({ id: z.id, cols: [newLeft, z.cols[1]] });
			} else if (
				edge === "left" &&
				z.cols[1] < movingZone.cols[0] &&
				z.cols[1] >= next.cols[0]
			) {
				const newRight = next.cols[0] - 1;
				if (newRight < z.cols[0]) return null;
				patches.push({ id: z.id, cols: [z.cols[0], newRight] });
			}
		} else {
			const colsOverlap =
				z.cols[0] <= next.cols[1] && next.cols[0] <= z.cols[1];
			if (!colsOverlap) continue;
			if (
				edge === "bottom" &&
				z.rows[0] > movingZone.rows[1] &&
				z.rows[0] <= next.rows[1]
			) {
				const newTop = next.rows[1] + 1;
				if (newTop > z.rows[1]) return null;
				patches.push({ id: z.id, rows: [newTop, z.rows[1]] });
			} else if (
				edge === "top" &&
				z.rows[1] < movingZone.rows[0] &&
				z.rows[1] >= next.rows[0]
			) {
				const newBottom = next.rows[0] - 1;
				if (newBottom < z.rows[0]) return null;
				patches.push({ id: z.id, rows: [z.rows[0], newBottom] });
			}
		}
	}
	return patches;
}

// リサイズ中のゾーンが next の範囲に広がるとき、接している隣接ゾーンを
// 押し出すことで重なりを解消できるかを判定する。
// 戻り値: 隣接ゾーンへのパッチ配列([{id, cols?, rows?}])。解消不可能なら null。
export function planResizePush(zones, movingZone, next, edges) {
	const activeEdges = ["left", "right", "top", "bottom"].filter(
		(e) => edges[e],
	);
	const merged = new Map();
	for (const edge of activeEdges) {
		const patches = planPushEdge(zones, movingZone, next, edge);
		if (!patches) return null;
		for (const p of patches) {
			merged.set(p.id, { ...merged.get(p.id), ...p });
		}
	}
	return [...merged.values()];
}

export function resizeEdges(zone, col, row) {
	const inside =
		col >= zone.cols[0] &&
		col <= zone.cols[1] &&
		row >= zone.rows[0] &&
		row <= zone.rows[1];
	return {
		left: inside && col === zone.cols[0],
		right: inside && col === zone.cols[1],
		top: inside && row === zone.rows[0],
		bottom: inside && row === zone.rows[1],
	};
}
