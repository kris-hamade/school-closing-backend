---
name: Backend improvements and API docs
overview: Enhance the backend with improved data structures, additional API endpoints, better error handling, and create comprehensive API documentation for the frontend project.
todos:
  - id: enhance-data-structure
    content: Enhance data structure in fetchClosures() to include metadata (timestamps, match scores, original status, ISD-level closures)
    status: completed
  - id: add-health-endpoint
    content: Add GET /api/health endpoint for health checks
    status: completed
  - id: add-isd-endpoint
    content: Add GET /api/closures/isd/:isdName endpoint for ISD-specific queries
    status: completed
    dependencies:
      - enhance-data-structure
  - id: add-school-search
    content: Add GET /api/closures/school/:schoolName endpoint for school search
    status: completed
    dependencies:
      - enhance-data-structure
  - id: add-summary-endpoint
    content: Add GET /api/closures/summary endpoint for statistics
    status: completed
    dependencies:
      - enhance-data-structure
  - id: improve-error-handling
    content: Improve error handling with proper HTTP status codes and structured error responses
    status: completed
  - id: add-caching-headers
    content: Add response caching headers (ETag, Cache-Control) to API responses
    status: completed
  - id: create-api-docs
    content: Create comprehensive API_DOCUMENTATION.md file with all endpoints, schemas, and examples
    status: completed
    dependencies:
      - enhance-data-structure
      - add-health-endpoint
      - add-isd-endpoint
      - add-school-search
      - add-summary-endpoint
---

# Backend Improvements and API Documentation

## Current State Analysis

The backend currently:

- Scrapes school closure data from an external URL
- Uses fuzzy matching (90% threshold) to match schools
- Returns data structured as: `ISD > County > School > { closed: boolean }`
- Updates every 2.5 minutes
- Has a single endpoint: `GET /api/closures`

## Proposed Improvements

### 1. Enhanced Data Structure

Add metadata to responses that won't break existing frontend but enables new features:

- **Timestamp**: When the data was last fetched/updated
- **Match confidence**: The fuzzy match score for transparency
- **Original status**: The raw closure status text from the source
- **ISD-level closure**: Boolean indicating if entire ISD is closed (all schools in ISD)
- **Data freshness**: Time since last successful fetch

### 2. Additional API Endpoints

Add endpoints for better frontend flexibility:

- `GET /api/health` - Health check endpoint
- `GET /api/closures/isd/:isdName` - Get closures for specific ISD
- `GET /api/closures/school/:schoolName` - Search for specific school
- `GET /api/closures/summary` - Get summary statistics (total closed, by ISD, etc.)
- `GET /api/closures/isd-status` - Get ISD-level closure status only

### 3. Code Quality Improvements

- Better error handling with proper HTTP status codes
- Input validation and sanitization
- Response caching headers (ETag, Cache-Control)
- Structured error responses
- Graceful degradation when external source is unavailable

### 4. API Documentation File

Create `API_DOCUMENTATION.md` that includes:

- Complete endpoint documentation
- Request/response schemas with examples
- Data structure definitions
- Error response formats
- Usage examples
- This file can be fed into Cursor for the frontend project

## Implementation Details

### Files to Modify

- [`server.js`](server.js): Add new endpoints, enhance data structure, improve error handling

### Files to Create

- [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md): Comprehensive API documentation for frontend integration

### Data Structure Changes

The enhanced response will maintain backward compatibility by keeping the existing structure, but adding optional metadata fields:

```javascript
{
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00Z",
    "dataSource": "external_url",
    "totalSchools": 1234,
    "closedSchools": 45
  },
  "isdStatus": {
    "ISD Name": {
      "allClosed": true,
      "closedCount": 10,
      "totalCount": 10
    }
  },
  "closures": {
    // Existing structure maintained for backward compatibility
    "ISD Name": {
      "County Name": {
        "School Name": {
          "closed": true,
          "matchScore": 95,
          "originalStatus": "Closed",
          "lastChecked": "2024-01-15T10:30:00Z"
        }
      }
    }
  }
}
```

The existing `/api/closures` endpoint will return the enhanced structure, but the frontend can ignore new fields if not needed.

## Benefits

1. **Backward Compatible**: Existing frontend code continues to work
2. **Feature Rich**: New metadata enables features like "last updated" timestamps, confidence indicators
3. **Better UX**: ISD-level closures help users quickly see if entire districts are closed
4. **Developer Friendly**: Comprehensive documentation helps frontend development
5. **More Flexible**: Multiple endpoints allow frontend to fetch only needed data
6. **Production Ready**: Better error handling and health checks improve reliability