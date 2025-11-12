/**
 * host_DUNG_importMGT.jsx
 * - V1: Source Trim video
 * - V2: Chèn MOGRT bằng hàm seq.importMGT() (theo tài liệu)
 *
 * - FIX 1: Sửa lỗi "SolidColor does not have a constructor".
 * - FIX 2: Sửa lỗi tìm MOGRT (bỏ đuôi .mogrt). (Logic này đã bị xóa vì dùng importMGT)
 * - FIX 3: Sửa lỗi typo 'clearOutPoint'.
 * - FIX 4: Cập nhật Regex CSV và parseTimecode.
 * - FIX 5 (MỚI): Chuyển đổi 'seconds' sang 'ticks' cho hàm importMGT.
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

// ==== Parse timecode (Xử lý dấu phẩy an toàn) ====
function parseTimecode(tc) {
    if (tc === undefined || tc === null) return NaN;
    tc = String(tc).replace(/"/g, "").replace(/^\uFEFF/, "");
    tc = tc.replace(/^\s+|\s+$/g, "");
    tc = tc.replace(/,(\d+)$/, '.$1'); // Thay dấu phẩy cuối cùng bằng dấu chấm

    var parts = tc.split(/[:.]/);
    if (parts.length < 3) return NaN;
    if (parts.length < 4) parts.push("0");
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var s = parseInt(parts[2], 10) || 0;
    var ms = parseInt(parts[3], 10) || 0;
    return h * 3600 + m * 60 + s + ms / 1000.0;
}

// ==== (CẬP NHẬT) Chuyển đổi màu Hex sang object {r, g, b} ====
function hexToRGB(hex) {
    var r = 0, g = 0, b = 0;
    if (hex.charAt(0) == '#') { hex = hex.substring(1); }
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
    return { r: r, g: g, b: b }; 
}

// ==== Parse CSV (CẬP NHẬT REGEX) ====
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
        var match = line.match(/^\s*([^,]+)\s*,\s*"?([^"]+)"?\s*,\s*"?([^"]+)"?\s*(?:,\s*"?([^"]+)"?\s*)?/i);
        if (!match) {
            sendLog("⚠️ Dòng CSV không hợp lệ (bỏ qua): " + line);
            continue;
        }
        var name = safeTrim(match[1]);
        var start = parseTimecode(match[2]);
        var end = parseTimecode(match[3]);
        var textEditCmd = (match[4] && match[4] !== "") ? safeTrim(match[4]) : null; 
        if (!isNaN(start) && !isNaN(end)) {
            data.push({ name: name, start: start, end: end, textEdit: textEditCmd });
        } else {
             sendLog("⚠️ Timecode không hợp lệ (bỏ qua): " + line);
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
// =============== (MỚI) SET SETTINGS ================
// ===================================================
function applySequenceSettings(jsonText) {
    sendLog("⚙️ Bắt đầu áp dụng Sequence Settings...");

    try {
        if (!app.project.activeSequence) {
            sendLog("❌ Không có sequence nào đang active.");
            return "no_sequence";
        }
        var seq = app.project.activeSequence;

        // 1. Lấy settings hiện tại
        // Đây là một đối tượng SequenceSettings
        var currentSettings = seq.getSettings();
        if (!currentSettings) {
            sendLog("❌ Không thể lấy settings của sequence active.");
            return "settings_error";
        }

        // 2. Parse JSON từ người dùng
        var userSettings;
        try {
            // Dùng eval để parse JSON trong ExtendScript (không có JSON.parse)
            userSettings = eval('(' + jsonText + ')'); 
        } catch (e) {
            sendLog("❌ Lỗi parse JSON: " + e.toString());
            return "json_parse_error";
        }

        sendLog("Đang áp dụng settings: " + jsonText);

        // 3. Merge userSettings vào currentSettings
        // Chúng ta lặp qua các key trong JSON của người dùng
        for (var key in userSettings) {
            if (userSettings.hasOwnProperty(key)) {
                
                // Kiểm tra xem key này có tồn tại trong đối tượng SequenceSettings không
                if (currentSettings.hasOwnProperty(key)) {
                    
                    // XỬ LÝ TRƯỜNG HỢP ĐẶC BIỆT: audioSampleRate
                    // Đây là một Time object, không phải là Integer
                    if (key === "audioSampleRate") {
                        var rate = parseInt(userSettings[key], 10);
                        if (!isNaN(rate)) {
                            // 'ticks' của Time object này chính là giá trị sample rate
                            // Chúng ta phải gán nó dưới dạng string
                            currentSettings.audioSampleRate.ticks = rate.toString(); 
                            sendLog("Updated audioSampleRate to: " + rate);
                        } else {
                            sendLog("⚠️ Giá trị audioSampleRate không hợp lệ (bỏ qua): " + userSettings[key]);
                        }
                    } 
                    // Xử lý các trường hợp còn lại (Int, Boolean, String)
                    // Gán trực tiếp giá trị từ JSON của người dùng
                    else {
                        currentSettings[key] = userSettings[key];
                        sendLog("Updated " + key + " to: " + userSettings[key]);
                    }
                } else {
                    // Bỏ qua nếu key trong JSON không phải là một setting hợp lệ
                    sendLog("⚠️ Key không tồn tại trong SequenceSettings (bỏ qua): " + key);
                }
            }
        }

        // 4. Áp dụng đối tượng settings đã được merge
        var result = seq.setSettings(currentSettings);
        
        if (result === true) {
            sendLog("✅ Đã áp dụng settings thành công!");
            return "settings_applied_success";
        } else {
            sendLog("❌ Áp dụng settings thất bại (hàm setSettings trả về false).");
            sendLog("Hãy kiểm tra xem editingMode có hợp lệ không.");
            return "settings_apply_failed";
        }

    } catch (e) {
        sendLog("❌ Lỗi tổng (applySequenceSettings): " + e);
        return "error: " + e.toString();
    }
}

// ===================================================
// =============== MAIN FUNCTION =====================
// ===================================================
function autoEditFromCSV(csvText, videoPaths, mogrtPath, boxFillColor, boxStrokeColor) {
    sendLog("🚀 Bắt đầu Auto Edit (Sử dụng seq.importMGT)");

    try {
        var data = parseCSV(csvText);
        if (!data.length) {
            sendLog("❌ CSV không hợp lệ hoặc rỗng.");
            return "no_data";
        }
        if (!app.project.activeSequence) return "no_sequence";

        var seq = app.project.activeSequence; // Lấy sequence
        if (!seq.videoTracks || seq.videoTracks.numTracks === 0) return "no_track";

        // --- (CẬP NHẬT) Đã xóa khối logic import MOGRT ở đây ---
        // Chúng ta sẽ import trực tiếp trong vòng lặp

        if (seq.videoTracks.numTracks < 2) {
             sendLog("⚠️ Cảnh báo: Cần ít nhất 2 video track (V1, V2). Sẽ bỏ qua MOGRT text.");
        }


        for (var i = 0; i < data.length; i++) {
            var row = data[i];
            var duration = row.end - row.start;
            if (duration <= 0) continue;

            // --- PHẦN 1: XỬ LÝ VIDEO (Giữ nguyên logic 'Find or Import') ---
            sendLog("🎞 Clip " + (i + 1) + ": " + row.name);
            var clipPath = findFilePath(videoPaths, row.name);
            var item = null;

            if (clipPath) {
                try {
                    item = findProjectItemByName(app.project.rootItem, String(row.name).toLowerCase());
                    if (!item) {
                        sendLog("Đang import video: " + row.name);
                        app.project.importFiles([clipPath], 1, app.project.rootItem, 0);
                        item = findProjectItemByName(app.project.rootItem, String(row.name).toLowerCase());
                    }
                } catch (eImp) { sendLog("⚠️ Lỗi import: " + eImp); }
            }

            if (item) {
                try {
                    item.setInPoint(row.start, 4);
                    item.setOutPoint(row.end, 4);
                    
                    var t = new Time();
                    t.seconds = row.start;
                    seq.videoTracks[1].insertClip(item, t); // Chèn vào V1 (index 0)
                    sendLog("✅ Đã chèn clip: " + row.name + " @ " + row.start + "s");

                    item.setScaleToFrameSize();

                    // *** FIX ***: Sửa lỗi typo
                    item.clearInPoint(); 
                    item.clearOutPoint();
                } catch (eVideo) {
                    sendLog("❌ Lỗi xử lý clip: " + eVideo);
                }
            } else {
                sendLog("⚠️ Không tìm thấy file: " + row.name + ". Bỏ qua.");
            }
            
            // --- (CẬP NHẬT) PHẦN 2: XỬ LÝ TEXT MOGRT (Dùng importMGT) ---
            var textContent = null;
            if (row.textEdit && row.textEdit.indexOf("TEXT_EDIT(") === 0) {
                textContent = row.textEdit.substring(10, row.textEdit.length - 1);
            }
            
            // Điều kiện: Có text, có đường dẫn MOGRT, và có ít nhất 2 track
            if (textContent && mogrtPath && seq.videoTracks.numTracks >= 2) {
                
                var graphicClip = null;
                
                try {
                    sendLog("✍️ Đang import MOGRT (seq.importMGT): " + textContent);

                    // 1. Chuyển đổi 'seconds' (giây) sang 'ticks'
                    var t_start = new Time();
                    t_start.seconds = row.start;
                    var timeInTicks = t_start.ticks; // Lấy 'ticks'
                    
                    // 2. GỌI HÀM importMGT()
                    // (path, timeInTicks, vidTrackOffset, audTrackOffset)
                    // vidTrackOffset = 1 (nghĩa là chèn vào V2, vì V1 là index 0)
                    // audTrackOffset = 0 (không có audio)
                    graphicClip = seq.importMGT(mogrtPath, timeInTicks, 2, 0);
                    
                    if (!graphicClip) {
                        sendLog("❌ Lỗi importMGT! File có thể bị hỏng hoặc không tương thích.");
                        continue;
                    }

                    // 3. Set độ dài (vẫn cần thiết)
                    var t_end = new Time();
                    t_end.seconds = row.end;
                    graphicClip.end = t_end;

                    // 4. Set thuộc tính
                    var mgtComponent = graphicClip.getMGTComponent();
                    if (mgtComponent) {
                        var props = mgtComponent.properties;
                        
                        var textParam = props.getParamForDisplayName("MY_TEXT");
                        if (textParam) textParam.setValue(textContent);
                        else sendLog("⚠️ Lỗi MOGRT: Không tìm thấy 'MY_TEXT'.");


                        sendLog("✅ Đã cập nhật Text MOGRT.");
                    }
                } catch(eMogrt) {
                    sendLog("❌ Lỗi khi xử lý MOGRT: " + eMogrt);
                    // Nếu lỗi ở đây, 99% là do file MOGRT không hợp lệ
                }
            } // Kết thúc xử lý text
        } // Kết thúc vòng lặp for

        sendLog("🎉 Hoàn tất Auto Edit.");
        return "done";

    } catch (e) {
        sendLog("❌ Lỗi tổng: " + e);
        return "error: " + e.toString();
    }
}
