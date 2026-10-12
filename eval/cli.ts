// PIN-44 eval entry point. See eval/README.md.
//   npx deno run -A --no-lock --env-file=.env eval/cli.ts <fetch|label|run|judge|report> [flags]

import { fetchCommand } from './fetch.ts';
import { labelCommand } from './label.ts';
import { judgeCommand } from './judge.ts';
import { reportCommand } from './report.ts';
import { runCommand } from './run.ts';

const [command, ...args] = Deno.args;
const commands: Record<string, (args: string[]) => Promise<void>> = {
  fetch: fetchCommand,
  label: labelCommand,
  run: runCommand,
  judge: judgeCommand,
  report: reportCommand,
};

const fn = commands[command ?? ''];
if (!fn) {
  console.error(`Usage: cli.ts <${Object.keys(commands).join('|')}> [flags]`);
  Deno.exit(1);
}
await fn(args);
