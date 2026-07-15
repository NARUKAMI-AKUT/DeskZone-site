// 設定の既定値・シリアライズ・保存(純ロジック)。localStorageは注入で受け取る。
import { computeGrid } from "./gridcalc.js";

const STORAGE_KEY = "desktop-zoning-settings";
const VERSION = 1;

export const FRAME_DEFAULTS = {
	border: { width: 3, color: "#FFFFFF", alpha: 0.67, radius: 24, inset: 2 },
	frost: { blur: 8, color: "#000000", alpha: 0.25, radius: 24, inset: 2 },
	divider: { width: 3, color: "#FFFFFF", alpha: 0.67, edge: "right" },
	fill: { color: "#4A90D9", alpha: 0.2, radius: 24, inset: 2 },
};

export function defaultSettings() {
	const env = {
		width: 3840,
		height: 2160,
		scale: 200,
		orientation: "landscape",
		iconSize: "small",
		taskbar: { position: "bottom", height: 80 },
	};
	return {
		env,
		grid: computeGrid(env),
		styleDefaults: {
			frame: { type: "border", params: { ...FRAME_DEFAULTS.border } },
		},
		zones: [],
		backgroundColor: "#1E2A38",
	};
}

export function applyEnv(settings, env) {
	return { ...settings, env, grid: computeGrid(env) };
}

export function toJSON(settings) {
	return JSON.stringify({ version: VERSION, ...settings }, null, 2);
}

export function fromJSON(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, error: "JSONとして読み込めませんでした" };
	}
	if (data === null || typeof data !== "object") {
		return { ok: false, error: "設定データの形式が不正です" };
	}
	if (data.version !== VERSION) {
		return {
			ok: false,
			error: `対応していない設定バージョンです (${data.version})`,
		};
	}
	for (const key of [
		"env",
		"grid",
		"styleDefaults",
		"zones",
		"backgroundColor",
	]) {
		if (!(key in data))
			return { ok: false, error: `設定に ${key} がありません` };
	}
	if (!Array.isArray(data.zones)) {
		return { ok: false, error: "zones が配列ではありません" };
	}
	const { version, ...settings } = data;
	return { ok: true, settings };
}

export function saveTo(storage, settings) {
	storage.setItem(STORAGE_KEY, toJSON(settings));
}

export function loadFrom(storage) {
	const text = storage.getItem(STORAGE_KEY);
	if (text === null) return null;
	const r = fromJSON(text);
	return r.ok ? r.settings : null;
}
