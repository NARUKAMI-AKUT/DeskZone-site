// GA4アナリティクス。gtag未ロード時(オフライン・ローカルテスト等)は何もしない安全設計。
// 画像データ・ゾーン名・生成PNGの中身は一切送信しない。送るのは機能の使用有無と件数のみ。

function send(name, params = {}) {
	if (typeof window === "undefined" || typeof window.gtag !== "function")
		return;
	window.gtag("event", name, params);
}

export function trackToolOpen() {
	send("tool_open");
}

export function trackCalibrationAdjusted() {
	send("calibration_adjusted");
}

export function trackZoneCreated(zonesCount) {
	send("zone_created", { zones_count: zonesCount });
}

export function trackFrameStyleChanged(frameType) {
	send("frame_style_changed", { frame_type: frameType });
}

export function trackLabelStyleChanged(labelStyle) {
	send("label_style_changed", { label_style: labelStyle });
}

const EXPORT_EVENT_NAMES = {
	"grid-reference": "export_grid_reference",
	"zone-preview": "export_zone_preview",
	wallpaper: "export_wallpaper",
	"settings-json": "export_settings_json",
};

export function trackExport(kind) {
	const name = EXPORT_EVENT_NAMES[kind];
	if (name) send(name);
}

export function trackSettingsImport(success) {
	send("import_settings_json", { success });
}

export function trackBackgroundImageSelected() {
	send("background_image_selected");
}

export function trackException(message, source, lineno) {
	send("app_exception", { message, source, lineno });
}
