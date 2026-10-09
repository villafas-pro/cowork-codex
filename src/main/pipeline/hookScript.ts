/**
 * The script Claude Code runs on session events. The app writes it to its own data folder and
 * points Claude Code's hooks at it (see claudeSettings.ts).
 *
 * It must be fast, silent and harmless: it reads the hook's JSON from stdin, finds a Jira ticket
 * key (from the git branch, else from the prompt), and drops one small file in the events folder
 * for the app to pick up. It prints nothing (UserPromptSubmit output would be fed to Claude) and
 * always exits 0 so it can never break a session.
 *
 * Plain CommonJS with no dependencies, kept as a string so it ships inside the app bundle.
 * Avoid backticks and dollar-brace sequences in the source below.
 */
export const HOOK_SCRIPT_SOURCE = String.raw`'use strict';
// Written by Cowork Codex. Safe to delete; the app rewrites it when you install the hooks.
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

// Things shaped like ticket keys that are not tickets
var DENY = {};
['UTF','SHA','ISO','MD','AES','RSA','TLS','SSL','HTTP','UTC','GMT','WCAG','ARIA','RFC','ES','EN','JSON','XML','CSS','HTML','PDF','CVE','NPM','ECMA','ANSI','ASCII','IPV','COVID','GPT','USB','SQL'].forEach(function (p) { DENY[p] = true; });

function findKey(text, ignoreCase) {
  if (typeof text !== 'string') return null;
  var re = ignoreCase
    ? /(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,7})(?![0-9])/g
    : /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9]{1,9})-(\d{1,7})(?![0-9])/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var prefix = m[1].toUpperCase();
    if (!DENY[prefix]) return prefix + '-' + m[2];
  }
  return null;
}

function main() {
  var dir = process.argv[2];
  if (!dir) return;
  var raw;
  try { raw = fs.readFileSync(0, 'utf8'); } catch (e) { return; }
  var p;
  try { p = JSON.parse(raw); } catch (e) { return; }
  if (!p || typeof p !== 'object') return;

  var ev = p.hook_event_name;
  var type = ev === 'SessionStart' ? 'session_start'
    : ev === 'SessionEnd' ? 'session_end'
    : (ev === 'UserPromptSubmit' || ev === 'Stop') ? 'heartbeat'
    : null;
  if (!type) return;

  var cwd = typeof p.cwd === 'string' ? p.cwd : process.cwd();
  var branch = '';
  try {
    branch = cp.execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true
    }).toString().trim();
  } catch (e) { /* not a repo, or git missing */ }

  var key = findKey(branch, true) || findKey(p.prompt, false);
  // A session with no ticket is not ours to track, but its end is still recorded so the app can
  // close a session it learned about from a later prompt.
  if (!key && type !== 'session_end') return;

  var name = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  fs.mkdirSync(dir, { recursive: true });
  var tmp = path.join(dir, '.' + name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify({
    v: 1, type: type, at: Date.now(), session_id: String(p.session_id || ''),
    cwd: cwd, branch: branch, key: key, event: ev
  }));
  fs.renameSync(tmp, path.join(dir, name + '.json'));
}

try { main(); } catch (e) { /* never fail a session */ }
process.exitCode = 0;
`
