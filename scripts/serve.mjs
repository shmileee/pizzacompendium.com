#!/usr/bin/env node
// Preview of dist/: mise run serve   (HOST, default 127.0.0.1; PORT, default 8080, 0 = any free port)
import path from 'node:path';
import { projectRoot } from './lib/cli.mjs';
import { describeError, describeUrl, listen, parsePort } from './lib/serve.mjs';

const distDir = path.join(
  projectRoot(process.env, import.meta.dirname),
  'dist',
);
const host = process.env.HOST || '127.0.0.1';
const port = parsePort(process.env.PORT, 8080);

if (port === null) {
  console.error(
    `PORT must be a number from 0 to 65535, not "${process.env.PORT}"`,
  );
  process.exitCode = 1;
} else {
  try {
    const server = await listen({ distDir, host, port });
    // Stop cleanly on Ctrl-C and on `kill`, so that the process ends normally.
    // The handlers come before the message: whoever reads it may signal at once.
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        server.closeAllConnections();
        server.close();
      });
    console.log(`Serving dist/ on ${describeUrl(host, server.address().port)}`);
  } catch (error) {
    console.error(describeError(error, { host, port }));
    process.exitCode = 1;
  }
}
