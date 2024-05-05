# Commit Spoofing Detective Action

This action checks for mismatches between a commit's author and the actor who pushed the commit. An adversary can easily push a commit with an arbritrary commit author, assuming the adversary knows the email and username of the victim. This action highlights commits that are suspicious in this regard, and can be a usable mitigation if signed commits are not enforced. Please remember that the action only checks for mismatches between the push actor and commit author to check for potentially spoofed commits. If a developer has two GitHub accounts that are resepectievly the author and the actor, this could lead to a mismatch without it being a spoofed commit.

# Events

There are currently only two types of GitHub actions supported:

- Push events
  - Checks the latest pushed commit only
- Pull request events
  - Checks all pushed commits in source branch of pr

# When does it determine failure?

- Action detected a mismatch in at least one commit
- Not all relevant commits were checked. Potentially a result of latency in GitHub API
- Any general API or code errors

## Inputs

### `GITHUB_TOKEN`

**Required for pull request events only:** A GitHub token is needed when using the action for pr events. The token is used to fetch commits and activities in a specific pr/branch from the GitHub API. See example for insertion into the action

## Outputs

### `mismatch`

The output indicates whether or not a mismatch in a commit was detected.

Values: "true", "false" or undefined (if action cannot come to a conclusion. E.g. it could not fetch from GitHub API)

## Example usage

This example shows how to use the action on every push and opening, reopening and pushes to a pull request.

```yaml
on:
  push:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  commit_spoofing_detective_job:
    runs-on: ubuntu-latest
    name: A job that checks for potentially spoofed commits
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3
      - name: Commit spoofing check
        id: commit-spoof
        uses: Ferejbo/commit-spoofing-detective-action@v1.0
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Check Mismatch Output
        if: steps.commit-spoof.outputs.mismatch == 'true'
        run: echo "A commit spoofing was potentially detected."
```
