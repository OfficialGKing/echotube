# EchoTube - YouTube Creator Dashboard

A real-time dashboard for YouTube content creators to manage comments and track channel analytics.

## Features

- Real-time comment notifications and management
- Video performance tracking
- Revenue analytics (for YouTube Partners)
- Interactive comment response system
- Like and heart comment interactions

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables in `.env`:
```
YOUTUBE_API_KEY=your_api_key
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

3. Run the backend:
```bash
python app.py
```

4. Install and run the frontend:
```bash
cd frontend
npm install
npm start
```

## Technologies Used

- Backend: Flask (Python)
- Frontend: React
- Authentication: Google OAuth 2.0
- API: YouTube Data API v3
