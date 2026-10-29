import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const packageJsonUrl = new URL('../package.json', import.meta.url)
const prepareCommand = JSON.parse(readFileSync(packageJsonUrl, 'utf8')).scripts.prepare

function runPrepareIn(directory) {
  return spawnSync('sh', ['-c', prepareCommand], { cwd: directory, encoding: 'utf8' })
}

function createTempDirectory(testContext, prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  testContext.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('prepare succeeds outside a git work tree', (t) => {
  const plainDirectory = createTempDirectory(t, 'prepare-plain-')
  assert.equal(runPrepareIn(plainDirectory).status, 0)
})

test('prepare points git hooks at .githooks inside a git work tree', (t) => {
  const repoDirectory = createTempDirectory(t, 'prepare-repo-')
  const initResult = spawnSync('git', ['init', '-q'], { cwd: repoDirectory })
  assert.equal(initResult.status, 0, 'git init failed')
  assert.equal(runPrepareIn(repoDirectory).status, 0)
  const hooksPath = spawnSync('git', ['config', 'core.hooksPath'], { cwd: repoDirectory, encoding: 'utf8' })
  assert.equal(hooksPath.stdout.trim(), '.githooks')
})
