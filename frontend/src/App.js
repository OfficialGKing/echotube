import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardMedia,
  TextField,
  IconButton,
  Grid,
  Paper,
} from '@mui/material';
import {
  Favorite,
  ThumbUp,
  Send,
  MonetizationOn,
} from '@mui/icons-material';
import axios from 'axios';
import { formatDistance } from 'date-fns';

const API_BASE_URL = 'http://localhost:5000';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [comments, setComments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [replies, setReplies] = useState({});

  useEffect(() => {
    checkAuth();
    if (isAuthenticated) {
      fetchComments();
      fetchAnalytics();
    }
  }, [isAuthenticated]);

  const checkAuth = () => {
    // Check if user is authenticated (you might want to use cookies or local storage)
    const token = localStorage.getItem('youtube_token');
    setIsAuthenticated(!!token);
  };

  const handleLogin = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/login`);
      window.location.href = response.data.auth_url;
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/comments`);
      setComments(response.data.items);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/analytics`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const handleReply = async (commentId) => {
    try {
      const replyText = replies[commentId];
      if (!replyText) return;

      await axios.post(`${API_BASE_URL}/api/reply`, {
        commentId,
        replyText,
      });

      // Clear reply text and refresh comments
      setReplies({ ...replies, [commentId]: '' });
      fetchComments();
    } catch (error) {
      console.error('Error posting reply:', error);
    }
  };

  const CommentCard = ({ comment }) => {
    const snippet = comment.snippet.topLevelComment.snippet;
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={2}>
              <CardMedia
                component="img"
                image={snippet.authorProfileImageUrl}
                alt={snippet.authorDisplayName}
                sx={{ width: 50, height: 50, borderRadius: '50%' }}
              />
            </Grid>
            <Grid item xs={12} sm={10}>
              <Typography variant="subtitle1" component="div">
                {snippet.authorDisplayName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDistance(new Date(snippet.publishedAt), new Date(), { addSuffix: true })}
              </Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
                {snippet.textDisplay}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                <IconButton>
                  <ThumbUp />
                </IconButton>
                <IconButton>
                  <Favorite />
                </IconButton>
              </Box>
              <Box sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  variant="outlined"
                  placeholder="Write a reply..."
                  value={replies[comment.id] || ''}
                  onChange={(e) => setReplies({ ...replies, [comment.id]: e.target.value })}
                />
                <Button
                  variant="contained"
                  endIcon={<Send />}
                  sx={{ mt: 1 }}
                  onClick={() => handleReply(comment.id)}
                >
                  Reply
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          EchoTube Dashboard
        </Typography>

        {!isAuthenticated ? (
          <Button variant="contained" onClick={handleLogin}>
            Sign in with YouTube
          </Button>
        ) : (
          <>
            {analytics?.monetized && (
              <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  <MonetizationOn /> Revenue Analytics
                </Typography>
                {/* Add revenue analytics display here */}
              </Paper>
            )}

            <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
              Recent Comments
            </Typography>
            {comments.map((comment) => (
              <CommentCard key={comment.id} comment={comment} />
            ))}
          </>
        )}
      </Box>
    </Container>
  );
}

export default App;
