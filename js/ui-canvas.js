// プレビューCanvasの表示制御とゾーンのポインタ操作。
// 内部解像度は常にenvと同じ(描画座標=出力座標)。ズームはCSS表示幅のみ。

import { trackZoneCreated } from "./analytics.js";
import { cellFromPoint, zoneRect } from "./gridcalc.js";
import { render } from "./render.js";
import {
	createZone,
	findZoneAt,
	resizeEdges,
	zoneFromDrag,
	zonesOverlap,
} from "./zones.js";

export function setupPreview(canvas, app) {
	const ctx = canvas.getContext("2d");
	let drag = null; // {mode:'create'|'resize', start:{col,row}, zone?, edges?, ghost?}

	function redraw() {
		const { width, height } = app.settings.env;
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		canvas.style.width = `${Math.round((width * app.zoomPercent) / 100)}px`;
		render(ctx, app.settings, {
			background: app.background,
			showGrid: true,
			showTaskbar: true,
		});
		drawOverlay();
	}

	function drawOverlay() {
		const g = app.settings.grid;
		ctx.save();
		ctx.setLineDash([12, 8]);
		ctx.lineWidth = 4;
		const selected = app.settings.zones.find(
			(z) => z.id === app.selectedZoneId,
		);
		if (selected) {
			const r = zoneRect(g, selected.cols, selected.rows);
			ctx.strokeStyle = "#8b7cf6";
			ctx.strokeRect(r.x, r.y, r.w, r.h);
		}
		if (drag?.ghost) {
			const r = zoneRect(g, drag.ghost.cols, drag.ghost.rows);
			ctx.strokeStyle = drag.ghost.invalid ? "#f26d6d" : "#6df2a8";
			ctx.strokeRect(r.x, r.y, r.w, r.h);
		}
		ctx.restore();
	}

	function canvasPoint(ev) {
		const b = canvas.getBoundingClientRect();
		return {
			x: (ev.clientX - b.left) * (canvas.width / b.width),
			y: (ev.clientY - b.top) * (canvas.height / b.height),
		};
	}

	function overlapsOthers(range, excludeId) {
		return app.settings.zones.some(
			(z) => z.id !== excludeId && zonesOverlap(z, range),
		);
	}

	canvas.addEventListener("pointerdown", (ev) => {
		const p = canvasPoint(ev);
		const cell = cellFromPoint(app.settings.grid, p.x, p.y);
		if (!cell) {
			app.selectedZoneId = null;
			app.onZonesChanged();
			redraw();
			return;
		}
		const hit = findZoneAt(app.settings.zones, cell.col, cell.row);
		if (hit) {
			const edges = resizeEdges(hit, cell.col, cell.row);
			app.selectedZoneId = hit.id;
			if (edges.left || edges.right || edges.top || edges.bottom) {
				drag = {
					mode: "resize",
					start: cell,
					zone: hit,
					edges,
					orig: { cols: [...hit.cols], rows: [...hit.rows] },
				};
			}
			app.onZonesChanged();
		} else {
			drag = {
				mode: "create",
				start: cell,
				ghost: { ...zoneFromDrag(cell, cell), invalid: false },
			};
		}
		canvas.setPointerCapture(ev.pointerId);
		redraw();
	});

	// グリッド外のポインタを最寄りセルに丸める(ドラッグ中に端へはみ出しても追従させる)
	function nearestCell(grid, x, y) {
		return {
			col: Math.min(
				grid.cols - 1,
				Math.max(0, Math.floor((x - grid.originX) / grid.cellW)),
			),
			row: Math.min(
				grid.rows - 1,
				Math.max(0, Math.floor((y - grid.originY) / grid.cellH)),
			),
		};
	}

	canvas.addEventListener("pointermove", (ev) => {
		if (!drag) return;
		const p = canvasPoint(ev);
		const grid = app.settings.grid;
		const cell = cellFromPoint(grid, p.x, p.y) ?? nearestCell(grid, p.x, p.y);
		if (drag.mode === "create") {
			const range = zoneFromDrag(drag.start, cell);
			drag.ghost = { ...range, invalid: overlapsOthers(range, null) };
		} else {
			const z = drag.zone;
			const next = { cols: [...drag.orig.cols], rows: [...drag.orig.rows] };
			if (drag.edges.left) next.cols[0] = Math.min(cell.col, next.cols[1]);
			if (drag.edges.right) next.cols[1] = Math.max(cell.col, next.cols[0]);
			if (drag.edges.top) next.rows[0] = Math.min(cell.row, next.rows[1]);
			if (drag.edges.bottom) next.rows[1] = Math.max(cell.row, next.rows[0]);
			if (!overlapsOthers({ ...next }, z.id)) {
				z.cols = next.cols;
				z.rows = next.rows;
			}
		}
		redraw();
	});

	canvas.addEventListener("pointerup", () => {
		if (drag?.mode === "create" && drag.ghost && !drag.ghost.invalid) {
			const n = app.settings.zones.length + 1;
			const z = createZone(
				`ゾーン${n}`,
				drag.ghost.cols[0],
				drag.ghost.rows[0],
				drag.ghost.cols[1],
				drag.ghost.rows[1],
			);
			app.settings.zones.push(z);
			app.selectedZoneId = z.id;
			trackZoneCreated(app.settings.zones.length);
		}
		drag = null;
		app.onZonesChanged();
		app.redraw();
	});

	canvas.addEventListener("pointercancel", () => {
		drag = null;
		redraw();
	});

	return { redraw };
}
