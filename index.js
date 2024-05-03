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
    console.log("PRRRRRRR");
    try {
      const responseCommits = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits?per_page=100",
        {
          owner: owner,
          repo: repo,
          pull_number: pr.number,
        }
      );

      if (responseCommits.status != 200) {
        core.setFailed(
          `Action failed with network error: ${responseCommits.status}`
        );
      }

      console.log("context", context);

      console.log("payload", context.payload);

      console.log("pr", context.payload.pull_request.head.ref);

      const sourceBranchName = context.payload.pull_request.head.ref;
      const commitsInPr = responseCommits.data;
      const relevantBranch = context.payload.pull_request.head.ref;

      const responseActivities = await octokit.request(
        "GET /repos/{owner}/{repo}/activity?ref={ref}&activity_type=push&per_page=100",
        {
          owner: owner,
          repo: repo,
          ref: context.payload.pull_request.head.ref,
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );

      if (responseActivities.status != 200) {
        core.setFailed(
          `Action failed with network error: ${responseActivities.status}`
        );
      }

      const activitiesInPr = responseActivities.data;
      let susCommitsMessage = "";
      let checkedCommitsMessage = "";

      for (commit of commitsInPr) {
        const commitSha = commit.sha;
        const commitAuthorLogin = commit.author.login;
        const commitMessage = commit.commit.message;

        for (activity of activitiesInPr) {
          const activityCommitSha = activity.after;
          const activityActor = activity.actor.login;

          if (commitSha == activityCommitSha) {
            checkedCommitsMessage +=
              returnCheckedCommitStringFormatted(commitMessage, commitSha) +
              "\n";

            if (commitAuthorLogin != activityActor) {
              susCommitsMessage +=
                returnSuspiciousCommitStringFormatted(
                  commitMessage,
                  commitSha,
                  commitAuthorLogin,
                  activityActor
                ) + "\n";
            }
          }
        }
      }

      console.log("Commits", commitsInPr);
      console.log("Activities", activitiesInPr);

      console.log("Checked the following commits in the pull request:");
      console.log(checkedCommitsMessage);

      if (susCommitsMessage) {
        core.setFailed(
          "One or more commits are might be spoofed \n" + susCommitsMessage
        );
      } else {
        console.log(
          "No potentially spoofed commits spotted in the pull request"
        );
        core.setOutput("mismatch", "false");
      }
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

      const commitTextOutput = returnCheckedCommitStringFormatted(
        commitMessage,
        sha
      );

      if (commitAuthor !== pusher) {
        const detailedMismatchMessage = returnSuspiciousCommitStringFormatted(
          commitMessage,
          sha,
          commitAuthor,
          pusher
        );
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

function returnCheckedCommitStringFormatted(message, sha) {
  return `commit "${message}" (${sha})`;
}

function returnSuspiciousCommitStringFormatted(message, sha, author, actor) {
  return `Suspicious ${returnCheckedCommitStringFormatted(
    message,
    sha
  )}. Author is ${author}, while push actor is ${actor}`;
}

checkSpoofing();
