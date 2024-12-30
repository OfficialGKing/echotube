// Constants
const API_BASE_URL = 'http://localhost:5000';

// Basic fetch configuration
const fetchConfig = {
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json'
    }
};

console.log('EchoTube Dashboard initializing...');

// State management
let comments = [];
let channelId = null;
let analytics = null;
let channelStats = null;
let commentFilters = {
    hideOwnerComments: true,
    showUnrepliedOnly: false,
    sortOrder: 'newest'
};
let isAuthenticated = false;
let videos = [];
let statsUpdateInterval = null;
let hashtagData = null;
let hashtagUpdateInterval = null;

// Tab Management
const TABS = {
    COMMENTS: 'comments',
    VIDEOS: 'videos',
    LIVE: 'live',
    HASHTAGS: 'hashtags'
};

let currentTab = TABS.COMMENTS;

function switchTab(tab) {
    currentTab = tab;
    
    // Handle live updates
    if (tab === TABS.LIVE && !statsUpdateInterval) {
        startLiveUpdates();
    } else if (tab !== TABS.LIVE && statsUpdateInterval) {
        stopLiveUpdates();
    }
    
    // Handle hashtag updates
    if (tab === TABS.HASHTAGS && !hashtagUpdateInterval) {
        startHashtagUpdates();
    } else if (tab !== TABS.HASHTAGS && hashtagUpdateInterval) {
        stopHashtagUpdates();
    }
    
    createDashboard();
    
    // Update active tab styling
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
}

// DOM Elements
const root = document.getElementById('root');

// Auth check
async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/status`, {
            ...fetchConfig,
            method: 'GET',
            credentials: 'include'  // Important for CORS with credentials
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Not authenticated
                return { authenticated: false };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return { authenticated: data.authenticated };
    } catch (error) {
        console.error('Auth check error:', error);
        // Don't show error for auth check failures
        return { authenticated: false };
    }
}

function showLoginSection() {
    console.log('Showing login section...');
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        console.log('Creating main container...');
        const root = document.getElementById('root');
        if (!root) {
            console.error('Root element not found!');
            return;
        }
        root.innerHTML = `
            <div class="main-container">
                ${createLoginSection()}
            </div>
        `;
        console.log('Login section created');
    } else {
        console.log('Updating existing container...');
        mainContainer.innerHTML = createLoginSection();
        console.log('Login section updated');
    }
}

function hideLoginSection() {
    const loginPrompt = document.querySelector('.login-prompt');
    if (loginPrompt) {
        loginPrompt.remove();
    }
}

function showLoadingSpinner() {
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) return;
    
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'loading-spinner';
    loadingSpinner.innerHTML = `
        <div class="spinner">
            <div class="double-bounce1"></div>
            <div class="double-bounce2"></div>
        </div>
    `;
    
    mainContainer.innerHTML = '';
    mainContainer.appendChild(loadingSpinner);
}

function hideLoadingSpinner() {
    const loadingSpinner = document.querySelector('.loading-spinner');
    if (loadingSpinner) {
        loadingSpinner.remove();
    }
}

// Main App Component
function createApp() {
    root.innerHTML = `
        <header class="app-header">
            <h1>EchoTube Dashboard</h1>
        </header>
        <main class="main-container">
            <div id="dashboard"></div>
        </main>
    `;
}

function createDashboard() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;
    
    dashboard.innerHTML = `
        <div class="dashboard-container">
            <div class="tabs-container">
                <button class="tab-button ${currentTab === TABS.COMMENTS ? 'active' : ''}" 
                        data-tab="${TABS.COMMENTS}"
                        onclick="switchTab('${TABS.COMMENTS}')">
                    <span class="material-icons">comment</span>
                    Comments
                </button>
                <button class="tab-button ${currentTab === TABS.VIDEOS ? 'active' : ''}" 
                        data-tab="${TABS.VIDEOS}"
                        onclick="switchTab('${TABS.VIDEOS}')">
                    <span class="material-icons">video_library</span>
                    Videos
                </button>
                <button class="tab-button ${currentTab === TABS.LIVE ? 'active' : ''}" 
                        data-tab="${TABS.LIVE}"
                        onclick="switchTab('${TABS.LIVE}')">
                    <span class="material-icons">stream</span>
                    Live Updates
                </button>
                <button class="tab-button ${currentTab === TABS.HASHTAGS ? 'active' : ''}" 
                        data-tab="${TABS.HASHTAGS}"
                        onclick="switchTab('${TABS.HASHTAGS}')">
                    <span class="material-icons">tag</span>
                    Hashtags
                </button>
            </div>
            ${currentTab === TABS.COMMENTS ? createCommentsSection() : 
              currentTab === TABS.VIDEOS ? createVideosSection() :
              currentTab === TABS.LIVE ? createLiveUpdatesSection() :
              createHashtagsSection(hashtagData)}
        </div>
    `;
}

// Initialize app with better error handling
async function initializeApp() {
    try {
        // Create main container first
        let mainContainer = document.querySelector('.main-container');
        if (!mainContainer) {
            mainContainer = document.createElement('div');
            mainContainer.className = 'main-container';
            document.body.appendChild(mainContainer);
        }

        // Then create content container
        let contentContainer = document.getElementById('content');
        if (!contentContainer) {
            contentContainer = document.createElement('div');
            contentContainer.id = 'content';
            mainContainer.appendChild(contentContainer);
        }

        // Then create comments container
        let commentsContainer = document.getElementById('comments');
        if (!commentsContainer) {
            commentsContainer = document.createElement('div');
            commentsContainer.id = 'comments';
            mainContainer.appendChild(commentsContainer);
        }

        // Initialize the app
        await Promise.all([
            fetchVideos(),
            fetchComments()
        ]);
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the application. Please try refreshing the page.');
    }
}

function createContainers() {
    // Create main container if it doesn't exist
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    // Create content container if it doesn't exist
    let contentContainer = document.getElementById('content');
    if (!contentContainer) {
        contentContainer = document.createElement('div');
        contentContainer.id = 'content';
        mainContainer.appendChild(contentContainer);
    }

    // Create comments container if it doesn't exist
    let commentsContainer = document.getElementById('comments');
    if (!commentsContainer) {
        commentsContainer = document.createElement('div');
        commentsContainer.id = 'comments';
        mainContainer.appendChild(commentsContainer);
    }

    return {
        mainContainer,
        contentContainer,
        commentsContainer
    };
}

function showQuotaExceededMessage(isDemoMode = false) {
    const { contentContainer } = createContainers();
    
    // Remove existing quota message if any
    const existingMessage = document.querySelector('.quota-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const quotaMessage = document.createElement('div');
    quotaMessage.className = 'quota-message';
    
    if (isDemoMode) {
        quotaMessage.innerHTML = `
            <div class="alert alert-info" role="alert">
                <h4 class="alert-heading">Demo Mode Active</h4>
                <p>The YouTube API quota has been exceeded. You are currently viewing demo data.</p>
                <hr>
                <p class="mb-0">The quota typically resets at midnight Pacific Time. Your dashboard will automatically update with real data once the quota resets.</p>
                <button onclick="window.location.reload()" class="btn btn-outline-primary mt-3">
                    Try Again
                </button>
            </div>
        `;
    } else {
        quotaMessage.innerHTML = `
            <div class="alert alert-warning" role="alert">
                <h4 class="alert-heading">YouTube API Quota Exceeded</h4>
                <p>We've hit the YouTube API quota limit. Please try again later.</p>
                <hr>
                <p class="mb-0">The quota typically resets at midnight Pacific Time.</p>
                <button onclick="window.location.reload()" class="btn btn-outline-warning mt-3">
                    Try Again
                </button>
            </div>
        `;
    }
    
    contentContainer.insertBefore(quotaMessage, contentContainer.firstChild);
}

function showError(message) {
    const { contentContainer } = createContainers();

    const errorMessage = document.createElement('div');
    errorMessage.className = 'alert alert-danger';
    errorMessage.role = 'alert';
    errorMessage.textContent = message;
    
    contentContainer.insertBefore(errorMessage, contentContainer.firstChild);
}

// Comments Section
function createCommentsSection() {
    if (!Array.isArray(comments)) {
        console.error('Comments is not an array:', comments);
        return '<div>Error loading comments</div>';
    }
    
    const filteredComments = filterComments(comments);
    
    const filterControls = `
        <div class="comment-filters">
            <div class="filter-group">
                <label class="filter-label">
                    <input type="checkbox" 
                           ${commentFilters.hideOwnerComments ? 'checked' : ''} 
                           onchange="toggleOwnerComments(this.checked)">
                    Hide my comments
                </label>
                <label class="filter-label">
                    <input type="checkbox" 
                           ${commentFilters.showUnrepliedOnly ? 'checked' : ''} 
                           onchange="toggleUnrepliedOnly(this.checked)">
                    Show unreplied only
                </label>
            </div>
            <div class="filter-group">
                <select class="sort-select" onchange="changeSortOrder(this.value)">
                    <option value="newest" ${commentFilters.sortOrder === 'newest' ? 'selected' : ''}>
                        Newest First
                    </option>
                    <option value="oldest" ${commentFilters.sortOrder === 'oldest' ? 'selected' : ''}>
                        Oldest First
                    </option>
                </select>
            </div>
        </div>
    `;

    if (!filteredComments.length) {
        return `
            ${filterControls}
            <div class="no-comments">
                <span class="material-icons">comment_bank</span>
                <p>No comments found</p>
            </div>
        `;
    }

    return `
        <div class="comments-section">
            <h2>
                <span class="material-icons">comment</span>
                Comments
            </h2>
            ${filterControls}
            <div class="comments-list">
                ${filteredComments.map(commentThread => {
                    const comment = commentThread.snippet.topLevelComment;
                    const snippet = comment.snippet;
                    const hasReplies = commentThread.snippet.totalReplyCount > 0;
                    const isOwnerComment = snippet.authorChannelId.value === channelId;
                    const videoDetails = commentThread.videoDetails || {};
                    const videoId = commentThread.snippet.videoId;
                    const commentId = comment.id;
                    
                    return `
                        <div class="comment-card ${!hasReplies ? 'unreplied' : ''} ${isOwnerComment ? 'owner-comment' : ''}">
                            <div class="comment-video-preview">
                                <a href="https://www.youtube.com/watch?v=${videoId}&lc=${commentId}" 
                                   target="_blank" 
                                   title="${videoDetails.title || 'View on YouTube'}"
                                   class="video-thumbnail-link">
                                    <img class="video-thumbnail" 
                                         src="${videoDetails.thumbnails?.medium?.url || 'https://i.ytimg.com/vi/default.jpg'}" 
                                         alt="${videoDetails.title || 'Video thumbnail'}"
                                         width="${videoDetails.thumbnails?.medium?.width || 320}"
                                         height="${videoDetails.thumbnails?.medium?.height || 180}">
                                    <div class="video-title">${videoDetails.title || 'YouTube Video'}</div>
                                    ${videoDetails.statistics ? `
                                        <div class="video-stats">
                                            <span><span class="material-icons">visibility</span> ${formatNumber(videoDetails.statistics.viewCount)}</span>
                                            <span><span class="material-icons">thumb_up</span> ${formatNumber(videoDetails.statistics.likeCount)}</span>
                                        </div>
                                    ` : ''}
                                </a>
                            </div>
                            <div class="comment-header">
                                <img class="comment-avatar" 
                                     src="${snippet.authorProfileImageUrl || 'https://www.gravatar.com/avatar/?d=mp'}" 
                                     alt="Avatar of ${snippet.authorDisplayName}"
                                     onerror="this.src='https://www.gravatar.com/avatar/?d=mp'">
                                <div class="comment-metadata">
                                    <div class="comment-author">
                                        ${snippet.authorDisplayName || 'Anonymous'}
                                        ${isOwnerComment ? '<span class="author-badge">Creator</span>' : ''}
                                    </div>
                                    <div class="comment-time">${formatDate(snippet.publishedAt)}</div>
                                </div>
                            </div>
                            <div class="comment-content">
                                <p>${snippet.textDisplay || ''}</p>
                            </div>
                            <div class="comment-actions">
                                <button onclick="handleLike('${comment.id}')" 
                                        class="action-button ${snippet.likeCount > 0 ? 'active' : ''}" 
                                        title="Like this comment">
                                    <span class="material-icons">thumb_up</span>
                                    <span class="action-count">${snippet.likeCount || 0}</span>
                                </button>
                                <button onclick="handleHeart('${comment.id}')" 
                                        class="action-button ${snippet.heartCount > 0 ? 'active' : ''}" 
                                        title="Heart this comment">
                                    <span class="material-icons">favorite</span>
                                    Heart
                                </button>
                                ${hasReplies ? `
                                    <span class="reply-count">
                                        <span class="material-icons">forum</span>
                                        ${commentThread.snippet.totalReplyCount} ${
                                            commentThread.snippet.totalReplyCount === 1 ? 'reply' : 'replies'
                                        }
                                    </span>
                                ` : ''}
                            </div>
                            <div class="reply-form">
                                <input type="text" 
                                       class="reply-input"
                                       id="reply-${comment.id}" 
                                       placeholder="Write a reply...">
                                <button onclick="handleReply('${comment.id}')" class="reply-button">
                                    <span class="material-icons">reply</span>
                                    Reply
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Filter functions
function filterComments(commentsData) {
    if (!Array.isArray(commentsData)) return [];
    
    let filtered = commentsData;
    
    if (commentFilters.hideOwnerComments) {
        filtered = filtered.filter(thread => {
            const topLevelComment = thread.snippet.topLevelComment;
            // Only keep the thread if:
            // 1. The top-level comment is NOT from the channel owner
            // 2. OR if it's a reply thread (we'll handle showing only non-owner top-level comments separately)
            return topLevelComment.snippet.authorChannelId.value !== channelId;
        });
    }
    
    if (commentFilters.showUnrepliedOnly) {
        filtered = filtered.filter(thread => thread.snippet.totalReplyCount === 0);
    }
    
    // Sort comments
    filtered.sort((a, b) => {
        const dateA = new Date(a.snippet.topLevelComment.snippet.publishedAt);
        const dateB = new Date(b.snippet.topLevelComment.snippet.publishedAt);
        return commentFilters.sortOrder === 'newest' ? 
            dateB - dateA : dateA - dateB;
    });
    
    return filtered;
}

// Filter event handlers
function toggleOwnerComments(checked) {
    commentFilters.hideOwnerComments = checked;
    createDashboard();
}

function toggleUnrepliedOnly(checked) {
    commentFilters.showUnrepliedOnly = checked;
    createDashboard();
}

function changeSortOrder(order) {
    commentFilters.sortOrder = order;
    createDashboard();
}

// Utility Functions
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid date';
        
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        const diffMinutes = Math.floor(diffTime / (1000 * 60));
        
        if (diffMinutes < 60) {
            return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
        } else if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid date';
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatDuration(duration) {
    // Convert ISO 8601 duration to readable format
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    
    let result = '';
    if (hours) result += `${hours}:`;
    result += `${minutes.padStart(2, '0')}:`;
    result += seconds.padStart(2, '0');
    
    return result;
}

// Event Handlers
async function handleLike(commentId) {
    const likeButton = document.querySelector(`button[onclick="handleLike('${commentId}')"]`);
    const isLiked = likeButton.classList.contains('active');
    
    try {
        // Optimistically update UI
        likeButton.classList.toggle('active');
        const countSpan = likeButton.querySelector('.action-count');
        const currentCount = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = isLiked ? currentCount - 1 : currentCount + 1;
        
        // Send request to server
        const response = await fetch(`${API_BASE_URL}/api/${isLiked ? 'unlike' : 'like'}`, {
            ...fetchConfig,
            method: 'POST',
            body: JSON.stringify({ commentId })
        });
        
        if (!response.ok) {
            // Revert UI if request failed
            likeButton.classList.toggle('active');
            countSpan.textContent = currentCount;
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        console.log(`Successfully ${isLiked ? 'unliked' : 'liked'} comment:`, commentId);
    } catch (error) {
        console.error('Error handling like:', error);
        showError(`Failed to ${isLiked ? 'unlike' : 'like'} comment. Please try again.`);
        // Revert UI changes on error
        likeButton.classList.toggle('active');
        const countSpan = likeButton.querySelector('.action-count');
        const currentCount = parseInt(countSpan.textContent) || 0;
        countSpan.textContent = isLiked ? currentCount + 1 : currentCount - 1;
    }
}

async function handleHeart(commentId) {
    const heartButton = document.querySelector(`button[onclick="handleHeart('${commentId}')"]`);
    const isHearted = heartButton.classList.contains('active');
    
    try {
        // Optimistically update UI
        heartButton.classList.toggle('active');
        
        // Send request to server
        const response = await fetch(`${API_BASE_URL}/api/${isHearted ? 'unheart' : 'heart'}`, {
            ...fetchConfig,
            method: 'POST',
            body: JSON.stringify({ commentId })
        });
        
        if (!response.ok) {
            // Revert UI if request failed
            heartButton.classList.toggle('active');
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        console.log(`Successfully ${isHearted ? 'unhearted' : 'hearted'} comment:`, commentId);
    } catch (error) {
        console.error('Error handling heart:', error);
        showError(`Failed to ${isHearted ? 'unheart' : 'heart'} comment. Please try again.`);
        // Revert UI changes on error
        heartButton.classList.toggle('active');
    }
}

async function handleReply(commentId) {
    const replyInput = document.querySelector(`#reply-${commentId}`);
    const replyText = replyInput.value.trim();
    
    if (!replyText) {
        showError('Please enter a reply');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/reply`, {
            ...fetchConfig,
            method: 'POST',
            body: JSON.stringify({
                commentId,
                replyText
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        // Clear the input
        replyInput.value = '';
        
        // Show success message
        showMessage('Reply posted successfully!');
        
        // Refresh comments to show the new reply
        await fetchComments();
    } catch (error) {
        console.error('Reply error:', error);
        showError('Failed to post reply. Please try again.');
    }
}

function showMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
    const { contentContainer } = createContainers();

    const errorMessage = document.createElement('div');
    errorMessage.className = 'alert alert-danger';
    errorMessage.role = 'alert';
    errorMessage.textContent = message;
    
    contentContainer.insertBefore(errorMessage, contentContainer.firstChild);
}

// Videos Overview Section
function createVideosSection() {
    if (!Array.isArray(videos)) {
        return '<div>Loading videos...</div>';
    }
    
    return `
        <div class="videos-section">
            <h2>
                <span class="material-icons">video_library</span>
                Videos Overview
            </h2>
            <div class="videos-grid">
                ${videos.map(video => {
                    const monetizationIcon = getMonetizationIcon(video.monetizationStatus);
                    const monetizationClass = `monetization-${video.monetizationStatus}`;
                    const thumbnailUrl = video.thumbnail?.url || 'https://via.placeholder.com/480x360.png?text=No+Thumbnail';
                    const thumbnailWidth = video.thumbnail?.width || 480;
                    const thumbnailHeight = video.thumbnail?.height || 360;
                    
                    return `
                        <div class="video-card">
                            <div class="video-thumbnail">
                                <a href="https://www.youtube.com/watch?v=${video.id}" target="_blank">
                                    <img src="${thumbnailUrl}" 
                                         alt="${video.title}"
                                         width="${thumbnailWidth}"
                                         height="${thumbnailHeight}">
                                    <span class="video-duration">${formatDuration(video.duration)}</span>
                                </a>
                            </div>
                            <div class="video-details">
                                <div class="video-title" title="${video.title}">
                                    ${video.title}
                                </div>
                                <div class="video-stats">
                                    <span class="view-count">
                                        <span class="material-icons">visibility</span>
                                        ${formatNumber(video.viewCount)}
                                    </span>
                                    <span class="like-count">
                                        <span class="material-icons">thumb_up</span>
                                        ${formatNumber(video.likeCount)}
                                    </span>
                                </div>
                                <div class="video-monetization ${monetizationClass}">
                                    <span class="monetization-icon material-icons">${monetizationIcon}</span>
                                    ${video.monetizationStatus !== 'none' ? `
                                        <span class="estimated-earnings">
                                            Est. earnings: $${video.estimatedEarnings.toFixed(2)}
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function getMonetizationIcon(status) {
    switch (status) {
        case 'monetized':
            return 'monetization_on';
        case 'limited':
            return 'warning';
        case 'demonetized':
            return 'money_off';
        default:
            return 'not_interested';
    }
}

// Live Updates Section
function createLiveUpdatesSection() {
    if (!channelStats) {
        return '<div class="live-updates-section">Loading channel statistics...</div>';
    }
    
    const subscriberCount = parseInt(channelStats.subscriberCount);
    const viewCount = parseInt(channelStats.viewCount);
    const videoCount = parseInt(channelStats.videoCount);
    
    return `
        <div class="live-updates-section">
            <h2>
                <span class="material-icons">stream</span>
                Live Updates
            </h2>
            <div class="channel-info">
                <img src="${channelStats.channelThumbnail}" alt="${channelStats.channelName}" class="channel-thumbnail">
                <h3 class="channel-name">${channelStats.channelName}</h3>
            </div>
            <div class="stats-grid">
                <div class="stat-card subscribers">
                    <div class="stat-icon">
                        <span class="material-icons">people</span>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Subscribers</div>
                        <div class="stat-value" id="subscriberCount">${formatNumber(subscriberCount)}</div>
                    </div>
                </div>
                <div class="stat-card views">
                    <div class="stat-icon">
                        <span class="material-icons">visibility</span>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Total Views</div>
                        <div class="stat-value" id="viewCount">${formatNumber(viewCount)}</div>
                    </div>
                </div>
                <div class="stat-card videos">
                    <div class="stat-icon">
                        <span class="material-icons">video_library</span>
                    </div>
                    <div class="stat-info">
                        <div class="stat-label">Videos</div>
                        <div class="stat-value" id="videoCount">${formatNumber(videoCount)}</div>
                    </div>
                </div>
            </div>
            <div class="last-updated">
                Last updated: ${new Date().toLocaleTimeString()}
            </div>
        </div>
    `;
}

async function fetchLiveStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/live-stats`, {
            ...fetchConfig,
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const oldStats = channelStats;
        channelStats = data;
        
        // Update the dashboard if we're on the live tab
        if (currentTab === TABS.LIVE) {
            if (oldStats) {
                // Update individual elements to avoid full re-render
                updateStatElement('subscriberCount', data.subscriberCount, oldStats.subscriberCount);
                updateStatElement('viewCount', data.viewCount, oldStats.viewCount);
                updateStatElement('videoCount', data.videoCount, oldStats.videoCount);
                document.querySelector('.last-updated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
            } else {
                createDashboard();
            }
        }
    } catch (error) {
        console.error('Error fetching live stats:', error);
        showError('Failed to fetch live statistics');
    }
}

function updateStatElement(id, newValue, oldValue) {
    const element = document.getElementById(id);
    if (!element) return;
    
    const newNum = parseInt(newValue);
    const oldNum = parseInt(oldValue);
    
    if (newNum !== oldNum) {
        // Create temporary elements for the animation
        const oldValueEl = document.createElement('span');
        oldValueEl.className = 'stat-value-old';
        oldValueEl.textContent = formatNumber(oldNum);
        
        const newValueEl = document.createElement('span');
        newValueEl.className = 'stat-value-new';
        newValueEl.textContent = formatNumber(newNum);
        
        // Add direction class for slide animation
        const direction = newNum > oldNum ? 'increase' : 'decrease';
        element.classList.add(direction);
        
        // Replace content with animated elements
        element.innerHTML = '';
        element.appendChild(oldValueEl);
        element.appendChild(newValueEl);
        
        // Add animation class to trigger the transition
        requestAnimationFrame(() => {
            element.classList.add('animating');
            
            // After animation completes
            setTimeout(() => {
                element.innerHTML = formatNumber(newNum);
                element.classList.remove('animating', direction);
                
                // Add glow effect
                element.classList.add('stat-changed');
                setTimeout(() => element.classList.remove('stat-changed'), 1500);
            }, 600); // Match this with CSS animation duration
        });
    }
}

function startLiveUpdates() {
    fetchLiveStats(); // Initial fetch
    statsUpdateInterval = setInterval(fetchLiveStats, 30000); // Update every 30 seconds
}

function stopLiveUpdates() {
    if (statsUpdateInterval) {
        clearInterval(statsUpdateInterval);
        statsUpdateInterval = null;
    }
}

// Hashtags Section
function createHashtagsSection(hashtagData) {
    if (!hashtagData) {
        return '<div class="hashtags-section">Loading hashtag analysis...</div>';
    }
    
    const { hashtags, channel_topics, updated_at } = hashtagData;

    const sections = [
        { id: 'trending', title: 'Trending Now', icon: 'trending_up' },
        { id: 'popular', title: 'Popular', icon: 'star' },
        { id: 'growing', title: 'Growing Fast', icon: 'rocket_launch' },
        { id: 'niche', title: 'Niche Specific', icon: 'tag' }
    ];

    const hashtagsHtml = sections.map(section => {
        const sectionHashtags = hashtags[section.id] || [];
        return `
            <div class="hashtag-section ${section.id}-hashtags">
                <h2>
                    <i class="material-icons">${section.icon}</i>
                    ${section.title}
                </h2>
                ${sectionHashtags.map(tag => createHashtagCard(tag.hashtag, tag)).join('')}
            </div>
        `;
    }).join('');

    return `
        <div class="hashtags-section">
            <div class="hashtags-info">
                <p>Based on analysis of successful videos in your niche:</p>
                <div class="channel-topics">
                    ${channel_topics.map(topic => `<span class="topic-badge">${topic}</span>`).join('')}
                </div>
            </div>
            <div class="hashtag-categories">
                ${hashtagsHtml}
            </div>
            <div class="last-updated">
                Last updated: ${new Date(updated_at).toLocaleString()}
            </div>
        </div>
    `;
}

function createHashtagCard(hashtag, stats) {
    return `
        <div class="hashtag-item">
            <div class="hashtag-name">
                #${hashtag}
                <span class="hashtag-count">${stats.usage_count}x</span>
            </div>
            <div class="hashtag-stats">
                <span><i class="material-icons">visibility</i>${formatNumber(stats.avg_views)}</span>
                <span><i class="material-icons">thumb_up</i>${formatNumber(stats.avg_likes)}</span>
            </div>
            <div class="example-videos">
                ${stats.example_videos.map(video => `
                    <div class="example-video">
                        <div class="example-video-title">${video.title}</div>
                        <div class="example-video-stats">${formatNumber(video.views)} views</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

async function fetchHashtags() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/hashtags`, {
            ...fetchConfig,
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        hashtagData = data;
        
        if (currentTab === TABS.HASHTAGS) {
            createDashboard();
        }
    } catch (error) {
        console.error('Error fetching hashtags:', error);
        showError('Failed to fetch hashtag analysis');
    }
}

function startHashtagUpdates() {
    fetchHashtags(); // Initial fetch
    hashtagUpdateInterval = setInterval(fetchHashtags, 300000); // Update every 5 minutes
}

function stopHashtagUpdates() {
    if (hashtagUpdateInterval) {
        clearInterval(hashtagUpdateInterval);
        hashtagUpdateInterval = null;
    }
}

// Data Fetching
async function fetchComments() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/comments`, fetchConfig);
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 429) {
                console.log('YouTube API quota exceeded for comments');
                return { comments: [], quotaExceeded: true };
            }
            throw new Error(data.error || 'Failed to fetch comments');
        }
        
        if (data.is_demo) {
            showQuotaExceededMessage(true);
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching comments:', error);
        throw error;
    }
}

async function fetchVideos() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/videos`, fetchConfig);
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 429) {
                console.log('YouTube API quota exceeded, showing quota message');
                showQuotaExceededMessage();
                return { videos: [], quotaExceeded: true };
            }
            throw new Error(data.error || 'Failed to fetch videos');
        }
        
        if (data.is_demo) {
            showQuotaExceededMessage(true);
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching videos:', error);
        throw error;
    }
}

async function fetchAnalytics() {
    try {
        console.log('Fetching analytics...');
        const response = await fetch(`${API_BASE_URL}/api/analytics`, {
            ...fetchConfig,
            method: 'GET'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Analytics received:', data);
        analytics = data;
        createApp();
    } catch (error) {
        console.error('Error fetching analytics:', error);
        showError('Failed to fetch analytics data.');
    }
}

// Login Component
function createLoginSection() {
    return `
        <div class="login-container">
            <h2>Welcome to EchoTube Dashboard</h2>
            <p style="margin-bottom: 2rem; color: var(--text-secondary)">Manage your YouTube comments and track analytics in real-time</p>
            <button id="loginBtn" class="login-button" onclick="handleLogin()">
                <span class="youtube-play"></span>
                <span class="material-icons">account_circle</span>
                Sign in with YouTube
            </button>
        </div>
    `;
}

// Analytics Section
function createAnalyticsSection() {
    return `
        <div class="analytics-card">
            <h2>
                <span class="material-icons">monitoring</span>
                Channel Analytics
            </h2>
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-value">$${analytics.totalEarnings || '0.00'}</div>
                    <div class="stat-label">Total Earnings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${analytics.totalViews || '0'}</div>
                    <div class="stat-label">Total Views</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${analytics.subscribers || '0'}</div>
                    <div class="stat-label">Subscribers</div>
                </div>
            </div>
        </div>
    `;
}

async function handleLogin() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            ...fetchConfig,
            method: 'GET'
        });
        const data = await response.json();
        window.location.href = data.auth_url;
    } catch (error) {
        console.error('Login error:', error);
        showError('Failed to login. Please try again.');
    }
}

// Start the app
console.log('Starting the app...');
initializeApp();
