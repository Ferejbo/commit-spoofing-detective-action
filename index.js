const core = require("@actions/core");
const github = require("@actions/github");

const { Octokit } = require("@octokit/core");

async function checkSpoofing() {
  const token = core.getInput("GITHUB_TOKEN");
  const octokit = new Octokit({ auth: token });

  const context = github.context;

  const { owner, repo } = context.repo;
  const sha = context.sha;

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

checkSpoofing();
