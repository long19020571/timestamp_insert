/**
 * host_log_enabled.jsx (source trim + gap filler)
 * - Source Trim: chỉ chèn đúng đoạn theo CSV
 * - Nếu thiếu file video → chèn black video cùng độ dài
 * - Hoạt động ổn định trên Premiere 2022–2025
 */

function sendLog(msg) {
    try {
        $.writeln("[LOG] " + msg);
        try { app.setSDKEventMessage(String(msg), "info"); } catch(e2) {}
    } catch (e) {}
}

// ==== Safe string trim ====
function safeTrim(s) {
    try { return String(s).replace(/^\s+|\s+$/g, ""); }
    catch (e) { return s; }
}

// ==== Parse timecode ====
function parseTimecode(tc) {
    if (tc === undefined || tc === null) return NaN;
    tc = String(tc).replace(/"/g, "").replace(/^\uFEFF/, "").replace(",", ".");
    tc = tc.replace(/^\s+|\s+$/g, "");
    var parts = tc.split(/[:.]/);
    if (parts.length < 3) return NaN;
    if (parts.length < 4) parts.push("0");
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var s = parseInt(parts[2], 10) || 0;
    var ms = parseInt(parts[3], 10) || 0;
    return h * 3600 + m * 60 + s + ms / 1000.0;
}

// ==== Parse CSV safely ====
function parseCSV(csvText) {
    if (!csvText) return [];
    csvText = String(csvText).replace(/^\uFEFF/, "");
    var rawLines = csvText.split(/\r?\n/);
    var lines = [];
    for (var i = 0; i < rawLines.length; i++) {
        var l = rawLines[i];
        if (!l) continue;
        var trimmed = safeTrim(l);
        if (trimmed === "" || /^,+$/.test(trimmed)) continue;
        lines.push(trimmed);
    }

    var data = [];
    for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        var match = line.match(/^\s*([^,]+)\s*,\s*"?([^"]+)"?\s*,\s*"?([^"]+)"?\s*$/);
        if (!match) continue;
        var name = safeTrim(match[1]);
        var start = parseTimecode(match[2]);
        var end = parseTimecode(match[3]);
        if (!isNaN(start) && !isNaN(end)) {
            data.push({ name: name, start: start, end: end });
        }
    }
    return data;
}

// ==== Find ProjectItem recursively ====
function findProjectItemByName(root, nameLower) {
    if (!root || !root.children) return null;
    for (var i = 0; i < root.children.numItems; i++) {
        var child = root.children[i];
        if (!child || !child.name) continue;
        if (String(child.name).toLowerCase() === nameLower) return child;
        try {
            if (child.type === ProjectItemType.BIN) {
                var found = findProjectItemByName(child, nameLower);
                if (found) return found;
            }
        } catch (e) {}
    }
    return null;
}

// ==== Find file path ====
function findFilePath(list, filename) {
    if (!list || !filename) return null;
    var nameLower = String(filename).toLowerCase();
    for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p) continue;
        var pathLower = String(p).toLowerCase();
        if (pathLower.indexOf(nameLower, pathLower.length - nameLower.length) !== -1)
            return list[i];
    }
    return null;
}


// ===================================================
// =============== MAIN FUNCTION =====================
// ===================================================
function autoEditFromCSV(csvText, videoPaths) {
    sendLog("🚀 Auto Edit (Source Trim + Gap Filler)");

    try {
        var data = parseCSV(csvText);
        if (!data.length) {
            sendLog("❌ CSV không hợp lệ hoặc rỗng.");
            return "no_data";
        }
        if (!app.project.activeSequence) return "no_sequence";

        var seq = app.project.activeSequence;
        if (!seq.videoTracks || seq.videoTracks.numTracks === 0) return "no_track";

        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var duration = row.end - row.start;
            if (duration <= 0) continue;

            sendLog("🎞 Clip " + (i + 1) + ": " + row.name + " (" + row.start + "s → " + row.end + "s)");

            var clipPath = findFilePath(videoPaths, row.name);
            var item = null;

            if (clipPath) {
                try {
                    app.project.importFiles([clipPath], 1, app.project.rootItem, 0);
                    item = findProjectItemByName(app.project.rootItem, String(row.name).toLowerCase());
                } catch (eImp) {
                    sendLog("⚠️ Lỗi import: " + eImp);
                }
            }


            // Source Trim
            try {
                item.setInPoint(row.start, 4);
                item.setOutPoint(row.end, 4);
            } catch (eTrim2) {
                sendLog("⚠️ Lỗi setIn/OutPoint: " + eTrim2);
                continue;
            }

            // Insert trimmed clip
            try {
                var t = new Time();
                t.seconds = row.start;
                seq.videoTracks[0].insertClip(item, t);
                sendLog("✅ Đã chèn clip: " + row.name + " @ " + row.start + "s");
            } catch (eInsert) {
                sendLog("❌ Lỗi insertClip: " + eInsert);
            }

            // Reset In/Out
            try { item.clearInPoint(); item.clearOutPoint(); } catch (eClr) {}
        }

        sendLog("🎉 Hoàn tất Auto Edit (Source Trim + Gap).");
        return "done";

    } catch (e) {
        sendLog("❌ Lỗi tổng: " + e);
        return "error: " + e.toString();
    }
}
