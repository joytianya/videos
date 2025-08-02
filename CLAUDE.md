# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Flask-based HTTP proxy server that forwards requests to a target domain while performing URL and content rewriting. The application acts as a reverse proxy, modifying request and response headers to maintain functionality across domains.

## Development Setup

### Environment Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt
```

### Running the Application
```bash
# Run the proxy server
python src/main.py
```
The server runs on `0.0.0.0:8888` by default.

### Health Check
```bash
curl http://localhost:8888/health
```

## Architecture

### Core Components

- **`src/main.py`**: Main proxy server with request/response handling logic
- **`src/models/user.py`**: SQLAlchemy User model (appears unused in main proxy functionality)
- **`src/routes/user.py`**: RESTful user API routes (appears unused in main proxy functionality)
- **`src/database/app.db`**: SQLite database file

### Key Configuration
- **Target Domain**: Configured via `TARGET_DOMAIN` and `TARGET_SCHEME` constants in `main.py`
- **Proxy Logic**: All routes are handled by the catch-all `proxy()` function
- **Content Processing**: Text-based content types are modified to replace domain references

### Request Flow
1. Incoming request received by Flask
2. Headers modified (Host, Referer, etc.)
3. Request forwarded to target domain via `requests.Session`
4. Response content processed for domain replacement
5. Response headers modified and returned to client

### Content Rewriting
The proxy modifies:
- Absolute URLs (`https://target.com` → `https://proxy.com`)
- Protocol-relative URLs (`//target.com` → `//proxy.com`)
- Cookie domains
- Location headers for redirects

## Dependencies

Key packages:
- **Flask**: Web framework
- **flask-cors**: CORS support
- **requests**: HTTP client for proxying
- **Flask-SQLAlchemy**: ORM (for user model, currently unused)

## Notes

- The user management system (models/routes) appears to be scaffolded but not integrated with the main proxy functionality
- SSL certificate verification is disabled (`verify=False`)
- Request timeout is set to 10 seconds
- The proxy preserves HTTP methods (GET, POST, PUT, DELETE, etc.)