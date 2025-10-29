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

    if (!csvFile || folder.length === 0) {
        alert("Vui lòng chọn file CSV và thư mục video!");
        return;
    }

    // ====== ĐỌC FILE CSV ======
    const reader = new FileReader();
    reader.onload = (e) => {
        const csvText = e.target.result;

        // ====== TẠO DANH SÁCH ĐƯỜNG DẪN FILE VIDEO ======
        // CEP mới không có f.path → tự xây dựng path dựa vào folder đầu tiên
        const firstFile = folder[0];
        let folderPath = "";
        if (firstFile.webkitRelativePath) {
            folderPath = firstFile.webkitRelativePath.split("/")[0]; // tên thư mục
        }

        const files = Array.from(folder).map(f => {
            if (f.path) return f.path.replace(/\\/g, "\\\\"); // bản CEP cũ
            return folderPath + "/" + f.name;                 // fallback
        });

        log("📂 CSV loaded. Gửi dữ liệu sang Premiere...");

        // ====== GỌI JSX TRONG PREMIERE ======
        const command = `autoEditFromCSV(${JSON.stringify(csvText)}, ${JSON.stringify(files)})`;

        csInterface.evalScript(command, function (result) {
            if (result) log("✅ Kết quả: " + result);
            else log("✅ Đã gửi lệnh xử lý sang Premiere!");
        });
    };

    reader.readAsText(csvFile);
});
