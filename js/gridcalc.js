// グリッド計算(純ロジック)。DOM/Canvasに依存しない。
// ICON_CELL_BASE は100%スケール時のセルサイズ基準値。
// small は本プロジェクトの実測(3840x2160/200%でセル202x186)から逆算した確定値。
// medium/large は推定初期値 — アプリのキャリブレーション機能で1px単位に補正される前提。
export const ICON_CELL_BASE = {
	small: { w: 101, h: 93 },
	medium: { w: 117, h: 109 },
	large: { w: 149, h: 141 },
};

export function computeGrid(env) {
	const scale = env.scale / 100;
	const base = ICON_CELL_BASE[env.iconSize];
	const cellW = Math.round(base.w * scale);
	const cellH = Math.round(base.h * scale);
	let x = 0,
		y = 0,
		w = env.width,
		h = env.height;
	const tb = env.taskbar;
	if (tb.position === "bottom") h -= tb.height;
	else if (tb.position === "top") {
		y = tb.height;
		h -= tb.height;
	} else if (tb.position === "left") {
		x = tb.height;
		w -= tb.height;
	} else if (tb.position === "right") w -= tb.height;
	return {
		cols: Math.floor(w / cellW),
		rows: Math.floor(h / cellH),
		cellW,
		cellH,
		originX: x,
		originY: y,
	};
}

export function colLetter(index) {
	let s = "";
	let n = index;
	do {
		s = String.fromCharCode(65 + (n % 26)) + s;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return s;
}

export function cellAddress(col, row) {
	return colLetter(col) + (row + 1);
}

export function cellRect(grid, col, row) {
	return {
		x: grid.originX + col * grid.cellW,
		y: grid.originY + row * grid.cellH,
		w: grid.cellW,
		h: grid.cellH,
	};
}

export function zoneRect(grid, cols, rows) {
	const tl = cellRect(grid, cols[0], rows[0]);
	return {
		x: tl.x,
		y: tl.y,
		w: (cols[1] - cols[0] + 1) * grid.cellW,
		h: (rows[1] - rows[0] + 1) * grid.cellH,
	};
}

export function cellFromPoint(grid, x, y) {
	const col = Math.floor((x - grid.originX) / grid.cellW);
	const row = Math.floor((y - grid.originY) / grid.cellH);
	if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
	return { col, row };
}
