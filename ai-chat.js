// Track when we last updated GitHub data
let lastGitHubUpdate = 0;
let fullRepoData = null; // Store complete repository data
// Track request states for rate limiting and retries
let requestInProgress = false;
let lastRequestTime = 0;
let retryCount = 0;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY = 1000; // Start with 1 second delay

// Format message text with markdown-like syntax
function formatMessageText(text) {
    if (!text) return '';
    
    // Keep a copy of the original text for processing multi-line elements
    const originalText = text;

    // Heading formatting
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    
    // Bold text formatting **text** -> <strong>text</strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text formatting *text* -> <em>text</em>
    text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    
    // Inline code formatting `code` -> <code>code</code>
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Code blocks
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Blockquote formatting
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    
    // Horizontal rule
    text = text.replace(/^---+$/gm, '<hr>');
    
    // Ordered lists
    let orderedListMatch = originalText.match(/^\d+\.\s+.+(?:\n\d+\.\s+.+)*/gm);
    if (orderedListMatch) {
        for (const listBlock of orderedListMatch) {
            let listItems = listBlock.split('\n').map(item => {
                return `<li>${item.replace(/^\d+\.\s+/, '')}</li>`;
            }).join('');
            text = text.replace(listBlock, `<ol>${listItems}</ol>`);
        }
    }
    
    // Unordered lists (handling both - and • bullet points)
    let unorderedListMatch = originalText.match(/^(?:- |• ).+(?:\n(?:- |• ).+)*/gm);
    if (unorderedListMatch) {
        for (const listBlock of unorderedListMatch) {
            let listItems = listBlock.split('\n').map(item => {
                return `<li>${item.replace(/^(?:- |• )/, '')}</li>`;
            }).join('');
            text = text.replace(listBlock, `<ul>${listItems}</ul>`);
        }
    } else {
        // If we didn't find a multi-line list, handle single line list items
        text = text.replace(/^(?:- |• )(.*?)$/gm, '<ul><li>$1</li></ul>');
    }
    
    // Convert URLs to clickable links (but not if they're already in an HTML tag)
    text = text.replace(
        /(?<!["'=])(https?:\/\/[^\s<]+)/g, 
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    // Replace line breaks with <br> tags (but not inside HTML tags we've created)
    text = text.replace(/\n(?!<\/(h1|h2|h3|blockquote|ol|ul|li|pre|code)>)/g, '<br>');
    
    return text;
}

document.addEventListener('DOMContentLoaded', async () => {
    const aiChatNavbarIcon = document.getElementById('aiChatNavbarIcon');
    const aiChatPanel = document.getElementById('aiChatPanel');
    const aiChatCloseButton = document.getElementById('aiChatClose');
    const aiChatSendButton = document.getElementById('aiChatSend');
    const aiChatInput = document.getElementById('aiChatInput');
    const aiChatMessagesContainer = document.querySelector('#aiChatPanel .ai-chat-messages');

    const GITHUB_USERNAME = "Ravsalt"; // User's GitHub username
    
    // Fetch comprehensive GitHub data for the system prompt
    let githubData = "No recent GitHub activity available.";
    
    // Enhanced GitHub data fetching
    async function fetchGitHubData() {
        try {
            // Fetch detailed contribution summary with more repos
            const contributionSummary = await window.githubApi.get_user_contribution_summary(GITHUB_USERNAME, 10); // Increased from 5 to 10 repos
            
            if (contributionSummary) {
                const summaryData = JSON.parse(contributionSummary);
                
                if (!summaryData.error && summaryData.contribution_summary) {
                    // Store full repo data for possible detailed queries
                    fullRepoData = summaryData.contribution_summary;
                    
                    githubData = '';
                    
                    // Add overview section
                    githubData += `## Repository Overview\n`;
                    githubData += `${GITHUB_USERNAME} has ${fullRepoData.length} active repositories covering various projects.\n\n`;
                    
                    // Group repositories by primary language
                    const languageGroups = {};
                    fullRepoData.forEach(repo => {
                        if (repo.language) {
                            if (!languageGroups[repo.language]) {
                                languageGroups[repo.language] = [];
                            }
                            languageGroups[repo.language].push(repo.repository);
                        }
                    });
                    
                    // Add language summary
                    githubData += `## Technologies Used\n`;
                    Object.keys(languageGroups).forEach(language => {
                        githubData += `- **${language}**: ${languageGroups[language].length} projects\n`;
                    });
                    githubData += `\n`;
                    
                    // Add detailed repository information
                    githubData += `## Project Details\n`;
                    fullRepoData.forEach(repo => {
                        githubData += `### ${repo.repository}\n`;
                        
                        if (repo.description) {
                            githubData += `**Description**: ${repo.description}\n`;
                        }
                        
                        if (repo.language) {
                            githubData += `**Primary Language**: ${repo.language}\n`;
                        }
                        
                        // Include stars and forks if available
                        if (repo.stars) {
                            githubData += `**Stars**: ${repo.stars} | `;
                        }
                        if (repo.forks) {
                            githubData += `**Forks**: ${repo.forks}\n`;
                        }
                        
                        // Add recent activity
                        if (repo.recent_commits && repo.recent_commits.length > 0) {
                            githubData += `**Recent Updates**:\n`;
                            repo.recent_commits.slice(0, 3).forEach(commit => {
                                const message = commit.message.split('\n')[0]
                                    .replace(/^[^\w\s]+/, '')
                                    .toLowerCase();
                                githubData += `- ${message}\n`;
                            });
                        }
                        
                        githubData += `\n`;
                    });
                    
                    // Add featured projects section
                    githubData += `## Featured Projects\n`;
                    const featuredProjects = [
                        "MangaPH: Because manga should be easy to read, not a scavenger hunt.",
                        "IslaWeb: Helping businesses get online so they can flex their websites.",
                        "BookHub: 📚 Discover. Read. Repeat. The only commitment issues here are with book series.",
                        "Maldita: One click decides everything. No pressure. But also, pressure.",
                        "Fort Santiago: A Roblox military game, because why not?"
                    ];
                    
                    featuredProjects.forEach(project => {
                        githubData += `- ${project}\n`;
                    });
                }
            }
            lastGitHubUpdate = Date.now();
            return githubData || 'Working on some exciting new projects!';
        } catch (error) {
            console.error("Error fetching GitHub data:", error);
            return 'Working on some exciting new projects!';
        }
    }
    
    // Initial GitHub data fetch
    githubData = await fetchGitHubData();
    
    // Initialize chat history with enhanced system prompt that includes detailed GitHub info
    let chatHistory = [
        { role: "system", content: `You are R.ai, Raven's friendly AI assistant on his portfolio website. Your ONLY purpose is to help visitors learn about Raven, his projects, skills, and experience.

IMPORTANT TOPIC CONSTRAINTS:
1. ONLY discuss Raven's projects, skills, background, and portfolio content
2. DO NOT answer questions about unrelated topics like:
   - Academic subjects (math, science, history, etc.)
   - General knowledge questions
   - Current events
   - Technical tutorials unrelated to Raven's work
   - Personal advice
   - Definitions of terms/concepts unrelated to Raven

If a visitor asks about something unrelated, politely redirect them by saying you're specialized in sharing information about Raven's work, and suggest they ask about his projects, skills, or experience instead.

COMMUNICATION STYLE:
- Use simple, everyday language (no tech jargon)
- Be warm and engaging
- Focus on what Raven is creating and why it matters
- Keep responses concise and friendly
- Use markdown formatting for better readability (headings, bold, lists, etc.)

REPOSITORY INFORMATION:
${githubData}
        ` },
        { role: "assistant", content: "Hi there! 👋 I'm R.ai, your guide to Raven's creative world. I can tell you all about the cool things Raven's building and the problems they're solving. What would you like to know about their work?" }
    ];

    function toggleChatPanel() {
        if (aiChatPanel.style.display === 'none' || aiChatPanel.style.display === '') {
            aiChatPanel.style.display = 'flex';
            // Auto-scroll when opening the chat panel
            setTimeout(scrollToBottom, 100); // Slight delay to ensure the panel is rendered
        } else {
            aiChatPanel.style.display = 'none';
        }
    }

    // Add click handler for the Let's Talk button
    const letsTalkBtn = document.getElementById('letsTalkBtn');
    if (letsTalkBtn) {
        letsTalkBtn.addEventListener('click', (event) => {
            event.preventDefault();
            // Make sure the chat panel is visible
            aiChatPanel.style.display = 'flex';
            // Focus the input field
            if (aiChatInput) {
                aiChatInput.focus();
            }
            // Scroll to bottom to show the latest messages
            setTimeout(scrollToBottom, 100);
        });
    }

    if (aiChatNavbarIcon) {
        aiChatNavbarIcon.addEventListener('click', (event) => {
            event.preventDefault();
            toggleChatPanel();
        });
    }

    if (aiChatCloseButton) {
        aiChatCloseButton.addEventListener('click', () => {
            aiChatPanel.style.display = 'none';
        });
    }

    // Get current time in HH:MM format for message timestamps
    function getCurrentTime() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function addMessageToChatUI(text, sender, isHTML = false) {
        if (!aiChatMessagesContainer) return null;
        
        // Use div for better formatting capabilities
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('ai-chat-message');
        
        // Add timestamp data attribute
        messageDiv.setAttribute('data-time', getCurrentTime());
        
        if (sender === 'user') {
            messageDiv.classList.add('ai-chat-message-user');
        } else if (sender === 'assistant') {
            messageDiv.classList.add('ai-chat-message-bot');
        } else if (sender === 'tool_result') {
            messageDiv.classList.add('ai-chat-message-tool-result');
        } else if (sender === 'error') {
            messageDiv.classList.add('ai-chat-message-error');
        }

        if (isHTML) {
            messageDiv.innerHTML = text;
        } else if (sender === 'assistant') {
            // Apply markdown formatting to assistant messages
            messageDiv.innerHTML = formatMessageText(text);
        } else {
            messageDiv.textContent = text;
        }
        
        aiChatMessagesContainer.appendChild(messageDiv);
        scrollToBottom();
        return messageDiv; // Return for potential updates
    }
    
    // Enhanced scrollToBottom function with smooth scrolling
    function scrollToBottom() {
        if (aiChatMessagesContainer) {
            // Use smooth scrolling behavior for a better user experience
            aiChatMessagesContainer.scrollTo({
                top: aiChatMessagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    // Add a mutation observer to automatically scroll when new content is added
    const messagesObserver = new MutationObserver((mutations) => {
        // If content changes (new messages), scroll to bottom
        scrollToBottom();
    });
    
    // Start observing the messages container for content changes
    if (aiChatMessagesContainer) {
        messagesObserver.observe(aiChatMessagesContainer, {
            childList: true,       // Watch for added/removed messages
            subtree: true,         // Watch for changes in descendants
            characterData: true    // Watch for text changes
        });
    }

    // Check if the query is likely about Raven or his projects
    function isRelevantQuestion(query) {
        query = query.toLowerCase();
        
        // Common unrelated topics that should be declined
        const unrelatedTopics = [
            'calculus', 'math', 'mathematics', 'physics', 'chemistry', 'biology',
            'history', 'geography', 'politics', 'religion', 'philosophy',
            'what is', 'define', 'explain', 'how to', 'tutorial',
            'weather', 'news', 'sports', 'stock', 'invest', 'recipe', 'cook'
        ];
        
        // Check for clear indicators of unrelated topics
        for (const topic of unrelatedTopics) {
            if (query.includes(topic)) {
                return false;
            }
        }
        
        // Positive indications this is about Raven
        const relevantTerms = [
            'project', 'portfolio', 'raven', 'skill', 'work', 'create', 'build',
            'code', 'develop', 'program', 'tech', 'experience', 'github', 'repo'
        ];
        
        for (const term of relevantTerms) {
            if (query.includes(term)) {
                return true;
            }
        }
        
        // When unclear, we'll let the AI's system prompt handle it
        return true;
    }

    // Check if the query is asking about a specific project
    function isProjectInfoQuery(query) {
        query = query.toLowerCase();
        
        // Project query patterns
        const projectQueryPatterns = [
            'tell me about (the )?project',
            'what is (the )?project',
            'more (information|info|details) (on|about) (the )?project',
            'describe (the )?project'
        ];
        
        // Check if query matches any project query patterns
        for (const pattern of projectQueryPatterns) {
            const regex = new RegExp(pattern);
            if (regex.test(query)) {
                return true;
            }
        }
        
        return false;
    }

    // Try to extract project name from query
    function extractProjectName(query) {
        query = query.toLowerCase();
        
        // If fullRepoData is available, check for mentions of any repo names
        if (fullRepoData) {
            for (const repo of fullRepoData) {
                const repoName = repo.repository.toLowerCase();
                if (query.includes(repoName)) {
                    return repo.repository;
                }
            }
        }
        
        // Check for the featured project names
        const featuredProjects = ["MangaPH", "IslaWeb", "BookHub", "Maldita", "Fort Santiago"];
        for (const project of featuredProjects) {
            if (query.includes(project.toLowerCase())) {
                return project;
            }
        }
        
        return null;
    }

    // Handle requests for project information
    function getProjectInfo(projectName) {
        if (!fullRepoData) return null;
        
        // Try to find the repository that best matches the project name
        const project = fullRepoData.find(repo => 
            repo.repository.toLowerCase() === projectName.toLowerCase() ||
            repo.repository.toLowerCase().includes(projectName.toLowerCase())
        );
        
        if (project) {
            let projectInfo = `## ${project.repository}\n\n`;
            
            if (project.description) {
                projectInfo += `**Description**: ${project.description}\n\n`;
            }
            
            if (project.language) {
                projectInfo += `**Primary Language**: ${project.language}\n\n`;
            }
            
            if (project.recent_commits && project.recent_commits.length > 0) {
                projectInfo += `**Recent Activity**:\n`;
                project.recent_commits.forEach(commit => {
                    const message = commit.message.split('\n')[0]
                        .replace(/^[^\w\s]+/, '')
                        .toLowerCase();
                    projectInfo += `- ${message}\n`;
                });
            }
            
            return projectInfo;
        }
        
        return null;
    }

    // Function to create a retry button that can be added to error messages
    function createRetryButton(originalMessage, botMessageElement) {
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Try Again';
        retryButton.className = 'ai-chat-retry-button';
        retryButton.onclick = async () => {
            // Remove the error message and button
            if (botMessageElement) {
                botMessageElement.innerHTML = `Retrying... <span class="typing-indicator"><span></span><span></span><span></span></span>`;
            }
            
            // Reset retry count for this new attempt
            retryCount = 0;
            
            // Try the request again
            await postChatCompletion(chatHistory, { model: "openai" });
        };
        return retryButton;
    }

    // Helper function to calculate exponential backoff delay
    function getBackoffDelay() {
        // Exponential backoff: BASE_RETRY_DELAY * 2^retryCount with some randomization
        const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount) * (0.8 + Math.random() * 0.4);
        return Math.min(delay, 10000); // Cap at 10 seconds
    }

    // Global CORS proxy configuration
    const CORS_PROXY = ''; // Can be set via window.CORS_PROXY if needed
    
    async function postChatCompletion(messages, options = {}, isRetry = false) {
        // If a request is already in progress and this is not a retry, don't send another
        if (requestInProgress && !isRetry) {
            console.log("Request already in progress, ignoring duplicate request");
            return null;
        }
        
        // Rate limiting check - ensure we're not sending requests too quickly
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds minimum between requests
        
        if (!isRetry && timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            console.log(`Rate limiting: waiting ${waitTime}ms before sending next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Create a thinking message while waiting for the response
        let botMessageElement;
        if (!isRetry) {
            const thinkingHTML = `Thinking <span class="typing-indicator"><span></span><span></span><span></span></span>`;
            botMessageElement = addMessageToChatUI(thinkingHTML, 'assistant', true);
        } else {
            // Use the existing element for retries
            botMessageElement = document.querySelector('.ai-chat-messages .ai-chat-message-bot:last-child');
            if (botMessageElement) {
                botMessageElement.innerHTML = `Retrying... <span class="typing-indicator"><span></span><span></span><span></span></span>`;
            }
        }
        
        requestInProgress = true;
        lastRequestTime = Date.now();
        
        // Check if query is asking for specific project info
        const lastUserMessage = messages[messages.length - 1].content;
        const projectName = extractProjectName(lastUserMessage);
        
        if (projectName && isProjectInfoQuery(lastUserMessage)) {
            const projectInfo = getProjectInfo(projectName);
            if (projectInfo) {
                // Add project info to the system message temporarily
                messages = [
                    ...messages.slice(0, -1),
                    {
                        role: "system",
                        content: `The user is asking about the project "${projectName}". Here's detailed information about this project that you should use in your response:\n\n${projectInfo}\n\nMake sure to format your response nicely using markdown.`
                    },
                    messages[messages.length - 1]
                ];
            }
        }
        
        // Use CORS proxy if available, otherwise use direct URL
        const apiUrl = new URL("https://text.pollinations.ai/openai");
        const targetUrl = CORS_PROXY ? `${CORS_PROXY}${apiUrl.pathname}` : apiUrl.toString();
        
        const payload = {
            model: options.model || "openai",
            messages: messages,
            seed: options.seed || Math.floor(Math.random() * 10000),
            private: options.private || false,
            referrer: options.referrer || "RavenPortfolioWebApp"
        };

        console.log(`Sending ${isRetry ? 'retry #' + retryCount : 'initial'} request to:`, {
            url: targetUrl,
            payload: {
                ...payload,
                messages: '[' + payload.messages.length + ' messages]' // Don't log full messages
            }
        });

        try {
            const fetchOptions = {
                method: "POST",
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'omit',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            };

            // Add CORS headers if using a proxy
            if (CORS_PROXY) {
                fetchOptions.headers['X-Target-URL'] = apiUrl.toString();
            }


            const response = await fetch(targetUrl, fetchOptions);

            if (!response.ok) {
                let errorText;
                try {
                    errorText = await response.text();
                    // Try to parse as JSON for structured error messages
                    try {
                        const errorJson = JSON.parse(errorText);
                        errorText = errorJson.error?.message || errorText;
                    } catch (e) {
                        // Not JSON, use as is
                    }
                } catch (e) {
                    errorText = 'Could not read error response';
                }
                
                const statusCode = response.status;
                const errorMessage = `HTTP error! status: ${statusCode}, message: ${errorText}`;
                console.error(errorMessage);
                
                // Special handling for rate limiting (HTTP 429) and server errors (5xx)
                if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
                    // If we haven't exceeded max retries, try again with backoff
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        const retryDelay = getBackoffDelay();
                        
                        if (botMessageElement) {
                            const retryMessage = statusCode === 429 ? 
                                `Rate limited. Retrying in ${Math.round(retryDelay/1000)} seconds...` :
                                `Temporary server issue. Retrying in ${Math.round(retryDelay/1000)} seconds...`;
                            
                            botMessageElement.innerHTML = `${retryMessage} <span class="typing-indicator"><span></span><span></span><span></span></span>`;
                        }
                        
                        console.log(`API error (${statusCode}). Retry #${retryCount} in ${retryDelay}ms`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        
                        // Reset request in progress flag for the retry
                        requestInProgress = false;
                        const retryResult = await postChatCompletion(messages, options, true);
                        return retryResult;
                    } else {
                        // Max retries exceeded
                        if (botMessageElement) {
                            const errorMsg = statusCode === 429 ? 
                                'Too many requests. Please wait a few minutes and try again.' :
                                'The server is having issues. Please try again later.';
                                
                            botMessageElement.innerHTML = errorMsg;
                            const retryButton = createRetryButton(messages[messages.length - 1].content, botMessageElement);
                            botMessageElement.appendChild(retryButton);
                        }
                        chatHistory.push({ role: "assistant", content: `[Error: ${statusCode === 429 ? 'Rate limited' : 'Server error'}]` });
                    }
                } else {
                    // Other client-side errors (4xx)
                    if (botMessageElement) {
                        let userFriendlyError = 'An error occurred. Please try again.';
                        if (statusCode === 400) userFriendlyError = 'Invalid request. The message might be too long or malformed.';
                        if (statusCode === 401 || statusCode === 403) userFriendlyError = 'Authentication failed. Please refresh the page.';
                        if (statusCode === 404) userFriendlyError = 'The chat service is currently unavailable.';
                        
                        botMessageElement.innerHTML = `${userFriendlyError} (Error ${statusCode})`;
                        const retryButton = createRetryButton(messages[messages.length - 1].content, botMessageElement);
                        botMessageElement.appendChild(retryButton);
                    }
                    chatHistory.push({ role: "assistant", content: `[Error: ${statusCode}]` });
                }
                
                scrollToBottom(); // Ensure error message is visible
                requestInProgress = false;
                return null;
            }

            const result = await response.json();
            const assistantMessage = result?.choices?.[0]?.message;
            
            if (!assistantMessage) {
                console.error("No assistant message found in response:", result);
                if (botMessageElement) {
                    botMessageElement.innerHTML = "Error: Could not understand AI response.";
                    const retryButton = createRetryButton(messages[messages.length - 1].content, botMessageElement);
                    botMessageElement.appendChild(retryButton);
                }
                chatHistory.push({ role: "assistant", content: "[Error: Invalid AI response]" });
                scrollToBottom(); // Ensure error message is visible
                requestInProgress = false;
                return null;
            }
            
            if (botMessageElement) { // Update the existing bot message element
                botMessageElement.innerHTML = formatMessageText(assistantMessage.content);
                console.log("Assistant:", assistantMessage.content);
                scrollToBottom(); // Ensure the complete response is visible
            }
            
            // Success! Reset retry count
            retryCount = 0;
            requestInProgress = false;
            return assistantMessage;
        } catch (error) {
            console.error("Error posting chat completion:", error);
            
            // Network error or other exception - handle retry
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                const retryDelay = getBackoffDelay();
                
                if (botMessageElement) {
                    botMessageElement.innerHTML = `Connection issue. Retrying in ${Math.round(retryDelay/1000)} seconds... <span class="typing-indicator"><span></span><span></span><span></span></span>`;
                }
                
                console.log(`Connection error. Retry #${retryCount} in ${retryDelay}ms`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // Reset request in progress flag for the retry
                requestInProgress = false;
                const retryResult = await postChatCompletion(messages, options, true);
                return retryResult;
            } else {
                // Max retries exceeded
                if (botMessageElement) {
                    botMessageElement.innerHTML = "Network connection error. Please check your connection and try again.";
                    const retryButton = createRetryButton(messages[messages.length - 1].content, botMessageElement);
                    botMessageElement.appendChild(retryButton);
                }
                chatHistory.push({ role: "assistant", content: "[Error: API connection]" });
                scrollToBottom(); // Ensure error message is visible
                requestInProgress = false;
                return null;
            }
        }
    }

    async function handleSendMessage() {
        const messageText = aiChatInput.value.trim();
        if (!messageText) return;

        // Check if we should refresh GitHub data (every 10 minutes)
        const TEN_MINUTES = 10 * 60 * 1000;
        if (Date.now() - lastGitHubUpdate > TEN_MINUTES) {
            try {
                // Fetch updated GitHub data
                githubData = await fetchGitHubData();
                
                // Update system prompt with fresh data
                chatHistory[0].content = `You are R.ai, Raven's friendly AI assistant on his portfolio website. Your ONLY purpose is to help visitors learn about Raven, his projects, skills, and experience.

IMPORTANT TOPIC CONSTRAINTS:
1. ONLY discuss Raven's projects, skills, background, and portfolio content
2. DO NOT answer questions about unrelated topics like:
   - Academic subjects (math, science, history, etc.)
   - General knowledge questions
   - Current events
   - Technical tutorials unrelated to Raven's work
   - Personal advice
   - Definitions of terms/concepts unrelated to Raven

If a visitor asks about something unrelated, politely redirect them by saying you're specialized in sharing information about Raven's work, and suggest they ask about his projects, skills, or experience instead.

COMMUNICATION STYLE:
- Use simple, everyday language (no tech jargon)
- Be warm and engaging
- Focus on what Raven is creating and why it matters
- Keep responses concise and friendly
- Use markdown formatting for better readability (headings, bold, lists, etc.)

REPOSITORY INFORMATION:
${githubData}`;
            } catch (error) {
                // Silently handle any errors
                console.error("Error updating GitHub data:", error);
            }
        }

        // Add user message to UI
        addMessageToChatUI(messageText, 'user');
        chatHistory.push({ role: "user", content: messageText });
        aiChatInput.value = '';
        aiChatSendButton.disabled = true;
        aiChatInput.disabled = true;

        // First, check if this is an off-topic question
        if (!isRelevantQuestion(messageText)) {
            // Add a reminder to the chat history to reinforce staying on topic
            chatHistory.push({ 
                role: "system", 
                content: "Remember: You MUST ONLY answer questions about Raven and his work. The previous question appears to be off-topic. Politely explain that you can only discuss Raven's projects, skills, and experience."
            });
        }

        // Special handling for repository listing request
        if (messageText.toLowerCase().includes('list') && 
            (messageText.toLowerCase().includes('repos') || messageText.toLowerCase().includes('repositories') || 
             messageText.toLowerCase().includes('projects'))) {
            
            // Add specific instruction to provide a comprehensive list
            chatHistory.push({ 
                role: "system", 
                content: "The user is asking for a list of Raven's repositories/projects. Please provide a well-formatted list of projects with brief descriptions using markdown formatting. Use the repository information I provided earlier."
            });
        }

        let assistantResponse = await postChatCompletion(chatHistory, { model: "openai" });

        if (assistantResponse) {
            chatHistory.push(assistantResponse);
            // UI is already updated by postChatCompletion
            
            // Remove any temporary system messages we added
            chatHistory = chatHistory.filter((msg, index) => {
                // Keep all non-system messages
                if (msg.role !== "system") return true;
                // Keep the first system message (the main prompt)
                if (index === 0) return true;
                // Remove any other system messages (they were temporary)
                return false;
            });
        } else {
            // postChatCompletion failed, UI already updated with error
            addMessageToChatUI("Sorry, I couldn't get a response. Please try again.", 'assistant');
        }

        aiChatSendButton.disabled = false;
        aiChatInput.disabled = false;
        aiChatInput.focus();
    }

    if (aiChatSendButton && aiChatInput) {
        aiChatSendButton.addEventListener('click', handleSendMessage);
        aiChatInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleSendMessage();
            }
        });
    }

    // Add window resize handler to ensure scroll position is maintained when window is resized
    window.addEventListener('resize', () => {
        if (aiChatPanel.style.display === 'flex') {
            scrollToBottom();
        }
    });
});
