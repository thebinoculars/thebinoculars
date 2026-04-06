const axios = require("axios");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN environment variable is required.");
  process.exit(1);
}

const github = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  },
});

const BOT_LOGINS = [
  "dependabot[bot]",
  "dependabot-preview[bot]",
  "renovate[bot]",
  "renovate",
  "greenkeeper[bot]",
  "depfu[bot]",
  "snyk-bot",
  "imgbot[bot]",
  "allcontributors[bot]",
  "github-actions[bot]",
  "mergify[bot]",
  "kodiakhq[bot]",
  "whitesource-bolt-for-github[bot]",
];

const BLOCK_LABELS = [
  "do-not-merge",
  "do not merge",
  "wip",
  "work in progress",
  "hold",
  "on-hold",
  "blocked",
];

const MERGE_METHOD = process.env.MERGE_METHOD || "squash";
const MAX_BEHIND_BY = parseInt(process.env.MAX_BEHIND_BY || "20", 10);
const MAX_PRS_PER_REPO = parseInt(process.env.MAX_PRS_PER_REPO || "1", 10);
const DRY_RUN = process.env.DRY_RUN === "true";
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "5", 10);
const CI_FAIL_CLOSE_THRESHOLD = parseInt(
  process.env.CI_FAIL_CLOSE_THRESHOLD || "3",
  10,
);

const SKIP_REPOS = (process.env.SKIP_REPOS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ONLY_REPOS = (process.env.ONLY_REPOS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function ghGet(url, params = {}) {
  const res = await github.get(url, { params });
  return res.data;
}

async function ghPost(url, data = {}) {
  const res = await github.post(url, data);
  return res.data;
}

async function ghPut(url, data = {}) {
  const res = await github.put(url, data);
  return res.data;
}

async function ghPatch(url, data = {}) {
  const res = await github.patch(url, data);
  return res.data;
}

async function ghDelete(url) {
  const res = await github.delete(url);
  return res.data;
}

function isBot(login) {
  if (!login) return false;
  const lower = login.toLowerCase();
  return (
    BOT_LOGINS.some((b) => lower === b.toLowerCase()) || lower.endsWith("[bot]")
  );
}

function hasBlockingLabel(labels) {
  return labels.some((label) =>
    BLOCK_LABELS.includes(label.name.toLowerCase()),
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllPages(url, params = {}) {
  const items = [];
  let page = 1;

  while (true) {
    const data = await ghGet(url, { ...params, per_page: 100, page });
    items.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return items;
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = Promise.resolve()
      .then(task)
      .then((r) => {
        executing.delete(p);
        return r;
      });

    executing.add(p);
    results.push(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(results);
}

async function getAllUserRepos() {
  console.log("🔍 Fetching repositories...");

  const repos = await fetchAllPages("/user/repos", {
    visibility: "all",
    affiliation: "owner",
    sort: "updated",
  });

  console.log(`   Found ${repos.length} repositories.\n`);
  return repos;
}

async function getOldestBotPRs(owner, repo) {
  const prs = await ghGet(`/repos/${owner}/${repo}/pulls`, {
    state: "open",
    sort: "created",
    direction: "asc",
    per_page: 50,
  });

  return prs.filter((pr) => isBot(pr.user?.login)).slice(0, MAX_PRS_PER_REPO);
}

async function getPR(owner, repo, number) {
  return await ghGet(`/repos/${owner}/${repo}/pulls/${number}`);
}

async function getCIStatus(owner, repo, sha) {
  try {
    const [combinedStatus, checkRuns] = await Promise.all([
      ghGet(`/repos/${owner}/${repo}/commits/${sha}/status`),
      ghGet(`/repos/${owner}/${repo}/commits/${sha}/check-runs`, {
        per_page: 100,
      }),
    ]);

    const statuses = combinedStatus.statuses || [];
    const runs = checkRuns.check_runs || [];

    if (statuses.length === 0 && runs.length === 0) return "none";

    const hasFailure =
      statuses.some((s) => ["failure", "error"].includes(s.state)) ||
      runs.some((r) =>
        ["failure", "cancelled", "timed_out", "action_required"].includes(
          r.conclusion,
        ),
      );

    if (hasFailure) return "failure";

    const hasPending =
      statuses.some((s) => s.state === "pending") ||
      runs.some((r) => ["queued", "in_progress"].includes(r.status));

    if (hasPending) return "pending";

    return "success";
  } catch (error) {
    console.warn(
      `⚠️ CI status error ${owner}/${repo}@${sha.slice(0, 7)}: ${error.message}`,
    );
    return "none";
  }
}

async function getCIFailCommentCount(owner, repo, prNumber) {
  try {
    const comments = await ghGet(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      { per_page: 100 },
    );

    return comments.filter(
      (c) =>
        isBot(c.user?.login) && c.body?.includes("⚠️ Auto-merge: CI failed"),
    ).length;
  } catch {
    return 0;
  }
}

async function evaluatePR(owner, repo, pr) {
  if (pr.draft) return { action: "skip", reason: "PR is a draft" };

  if (hasBlockingLabel(pr.labels || []))
    return { action: "skip", reason: "PR has a blocking label" };

  let fullPR = await getPR(owner, repo, pr.number);

  if (fullPR.mergeable === null) {
    await sleep(3000);
    fullPR = await getPR(owner, repo, pr.number);
  }

  if (fullPR.mergeable === false || fullPR.mergeable_state === "dirty")
    return { action: "close", reason: "Has merge conflicts" };

  if (fullPR.behind_by !== undefined && fullPR.behind_by > MAX_BEHIND_BY)
    return {
      action: "update",
      reason: `Branch is ${fullPR.behind_by} commits behind`,
    };

  const ciStatus = await getCIStatus(owner, repo, pr.head.sha);

  if (ciStatus === "failure") {
    const failCount = await getCIFailCommentCount(owner, repo, pr.number);

    if (failCount >= CI_FAIL_CLOSE_THRESHOLD - 1) {
      return {
        action: "close",
        reason: `CI/CD failed ${CI_FAIL_CLOSE_THRESHOLD} times`,
        ciStatus,
      };
    }

    return { action: "warn", reason: "CI/CD failed", ciStatus };
  }

  if (ciStatus === "pending")
    return { action: "skip", reason: "CI/CD still pending" };

  return { action: "merge", reason: "All checks passed", ciStatus };
}

async function mergePR(owner, repo, pr, log) {
  if (DRY_RUN) {
    log.info(`🟡 [dry-run] Would merge #${pr.number}`);
    return true;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await ghPut(`/repos/${owner}/${repo}/pulls/${pr.number}/merge`, {
        merge_method: MERGE_METHOD,
        commit_title: `Auto-merge: ${pr.title} (#${pr.number})`,
      });

      log.info(`✅ Merged #${pr.number}`);

      if (pr.head.repo?.full_name === `${owner}/${repo}`) {
        try {
          await ghDelete(
            `/repos/${owner}/${repo}/git/refs/heads/${pr.head.ref}`,
          );
          log.info(`🗑️ Branch deleted: ${pr.head.ref}`);
        } catch {}
      }

      return true;
    } catch (error) {
      if (attempt < 3) {
        log.warn(`⚠️ retry ${attempt}: ${error.message}`);
        await sleep(2000 * attempt);
      } else {
        log.error(`❌ Merge failed: ${error.message}`);
      }
    }
  }

  return false;
}

async function closePR(owner, repo, pr, reason, log) {
  if (DRY_RUN) {
    log.info(`🟡 [dry-run] Would close #${pr.number}`);
    return true;
  }

  try {
    await ghPost(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, {
      body: `🤖 Auto-closed: **${reason}**.\n\nIf this was a false positive, feel free to reopen.`,
    });

    await ghPatch(`/repos/${owner}/${repo}/pulls/${pr.number}`, {
      state: "closed",
    });

    log.info(`❌ Closed #${pr.number}`);
    return true;
  } catch (error) {
    log.error(`❌ Close failed: ${error.message}`);
    return false;
  }
}

async function warnCIFail(owner, repo, pr, failCount, log) {
  if (DRY_RUN) return;

  try {
    await ghPost(`/repos/${owner}/${repo}/issues/${pr.number}/comments`, {
      body: `⚠️ Auto-merge: CI failed (attempt ${
        failCount + 1
      }/${CI_FAIL_CLOSE_THRESHOLD})`,
    });
  } catch (error) {
    log.error(`❌ Comment failed: ${error.message}`);
  }
}

async function updateBranch(owner, repo, pr, log) {
  if (DRY_RUN) return true;

  try {
    await ghPut(`/repos/${owner}/${repo}/pulls/${pr.number}/update-branch`);
    log.info(`🔄 Branch updated`);
    return true;
  } catch (error) {
    log.warn(`⚠️ Update failed: ${error.message}`);
    return false;
  }
}

function makeLog(owner, name) {
  const prefix = `[${owner}/${name}]`;
  return {
    info: (msg) => console.log(`${prefix} ${msg}`),
    warn: (msg) => console.warn(`${prefix} ${msg}`),
    error: (msg) => console.error(`${prefix} ${msg}`),
  };
}

async function processRepo(repo) {
  const owner = repo.owner.login;
  const name = repo.name;
  const fullName = `${owner}/${name}`.toLowerCase();

  if (repo.archived || repo.disabled) return [];

  if (ONLY_REPOS.length > 0 && !ONLY_REPOS.includes(fullName)) return [];
  if (SKIP_REPOS.includes(fullName)) return [];

  const prs = await getOldestBotPRs(owner, name);
  if (prs.length === 0) return [];

  const log = makeLog(owner, name);
  const results = [];

  for (const pr of prs) {
    const { action, reason, ciStatus } = await evaluatePR(owner, name, pr);

    switch (action) {
      case "merge":
        if (await mergePR(owner, name, pr, log)) results.push("merged");
        break;

      case "close":
        if (await closePR(owner, name, pr, reason, log)) results.push("closed");
        break;

      case "warn": {
        const failCount = await getCIFailCommentCount(owner, name, pr.number);
        await warnCIFail(owner, name, pr, failCount, log);
        results.push("skipped");
        break;
      }

      case "update":
        await updateBranch(owner, name, pr, log);
        results.push("skipped");
        break;

      default:
        results.push("skipped");
        break;
    }
  }

  return results;
}

async function main() {
  const repos = await getAllUserRepos();
  const stats = { merged: 0, closed: 0, skipped: 0 };

  const tasks = repos.map((repo) => () => processRepo(repo));
  const settled = await runWithConcurrency(tasks, CONCURRENCY);

  for (const result of settled) {
    if (result.status === "fulfilled") {
      for (const r of result.value) {
        if (r === "merged") stats.merged++;
        else if (r === "closed") stats.closed++;
        else stats.skipped++;
      }
    }
  }

  console.log(stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
