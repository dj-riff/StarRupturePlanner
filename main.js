const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // Create a slightly larger window to provide more space for complex
  // production graphs.  This makes the app more comfortable on
  // modern displays without requiring the user to resize manually.
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Star Rupture Production Planner'
  });
  win.loadFile('index.html');
  win.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});