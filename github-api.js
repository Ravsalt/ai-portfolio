/**
 * Fetches a list of repositories for a GitHub user
 * @param {string} username - GitHub username
 * @param {number} count - Maximum number of repositories to fetch
 * @returns {Promise<string>} - JSON string with repository data
 */
async function fetchUserRepositories(username, count = 10) {
    const apiUrl = `https://api.github.com/users/${username}/repos?per_page=${count}&sort=updated`;
    console.log(`Fetching repositories from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            console.error(`GitHub API error! Status: ${response.status}, Message: ${errorData.message}`);
            return JSON.stringify({ 
                error: true, 
                status: response.status, 
                message: `Failed to fetch repositories: ${errorData.message || 'Unknown error'}` 
            });
        }

        const reposData = await response.json();
        
        if (!Array.isArray(reposData)) {
            console.error("GitHub API did not return an array for repositories:", reposData);
            return JSON.stringify({ 
                error: true, 
                message: "Invalid data format received from GitHub API for repositories."
            });
        }

        const processedRepos = reposData.map(repo => ({
            name: repo.name,
            description: repo.description,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            updated_at: new Date(repo.updated_at).toLocaleString(),
            url: repo.html_url
        }));
        
        console.log(`Processed ${processedRepos.length} repositories`);
        return JSON.stringify(processedRepos);

    } catch (error) {
        console.error('Error fetching or processing GitHub repositories:', error);
        return JSON.stringify({ 
            error: true, 
            message: `Network or processing error fetching repositories: ${error.message}` 
        });
    }
}

/**
 * Fetches latest commits from a specific GitHub repository
 * @param {string} username - GitHub username
 * @param {string} repoName - Repository name
 * @param {number} count - Maximum number of commits to fetch
 * @returns {Promise<string>} - JSON string with commit data
 */
async function fetchLatestCommitsFromGitHub(username, repoName, count = 3) {
    const apiUrl = `https://api.github.com/repos/${username}/${repoName}/commits?per_page=${count}`;
    console.log(`Fetching commits from: ${apiUrl}`);

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                // No explicit 'Authorization' header for public repos, relies on rate limits for unauthenticated requests.
                // For private repos or higher rate limits, an OAuth token would be needed.
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            console.error(`GitHub API error! Status: ${response.status}, Message: ${errorData.message}`);
            return JSON.stringify({ 
                error: true, 
                status: response.status, 
                message: `Failed to fetch commits: ${errorData.message || 'Unknown error'}` 
            });
        }

        const commitsData = await response.json();
        
        if (!Array.isArray(commitsData)) {
            console.error("GitHub API did not return an array for commits:", commitsData);
            return JSON.stringify({ 
                error: true, 
                message: "Invalid data format received from GitHub API for commits."
            });
        }

        const processedCommits = commitsData.map(commitEntry => ({
            sha: commitEntry.sha.substring(0, 7), // Short SHA
            message: commitEntry.commit.message.split('\n')[0], // First line of commit message
            author: commitEntry.commit.author.name,
            date: new Date(commitEntry.commit.author.date).toLocaleString(),
            url: commitEntry.html_url
        }));
        
        console.log("Processed commits:", processedCommits);
        return JSON.stringify(processedCommits); // Return as a JSON string, as expected by the AI tool call response

    } catch (error) {
        console.error('Error fetching or processing GitHub commits:', error);
        return JSON.stringify({ 
            error: true, 
            message: `Network or processing error fetching commits: ${error.message}` 
        });
    }
}

/**
 * Fetches contribution summary across all repositories for a user
 * @param {string} username - GitHub username
 * @param {number} repoLimit - Maximum number of repositories to check
 * @returns {Promise<string>} - JSON string with contribution summary
 */
async function fetchUserContributionSummary(username, repoLimit = 5) {
    try {
        // First get the user's repositories
        const reposResponse = await fetchUserRepositories(username, repoLimit);
        const repos = JSON.parse(reposResponse);
        
        if (repos.error) {
            return reposResponse; // Return the error
        }
        
        // For each repository, get some commit stats
        const contributionSummary = [];
        
        for (const repo of repos.slice(0, repoLimit)) { // Limit to avoid rate limiting
            try {
                const commitsResponse = await fetchLatestCommitsFromGitHub(username, repo.name, 3);
                const commits = JSON.parse(commitsResponse);
                
                if (!commits.error) {
                    contributionSummary.push({
                        repository: repo.name,
                        description: repo.description,
                        language: repo.language,
                        recent_commits: commits,
                        last_updated: repo.updated_at
                    });
                }
            } catch (error) {
                console.error(`Error fetching commits for ${repo.name}:`, error);
                // Continue with other repos even if one fails
            }
        }
        
        console.log(`Generated contribution summary for ${contributionSummary.length} repositories`);
        return JSON.stringify({
            username: username,
            total_repositories: repos.length,
            contribution_summary: contributionSummary
        });
        
    } catch (error) {
        console.error('Error generating contribution summary:', error);
        return JSON.stringify({ 
            error: true, 
            message: `Error generating contribution summary: ${error.message}` 
        });
    }
}

// Export the functions for use in other modules
window.githubApi = {
    get_latest_github_commits_for_user: fetchLatestCommitsFromGitHub,
    get_user_repositories: fetchUserRepositories,
    get_user_contribution_summary: fetchUserContributionSummary
};

// Example usage (for testing in browser console if needed):
// window.githubApi.get_latest_github_commits_for_user('Ravsalt', 'ai-portfolio', 3)
//     .then(dataStr => console.log(JSON.parse(dataStr)));
