from flask import Flask, request, jsonify, session, make_response, redirect, url_for
from flask_cors import CORS
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from datetime import datetime
import os
import logging
from dotenv import load_dotenv
from collections import Counter
import re
from datetime import datetime, timedelta
import numpy as np
from google.auth.transport.requests import Request

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

# Cache storage
cache = {
    'videos': {},  # Store by user ID
    'comments': {},  # Store by user ID
    'last_fetch': {},  # Store by user ID
}

def get_cache_key(session):
    """Generate a unique cache key for the user."""
    if 'credentials' not in session:
        return None
    try:
        creds = session['credentials']
        return f"{creds['client_id']}_{creds['token'][:10]}"
    except:
        return None

def get_cached_data(cache_type, session):
    """Get cached data if it's still valid."""
    cache_key = get_cache_key(session)
    if not cache_key:
        return None

    if cache_key not in cache[cache_type] or cache_key not in cache['last_fetch']:
        return None

    last_fetch = cache['last_fetch'][cache_key]
    if datetime.now() - last_fetch > timedelta(minutes=30):  # Cache for 30 minutes
        return None

    return cache[cache_type][cache_key]

def set_cached_data(cache_type, data, session):
    """Store data in cache."""
    cache_key = get_cache_key(session)
    if not cache_key:
        return

    cache[cache_type][cache_key] = data
    cache['last_fetch'][cache_key] = datetime.now()

def get_demo_data():
    """Return demo data when API quota is exceeded."""
    demo_videos = [
        {
            'id': 'demo1',
            'title': 'Welcome to EchoTube Dashboard',
            'description': 'This is a demo video while the YouTube API quota is exceeded. The real data will be available once the quota resets.',
            'thumbnail': 'https://i.imgur.com/7K2AGbm.jpg',
            'publishedAt': (datetime.now() - timedelta(days=1)).isoformat(),
            'viewCount': 1200,
            'likeCount': 150,
            'commentCount': 25
        },
        {
            'id': 'demo2',
            'title': 'Understanding YouTube API Quotas',
            'description': 'Learn about YouTube API quotas and how to manage them effectively.',
            'thumbnail': 'https://i.imgur.com/QzWqrNG.jpg',
            'publishedAt': (datetime.now() - timedelta(days=2)).isoformat(),
            'viewCount': 800,
            'likeCount': 95,
            'commentCount': 15
        }
    ]
    
    demo_comments = [
        {
            'id': 'comment1',
            'videoId': 'demo1',
            'authorDisplayName': 'Demo User',
            'authorProfileImageUrl': 'https://i.imgur.com/7K2AGbm.jpg',
            'textDisplay': 'This is a demo comment. Real comments will be shown once the YouTube API quota resets.',
            'likeCount': 5,
            'publishedAt': (datetime.now() - timedelta(hours=2)).isoformat(),
            'updatedAt': (datetime.now() - timedelta(hours=2)).isoformat()
        },
        {
            'id': 'comment2',
            'videoId': 'demo2',
            'authorDisplayName': 'API Quota Info',
            'authorProfileImageUrl': 'https://i.imgur.com/QzWqrNG.jpg',
            'textDisplay': 'YouTube API quotas typically reset at midnight Pacific Time. Your dashboard will automatically update with real data once the quota resets.',
            'likeCount': 3,
            'publishedAt': (datetime.now() - timedelta(hours=4)).isoformat(),
            'updatedAt': (datetime.now() - timedelta(hours=4)).isoformat()
        }
    ]
    
    return {
        'videos': demo_videos,
        'comments': demo_comments,
        'channelId': 'demo_channel',
        'is_demo': True
    }

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', os.urandom(24))
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

# Configure CORS for all routes
CORS(app, supports_credentials=True, resources={
    r"/*": {  # This will apply to all routes
        "origins": ["http://localhost:8000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin == "http://localhost:8000":
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# OAuth 2.0 configuration
CLIENT_SECRETS_FILE = "client_secrets.json"
SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtubepartner',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
]

def get_youtube_client():
    if 'credentials' not in session:
        logger.error('No credentials found in session')
        logger.debug(f'Session contents: {session.items()}')
        raise Exception('Not authenticated')
    
    try:
        logger.debug(f'Credentials from session: {session["credentials"]}')
        credentials = Credentials(**session['credentials'])
        if not credentials.valid:
            logger.debug(f'Credentials invalid. Expired: {credentials.expired}, Has refresh token: {credentials.refresh_token is not None}')
            if credentials.expired and credentials.refresh_token:
                logger.debug('Attempting to refresh token')
                credentials.refresh(Request())
                session['credentials'] = {
                    'token': credentials.token,
                    'refresh_token': credentials.refresh_token,
                    'token_uri': credentials.token_uri,
                    'client_id': credentials.client_id,
                    'client_secret': credentials.client_secret,
                    'scopes': credentials.scopes
                }
                session.modified = True
                logger.debug('Token refreshed successfully')
        return build('youtube', 'v3', credentials=credentials)
    except Exception as e:
        logger.error(f'Error creating YouTube client: {str(e)}', exc_info=True)
        session.pop('credentials', None)  # Clear invalid credentials
        raise Exception(f'Authentication failed: {str(e)}')

@app.route('/')
def home():
    return jsonify({"status": "ok"})

@app.route('/auth/status', methods=['GET'])
def auth_status():
    try:
        is_authenticated = 'credentials' in session
        logger.debug(f'Auth status check - Session contents: {session.items()}')
        logger.debug(f'Auth status check - authenticated: {is_authenticated}')
        return jsonify({
            'authenticated': is_authenticated,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f'Error in auth_status: {str(e)}', exc_info=True)
        return jsonify({
            'error': str(e),
            'authenticated': False
        }), 500

@app.route('/auth/login', methods=['GET'])
def login():
    try:
        flow = Flow.from_client_secrets_file(
            CLIENT_SECRETS_FILE,
            scopes=SCOPES,
            redirect_uri='http://localhost:5000/auth/callback'
        )
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'  # Force consent screen to get refresh token
        )
        session['state'] = state
        logger.debug(f'Generated auth URL: {authorization_url}')
        return jsonify({'auth_url': authorization_url})
    except Exception as e:
        logger.error(f'Error in login: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/auth/callback')
def oauth2callback():
    try:
        logger.debug(f'Callback received. Session state: {session.get("state")}')
        logger.debug(f'Request URL: {request.url}')
        logger.debug(f'Request args: {request.args}')
        
        if 'error' in request.args:
            logger.error(f'OAuth error: {request.args.get("error")}')
            return redirect('http://localhost:8000?error=auth_failed')
            
        if 'state' not in session:
            logger.error('No state in session')
            return redirect('http://localhost:8000?error=no_state')
            
        state = session['state']
        flow = Flow.from_client_secrets_file(
            CLIENT_SECRETS_FILE,
            scopes=SCOPES,
            state=state,
            redirect_uri='http://localhost:5000/auth/callback'
        )
        
        authorization_response = request.url
        logger.debug(f'Authorization response URL: {authorization_response}')
        
        try:
            flow.fetch_token(authorization_response=authorization_response)
        except Exception as e:
            logger.error(f'Error fetching token: {str(e)}', exc_info=True)
            return redirect('http://localhost:8000?error=token_error')
            
        credentials = flow.credentials
        logger.debug(f'Got credentials. Has refresh token: {credentials.refresh_token is not None}')
        
        session['credentials'] = {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes
        }
        session.modified = True
        logger.debug('Credentials saved to session')
        
        # Test the credentials
        try:
            youtube = build('youtube', 'v3', credentials=credentials)
            test_response = youtube.channels().list(part='id', mine=True).execute()
            logger.debug(f'Test API call successful: {test_response}')
        except Exception as e:
            logger.error(f'Test API call failed: {str(e)}', exc_info=True)
            return redirect('http://localhost:8000?error=api_test_failed')
        
        return redirect('http://localhost:8000')
    except Exception as e:
        logger.error(f'Error in oauth2callback: {str(e)}', exc_info=True)
        return redirect('http://localhost:8000?error=auth_failed')

@app.route('/api/videos', methods=['GET'])
def get_videos():
    try:
        if 'credentials' not in session:
            logger.error('No credentials in session')
            return jsonify({'error': 'Not authenticated'}), 401

        # Check cache first
        cached_data = get_cached_data('videos', session)
        if cached_data:
            logger.info('Returning cached video data')
            return jsonify(cached_data)

        credentials = Credentials(**session['credentials'])

        if not credentials.valid:
            if credentials.expired and credentials.refresh_token:
                try:
                    credentials.refresh(Request())
                    session['credentials'] = {
                        'token': credentials.token,
                        'refresh_token': credentials.refresh_token,
                        'token_uri': credentials.token_uri,
                        'client_id': credentials.client_id,
                        'client_secret': credentials.client_secret,
                        'scopes': credentials.scopes
                    }
                    session.modified = True
                except Exception as e:
                    logger.error(f'Error refreshing token: {str(e)}', exc_info=True)
                    return jsonify({'error': 'Failed to refresh token'}), 401
            else:
                return jsonify({'error': 'Invalid credentials'}), 401

        youtube = build('youtube', 'v3', credentials=credentials)
        
        try:
            # First get the channel ID (costs 1 quota point)
            channels_response = youtube.channels().list(
                part='id,contentDetails',  # Get both in one call to save quota
                mine=True
            ).execute()
            
            if not channels_response['items']:
                return jsonify({'error': 'No YouTube channel found'}), 404
                
            channel_id = channels_response['items'][0]['id']
            uploads_playlist_id = channels_response['items'][0]['contentDetails']['relatedPlaylists']['uploads']
            
            # Get the most recent videos (costs 2 quota points)
            videos_response = youtube.search().list(
                part='snippet',
                channelId=channel_id,
                maxResults=10,  # Reduced from 50 to save quota
                type='video',
                order='date'
            ).execute()
            
            videos = []
            video_ids = []
            for item in videos_response.get('items', []):
                video_ids.append(item['id']['videoId'])
                videos.append({
                    'id': item['id']['videoId'],
                    'title': item['snippet']['title'],
                    'description': item['snippet']['description'],
                    'thumbnail': item['snippet']['thumbnails']['high']['url'],
                    'publishedAt': item['snippet']['publishedAt']
                })
            
            # Get statistics in bulk to save quota (costs 1 quota point)
            if video_ids:
                stats_response = youtube.videos().list(
                    part='statistics',
                    id=','.join(video_ids[:10])  # Process in smaller batches
                ).execute()
                
                stats_map = {item['id']: item['statistics'] for item in stats_response['items']}
                
                for video in videos:
                    if video['id'] in stats_map:
                        stats = stats_map[video['id']]
                        video.update({
                            'viewCount': int(stats.get('viewCount', 0)),
                            'likeCount': int(stats.get('likeCount', 0)),
                            'commentCount': int(stats.get('commentCount', 0))
                        })
            
            response_data = {'videos': videos, 'channelId': channel_id}
            
            # Cache the successful response
            set_cached_data('videos', response_data, session)
            
            return jsonify(response_data)
            
        except Exception as e:
            if 'quota' in str(e).lower():
                logger.error('YouTube API quota exceeded')
                # Try to return cached data even if it's expired
                cached_data = get_cached_data('videos', session)
                if cached_data:
                    logger.info('Returning cached video data due to quota error')
                    return jsonify(cached_data)
                    
                # If no cache, return demo data
                logger.info('Returning demo data due to quota error')
                demo_data = get_demo_data()
                return jsonify({'videos': demo_data['videos'], 'channelId': demo_data['channelId'], 'is_demo': True})
                
            logger.error(f'Error fetching videos: {str(e)}', exc_info=True)
            return jsonify({'error': f'Failed to fetch videos: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f'Error in get_videos: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/comments', methods=['GET'])
def get_comments():
    try:
        if 'credentials' not in session:
            logger.error('No credentials in session')
            return jsonify({'error': 'Not authenticated'}), 401

        # Check cache first
        cached_data = get_cached_data('comments', session)
        if cached_data:
            logger.info('Returning cached comment data')
            return jsonify(cached_data)

        credentials = Credentials(**session['credentials'])

        if not credentials.valid:
            if credentials.expired and credentials.refresh_token:
                try:
                    credentials.refresh(Request())
                    session['credentials'] = {
                        'token': credentials.token,
                        'refresh_token': credentials.refresh_token,
                        'token_uri': credentials.token_uri,
                        'client_id': credentials.client_id,
                        'client_secret': credentials.client_secret,
                        'scopes': credentials.scopes
                    }
                    session.modified = True
                except Exception as e:
                    logger.error(f'Error refreshing token: {str(e)}', exc_info=True)
                    return jsonify({'error': 'Failed to refresh token'}), 401
            else:
                return jsonify({'error': 'Invalid credentials'}), 401

        youtube = build('youtube', 'v3', credentials=credentials)
        
        try:
            # First get the channel ID (costs 1 quota point)
            channels_response = youtube.channels().list(
                part='id,contentDetails',
                mine=True
            ).execute()
            
            if not channels_response['items']:
                return jsonify({'error': 'No YouTube channel found'}), 404
                
            channel_id = channels_response['items'][0]['id']
            uploads_playlist_id = channels_response['items'][0]['contentDetails']['relatedPlaylists']['uploads']
            
            # Get the most recent videos (costs 2 quota points)
            playlistitems_response = youtube.playlistItems().list(
                part='snippet',
                playlistId=uploads_playlist_id,
                maxResults=5  # Reduced from 50 to save quota
            ).execute()
            
            video_ids = [item['snippet']['resourceId']['videoId'] 
                        for item in playlistitems_response['items']]
            
            all_comments = []
            for video_id in video_ids:
                try:
                    # Get comments for each video (costs 1 quota point per video)
                    comments_response = youtube.commentThreads().list(
                        part='snippet',
                        videoId=video_id,
                        maxResults=20  # Reduced from 100 to save quota
                    ).execute()
                    
                    for item in comments_response.get('items', []):
                        comment = item['snippet']['topLevelComment']['snippet']
                        all_comments.append({
                            'id': item['id'],
                            'videoId': video_id,
                            'authorDisplayName': comment['authorDisplayName'],
                            'authorProfileImageUrl': comment['authorProfileImageUrl'],
                            'textDisplay': comment['textDisplay'],
                            'likeCount': comment['likeCount'],
                            'publishedAt': comment['publishedAt'],
                            'updatedAt': comment['updatedAt']
                        })
                except Exception as e:
                    if 'quota' in str(e).lower():
                        break  # Stop processing more videos if we hit quota limit
                    logger.warning(f'Error fetching comments for video {video_id}: {str(e)}')
                    continue
            
            response_data = {'comments': all_comments, 'channelId': channel_id}
            
            # Cache the successful response
            set_cached_data('comments', response_data, session)
            
            return jsonify(response_data)
            
        except Exception as e:
            if 'quota' in str(e).lower():
                logger.error('YouTube API quota exceeded')
                # Try to return cached data even if it's expired
                cached_data = get_cached_data('comments', session)
                if cached_data:
                    logger.info('Returning cached comment data due to quota error')
                    return jsonify(cached_data)
                    
                # If no cache, return demo data
                logger.info('Returning demo data due to quota error')
                demo_data = get_demo_data()
                return jsonify({'comments': demo_data['comments'], 'channelId': demo_data['channelId'], 'is_demo': True})
                
            logger.error(f'Error fetching comments: {str(e)}', exc_info=True)
            return jsonify({'error': f'Failed to fetch comments: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f'Error in get_comments: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/like', methods=['POST'])
def like_comment():
    if 'credentials' not in session:
        logger.warning('Attempt to like comment without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        comment_id = data.get('commentId')
        
        if not comment_id:
            logger.warning('Missing comment ID in request')
            return jsonify({'error': 'Comment ID is required'}), 400
            
        youtube = get_youtube_client()
        
        # Like the comment using YouTube API
        response = youtube.comments().setModerationStatus(
            id=comment_id,
            moderationStatus='published',
            banAuthor=False
        ).execute()
        
        logger.debug(f'Liked comment with ID: {comment_id}')
        return jsonify({'success': True, 'action': 'like'})
    except Exception as e:
        logger.error(f'Error liking comment: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/unlike', methods=['POST'])
def unlike_comment():
    if 'credentials' not in session:
        logger.warning('Attempt to unlike comment without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        comment_id = data.get('commentId')
        
        if not comment_id:
            logger.warning('Missing comment ID in request')
            return jsonify({'error': 'Comment ID is required'}), 400
            
        youtube = get_youtube_client()
        
        # Unlike the comment
        response = youtube.comments().setModerationStatus(
            id=comment_id,
            moderationStatus='published',
            banAuthor=False
        ).execute()
        
        logger.debug(f'Unliked comment with ID: {comment_id}')
        return jsonify({'success': True, 'action': 'unlike'})
    except Exception as e:
        logger.error(f'Error unliking comment: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/heart', methods=['POST'])
def heart_comment():
    if 'credentials' not in session:
        logger.warning('Attempt to heart comment without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        comment_id = data.get('commentId')
        
        if not comment_id:
            logger.warning('Missing comment ID in request')
            return jsonify({'error': 'Comment ID is required'}), 400
            
        youtube = get_youtube_client()
        
        # Heart the comment using creator heart feature
        response = youtube.comments().setModerationStatus(
            id=comment_id,
            moderationStatus='published',
            banAuthor=False
        ).execute()
        
        logger.debug(f'Hearted comment with ID: {comment_id}')
        return jsonify({'success': True, 'action': 'heart'})
    except Exception as e:
        logger.error(f'Error hearting comment: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/unheart', methods=['POST'])
def unheart_comment():
    if 'credentials' not in session:
        logger.warning('Attempt to unheart comment without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        comment_id = data.get('commentId')
        
        if not comment_id:
            logger.warning('Missing comment ID in request')
            return jsonify({'error': 'Comment ID is required'}), 400
            
        youtube = get_youtube_client()
        
        # Remove heart from comment
        response = youtube.comments().setModerationStatus(
            id=comment_id,
            moderationStatus='published',
            banAuthor=False
        ).execute()
        
        logger.debug(f'Unhearted comment with ID: {comment_id}')
        return jsonify({'success': True, 'action': 'unheart'})
    except Exception as e:
        logger.error(f'Error unhearting comment: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/reply', methods=['POST'])
def reply_to_comment():
    if 'credentials' not in session:
        logger.warning('Attempt to reply to comment without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        parent_id = data.get('commentId')
        reply_text = data.get('replyText')
        
        if not parent_id or not reply_text:
            logger.warning('Missing required fields in reply request')
            return jsonify({'error': 'Comment ID and reply text are required'}), 400
            
        youtube = get_youtube_client()
        
        # Create the reply
        reply = youtube.comments().insert(
            part='snippet',
            body={
                'snippet': {
                    'parentId': parent_id,
                    'textOriginal': reply_text
                }
            }
        ).execute()
        
        logger.debug(f'Created reply to comment {parent_id}')
        return jsonify({
            'success': True, 
            'reply': reply
        })
    except Exception as e:
        logger.error(f'Error replying to comment: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    if 'credentials' not in session:
        logger.warning('Attempt to fetch analytics without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        logger.debug('Fetching analytics from YouTube API')
        youtube = get_youtube_client()
        
        # Get channel details including monetization status
        channel_response = youtube.channels().list(
            part='status,statistics',
            mine=True
        ).execute()
        
        if not channel_response.get('items'):
            logger.warning('No channel found for analytics')
            return jsonify({
                'monetized': False,
                'totalViews': 0,
                'subscribers': 0,
                'totalEarnings': '0.00'
            })
            
        channel = channel_response['items'][0]
        stats = channel.get('statistics', {})
        
        analytics_data = {
            'monetized': channel.get('status', {}).get('madeForKids', False),
            'totalViews': stats.get('viewCount', 0),
            'subscribers': stats.get('subscriberCount', 0),
            'totalEarnings': '0.00'  # Note: Actual earnings require YouTube Partner API
        }
        
        logger.debug(f'Retrieved analytics: {analytics_data}')
        return jsonify(analytics_data)
    except Exception as e:
        logger.error(f'Error fetching analytics: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/live-stats', methods=['GET'])
def get_live_stats():
    if 'credentials' not in session:
        logger.warning('Attempt to fetch live stats without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        youtube = get_youtube_client()
        
        # Get channel statistics
        channels_response = youtube.channels().list(
            part='statistics,snippet',
            mine=True
        ).execute()
        
        if not channels_response.get('items'):
            logger.warning('No channel found for user')
            return jsonify({'error': 'No channel found'}), 404
            
        channel = channels_response['items'][0]
        stats = channel['statistics']
        
        return jsonify({
            'subscriberCount': stats.get('subscriberCount', '0'),
            'viewCount': stats.get('viewCount', '0'),
            'videoCount': stats.get('videoCount', '0'),
            'channelName': channel['snippet']['title'],
            'channelThumbnail': channel['snippet']['thumbnails'].get('default', {}).get('url', '')
        })
        
    except Exception as e:
        logger.error(f'Error fetching live stats: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/hashtags', methods=['GET'])
def get_hashtags():
    if 'credentials' not in session:
        logger.warning('Attempt to fetch hashtags without authentication')
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        youtube = get_youtube_client()
        
        # Get user's channel first
        channels_response = youtube.channels().list(
            part='id,topicDetails,brandingSettings',
            mine=True
        ).execute()
        
        if not channels_response.get('items'):
            logger.warning('No channel found for user')
            return jsonify({'error': 'No channel found'}), 404
            
        channel = channels_response['items'][0]
        channel_topics = channel.get('topicDetails', {}).get('topicCategories', [])
        channel_keywords = channel.get('brandingSettings', {}).get('channel', {}).get('keywords', '').split(',')
        
        # Extract topic IDs and clean keywords
        topic_ids = [topic.split('/')[-1].lower() for topic in channel_topics]
        keywords = [kw.strip().lower() for kw in channel_keywords if kw.strip()]
        
        # Search for popular videos in the same niche
        search_results = []
        for topic in topic_ids + keywords[:3]:  # Use both topics and top keywords
            try:
                search_response = youtube.search().list(
                    part='id',
                    q=topic,
                    type='video',
                    videoCategoryId='10',  # Music category
                    maxResults=50,
                    order='viewCount',
                    publishedAfter=(datetime.utcnow() - timedelta(days=90)).isoformat() + 'Z'
                ).execute()
                
                video_ids = [item['id']['videoId'] for item in search_response.get('items', [])]
                if video_ids:
                    # Get detailed video information
                    videos_response = youtube.videos().list(
                        part='snippet,statistics',
                        id=','.join(video_ids)
                    ).execute()
                    search_results.extend(videos_response.get('items', []))
                    
                    # Log for debugging
                    logger.debug(f'Found {len(videos_response.get("items", []))} videos for topic {topic}')
                    
            except Exception as e:
                logger.warning(f'Error searching for topic {topic}: {str(e)}')
                continue
        
        # Extract and analyze hashtags
        hashtag_stats = {}
        hashtag_pattern = r'#(\w+)'
        
        logger.debug(f'Analyzing {len(search_results)} videos for hashtags')
        
        for video in search_results:
            description = video['snippet'].get('description', '')
            title = video['snippet'].get('title', '')
            tags = video['snippet'].get('tags', [])
            view_count = int(video['statistics'].get('viewCount', 0))
            like_count = int(video['statistics'].get('likeCount', 0))
            
            # Find hashtags in description and title
            hashtags = re.findall(hashtag_pattern, description + ' ' + title)
            # Add tags that start with #
            hashtags.extend([tag[1:] for tag in tags if tag.startswith('#')])
            
            # Log for debugging
            if hashtags:
                logger.debug(f'Found hashtags in video {video["id"]}: {hashtags}')
            
            # Calculate engagement score
            engagement_score = view_count * 0.7 + like_count * 0.3
            
            # Update hashtag statistics
            for hashtag in hashtags:
                hashtag = hashtag.lower()
                if hashtag not in hashtag_stats:
                    hashtag_stats[hashtag] = {
                        'count': 0,
                        'total_views': 0,
                        'total_likes': 0,
                        'total_score': 0,
                        'videos': []
                    }
                
                hashtag_stats[hashtag]['count'] += 1
                hashtag_stats[hashtag]['total_views'] += view_count
                hashtag_stats[hashtag]['total_likes'] += like_count
                hashtag_stats[hashtag]['total_score'] += engagement_score
                hashtag_stats[hashtag]['videos'].append({
                    'title': title,
                    'views': view_count,
                    'likes': like_count
                })
        
        logger.debug(f'Found {len(hashtag_stats)} unique hashtags')
        
        # Calculate hashtag effectiveness scores
        hashtag_scores = []
        for hashtag, stats in hashtag_stats.items():
            if stats['count'] >= 2:  # Lower threshold for testing
                avg_views = stats['total_views'] / stats['count']
                avg_likes = stats['total_likes'] / stats['count']
                frequency_score = min(stats['count'] / 5, 1)  # Adjusted threshold
                engagement_score = stats['total_score'] / stats['count']
                
                # Calculate percentiles for normalization
                if len(stats['videos']) >= 2:
                    view_percentile = np.percentile([v['views'] for v in stats['videos']], 75)
                    like_percentile = np.percentile([v['likes'] for v in stats['videos']], 75)
                else:
                    view_percentile = avg_views
                    like_percentile = avg_likes
                
                # Prevent division by zero
                if view_percentile == 0:
                    view_percentile = 1
                if like_percentile == 0:
                    like_percentile = 1
                
                # Final score calculation
                final_score = (
                    (avg_views / view_percentile) * 0.4 +
                    (avg_likes / like_percentile) * 0.3 +
                    frequency_score * 0.3
                )
                
                hashtag_scores.append({
                    'hashtag': hashtag,
                    'score': final_score,
                    'usage_count': stats['count'],
                    'avg_views': int(avg_views),
                    'avg_likes': int(avg_likes),
                    'example_videos': sorted(stats['videos'], 
                                          key=lambda x: x['views'], 
                                          reverse=True)[:3]
                })
        
        # Sort hashtags by score and get top 20
        top_hashtags = sorted(hashtag_scores, key=lambda x: x['score'], reverse=True)[:20]
        
        # Group hashtags by effectiveness
        grouped_hashtags = {
            'trending': top_hashtags[:5],
            'popular': top_hashtags[5:10],
            'growing': top_hashtags[10:15],
            'niche': top_hashtags[15:20]
        }
        
        logger.debug(f'Grouped hashtags: {grouped_hashtags}')
        
        return jsonify({
            'hashtags': grouped_hashtags,
            'channel_topics': [topic.split('/')[-1] for topic in channel_topics],
            'updated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f'Error analyzing hashtags: {str(e)}')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'  # For development only
    app.run(host='localhost', port=5000, debug=True)
