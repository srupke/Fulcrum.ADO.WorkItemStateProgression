const { execSync, spawn } = require("child_process");

function killPort(port) {
  try {
    if (process.platform === "win32") {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const lines = result.trim().split("\n");
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`); } catch {}
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9`);
    }
  } catch {}
}

killPort(3000);

setTimeout(() => {
  const child = spawn(
    "npx",
    ["webpack", "serve", "--env", "mock"],
    { stdio: "inherit", shell: true }
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}, 400);
