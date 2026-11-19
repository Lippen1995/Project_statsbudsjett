# Native GitHub connector recovery

Use this when the native task has a working GitHub connector but no authenticated local gh.
Do not classify a missing checkout or gh login as missing repository access.

## Restore a reproducible checkout

1. Fetch /git/ref/heads/main through the GitHub connector. Pin the returned commit.
2. Fetch /git/trees/<commit>?recursive=1 and require truncated=false.
3. Restore the scripts, their local imports, settings, editorial learning and required source files at that commit. Use fetch_file for text; for files above one MiB use fetch_blob with the tree's blob SHA.
4. Write the exact returned UTF-8 bytes. Do not append newlines to source data. Verify Git blob SHA-1 as SHA1("blob "+byteLength+"\\0"+bytes), and the research package SHA-256 checks.
5. Restore referenced immutable SSB files and KOSTRA entities. A missing local file is recoverable; never replace it with fabricated data.
6. Read fresh PR head, comments, authorization and current job status before starting.

## Run the existing scripts

The two connector adapters are a native-task fallback. They do not contain credentials and do not call an AI API.
The source of connector-host.js runs inside the native functions.exec tool, not Node or GitHub Actions.
Discover the GitHub tools named in that file before executing it.

Use an absolute workspace root containing a subdirectory named fellestall for the restored repository.
Create connector-bin alongside it and a private temporary request directory (mode 0700).
Symlink connector-bin/gh to fellestall/scripts/analyser/connector-gh.py and make the target executable.
Set no GH_TOKEN. The host configures PATH and FELLESTALL_CONNECTOR_QUEUE for each command.

Load the host text in functions.exec and call:

```javascript
const run = new Function('tools', 'text', hostSource + '; return runConnector;')(tools, text);
await run('node scripts/admin/sven-job.mjs start --note "Kontrollerer faktisk revisjon"',
  {root: workspaceRoot, queue: privateQueue, prNumber: actualPrNumber});
```

Keep the returned run ID. Use the same host for feedback-status-cli.mjs, prepare.mjs,
prepare-research-revision.mjs and finishing the same admin run.
Every GET is answered by a live authorized connector call. Permission checks use the dedicated permission tool.
Only documented technical feedback receipts for the selected PR and the admin status file can be written by this adapter.
It deliberately cannot update the article PR, approve, publish or alter the analysis pipeline.
Deliver the finished packet separately using the existing analysis/input-* bot handoff.

Do not let a stopped host leave a job marked as running. Record failed with the actual remaining blocker, or waiting when appropriate.
A valid prepared packet is not a delivered revision. Do not mark feedback processed until bot delivery.

## Health-reform recovery verified 19 November 2026

- Restored fresh main and PR #86 head 8ddd325753de31d564c32ef597387283bd82d693.
- Ran the original sven-job.mjs successfully through the connector.
- Ran feedback-status-cli.mjs and prepare-research-revision.mjs successfully against actual PR and authorized feedback.
- Prepared research-revision packet retained the primary series and passed validateArticle (157 facts).
- Re-ran baseline.py. All values and derived outputs were identical; only utgifter.json source fingerprint changed.
  The regenerated baseline was saved in commit 3cbef5c29096e65c58c84868a69a5a42575c4b11.
- Direct data.ssb.no connectivity timed out. This is a separate source-access problem, not a GitHub login failure.
- The article has NOT been revised or delivered by these technical checks. Full catalogue research, requested extensions, writing and verified bot handoff remain required.

If a baseline source fingerprint changes again, regenerate with baseline.py and inspect every changed output.
Never merely replace a hash to suppress an error. If primary observations change, stop for the documented data revision procedure.
