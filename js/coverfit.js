// 背景画像のカバーフィット計算(純ロジック)。
// 出力全面を覆う最小の切り出し矩形を、元画像の中央基準で求める。
export function computeCoverFit(imgW, imgH, outW, outH) {
	const scale = Math.max(outW / imgW, outH / imgH);
	const sw = outW / scale;
	const sh = outH / scale;
	return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}
