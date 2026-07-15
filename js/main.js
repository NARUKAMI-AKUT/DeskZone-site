import { trackException, trackToolOpen } from "./analytics.js";
import { defaultSettings, FRAME_DEFAULTS, loadFrom, saveTo } from "./state.js";
import { setupPreview } from "./ui-canvas.js";
import {
	setupSettingsIO,
	setupStep1,
	setupStep2,
	setupStep3,
} from "./ui-panel.js";
import { createZone } from "./zones.js";

const app = {
	settings: loadFrom(localStorage) ?? defaultSettings(),
	background: null, // ImageBitmap。保存対象外(セッション内のみ)
	zoomPercent: 30,
	redraw() {},
	selectedZoneId: null,
	onZonesChanged() {}, // Task 9でui-panelが上書きする
};

const preview = setupPreview(document.getElementById("preview"), app);
app.redraw = () => {
	preview.redraw();
	saveTo(localStorage, app.settings); // 変更のたびに自動保存
};

const step1 = setupStep1(document.getElementById("step1-body"), app);
app.onSettingsReplaced = () => step1.refresh();
setupStep2(document.getElementById("step2-body"), app);
setupStep3(document.getElementById("step3-body"), app);
setupSettingsIO(document.getElementById("settings-io"), app);

const zoom = document.getElementById("zoom");
const zoomValue = document.getElementById("zoom-value");
zoom.addEventListener("input", () => {
	app.zoomPercent = Number(zoom.value);
	zoomValue.textContent = `${app.zoomPercent}%`;
	app.redraw();
});

// ズーム: 画面に合わせるボタン(canvas-wrapの表示可能領域にちょうど収まる%を計算)
const zoomFitBtn = document.getElementById("zoom-fit");
zoomFitBtn.addEventListener("click", () => {
	const wrap = document.getElementById("canvas-wrap");
	const style = getComputedStyle(wrap);
	const availW =
		wrap.clientWidth -
		parseFloat(style.paddingLeft) -
		parseFloat(style.paddingRight);
	const availH =
		wrap.clientHeight -
		parseFloat(style.paddingTop) -
		parseFloat(style.paddingBottom);
	const { width, height } = app.settings.env;
	const fitPercent = Math.min(availW / width, availH / height) * 100;
	const clamped = Math.max(
		Number(zoom.min),
		Math.min(Number(zoom.max), Math.floor(fitPercent)),
	);
	zoom.value = clamped;
	app.zoomPercent = clamped;
	zoomValue.textContent = `${clamped}%`;
	app.redraw();
});

// タブ: ステップ1〜3の切り替え
const tabButtons = document.querySelectorAll(".tab-btn");
tabButtons.forEach((btn) => {
	btn.addEventListener("click", () => {
		tabButtons.forEach((b) => b.classList.remove("active"));
		document
			.querySelectorAll(".step")
			.forEach((s) => s.classList.remove("active"));
		btn.classList.add("active");
		document.getElementById(btn.dataset.tab).classList.add("active");
	});
});

// 使い方ガイド: ページを開いたときにモーダル表示(既存の折りたたみガイドの内容を複製)
const guideModal = document.getElementById("guide-modal-overlay");
const guideModalContent = document.getElementById("guide-modal-content");
const guideSource = document.querySelector(".guide-content");
if (guideModal && guideModalContent && guideSource) {
	guideModalContent.innerHTML = guideSource.innerHTML;
	guideModal.hidden = false;
}
document.getElementById("guide-modal-close").addEventListener("click", () => {
	guideModal.hidden = true;
});
guideModal.addEventListener("click", (ev) => {
	if (ev.target === guideModal) guideModal.hidden = true;
});

// ナビゲーションパネルのリサイズ(ドラッグで幅を調整、幅はlocalStorageに記憶)
const panel = document.getElementById("panel");
const resizer = document.getElementById("panel-resizer");
const PANEL_MIN_WIDTH = 260;
const PANEL_MAX_WIDTH = 640;
const PANEL_WIDTH_KEY = "desktop-zoning-panel-width";
const savedPanelWidth = Number(localStorage.getItem(PANEL_WIDTH_KEY));
if (
	Number.isFinite(savedPanelWidth) &&
	savedPanelWidth >= PANEL_MIN_WIDTH &&
	savedPanelWidth <= PANEL_MAX_WIDTH
) {
	panel.style.width = `${savedPanelWidth}px`;
}
let resizingPanel = false;
resizer.addEventListener("pointerdown", (ev) => {
	resizingPanel = true;
	resizer.classList.add("dragging");
	resizer.setPointerCapture(ev.pointerId);
});
resizer.addEventListener("pointermove", (ev) => {
	if (!resizingPanel) return;
	const newWidth = window.innerWidth - ev.clientX;
	const clamped = Math.max(
		PANEL_MIN_WIDTH,
		Math.min(PANEL_MAX_WIDTH, newWidth),
	);
	panel.style.width = `${clamped}px`;
});
function endPanelResize() {
	if (!resizingPanel) return;
	resizingPanel = false;
	resizer.classList.remove("dragging");
	localStorage.setItem(PANEL_WIDTH_KEY, parseFloat(panel.style.width));
}
resizer.addEventListener("pointerup", endPanelResize);
resizer.addEventListener("pointercancel", endPanelResize);

// 目視確認用: ?demo=1 で4スタイルのデモゾーンを注入(保存はされるが手で消せる)
if (new URLSearchParams(location.search).has("demo")) {
	const z1 = createZone("枠線", 0, 0, 2, 9);
	const z2 = createZone("フロスト", 3, 0, 7, 9);
	z2.style = { type: "frost", params: { ...FRAME_DEFAULTS.frost } };
	const z3 = createZone("仕切り線", 8, 0, 12, 9);
	z3.style = { type: "divider", params: { ...FRAME_DEFAULTS.divider } };
	z3.label.style = "badge";
	const z4 = createZone("半透明塗り", 13, 0, 18, 9);
	z4.style = { type: "fill", params: { ...FRAME_DEFAULTS.fill } };
	z4.label.position = "top-center";
	app.settings.zones = [z1, z2, z3, z4];
}

app.redraw();
trackToolOpen();

// JS例外の匿名レポート(スタックトレース本文は送らずメッセージ・発生箇所のみ)
window.addEventListener("error", (ev) => {
	trackException(ev.message, ev.filename, ev.lineno);
});
window.addEventListener("unhandledrejection", (ev) => {
	trackException(String(ev.reason), "unhandledrejection", 0);
});

export { app }; // 以降のタスクのモジュールがimportして使う
