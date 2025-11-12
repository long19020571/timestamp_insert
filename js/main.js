// ====== KHAI BÁO & NẠP HOST.JSX ======
const csInterface = new CSInterface();

function loadJSX() {
    const jsxPath = csInterface.getSystemPath(SystemPath.EXTENSION) + "/host/host.jsx";
    console.log("🔹 Loading JSX:", jsxPath);
    csInterface.evalScript('$.evalFile("' + jsxPath + '")', function (res) {
        console.log("✅ JSX loaded:", res);
        log("✅ host.jsx đã được nạp thành công!");
    });
    csInterface.evalScript('$.global.csInterface = true');
}

// Gọi khi panel khởi động
document.addEventListener("DOMContentLoaded", loadJSX);

// ====== HÀM LOG HIỂN THỊ TRÊN PANEL ======
function log(msg) {
    const box = document.getElementById("logBox");
    if (box) {
        box.value += msg + "\n";
        box.scrollTop = box.scrollHeight;
    }
}
window.log = log; // cho phép JSX gọi lại panel

// ====== NÚT RUN AUTO EDIT ======
document.getElementById("runBtn").addEventListener("click", () => {
    const csvFile = document.getElementById("csvFile").files[0];
    const folder = document.getElementById("videoFolder").files;
    
    // --- (MỚI) Lấy thêm MOGRT và Màu sắc ---
    const mogrtFile = document.getElementById("mogrtFile").files[0];

    if (!csvFile || folder.length === 0) {
        alert("Vui lòng chọn file CSV và thư mục video!");
        return;
    }
    
    // --- (MỚI) Kiểm tra MOGRT ---
    if (!mogrtFile) {
        alert("Vui lòng chọn file .mogrt!");
        return;
    }

    // ====== ĐỌC FILE CSV ======
    const reader = new FileReader();
    reader.onload = (e) => {
        const csvText = e.target.result;

        // ====== TẠO DANH SÁCH ĐƯỜNG DẪN FILE VIDEO ======
        const firstFile = folder[0];
        let folderPath = "";
        if (firstFile.webkitRelativePath) {
            folderPath = firstFile.webkitRelativePath.split("/")[0];
        }

        const files = Array.from(folder).map(f => {
            if (f.path) return f.path.replace(/\\/g, "\\\\");
            return folderPath + "/" + f.name;
        });
        
        // --- (MỚI) Lấy đường dẫn MOGRT (file đơn nên f.path hoạt động) ---
        const mogrtPath = mogrtFile.path.replace(/\\/g, "\\\\");

        log("📂 CSV loaded. Gửi dữ liệu sang Premiere...");

        // ====== GỌI JSX TRONG PREMIERE (Đã cập nhật) ======

        const command = `autoEditFromCSV(
            ${JSON.stringify(csvText)}, 
            ${JSON.stringify(files)}, 
            ${JSON.stringify(mogrtPath)}
        )`;


        csInterface.evalScript(command, function (result) {
            if (result) log("✅ Kết quả: " + result);
            else log("✅ Đã gửi lệnh xử lý sang Premiere!");
        });
    };

    reader.readAsText(csvFile);
});


// ====== (MỚI) NÚT SET SEQUENCE SETTINGS ======
document.getElementById("setSettingsBtn").addEventListener("click", () => {
    const settingsFile = document.getElementById("settingsFile").files[0];

    if (!settingsFile) {
        alert("Vui lòng chọn file JSON settings!");
        return;
    }

    // ====== ĐỌC FILE JSON ======
    const reader = new FileReader();
    reader.onload = (e) => {
        const jsonText = e.target.result;
        log("⚙️ JSON settings loaded. Gửi sang Premiere...");

        // ====== GỌI JSX TRONG PREMIERE ======
        // Sử dụng JSON.stringify để gửi toàn bộ nội dung text của file JSON
        // sang ExtendScript một cách an toàn
        const command = `applySequenceSettings(${JSON.stringify(jsonText)})`;

        csInterface.evalScript(command, function (result) {
            log("✅ Kết quả (Settings): " + result);
        });
    };

    reader.readAsText(settingsFile);
});

