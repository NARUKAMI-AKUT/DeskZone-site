// すべての出力アクションはrunExport()を通る。
// 将来のインターステシャル広告・有料版のフックポイント(現時点はカウントのみ)。
import { trackExport } from "./analytics.js";

const COUNT_KEY = "desktop-zoning-export-count";

export function runExport(kind, fn) {
	const n = Number(localStorage.getItem(COUNT_KEY) ?? "0") + 1;
	localStorage.setItem(COUNT_KEY, String(n));
	trackExport(kind);
	fn();
}

export function downloadCanvas(canvas, filename) {
	canvas.toBlob((blob) => downloadBlob(blob, filename), "image/png");
}

export function downloadText(text, filename) {
	downloadBlob(new Blob([text], { type: "application/json" }), filename);
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
