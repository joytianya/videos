# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a video streaming proxy server and crawler system that:
- Provides CORS-bypassing proxy for HLS video streaming
- Crawls video content from yfsp.tv using multiple strategies
- Offers search functionality across crawled video data
- Manages play sessions for video streaming
- Includes a web-based player interface

## Core Architecture

### Main Components

**proxy-server.js** - Main Express server application
- Entry point: `npm start` or `node proxy-server.js`
- Runs on port 3000 by default
- Serves as both API server and static file server
- Routes: `/proxy`, `/live-search`, `/create-play-session`, `/player`, `/search`

**Crawler System** - Multiple crawling strategies:
- `crawler.js` - Basic page-based crawler using Puppeteer
- `simple-crawler.js` - Simplified version of basic crawler  
- `api-crawler.js` - API-based crawler using direct HTTP requests
- `dynamic-api-crawler.js` - Enhanced API crawler with better error handling
- `batch-crawler.js` - Batch processing wrapper for crawlers

**Core Classes**:
- `VideoSearchIndex` (search-index.js) - Handles video indexing and search
- `PlaySessionManager` (play-session.js) - Manages temporary video play sessions

### Data Flow

1. **Crawling**: Various crawlers extract video metadata and store in `dynamic_api_data/`
2. **Indexing**: `VideoSearchIndex` builds searchable index from crawled data  
3. **Search**: API endpoints provide search functionality to frontend
4. **Streaming**: Proxy server bypasses CORS for HLS video streams
5. **Sessions**: Play sessions manage temporary video access with unique IDs

## Development Commands

### Server Management
```bash
npm start                    # Start proxy server
./manage-server.sh start     # Start server as daemon
./manage-server.sh stop      # Stop daemon server
./manage-server.sh status    # Check server status
./manage-server.sh restart   # Restart server
```

### Crawling Operations
```bash
# Basic crawler (1-3 pages for testing)
npm run crawl-test
npm run crawl              # 1-50 pages
npm run crawl-all          # 1-1000 pages

# Simple crawler
npm run crawl-simple-test
npm run crawl-simple       # 1-50 pages
npm run crawl-simple-all   # 1-1000 pages

# API crawler
npm run api-crawl-test
npm run api-crawl          # 1-50 pages  
npm run api-crawl-all      # 1-1000 pages

# Dynamic API crawler (recommended)
npm run dynamic-api-crawl-test
npm run dynamic-api-crawl      # 1-50 pages
npm run dynamic-api-crawl-all  # 1-1000 pages

# Batch crawler (fault-tolerant)
npm run batch-crawl        # Pages 1-999
npm run batch-crawl-test   # Pages 1-10
npm run batch-retry        # Retry failed pages
npm run batch-status       # Check batch progress
npm run batch-summary      # Generate summary
```

### Search Index Management
```bash
npm run build-index        # Rebuild search index
npm run test-search        # Test search functionality
```

## File Structure

### Data Directories
- `dynamic_api_data/` - Crawled video data (page_XXX.json files)
- `debug_screenshots/` - Debug screenshots from failed crawls
- `docs/` - Documentation files

### Configuration Files
- `package.json` - Dependencies and npm scripts
- `manage-server.sh` - Server management script
- `server.pid` / `server.log` - Runtime server files

### Frontend Files
- `player.html` - Video player template
- `live-search.html` - Search interface
- `search.html` - Search page
- `auto-player.html` - Auto-play interface

## Key Development Patterns

### Error Handling
- All crawlers implement retry mechanisms (default: 3 retries)
- Batch crawler maintains progress state for fault tolerance
- Screenshot capture on crawler failures for debugging

### Data Persistence  
- Video data stored as JSON files in `dynamic_api_data/`
- Search index cached in `video_search_index.json`
- Play sessions stored in memory with auto-cleanup

### Proxy Architecture
- M3U8 playlist URLs are rewritten to proxy through local server
- CORS headers added for cross-origin access
- Supports both M3U8 playlists and TS video segments

### Session Management
- Play sessions expire after 24 hours
- Unique session IDs generated using MD5 hash
- Automatic cleanup of expired sessions every hour

## Testing & Debugging

### Crawler Testing
Always test crawlers with small page ranges first:
```bash
npm run dynamic-api-crawl-test  # Test 1-3 pages
```

### Debug Information
- Server logs: `server.log`
- Batch crawl logs: `dynamic_api_data/batch_crawl.log`
- Debug screenshots: `debug_screenshots/` directory
- Crawler reports: Auto-generated with timestamps

### Common Issues
- **CORS errors**: Use the `/proxy` endpoint for video URLs
- **Missing M3U8**: Check crawler debug screenshots
- **Search not working**: Rebuild index with `npm run build-index`
- **Server startup fails**: Check if port 3000 is available

## Dependencies

- **express** - Web server framework
- **puppeteer** - Browser automation for crawling
- **axios** - HTTP client for API requests  
- **cheerio** - Server-side HTML parsing