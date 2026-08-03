// 設定パネルのフォーム構築とバインド。値の変更は即appに反映して再描画する。

import {
	trackBackgroundImageSelected,
	trackCalibrationAdjusted,
	trackFrameStyleChanged,
	trackLabelStyleChanged,
	trackSettingsImport,
} from "./analytics.js";
import { downloadCanvas, downloadText, runExport } from "./export.js";
import { computeGrid } from "./gridcalc.js";
import { render, renderGridReference, renderZonePreview } from "./render.js";
import {
	applyEnv,
	defaultSettings,
	FRAME_DEFAULTS,
	fromJSON,
	toJSON,
} from "./state.js";

export function el(tag, attrs = {}, ...children) {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") e.className = v;
		else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
		else e.setAttribute(k, v);
	}
	e.append(...children);
	return e;
}

const RESOLUTION_PRESETS = [
	{ label: "3840 × 2160 (4K)", w: 3840, h: 2160 },
	{ label: "2560 × 1440 (WQHD)", w: 2560, h: 1440 },
	{ label: "1920 × 1080 (フルHD)", w: 1920, h: 1080 },
];

export function setupStep1(container, app) {
	const env = () => app.settings.env;
	const calibrationTracked = false; // セッション中1回だけ送信(スライダー操作のたびに送らない)

	// --- 部品を先に作る(相互参照するため) ---
	const widthIn = el("input", {
		type: "number",
		min: "800",
		value: env().width,
	});
	const heightIn = el("input", {
		type: "number",
		min: "600",
		value: env().height,
	});
	const presetSel = el(
		"select",
		{},
		...RESOLUTION_PRESETS.map((p) =>
			el("option", { value: `${p.w}x${p.h}` }, p.label),
		),
		el("option", { value: "custom" }, "カスタム"),
	);
	const scaleSel = el(
		"select",
		{},
		...[100, 125, 150, 175, 200, 250].map((v) =>
			el("option", { value: String(v) }, `${v}%`),
		),
	);
	const orientSel = el(
		"select",
		{},
		el("option", { value: "landscape" }, "横"),
		el("option", { value: "portrait" }, "縦"),
	);
	const iconSel = el(
		"select",
		{},
		el("option", { value: "small" }, "小"),
		el("option", { value: "medium" }, "中"),
		el("option", { value: "large" }, "大"),
	);
	const tbPosSel = el(
		"select",
		{},
		el("option", { value: "bottom" }, "下"),
		el("option", { value: "top" }, "上"),
		el("option", { value: "left" }, "左"),
		el("option", { value: "right" }, "右"),
	);
	const tbHeightIn = el("input", {
		type: "number",
		min: "0",
		value: env().taskbar.height,
	});

	function syncPreset() {
		const key = `${env().width}x${env().height}`;
		presetSel.value = RESOLUTION_PRESETS.some((p) => `${p.w}x${p.h}` === key)
			? key
			: "custom";
	}

	function updateEnv(patch) {
		app.settings = applyEnv(app.settings, { ...env(), ...patch });
		refreshCalibration();
		app.redraw();
	}

	presetSel.addEventListener("change", () => {
		if (presetSel.value === "custom") return;
		const [w, h] = presetSel.value.split("x").map(Number);
		widthIn.value = w;
		heightIn.value = h;
		updateEnv({ width: w, height: h });
	});
	for (const [input, key] of [
		[widthIn, "width"],
		[heightIn, "height"],
	]) {
		input.addEventListener("change", () => {
			const v = input.valueAsNumber;
			if (!Number.isFinite(v) || v <= 0) {
				input.value = env()[key];
				return;
			}
			updateEnv({ [key]: Math.round(v) });
			syncPreset();
		});
	}
	scaleSel.addEventListener("change", () =>
		updateEnv({ scale: Number(scaleSel.value) }),
	);
	orientSel.addEventListener("change", () => {
		const cur = env();
		if (orientSel.value !== cur.orientation) {
			widthIn.value = cur.height;
			heightIn.value = cur.width;
			updateEnv({
				orientation: orientSel.value,
				width: cur.height,
				height: cur.width,
			});
			syncPreset();
		}
	});
	iconSel.addEventListener("change", () =>
		updateEnv({ iconSize: iconSel.value }),
	);
	tbPosSel.addEventListener("change", () =>
		updateEnv({ taskbar: { ...env().taskbar, position: tbPosSel.value } }),
	);
	tbHeightIn.addEventListener("change", () => {
		const v = tbHeightIn.valueAsNumber;
		if (!Number.isFinite(v) || v < 0) {
			tbHeightIn.value = env().taskbar.height;
			return;
		}
		// タスクバー高さはキャリブレーション対象: applyEnvを通さず(セル補正を消さない)、
		// envの値を直接更新して列数・行数だけ再計算する
		env().taskbar.height = Math.round(v);
		recomputeCounts();
		app.redraw();
	});

	// 現在のセルサイズ(補正込み)とタスクバーから、入る列数・行数を再計算する
	function recomputeCounts() {
		const g = app.settings.grid;
		const tb = env().taskbar;
		const availW =
			env().width -
			(tb.position === "left" || tb.position === "right" ? tb.height : 0);
		const availH =
			env().height -
			(tb.position === "top" || tb.position === "bottom" ? tb.height : 0);
		g.cols = Math.max(1, Math.floor(availW / g.cellW));
		g.rows = Math.max(1, Math.floor(availH / g.cellH));
	}

	// --- キャリブレーション(gridを直接1px単位で上書き。envは変えない) ---
	const calibDefs = [
		["cellW", "セル幅", 40, 400],
		["cellH", "セル高さ", 40, 400],
		["originX", "原点X", -100, 200],
		["originY", "原点Y", -100, 200],
	];
	const calibInputs = {};

	function makeCalibRow(key, label, min, max) {
		const range = el("input", {
			type: "range",
			min: String(min),
			max: String(max),
		});
		const num = el("input", {
			type: "number",
			min: String(min),
			max: String(max),
		});
		calibInputs[key] = { range, num };
		function apply(v) {
			if (!Number.isFinite(v)) return;
			app.settings.grid[key] = Math.round(v);
			recomputeCounts(); // セルサイズ変更で入る列数・行数も変わる
			range.value = num.value = app.settings.grid[key];
			if (!calibrationTracked) {
				calibrationTracked = true;
				trackCalibrationAdjusted();
			}
			app.redraw();
		}
		range.addEventListener("input", () => apply(range.valueAsNumber));
		num.addEventListener("change", () => apply(num.valueAsNumber));
		return el(
			"div",
			{},
			el("label", {}, `${label}(px)`),
			el("div", { class: "row2" }, range, num),
		);
	}

	function refreshCalibration() {
		for (const [key] of calibDefs) {
			const g = app.settings.grid;
			calibInputs[key].range.value = calibInputs[key].num.value = g[key];
		}
	}

	function resetCalibration() {
		// envから再計算した既定値に戻す(手動補正=grid上書きだけを破棄)
		app.settings.grid = computeGrid(env());
		refreshCalibration();
		app.redraw();
	}

	container.append(
		el("label", {}, "解像度プリセット"),
		presetSel,
		el(
			"div",
			{ class: "row2" },
			el("div", {}, el("label", {}, "幅(px)"), widthIn),
			el("div", {}, el("label", {}, "高さ(px)"), heightIn),
		),
		el("label", {}, "表示スケール"),
		scaleSel,
		el("label", {}, "画面の向き"),
		orientSel,
		el("label", {}, "アイコンサイズ"),
		iconSel,
		el(
			"div",
			{ class: "row2" },
			el("div", {}, el("label", {}, "タスクバー位置"), tbPosSel),
			el("div", {}, el("label", {}, "タスクバー高さ(px)"), tbHeightIn),
		),
		el(
			"button",
			{
				onclick: () =>
					runExport("grid-reference", () =>
						downloadCanvas(
							renderGridReference(app.settings),
							"grid_reference.png",
						),
					),
			},
			"グリッド基準画像をPNG出力",
		),
		el("h3", { class: "sub" }, "キャリブレーション(実機合わせ)"),
		el(
			"p",
			{ class: "hint" },
			"グリッド基準画像を壁紙に設定し、実際のアイコン位置とのズレを下のスライダーで補正します。" +
				"基準画像の出力はステップ3にあります。",
		),
		...calibDefs.map(([key, label, min, max]) =>
			makeCalibRow(key, label, min, max),
		),
		el(
			"div",
			{ class: "calib-actions" },
			el(
				"button",
				{ class: "calib-reset", onclick: resetCalibration },
				"キャリブレーションをリセット",
			),
		),
	);

	function refresh() {
		widthIn.value = env().width;
		heightIn.value = env().height;
		scaleSel.value = String(env().scale);
		orientSel.value = env().orientation;
		iconSel.value = env().iconSize;
		tbPosSel.value = env().taskbar.position;
		tbHeightIn.value = env().taskbar.height;
		syncPreset();
		refreshCalibration();
	}
	refresh();
	return { refresh };
}

const PARAM_FIELDS = {
	border: [
		["width", "線の太さ(px)", "number", 1, 20],
		["color", "色", "color"],
		["alpha", "不透明度", "alpha"],
		["radius", "角丸(px)", "number", 0, 100],
		["inset", "内側間隔(px)", "number", 0, 60],
	],
	frost: [
		["blur", "ぼかし(px)", "number", 1, 40],
		["color", "色", "color"],
		["alpha", "濃さ", "alpha"],
		["radius", "角丸(px)", "number", 0, 100],
		["inset", "内側間隔(px)", "number", 0, 60],
	],
	divider: [
		["width", "線の太さ(px)", "number", 1, 20],
		["color", "色", "color"],
		["alpha", "不透明度", "alpha"],
		["edge", "線を引く辺", "edge"],
	],
	fill: [
		["color", "色", "color"],
		["alpha", "不透明度", "alpha"],
		["radius", "角丸(px)", "number", 0, 100],
		["inset", "内側間隔(px)", "number", 0, 60],
	],
};

const FONTS = [
	"Segoe UI",
	"Yu Gothic UI",
	"Meiryo",
	"sans-serif",
	"serif",
	"monospace",
];
const FRAME_TYPE_LABELS = {
	border: "角丸枠線",
	frost: "フロスト",
	divider: "仕切り線",
	fill: "半透明塗り",
};
const EDGE_LABELS = { left: "左", right: "右", top: "上", bottom: "下" };

function paramInput(kind, params, key, min, max, onChange) {
	if (kind === "color") {
		return el("input", {
			type: "color",
			value: params[key],
			oninput: (e) => onChange(e.target.value),
		});
	}
	if (kind === "alpha") {
		const label = el("span", { class: "hint" }, String(params[key]));
		const range = el("input", {
			type: "range",
			min: "0",
			max: "1",
			step: "0.05",
			value: String(params[key]),
			oninput: (e) => {
				label.textContent = e.target.value;
				onChange(Number(e.target.value));
			},
		});
		return el("div", {}, range, label);
	}
	if (kind === "edge") {
		const sel = el(
			"select",
			{},
			...Object.entries(EDGE_LABELS).map(([v, t]) =>
				el("option", { value: v }, t),
			),
		);
		sel.value = params[key];
		sel.addEventListener("change", () => onChange(sel.value));
		return sel;
	}
	// number
	return el("input", {
		type: "number",
		min: String(min),
		max: String(max),
		value: String(params[key]),
		onchange: (e) => {
			const v = e.target.valueAsNumber;
			if (!Number.isFinite(v) || v < min || v > max) {
				e.target.value = params[key];
				return;
			}
			onChange(Math.round(v));
		},
	});
}

function paramEditor(frame, app) {
	const wrap = el("div", {});
	for (const [key, label, kind, min, max] of PARAM_FIELDS[frame.type]) {
		wrap.append(
			el("label", {}, label),
			paramInput(kind, frame.params, key, min, max, (v) => {
				frame.params[key] = v;
				app.redraw();
			}),
		);
	}
	return wrap;
}

export function setupStep2(container, app) {
	function rebuild() {
		container.replaceChildren();
		container.append(
			el(
				"p",
				{ class: "hint" },
				"プレビュー上をドラッグでゾーンを作成、クリックで選択、端のセルをドラッグでサイズ変更できます。",
			),
		);

		// ゾーン一覧(選択ボタン+削除ボタン)
		for (const z of app.settings.zones) {
			const selectBtn = el(
				"button",
				{
					class:
						z.id === app.selectedZoneId ? "zone-item selected" : "zone-item",
					onclick: () => {
						app.selectedZoneId = z.id;
						rebuild();
						app.redraw();
					},
				},
				z.name || "(無名)",
			);
			const deleteBtn = el(
				"button",
				{
					class: "zone-item-delete",
					title: "このゾーンを削除",
					onclick: (ev) => {
						ev.stopPropagation();
						if (!confirm(`ゾーン「${z.name}」を削除しますか?`)) return;
						app.settings.zones = app.settings.zones.filter(
							(zone) => zone.id !== z.id,
						);
						if (app.selectedZoneId === z.id) app.selectedZoneId = null;
						rebuild();
						app.redraw();
					},
				},
				"×",
			);
			container.append(
				el("div", { class: "zone-item-row" }, selectBtn, deleteBtn),
			);
		}

		const zone = app.settings.zones.find((z) => z.id === app.selectedZoneId);
		if (zone) container.append(zoneEditor(zone));

		// 全体の枠デフォルト(選択中のゾーン編集と混同されないよう別枠で表示)
		container.append(
			el(
				"div",
				{ class: "default-editor" },
				el("h3", { class: "sub" }, "全体の枠デフォルト(角丸枠線)"),
				el(
					"p",
					{ class: "hint" },
					"個別に枠スタイルを設定していない、すべてのゾーンに適用されます。",
				),
				paramEditor(app.settings.styleDefaults.frame, app),
			),
		);

		container.append(
			el(
				"button",
				{
					onclick: () =>
						runExport("zone-preview", () =>
							downloadCanvas(
								renderZonePreview(app.settings),
								"zone_preview.png",
							),
						),
				},
				"ゾーン確認画像をPNG出力",
			),
		);
	}

	function zoneEditor(zone) {
		const box = el("div", { class: "zone-editor" });
		box.append(
			el("h3", { class: "sub" }, "選択中のゾーン"),
			el("label", {}, "名前"),
			el("input", {
				type: "text",
				value: zone.name,
				oninput: (e) => {
					zone.name = e.target.value;
					app.redraw();
				},
				onchange: rebuild,
			}),
		);

		// 看板
		const lb = zone.label;
		const styleSel = el(
			"select",
			{},
			el("option", { value: "outline-text" }, "文字のみ(縁取り)"),
			el("option", { value: "badge" }, "角丸バッジ"),
		);
		styleSel.value = lb.style;
		styleSel.addEventListener("change", () => {
			lb.style = styleSel.value;
			trackLabelStyleChanged(lb.style);
			app.redraw();
		});
		const posSel = el(
			"select",
			{},
			el("option", { value: "top-left" }, "左上"),
			el("option", { value: "top-center" }, "上中央"),
			el("option", { value: "top-right" }, "右上"),
		);
		posSel.value = lb.position;
		posSel.addEventListener("change", () => {
			lb.position = posSel.value;
			app.redraw();
		});
		const fontSel = el(
			"select",
			{},
			...FONTS.map((f) => el("option", { value: f }, f)),
		);
		fontSel.value = lb.font;
		fontSel.addEventListener("change", () => {
			lb.font = fontSel.value;
			app.redraw();
		});
		box.append(
			el("label", {}, "看板スタイル"),
			styleSel,
			el("label", {}, "看板位置"),
			posSel,
			el("label", {}, "フォント"),
			fontSel,
			el("label", {}, "文字サイズ(px)"),
			paramInput("number", lb, "size", 10, 120, (v) => {
				lb.size = v;
				app.redraw();
			}),
			el("label", {}, "文字色"),
			paramInput("color", lb, "color", 0, 0, (v) => {
				lb.color = v;
				app.redraw();
			}),
		);

		// 枠スタイル
		const frameSel = el(
			"select",
			{},
			el("option", { value: "default" }, "全体デフォルトを使う"),
			...Object.entries(FRAME_TYPE_LABELS).map(([v, t]) =>
				el("option", { value: v }, t),
			),
		);
		frameSel.value = zone.style?.type ?? "default";
		frameSel.addEventListener("change", () => {
			zone.style =
				frameSel.value === "default"
					? null
					: {
							type: frameSel.value,
							params: { ...FRAME_DEFAULTS[frameSel.value] },
						};
			if (zone.style) trackFrameStyleChanged(frameSel.value);
			rebuild();
			app.redraw();
		});
		box.append(el("label", {}, "枠スタイル"), frameSel);
		if (zone.style) box.append(paramEditor(zone.style, app));

		return box;
	}

	app.onZonesChanged = rebuild;
	rebuild();
}

export function setupStep3(container, app) {
	const fileNameLabel = el("span", { class: "hint" }, "未選択");
	const fileIn = el("input", { type: "file", accept: "image/*" });
	fileIn.addEventListener("change", async () => {
		const file = fileIn.files[0];
		if (!file) return;
		try {
			app.background = await createImageBitmap(file);
			fileNameLabel.textContent = file.name;
			trackBackgroundImageSelected();
		} catch {
			alert("画像を読み込めませんでした");
			fileIn.value = "";
		}
		app.redraw();
	});

	const clearBtn = el(
		"button",
		{
			onclick: () => {
				app.background = null;
				fileIn.value = "";
				fileNameLabel.textContent = "未選択";
				app.redraw();
			},
		},
		"背景画像を外す",
	);

	const bgColor = el("input", {
		type: "color",
		value: app.settings.backgroundColor,
		oninput: (e) => {
			app.settings.backgroundColor = e.target.value;
			app.redraw();
		},
	});

	const exportBtn = el(
		"button",
		{
			class: "primary",
			onclick: () =>
				runExport("wallpaper", () => {
					const { width, height } = app.settings.env;
					const canvas = document.createElement("canvas");
					canvas.width = width;
					canvas.height = height;
					render(canvas.getContext("2d"), app.settings, {
						background: app.background,
						showGrid: false,
						showTaskbar: false,
					});
					downloadCanvas(canvas, "desktop_zoning_wallpaper.png");
				}),
		},
		"壁紙PNGを出力",
	);

	container.append(
		el("label", {}, "背景画像"),
		fileIn,
		fileNameLabel,
		clearBtn,
		el(
			"p",
			{ class: "hint" },
			"画像はブラウザ内でのみ処理され、どこにも送信・保存されません。" +
				"画像を選んでいる間は下の背景色は使われません。",
		),
		el("label", {}, "背景色(画像なしのとき)"),
		bgColor,
		exportBtn,
	);

	function refresh() {
		bgColor.value = app.settings.backgroundColor;
		fileIn.value = "";
		fileNameLabel.textContent = app.background
			? fileNameLabel.textContent
			: "未選択";
	}
	return { refresh };
}

// 設定JSONの保存・読み込み。ステップに依存せずいつでも使えるよう、
// パネル上部(使い方の隣)に常時表示するツールバーとして呼び出す。
export function setupSettingsIO(container, app) {
	const fileInput = el("input", {
		type: "file",
		accept: "application/json",
		hidden: "",
	});
	fileInput.addEventListener("change", () => {
		const file = fileInput.files[0];
		if (!file) return;
		file.text().then((text) => {
			const r = fromJSON(text);
			if (!r.ok) {
				trackSettingsImport(false);
				alert(`設定を読み込めませんでした: ${r.error}`);
				return;
			}
			app.settings = r.settings;
			app.selectedZoneId = null;
			app.onSettingsReplaced?.();
			app.onZonesChanged();
			app.redraw();
			trackSettingsImport(true);
		});
		fileInput.value = "";
	});

	const exportBtn = el(
		"button",
		{
			title: "設定をJSONファイルとして保存",
			onclick: () =>
				runExport("settings-json", () =>
					downloadText(toJSON(app.settings), "desktop_zoning_settings.json"),
				),
		},
		"設定を書き出す",
	);
	const importBtn = el(
		"button",
		{
			title: "設定JSONファイルを読み込む",
			onclick: () => fileInput.click(),
		},
		"設定を読み込む",
	);
	const resetBtn = el(
		"button",
		{
			class: "reset-btn",
			title: "環境・キャリブレーション・ゾーン・背景をすべて初期状態に戻す",
			onclick: () => {
				if (
					!confirm(
						"すべての設定(環境・キャリブレーション・ゾーン・背景画像)を初期化します。元には戻せません。よろしいですか?",
					)
				)
					return;
				app.settings = defaultSettings();
				app.background = null;
				app.selectedZoneId = null;
				app.onSettingsReplaced?.();
				app.onZonesChanged();
				app.redraw();
			},
		},
		"設定をリセット",
	);

	container.append(exportBtn, importBtn, resetBtn, fileInput);
}
