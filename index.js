const core = require("@actions/core");
const github = require("@actions/github");

const { Octokit } = require("@octokit/core");

async function checkSpoofing() {
  const token = core.getInput("GITHUB_TOKEN");
  const octokit = new Octokit({ auth: token });

  const context = github.context;

  const { owner, repo } = context.repo;
  const sha = context.sha;

  if (context.eventName == "pull_request") {
    const pr = context.payload.pull_request;

    try {
      const responseCommits = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits?per_page=100",
        {
          owner: owner,
          repo: repo,
          pull_number: pr.number,
        }
      );

      if (response.status != 200) {
        core.setFailed(`Action failed with network error: ${response.status}`);
      }

      console.log("context", context);

      console.log("payload", context.payload);

      console.log("pr", context.payload.pull_request);

      const commitsInPr = response.data;
      const relevantBranch = context.payload.pull_request.head.ref;

      const responseActivities = await octokit.request(
        "GET /repos/{owner}/{repo}/activity?activity_type=push&",
        {
          owner: "OWNER",
          repo: "REPO",
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );
    } catch (error) {
      core.setFailed(`Action failed with error: ${error}`);
    }
  } else if (context.eventName == "push") {
    try {
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/commits/{ref}",
        {
          owner: owner,
          repo: repo,
          ref: sha,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (response.status != 200) {
        core.setFailed(`Action failed with network error: ${response.status}`);
      }

      const data = response.data;

      const commitAuthor = data.author.login;
      const commitMessage = data.commit.message;

      const pusher = context.actor;

      const commitTextOutput = `commit "${commitMessage}" (${sha})`;

      if (commitAuthor !== pusher) {
        const detailedMismatchMessage = `Mismatch detected in ${commitTextOutput}. Author is "${commitAuthor}" while push actor is "${pusher}"😬`;
        core.setFailed(detailedMismatchMessage);
        core.setOutput("mismatch", "true");
      } else {
        console.log(
          `No mismatch detected: ${commitTextOutput}, authored by '${commitAuthor}' was also pushed by '${pusher}'.`
        );
        core.setOutput("mismatch", "false");
      }
    } catch (error) {
      core.setFailed(`Action failed with error: ${error}`);
    }
  }
}

checkSpoofing();
