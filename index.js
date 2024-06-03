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

      checkNetworkError(responseCommits.status, "commits in branch");

      const commitsInPr = responseCommits.data;

      async function getActivities(activityType) {
        const responseActivities = await octokit.request(
          `GET /repos/{owner}/{repo}/activity?ref={ref}&activity_type=${activityType}&per_page=100`,
          {
            owner: owner,
            repo: repo,
            ref: context.payload.pull_request.head.ref,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
            },
          }
        );

        checkNetworkError(responseActivities.status, "activities in branch");

        return responseActivities.data;
      }

      const activitiesInPr = (await getActivities("push")).concat(
        await getActivities("force_push")
      );

      let susCommitsMessage = "";
      let checkedCommitsMessage = "";
      let checkedCommitsCount = 0;

      let onlyAuthorMismatchMessage = "";
      let onlyCommitterMismatchMessage = "";

      for (commit of commitsInPr) {
        const commitSha = commit.sha;
        const commitMessage = commit.commit.message;

        const commitAuthorLogin = commit.author.login;
        const committerLogin = commit.committer.login;
        console.log(commit);

        for (activity of activitiesInPr) {
          const activityCommitSha = activity.after;
          const activityActor = activity.actor.login;

          if (commitSha == activityCommitSha) {
            checkedCommitsMessage +=
              returnCheckedCommitStringFormatted(commitMessage, commitSha) +
              "\n";
            checkedCommitsCount++;

            const commitAuthorLoginMismatch =
              commitAuthorLogin != activityActor;
            const committerLoginMismatch = committerLogin != activityActor;

            if (commitAuthorLoginMismatch && committerLoginMismatch) {
              core.setOutput("mismatch", "true");
              susCommitsMessage +=
                "Suspicious commit detected: " +
                getCommitInfoStringFormatted(
                  commitMessage,
                  commitSha,
                  commitAuthorLogin,
                  committerLogin,
                  activityActor
                ) +
                "\n";
            } else if (commitAuthorLoginMismatch) {
              onlyAuthorMismatchMessage +=
                "Only commit author differs from pusher: " +
                getCommitInfoStringFormatted(
                  commitMessage,
                  sha,
                  commitAuthor,
                  committer,
                  pusher
                ) +
                "\n";
            } else if (committerLoginMismatch) {
              onlyCommitterMismatchMessage +=
                "Only committer differs from pusher: " +
                getCommitInfoStringFormatted(
                  commitMessage,
                  sha,
                  commitAuthor,
                  committer,
                  pusher
                ) +
                "\n";
            }
          }
        }
      }

      console.log("Checked the following commits in the pull request:");
      console.log(checkedCommitsMessage);

      if (checkedCommitsCount < commitsInPr.length) {
        core.setFailed(
          "All commits in branch were not checked for spoofing. This could be a latency problem with the GitHub API 'activity' endpoint or a bug with the GitHub Action."
        );
      } else {
        console.log("All commits were succesfully checked for spoofing");
      }

      if (susCommitsMessage) {
        core.setFailed(
          "One or more commits might be spoofed: \n" + susCommitsMessage
        );
      } else {
        console.log(
          "No potentially spoofed commits spotted in the pull request"
        );
        if (onlyAuthorMismatchMessage || onlyCommitterMismatchMessage) {
          console.log(
            "Some partial mismatch were found. These are most likely benign but worth checking:\n" +
              onlyAuthorMismatchMessage +
              onlyCommitterMismatchMessage
          );
        }
        core.setOutput("mismatch", "false");
      }
    } catch (error) {
      core.setFailed(`Action failed with error: ${error}`);
    }
  } else if (context.eventName == "push") {
    try {
      const pushedCommit = context.payload.head_commit;

      const commitAuthor = pushedCommit.author.username;
      const committer = pushedCommit.committer.username;

      const commitMessage = pushedCommit.message;

      const pusher = context.actor;

      commitAuthorMismatch = commitAuthor !== pusher;
      committerMismatch = committer !== pusher;

      if (commitAuthorMismatch && committerMismatch) {
        const detailedMismatchMessage =
          "Suspicious commit detected: " +
          getCommitInfoStringFormatted(
            commitMessage,
            sha,
            commitAuthor,
            committer,
            pusher
          );
        core.setFailed(detailedMismatchMessage);
        core.setOutput("mismatch", "true");
      } else if (commitAuthorMismatch) {
        console.log(
          "Only commit author differs from pusher: " +
            getCommitInfoStringFormatted(
              commitMessage,
              sha,
              commitAuthor,
              committer,
              pusher
            )
        );
      } else if (committerMismatch) {
        console.log(
          "Only committer differs from pusher: " +
            getCommitInfoStringFormatted(
              commitMessage,
              sha,
              commitAuthor,
              committer,
              pusher
            )
        );
      } else {
        console.log(
          "No mismatch detected: " +
            getCommitInfoStringFormatted(
              commitMessage,
              sha,
              commitAuthor,
              committer,
              pusher
            )
        );
      }
      core.setOutput("mismatch", "false");
    } catch (error) {
      core.setFailed(`Action failed with error: ${error}`);
    }
  }
}

function returnCheckedCommitStringFormatted(message, sha) {
  return `commit "${message}" (${sha})`;
}

function getCommitInfoStringFormatted(message, sha, author, committer, actor) {
  return `${returnCheckedCommitStringFormatted(
    message,
    sha
  )}. Author is ${author} and commiter is ${committer}, while push actor is ${actor}`;
}

function checkNetworkError(statusCode, whatAreFetched) {
  if (statusCode != 200) {
    core.setFailed(
      `Action failed fetching ${whatAreFetched} from GitHub API. Network error: ${statusCode}`
    );
  }
}

checkSpoofing();
