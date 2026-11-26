// PIN-44 eval entry point. See eval/README.md.
//   npx deno run -A --no-lock --unstable-sloppy-imports --env-file=.env eval/cli.ts <fetch|label|run|judge|report|appliances|translate|pantry> [flags]
// --unstable-sloppy-imports: translate.ts uses shared/, whose imports have no file extensions.

import { appliancesCommand } from './appliances.ts';
import { fetchCommand } from './fetch.ts';
import { labelCommand } from './label.ts';
import { judgeCommand } from './judge.ts';
import { pantryCommand } from './pantry.ts';
import { reportCommand } from './report.ts';
import { runCommand } from './run.ts';
import { translateCommand } from './translate.ts';

const [command, ...args] = Deno.args;
const commands: Record<string, (args: string[]) => Promise<void>> = {
  fetch: fetchCommand,
  label: labelCommand,
  run: runCommand,
  judge: judgeCommand,
  report: reportCommand,
  appliances: appliancesCommand,
  translate: translateCommand,
  pantry: pantryCommand,
};

const fn = commands[command ?? ''];
if (!fn) {
  console.error(`Usage: cli.ts <${Object.keys(commands).join('|')}> [flags]`);
  Deno.exit(1);
}
await fn(args);
