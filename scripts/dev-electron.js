import { spawn } from 'child_process';
import net from 'net';

// Start the express + vite dev server
const serverProcess = spawn('npx', ['tsx', 'server.ts'], { 
  stdio: 'inherit', 
  shell: true,
  env: { ...process.env, FORCE_COLOR: true }
});

function checkServer() {
  const socket = new net.Socket();
  socket.connect(3000, '127.0.0.1', () => {
    socket.destroy();
    console.log('Server is ready, launching Electron...');
    
    // Start Electron pointing to development server
    const electronProcess = spawn('npx', ['electron', '.'], { 
      stdio: 'inherit', 
      shell: true,
      env: { ...process.env, ELECTRON_DEV: 'true' }
    });

    electronProcess.on('close', () => {
      console.log('Electron closed. Terminating dev server...');
      serverProcess.kill();
      process.exit(0);
    });
  });
  
  socket.on('error', () => {
    setTimeout(checkServer, 500);
  });
}

// Ensure the dev server process is killed if this launcher process is killed
process.on('SIGINT', () => {
  serverProcess.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  serverProcess.kill();
  process.exit(0);
});

checkServer();
