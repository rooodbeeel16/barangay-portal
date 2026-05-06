/**
 * Kills any process listening on the specified port before dev server starts.
 * This prevents EADDRINUSE errors when restarting the dev server.
 */
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;

try {
  const output = execSync('netstat -ano', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = output.split('\n').filter(
    (line) => line.includes(`:${PORT}`) && line.includes('LISTENING')
  );

  lines.forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && parseInt(pid) > 0) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`✅ Freed port ${PORT} (killed PID ${pid})`);
      } catch {
        // Process may have already exited — ignore
      }
    }
  });
} catch {
  // netstat not available or no matches — safe to continue
}
