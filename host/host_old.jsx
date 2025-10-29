/**
 * host_log_enabled.jsx (source trim & robust)
 * - Sử dụng setInPoint / setOutPoint (source trim thay vì timeline trim)
 * - Hỗ trợ CSV dạng "00:00:02,600"
 * - Xử lý importFiles trả về [true]
 * - Tự tìm ProjectItem hợp lệ
 * - Ghi log chi tiết, tránh crash ExtendScript
 */

function sendLog(msg) {
    try {
        $.writeln("[LOG] " + msg);
        try { app.setSDKEventMessage(String(msg), "info"); } catch (e2) {}
    } catch (e) {
        // ignore errors
    }
}

// ========== Safe trim (ExtendScript-safe) ==========
function safeTrim(s) {
    try { return String(s).replace(/^\s+|\s+$/g, ""); }
    catch (e) { return s; }
}

// ========== Parse timecode ==========
function parseTimecode(tc) {
    if (tc === undefined || tc === null) return NaN;
    tc = String(tc);
    tc = tc.replace(/"/g, "").replace(/^\uFEFF/, "");
    tc = tc.replace(/^\s+|\s+$/g, "");
    tc = tc.replace(",", "."); // comma → dot
    var parts = tc.split(/[:.]/);
    if (parts.length < 3) return NaN;
    if (parts.length < 4) parts.push("0");
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var s = parseInt(parts[2], 10) || 0;
    var ms = parseInt(parts[3], 10) || 0;
    return h * 3600 + m * 60 + s + ms / 1000.0;
}

// ========== Parse CSV safely ==========
function parseCSV(csvText) {
    if (csvText === undefined || csvText === null) {
        sendLog("⚠️ CSV text rỗng hoặc undefined!");
        return [];
    }
    try { csvText = String(csvText).replace(/^\uFEFF/, ""); } catch (e) {}

    var rawLines = csvText.split(/\r?\n/);
    var lines = [];
    for (var i = 0; i < rawLines.length; i++) {
        var l = rawLines[i];
        if (l === undefined || l === null) continue;
        var trimmed = safeTrim(l);
        if (trimmed === "" || /^,+$/.test(trimmed)) continue;
        lines.push(trimmed);
    }

    var data = [];
    for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        var match = line.match(/^\s*([^,]+)\s*,\s*"?([^"]+)"?\s*,\s*"?([^"]+)"?\s*$/);
        if (!match) {
            sendLog("⚠️ Không parse được dòng " + (j + 1) + ": " + line);
            continue;
        }
        var name = safeTrim(match[1]);
        var start = parseTimecode(match[2]);
        var end = parseTimecode(match[3]);
        if (isNaN(start) || isNaN(end)) {
            sendLog("⚠️ Timecode không hợp lệ ở dòng " + (j + 1));
            continue;
        }
        data.push({ name: name, start: start, end: end });
    }

    return data;
}

// ========== Tìm ProjectItem theo tên ==========
function findProjectItemByName(root, nameLower) {
    if (!root || !root.children) return null;
    for (var i = 0; i < root.children.numItems; i++) {
        var child = root.children[i];
        if (!child || !child.name) continue;
        var cname = String(child.name).toLowerCase();
        if (cname === nameLower) return child;
        try {
            if (child.type === ProjectItemType.BIN) {
                var found = findProjectItemByName(child, nameLower);
                if (found) return found;
            }
        } catch (e) {}
    }
    return null;
}

// ========== Tìm file path phù hợp ==========
function findFilePath(list, filename) {
    if (!list || !filename) return null;
    var nameLower = String(filename).toLowerCase();
    for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p) continue;
        var pathLower = String(p).toLowerCase();
        var idx = pathLower.lastIndexOf(nameLower);
        if (idx !== -1 && idx + nameLower.length === pathLower.length) return list[i];
    }
    return null;
}

// ===================================================
// =============== HÀM CHÍNH =========================
// ===================================================
function autoEditFromCSV(csvText, videoPaths) {
    sendLog("🚀 Bắt đầu Auto Edit (Source Trim Mode)...");

    try {
        var data = parseCSV(csvText);
        sendLog("📂 CSV có " + data.length + " dòng hợp lệ");

        if (data.length === 0) return "no_data";
        if (!app.project.activeSequence) return "no_sequence";

        var seq = app.project.activeSequence;
        if (!seq.videoTracks || seq.videoTracks.numTracks === 0) {
            sendLog("❌ Sequence chưa có video track!");
            return "no_track";
        }

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            sendLog("🎞 Clip " + (i + 1) + ": " + row.name + " (" + row.start + "s → " + row.end + "s)");

            var clipPath = findFilePath(videoPaths, row.name);
            if (!clipPath) {
                sendLog("⚠️ Không tìm thấy file: " + row.name);
                continue;
            }

            // Import clip
            try {
                app.project.importFiles([clipPath], 1, app.project.rootItem, 0);
            } catch (impErr) {
                sendLog("❌ Lỗi import: " + impErr);
                continue;
            }

            // Tìm project item
            var item = findProjectItemByName(app.project.rootItem, String(row.name).toLowerCase());
            if (!item) {
                sendLog("❌ Không tìm thấy ProjectItem cho: " + row.name);
                continue;
            }

            // Source Trim (set In/Out)
            try {
                item.setInPoint(row.start, 4); // 4 = timebase seconds
                item.setOutPoint(row.end, 4);
                sendLog("✂️ Set In/Out: " + row.start.toFixed(3) + "s → " + row.end.toFixed(3) + "s");
            } catch (trimErr) {
                sendLog("⚠️ Lỗi setIn/OutPoint: " + trimErr);
                continue;
            }

            // Insert trimmed clip into sequence
            try {
                var t = new Time();
                t.seconds = row.start;
                seq.videoTracks[0].insertClip(item, t);
                sendLog("✅ Đã chèn clip: " + row.name + " @ " + row.start.toFixed(3) + "s");
            } catch (insertErr) {
                sendLog("❌ Lỗi insertClip: " + insertErr);
                continue;
            }

            // Xóa in/out để tránh ảnh hưởng clip sau
            try {
                item.clearInPoint();
                item.clearOutPoint();
            } catch (e) {}
        }

        sendLog("🎉 Auto Edit hoàn tất (Source Trim Mode).");
        return "done";

    } catch (e) {
        sendLog("❌ Lỗi tổng: " + e);
        return "error: " + e.toString();
    }
}
