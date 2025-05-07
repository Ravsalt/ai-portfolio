/**
 * Fetches a list of repositories for a GitHub user
 * @param {string} username - GitHub username
 * @param {number} count - Maximum number of repositories to fetch
 * @returns {Promise<string>} - JSON string with repository data
 */
// CORS proxy configuration
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

/**
 * Creates CORS headers for GitHub API requests
 * @returns {Object} Headers object with CORS and GitHub API settings
 */
function createGitHubHeaders() {
    return {
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };
}

/**
 * Makes a CORS-enabled fetch request to GitHub API
 * @param {string} url - GitHub API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithCors(url, options = {}) {
    const headers = {
        ...createGitHubHeaders(),
        ...(options.headers || {})
    };

    const requestOptions = {
        ...options,
        headers,
        mode: 'cors',
        credentials: 'omit',
        cache: 'default'
    };

    try {
        // First try direct fetch
        let response = await fetch(url, requestOptions);
        
        // If CORS fails, try with proxy
        if (!response.ok && response.type === 'opaque') {
            console.log('Direct CORS request failed, trying with proxy...');
            response = await fetch(`${CORS_PROXY}${url}`, {
                ...requestOptions,
                headers: {
                    ...requestOptions.headers,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
        }
        
        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

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
        const response = await fetchWithCors(apiUrl, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            console.error(`GitHub API error! Status: ${response.status}, Message: ${errorData.message}`);
            return JSON.stringify({ 
                error: true, 
                status: response.status, 
                message: `GitHub API error: ${errorData.message || response.statusText}`
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
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/commits?per_page=${count}`;
    console.log(`Fetching commits from: ${apiUrl}`);

    try {
        const response = await fetchWithCors(apiUrl, {
            method: 'GET'
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            console.error(`GitHub API error! Status: ${response.status}, Message: ${errorData.message}`);
            return JSON.stringify({ 
                error: true, 
                status: response.status, 
                message: `GitHub API error: ${errorData.message || response.statusText}`
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
        // First get the user's repositories with enhanced error handling
        const reposResponse = await fetchUserRepositories(username, repoLimit);
        let repos;
        
        try {
            repos = JSON.parse(reposResponse);
        } catch (e) {
            console.error('Failed to parse repositories response:', e);
            return JSON.stringify({
                error: true,
                message: 'Failed to parse GitHub API response',
                details: e.message
            });
        }
        
        if (repos.error) {
            return reposResponse; // Return the original error response
        }
        
        // For each repository, get some commit stats with better error handling
        const repoPromises = repos.map(async repo => {
            try {
                if (!repo || !repo.name) {
                    console.warn('Skipping invalid repository:', repo);
                    return null;
                }

                let recentCommits = [];
                try {
                    const commitsResponse = await fetchLatestCommitsFromGitHub(username, repo.name, 3);
                    const parsedCommits = JSON.parse(commitsResponse);
                    if (!parsedCommits.error && Array.isArray(parsedCommits)) {
                        recentCommits = parsedCommits;
                    }
                } catch (commitError) {
                    console.warn(`Could not fetch commits for ${repo.name}:`, commitError);
                    // Continue with empty commits array
                }
                
                return {
                    repository: repo.name,
                    description: repo.description || 'No description',
                    language: repo.language || 'Not specified',
                    stars: repo.stargazers_count || 0,
                    forks: repo.forks_count || 0,
                    recent_commits: recentCommits,
                    last_updated: repo.updated_at || new Date().toISOString(),
                    url: repo.html_url || `https://github.com/${username}/${repo.name}`
                };
            } catch (error) {
                console.error(`Error processing repository ${repo.name || 'unknown'}:`, error);
                return null; // Skip this repo if there's an error
            }
        });
        
        const contributionSummary = await Promise.all(repoPromises);
        const filteredSummary = contributionSummary.filter(repo => repo !== null);
        
        console.log(`Generated contribution summary for ${filteredSummary.length} repositories`);
        return JSON.stringify({
            username: username,
            total_repositories: repos.length,
            contribution_summary: filteredSummary
        });
        
    } catch (error) {
        const errorMessage = error.message || 'Unknown error occurred';
        const errorStack = error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : 'No stack trace';
        
        console.error('Error in fetchUserContributionSummary:', {
            message: errorMessage,
            name: error.name,
            stack: errorStack,
            timestamp: new Date().toISOString()
        });
        
        return JSON.stringify({ 
            error: true,
            status: 500,
            message: `Failed to generate contribution summary: ${errorMessage}`,
            timestamp: new Date().toISOString()
        });
    }
}

// Export the functions for use in other modules
if (typeof window !== 'undefined') {
    window.githubApi = {
        get_latest_github_commits_for_user: fetchLatestCommitsFromGitHub,
        get_user_repositories: fetchUserRepositories,
        get_user_contribution_summary: fetchUserContributionSummary,
        // Add CORS proxy helper if needed
        enableCorsProxy: function(proxyUrl) {
            if (!proxyUrl.endsWith('/')) proxyUrl += '/';
            this.corsProxy = proxyUrl;
            console.log('CORS proxy enabled:', proxyUrl);
        }
    };
}

// For Node.js/CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getLatestGitHubCommitsForUser: fetchLatestCommitsFromGitHub,
        getUserRepositories: fetchUserRepositories,
        getUserContributionSummary: fetchUserContributionSummary,
        // Add version info
        VERSION: '1.0.0',
        // Add CORS proxy helper
        enableCorsProxy: function(proxyUrl) {
            if (!proxyUrl.endsWith('/')) proxyUrl += '/';
            this.corsProxy = proxyUrl;
            console.log('CORS proxy enabled:', proxyUrl);
        }
    };
}

// Log initialization
console.log('GitHub API Client initialized', {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: typeof window !== 'undefined' ? 'browser' : 'node'
});
