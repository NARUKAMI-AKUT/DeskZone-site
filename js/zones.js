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
