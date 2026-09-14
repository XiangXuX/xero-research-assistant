import { app } from "./app.js";
import { appConfig } from "./config.js";
import { closeResearchDatabase } from "./database/index.js";

const port = appConfig.port;

const server = app.listen(port, () => {
  console.log(`Xero Research API listening on http://localhost:${port}`);
});

const shutdown = () => {
  server.close(() => {
    closeResearchDatabase();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
