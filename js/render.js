// 全描画の唯一の入口。プレビューにも最終PNG出力にも同じrender()を使う。
// DOM操作・イベント処理は持たない(ui-*.jsの担当)。
import { computeCoverFit } from "./coverfit.js";
import { cellAddress, cellRect, zoneRect } from "./gridcalc.js";

export function render(ctx, settings, opts = {}) {
	const { background = null, showGrid = false, showTaskbar = false } = opts;
	const { width, height } = settings.env;
	ctx.clearRect(0, 0, width, height);
	drawBackground(ctx, settings, background);
	if (showTaskbar) drawTaskbarBand(ctx, settings);
	if (showGrid) drawGridLines(ctx, settings);
	if (opts.showZones ?? true) {
		for (const zone of settings.zones)
			drawZone(ctx, settings, zone, background);
	}
}

function drawBackground(ctx, settings, background) {
	const { width, height } = settings.env;
	if (background) {
		const f = computeCoverFit(
			background.width,
			background.height,
			width,
			height,
		);
		ctx.drawImage(background, f.sx, f.sy, f.sw, f.sh, 0, 0, width, height);
	} else {
		ctx.fillStyle = settings.backgroundColor;
		ctx.fillRect(0, 0, width, height);
	}
}

function drawTaskbarBand(ctx, settings) {
	const { width, height, taskbar: tb } = settings.env;
	ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
	if (tb.position === "bottom")
		ctx.fillRect(0, height - tb.height, width, tb.height);
	else if (tb.position === "top") ctx.fillRect(0, 0, width, tb.height);
	else if (tb.position === "left") ctx.fillRect(0, 0, tb.height, height);
	else ctx.fillRect(width - tb.height, 0, tb.height, height);
}

function drawGridLines(ctx, settings) {
	const g = settings.grid;
	ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let c = 0; c <= g.cols; c++) {
		const x = g.originX + c * g.cellW;
		ctx.moveTo(x, g.originY);
		ctx.lineTo(x, g.originY + g.rows * g.cellH);
	}
	for (let r = 0; r <= g.rows; r++) {
		const y = g.originY + r * g.cellH;
		ctx.moveTo(g.originX, y);
		ctx.lineTo(g.originX + g.cols * g.cellW, y);
	}
	ctx.stroke();
}

function roundRectPath(ctx, r, radius) {
	ctx.beginPath();
	ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function withAlphaColor(ctx, color, alpha) {
	ctx.fillStyle = color;
	ctx.strokeStyle = color;
	ctx.globalAlpha = alpha;
}

function drawZone(ctx, settings, zone, background) {
	const frame = zone.style ?? settings.styleDefaults.frame;
	const p = frame.params;
	const rect = zoneRect(settings.grid, zone.cols, zone.rows);
	ctx.save();
	if (frame.type === "border") {
		const r = {
			x: rect.x + p.inset,
			y: rect.y + p.inset,
			w: rect.w - p.inset * 2,
			h: rect.h - p.inset * 2,
		};
		roundRectPath(ctx, r, p.radius);
		withAlphaColor(ctx, p.color, p.alpha);
		ctx.lineWidth = p.width;
		ctx.stroke();
	} else if (frame.type === "frost") {
		const r = {
			x: rect.x + p.inset,
			y: rect.y + p.inset,
			w: rect.w - p.inset * 2,
			h: rect.h - p.inset * 2,
		};
		roundRectPath(ctx, r, p.radius);
		ctx.clip();
		ctx.filter = `blur(${p.blur}px)`;
		// クリップ内に背景を再描画してぼかす(端の滲み対策で少し広めに)
		drawBackgroundBlurSource(ctx, settings, background);
		ctx.filter = "none";
		withAlphaColor(ctx, p.color, p.alpha);
		ctx.fillRect(r.x, r.y, r.w, r.h);
	} else if (frame.type === "divider") {
		withAlphaColor(ctx, p.color, p.alpha);
		ctx.lineWidth = p.width;
		ctx.beginPath();
		if (p.edge === "left") {
			ctx.moveTo(rect.x, rect.y);
			ctx.lineTo(rect.x, rect.y + rect.h);
		} else if (p.edge === "right") {
			ctx.moveTo(rect.x + rect.w, rect.y);
			ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
		} else if (p.edge === "top") {
			ctx.moveTo(rect.x, rect.y);
			ctx.lineTo(rect.x + rect.w, rect.y);
		} else {
			ctx.moveTo(rect.x, rect.y + rect.h);
			ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
		}
		ctx.stroke();
	} else if (frame.type === "fill") {
		const r = {
			x: rect.x + p.inset,
			y: rect.y + p.inset,
			w: rect.w - p.inset * 2,
			h: rect.h - p.inset * 2,
		};
		roundRectPath(ctx, r, p.radius);
		withAlphaColor(ctx, p.color, p.alpha);
		ctx.fill();
	}
	ctx.restore();
	drawLabel(ctx, rect, zone);
}

function drawBackgroundBlurSource(ctx, settings, background) {
	// frost用: クリップ済みの領域に背景をそのまま重ね描きする
	const { width, height } = settings.env;
	if (background) {
		const f = computeCoverFit(
			background.width,
			background.height,
			width,
			height,
		);
		ctx.drawImage(background, f.sx, f.sy, f.sw, f.sh, 0, 0, width, height);
	} else {
		ctx.fillStyle = settings.backgroundColor;
		ctx.fillRect(0, 0, width, height);
	}
}

function drawLabel(ctx, rect, zone) {
	const lb = zone.label;
	if (!zone.name) return;
	ctx.save();
	ctx.font = `bold ${lb.size}px ${lb.font}`;
	ctx.textBaseline = "middle";
	const pad = 12;
	const textW = ctx.measureText(zone.name).width;
	const cy = rect.y + pad + lb.size * 0.7;
	let cx;
	if (lb.position === "top-left") {
		ctx.textAlign = "left";
		cx = rect.x + pad;
	} else if (lb.position === "top-center") {
		ctx.textAlign = "center";
		cx = rect.x + rect.w / 2;
	} else {
		ctx.textAlign = "right";
		cx = rect.x + rect.w - pad;
	}
	if (lb.style === "badge") {
		const bx =
			lb.position === "top-left"
				? cx - 10
				: lb.position === "top-center"
					? cx - textW / 2 - 10
					: cx - textW - 10;
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
		ctx.beginPath();
		ctx.roundRect(
			bx,
			cy - lb.size * 0.75,
			textW + 20,
			lb.size * 1.5,
			lb.size * 0.75,
		);
		ctx.fill();
	} else {
		ctx.lineWidth = Math.max(2, lb.size / 8);
		ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
		ctx.strokeText(zone.name, cx, cy);
	}
	ctx.fillStyle = lb.color;
	ctx.fillText(zone.name, cx, cy);
	ctx.restore();
}

export function renderGridReference(settings) {
	const { width, height } = settings.env;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#1a1f28";
	ctx.fillRect(0, 0, width, height);
	const g = settings.grid;
	// グリッド線(明るめ)
	ctx.strokeStyle = "rgba(120, 180, 255, 0.6)";
	ctx.lineWidth = 2;
	for (let c = 0; c <= g.cols; c++) {
		const x = g.originX + c * g.cellW;
		ctx.beginPath();
		ctx.moveTo(x, g.originY);
		ctx.lineTo(x, g.originY + g.rows * g.cellH);
		ctx.stroke();
	}
	for (let r = 0; r <= g.rows; r++) {
		const y = g.originY + r * g.cellH;
		ctx.beginPath();
		ctx.moveTo(g.originX, y);
		ctx.lineTo(g.originX + g.cols * g.cellW, y);
		ctx.stroke();
	}
	// 各セルの番地(セル左下寄り。中央はアイコンと重なって読めなくなるため)
	ctx.fillStyle = "rgba(120, 180, 255, 0.8)";
	ctx.font = `bold ${Math.max(12, Math.floor(g.cellH * 0.14))}px sans-serif`;
	ctx.textAlign = "left";
	ctx.textBaseline = "bottom";
	for (let c = 0; c < g.cols; c++) {
		for (let r = 0; r < g.rows; r++) {
			const rect = cellRect(g, c, r);
			ctx.fillText(cellAddress(c, r), rect.x + 4, rect.y + rect.h - 4);
		}
	}
	return canvas;
}

const PREVIEW_PALETTE = [
	"#e6693e",
	"#3ea8e6",
	"#5fbf6e",
	"#c95fbf",
	"#e6c53e",
	"#8a7ae6",
	"#e65f7a",
];

export function renderZonePreview(settings) {
	const { width, height } = settings.env;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	render(ctx, settings, {
		background: null,
		showGrid: true,
		showTaskbar: true,
		showZones: false,
	});
	settings.zones.forEach((zone, i) => {
		const r = zoneRect(settings.grid, zone.cols, zone.rows);
		ctx.fillStyle = PREVIEW_PALETTE[i % PREVIEW_PALETTE.length] + "55"; // 半透明
		ctx.fillRect(r.x, r.y, r.w, r.h);
		ctx.fillStyle = "#ffffff";
		ctx.font = "bold 40px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const range = `${cellAddress(zone.cols[0], zone.rows[0])}〜${cellAddress(zone.cols[1], zone.rows[1])}`;
		ctx.fillText(zone.name, r.x + r.w / 2, r.y + r.h / 2 - 26);
		ctx.font = "28px sans-serif";
		ctx.fillText(range, r.x + r.w / 2, r.y + r.h / 2 + 22);
	});
	return canvas;
}
