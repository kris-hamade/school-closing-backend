# School Closing Backend API Documentation

This document provides comprehensive documentation for the School Closing Backend API. This API serves school closure information for Michigan schools, organized by Intermediate School District (ISD), County, and School.

## Base URL

The API base URL depends on your deployment:
- Development: `http://localhost:3023`
- Production: `https://your-production-domain.com`

All endpoints are prefixed with `/api`.

## Authentication

Currently, no authentication is required for API access. All endpoints are publicly accessible.

## Response Format

All successful responses return JSON. Error responses follow a consistent structure:

```json
{
  "error": {
    "status": 404,
    "message": "ISD not found",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "details": {
      "isdName": "Example ISD"
    }
  }
}
```

## Caching

All endpoints support HTTP caching:
- **ETag**: Responses include an ETag header for conditional requests
- **Cache-Control**: Responses include `Cache-Control: public, max-age=60` (60 seconds)
- **Last-Modified**: Responses include the last update timestamp

To use conditional requests, include the `If-None-Match` header with the ETag value from a previous response. If the data hasn't changed, you'll receive a `304 Not Modified` response.

## Endpoints

### 1. Health Check

Check the health status of the API and data freshness.

**Endpoint:** `GET /api/health`

**Response Codes:**
- `200 OK`: Service is healthy and data is current
- `503 Service Unavailable`: Service is degraded (data fetch error occurred)

**Response Body:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "data": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "hasError": false,
    "error": null
  }
}
```

**Example Request:**
```bash
curl http://localhost:3023/api/health
```

**Example Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "data": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "hasError": false,
    "error": null
  }
}
```

**Example Response (Degraded):**
```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.5,
  "data": {
    "lastUpdated": "2024-01-15T10:25:00.000Z",
    "hasError": true,
    "error": "HTTP 500: Failed to fetch closure data"
  }
}
```

---

### 2. Get All Closures

Retrieve complete closure data for all schools. This is the main endpoint and maintains backward compatibility with the original structure while adding enhanced metadata.

**Endpoint:** `GET /api/closures`

**Response Codes:**
- `200 OK`: Success
- `304 Not Modified`: Data unchanged (when using If-None-Match header)
- `500 Internal Server Error`: Server error

**Response Body Structure:**
```json
{
  "closures": {
    "ISD Name": {
      "County Name": {
        "School Name": {
          "closed": true,
          "matchScore": 95,
          "originalStatus": "Closed",
          "lastChecked": "2024-01-15T10:30:00.000Z",
          "firstSeen": "2024-01-15T08:00:00.000Z",
          "lastStatusChange": "2024-01-15T10:30:00.000Z"
        }
      }
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "dataSource": "https://example.com/closures",
    "totalSchools": 1234,
    "closedSchools": 45,
    "fetchError": null,
    "pullHistory": [
      {
        "timestamp": "2024-01-15T10:30:00.000Z",
        "success": true,
        "error": null,
        "totalSchools": 1234,
        "closedSchools": 45
      }
    ]
  },
  "isdStatus": {
    "ISD Name": {
      "allClosed": false,
      "closedCount": 5,
      "totalCount": 20
    }
  }
}
```

**Field Descriptions:**
- `closures`: Nested object structure (ISD > County > School) containing closure information
  - `closed`: Boolean indicating if the school is closed
  - `matchScore`: Fuzzy match score (0-100) indicating confidence in the match, or `null` if no match found
  - `originalStatus`: Original closure status text from the source, or `null` if no match found
  - `lastChecked`: ISO 8601 timestamp of when this school's status was last checked
  - `firstSeen`: ISO 8601 timestamp of when this school was first detected in the system
  - `lastStatusChange`: ISO 8601 timestamp of when this school's status last changed (open ↔ closed), or `null` if status has never changed
- `metadata`: Overall data metadata
  - `lastUpdated`: ISO 8601 timestamp of the last successful data fetch
  - `dataSource`: URL of the data source
  - `totalSchools`: Total number of schools in the dataset
  - `closedSchools`: Number of schools currently closed
  - `fetchError`: Error message if last fetch failed, or `null` if successful
  - `pullHistory`: Array of pull history entries (last 100 entries kept in memory)
    - `timestamp`: ISO 8601 timestamp of when the pull occurred
    - `success`: Boolean indicating if the pull was successful
    - `error`: Error message if pull failed, or `null` if successful
    - `totalSchools`: Total number of schools at the time of this pull
    - `closedSchools`: Number of closed schools at the time of this pull
- `isdStatus`: ISD-level closure statistics
  - `allClosed`: Boolean indicating if all schools in the ISD are closed
  - `closedCount`: Number of closed schools in the ISD
  - `totalCount`: Total number of schools in the ISD

**Example Request:**
```bash
curl http://localhost:3023/api/closures
```

**Example Response:**
```json
{
  "closures": {
    "Kent Intermediate School District": {
      "Kent County": {
        "Grand Rapids Public Schools": {
          "closed": true,
          "matchScore": 95,
          "originalStatus": "Closed",
          "lastChecked": "2024-01-15T10:30:00.000Z"
        },
        "Forest Hills Public Schools": {
          "closed": false,
          "matchScore": null,
          "originalStatus": null,
          "lastChecked": "2024-01-15T10:30:00.000Z"
        }
      }
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "dataSource": "https://example.com/closures",
    "totalSchools": 1234,
    "closedSchools": 45,
    "fetchError": null
  },
  "isdStatus": {
    "Kent Intermediate School District": {
      "allClosed": false,
      "closedCount": 5,
      "totalCount": 20
    }
  }
}
```

**Backward Compatibility:**
The frontend can access the original structure via `response.closures`, which maintains the same nested structure as before. New fields are additive and can be ignored if not needed.

---

### 3. Get Closures by ISD

Retrieve closure data for a specific Intermediate School District.

**Endpoint:** `GET /api/closures/isd/:isdName`

**Parameters:**
- `isdName` (path parameter, required): The name of the ISD (URL encoded)

**Response Codes:**
- `200 OK`: Success
- `404 Not Found`: ISD not found
- `500 Internal Server Error`: Server error

**Response Body:**
```json
{
  "isdName": "Kent Intermediate School District",
  "status": {
    "allClosed": false,
    "closedCount": 5,
    "totalCount": 20
  },
  "closures": {
    "Kent County": {
      "Grand Rapids Public Schools": {
        "closed": true,
        "matchScore": 95,
        "originalStatus": "Closed",
        "lastChecked": "2024-01-15T10:30:00.000Z"
      }
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**
```bash
curl "http://localhost:3023/api/closures/isd/Kent%20Intermediate%20School%20District"
```

**Example Response:**
```json
{
  "isdName": "Kent Intermediate School District",
  "status": {
    "allClosed": false,
    "closedCount": 5,
    "totalCount": 20
  },
  "closures": {
    "Kent County": {
      "Grand Rapids Public Schools": {
        "closed": true,
        "matchScore": 95,
        "originalStatus": "Closed",
        "lastChecked": "2024-01-15T10:30:00.000Z"
      },
      "Forest Hills Public Schools": {
        "closed": false,
        "matchScore": null,
        "originalStatus": null,
        "lastChecked": "2024-01-15T10:30:00.000Z"
      }
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Error Response:**
```json
{
  "error": {
    "status": 404,
    "message": "ISD not found",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "details": {
      "isdName": "Non-existent ISD"
    }
  }
}
```

---

### 4. Search Schools

Search for schools by name (case-insensitive partial match).

**Endpoint:** `GET /api/closures/school/:schoolName`

**Parameters:**
- `schoolName` (path parameter, required): The school name to search for (URL encoded)

**Response Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Server error

**Response Body:**
```json
{
  "query": "Grand Rapids",
  "results": [
    {
      "school": "Grand Rapids Public Schools",
      "isd": "Kent Intermediate School District",
      "county": "Kent County",
      "closed": true,
      "matchScore": 95,
      "originalStatus": "Closed",
      "lastChecked": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1,
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**
```bash
curl "http://localhost:3023/api/closures/school/Grand%20Rapids"
```

**Example Response:**
```json
{
  "query": "Grand Rapids",
  "results": [
    {
      "school": "Grand Rapids Public Schools",
      "isd": "Kent Intermediate School District",
      "county": "Kent County",
      "closed": true,
      "matchScore": 95,
      "originalStatus": "Closed",
      "lastChecked": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1,
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Note:** The search performs a case-insensitive partial match. Searching for "rapids" would also match "Grand Rapids Public Schools".

---

### 5. Get Summary Statistics

Retrieve summary statistics about school closures across all ISDs.

**Endpoint:** `GET /api/closures/summary`

**Response Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Server error

**Response Body:**
```json
{
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "dataSource": "https://example.com/closures",
    "totalSchools": 1234,
    "closedSchools": 45,
    "fetchError": null
  },
  "isdStatus": {
    "Kent Intermediate School District": {
      "allClosed": false,
      "closedCount": 5,
      "totalCount": 20
    },
    "Oakland Schools": {
      "allClosed": true,
      "closedCount": 15,
      "totalCount": 15
    }
  },
  "statistics": {
    "totalISDs": 56,
    "isdsFullyClosed": 2,
    "isdsPartiallyClosed": 8,
    "isdsFullyOpen": 46
  }
}
```

**Field Descriptions:**
- `metadata`: Same as in the main closures endpoint
- `isdStatus`: Complete ISD status for all ISDs
- `statistics`: Aggregated statistics
  - `totalISDs`: Total number of ISDs in the dataset
  - `isdsFullyClosed`: Number of ISDs where all schools are closed
  - `isdsPartiallyClosed`: Number of ISDs where some (but not all) schools are closed
  - `isdsFullyOpen`: Number of ISDs where no schools are closed

**Example Request:**
```bash
curl http://localhost:3023/api/closures/summary
```

**Example Response:**
```json
{
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "dataSource": "https://example.com/closures",
    "totalSchools": 1234,
    "closedSchools": 45,
    "fetchError": null
  },
  "isdStatus": {
    "Kent Intermediate School District": {
      "allClosed": false,
      "closedCount": 5,
      "totalCount": 20
    },
    "Oakland Schools": {
      "allClosed": true,
      "closedCount": 15,
      "totalCount": 15
    }
  },
  "statistics": {
    "totalISDs": 56,
    "isdsFullyClosed": 2,
    "isdsPartiallyClosed": 8,
    "isdsFullyOpen": 46
  }
}
```

---

### 6. Get ISD Status Only

Retrieve only ISD-level closure status without individual school details. Useful for quick overviews.

**Endpoint:** `GET /api/closures/isd-status`

**Response Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Server error

**Response Body:**
```json
{
  "isdStatus": {
    "Kent Intermediate School District": {
      "allClosed": false,
      "closedCount": 5,
      "totalCount": 20
    },
    "Oakland Schools": {
      "allClosed": true,
      "closedCount": 15,
      "totalCount": 15
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**
```bash
curl http://localhost:3023/api/closures/isd-status
```

**Example Response:**
```json
{
  "isdStatus": {
    "Kent Intermediate School District": {
      "allClosed": false,
      "closedCount": 5,
      "totalCount": 20
    },
    "Oakland Schools": {
      "allClosed": true,
      "closedCount": 15,
      "totalCount": 15
    },
    "Wayne County Regional Educational Service Agency": {
      "allClosed": false,
      "closedCount": 0,
      "totalCount": 30
    }
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 7. Get Pull History

Retrieve the history of data pulls from the closure website.

**Endpoint:** `GET /api/closures/pull-history`

**Query Parameters:**
- `limit` (optional): Number of recent pulls to return (default: 50, max: 100)

**Response Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Server error

**Response Body:**
```json
{
  "pullHistory": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "success": true,
      "error": null,
      "totalSchools": 1234,
      "closedSchools": 45
    },
    {
      "timestamp": "2024-01-15T10:27:30.000Z",
      "success": true,
      "error": null,
      "totalSchools": 1234,
      "closedSchools": 44
    }
  ],
  "totalPulls": 150,
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Field Descriptions:**
- `pullHistory`: Array of pull history entries, ordered from oldest to newest
  - `timestamp`: ISO 8601 timestamp of when the pull occurred
  - `success`: Boolean indicating if the pull was successful
  - `error`: Error message if pull failed, or `null` if successful
  - `totalSchools`: Total number of schools at the time of this pull
  - `closedSchools`: Number of closed schools at the time of this pull
- `totalPulls`: Total number of pulls recorded (may be more than returned if limit is used)
- `metadata`: Metadata about the current data state

**Example Request:**
```bash
curl "http://localhost:3023/api/closures/pull-history?limit=20"
```

**Note:** The system keeps the last 100 pull history entries in memory. Older entries are automatically removed to prevent memory bloat.

---

### 8. Get Change History

Retrieve the history of changes to schools (status changes, additions, removals).

**Endpoint:** `GET /api/closures/change-history`

**Query Parameters:**
- `limit` (optional): Number of recent changes to return per type (default: 100, max: 1000)
- `type` (optional): Filter by change type - `status`, `added`, `removed`, or omit for all types

**Response Codes:**
- `200 OK`: Success
- `500 Internal Server Error`: Server error

**Response Body (all types):**
```json
{
  "statusChanges": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "isd": "Kent Intermediate School District",
      "county": "Kent County",
      "school": "Grand Rapids Public Schools",
      "from": "open",
      "to": "closed"
    }
  ],
  "schoolsAdded": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "isd": "Kent Intermediate School District",
      "county": "Kent County",
      "school": "New School District"
    }
  ],
  "schoolsRemoved": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "isd": "Kent Intermediate School District",
      "county": "Kent County",
      "school": "Old School District"
    }
  ],
  "counts": {
    "totalStatusChanges": 45,
    "totalSchoolsAdded": 2,
    "totalSchoolsRemoved": 1
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response Body (filtered by type):**
```json
{
  "statusChanges": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "isd": "Kent Intermediate School District",
      "county": "Kent County",
      "school": "Grand Rapids Public Schools",
      "from": "open",
      "to": "closed"
    }
  ],
  "counts": {
    "totalStatusChanges": 45,
    "totalSchoolsAdded": 2,
    "totalSchoolsRemoved": 1
  },
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z"
  }
}
```

**Field Descriptions:**
- `statusChanges`: Array of status change events (open ↔ closed)
  - `timestamp`: ISO 8601 timestamp of when the change occurred
  - `isd`: Intermediate School District name
  - `county`: County name
  - `school`: School name
  - `from`: Previous status (`"open"` or `"closed"`)
  - `to`: New status (`"open"` or `"closed"`)
- `schoolsAdded`: Array of schools that were first detected
  - `timestamp`: ISO 8601 timestamp of when the school was added
  - `isd`: Intermediate School District name
  - `county`: County name
  - `school`: School name
- `schoolsRemoved`: Array of schools that were removed from the dataset
  - `timestamp`: ISO 8601 timestamp of when the school was removed
  - `isd`: Intermediate School District name
  - `county`: County name
  - `school`: School name
- `counts`: Total counts of all change events (regardless of limit)
- `metadata`: Metadata about the current data state

**Example Requests:**
```bash
# Get all change types
curl "http://localhost:3023/api/closures/change-history?limit=50"

# Get only status changes
curl "http://localhost:3023/api/closures/change-history?type=status&limit=20"

# Get only added schools
curl "http://localhost:3023/api/closures/change-history?type=added"

# Get only removed schools
curl "http://localhost:3023/api/closures/change-history?type=removed"
```

**Note:** The system keeps the last 1000 change events of each type in memory. Older entries are automatically removed to prevent memory bloat.

---

## Data Update Frequency

The backend fetches new closure data from the external source every **2.5 minutes** (150 seconds). The data is cached in memory between fetches, so all API requests return the most recent cached data.

## Error Handling

### Common Error Scenarios

1. **Data Source Unavailable**: If the external data source is unavailable, the API will:
   - Return the last successfully fetched data
   - Set `metadata.fetchError` with the error message
   - Continue serving cached data (graceful degradation)

2. **ISD Not Found**: When querying a specific ISD that doesn't exist:
   - Returns `404 Not Found` with error details

3. **Server Errors**: Internal server errors return `500 Internal Server Error` with error details

### Error Response Format

All errors follow this structure:
```json
{
  "error": {
    "status": 404,
    "message": "Descriptive error message",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "details": {
      // Optional additional error details
    }
  }
}
```

## Usage Examples

### JavaScript/TypeScript (Fetch API)

```javascript
// Get all closures
async function getAllClosures() {
  const response = await fetch('http://localhost:3023/api/closures');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data;
}

// Get specific ISD
async function getISDClosures(isdName) {
  const encodedName = encodeURIComponent(isdName);
  const response = await fetch(`http://localhost:3023/api/closures/isd/${encodedName}`);
  if (response.status === 404) {
    const error = await response.json();
    throw new Error(error.error.message);
  }
  return await response.json();
}

// Search for school
async function searchSchool(schoolName) {
  const encodedName = encodeURIComponent(schoolName);
  const response = await fetch(`http://localhost:3023/api/closures/school/${encodedName}`);
  return await response.json();
}

// Get summary
async function getSummary() {
  const response = await fetch('http://localhost:3023/api/closures/summary');
  return await response.json();
}
```

### Using Conditional Requests (ETag)

```javascript
// First request
const response1 = await fetch('http://localhost:3023/api/closures');
const etag = response1.headers.get('ETag');
const data1 = await response1.json();

// Subsequent request with ETag
const response2 = await fetch('http://localhost:3023/api/closures', {
  headers: {
    'If-None-Match': etag
  }
});

if (response2.status === 304) {
  // Data hasn't changed, use cached data
  console.log('Data unchanged');
} else {
  // Data has changed
  const data2 = await response2.json();
  console.log('New data received');
}
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';

function useSchoolClosures() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:3023/api/closures');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // Optionally set up polling
    const interval = setInterval(fetchData, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}
```

## Data Structure Reference

### School Object
```typescript
interface School {
  closed: boolean;
  matchScore: number | null;  // 0-100, or null if no match
  originalStatus: string | null;  // Original status text, or null
  lastChecked: string;  // ISO 8601 timestamp
  firstSeen: string;  // ISO 8601 timestamp of when school was first detected
  lastStatusChange: string | null;  // ISO 8601 timestamp of last status change, or null
}
```

### ISD Status Object
```typescript
interface ISDStatus {
  allClosed: boolean;
  closedCount: number;
  totalCount: number;
}
```

### Metadata Object
```typescript
interface Metadata {
  lastUpdated: string;  // ISO 8601 timestamp
  dataSource: string;  // URL of data source
  totalSchools: number;
  closedSchools: number;
  fetchError: string | null;  // Error message or null
  pullHistory: PullHistoryEntry[];  // Array of pull history entries
}

interface PullHistoryEntry {
  timestamp: string;  // ISO 8601 timestamp
  success: boolean;
  error: string | null;
  totalSchools: number;
  closedSchools: number;
}
```

### Change History Objects
```typescript
interface StatusChange {
  timestamp: string;  // ISO 8601 timestamp
  isd: string;
  county: string;
  school: string;
  from: 'open' | 'closed';
  to: 'open' | 'closed';
}

interface SchoolChange {
  timestamp: string;  // ISO 8601 timestamp
  isd: string;
  county: string;
  school: string;
}
```

## Notes for Frontend Development

1. **Backward Compatibility**: The main `/api/closures` endpoint maintains the original structure in `response.closures`. New fields are additive and can be safely ignored.

2. **Caching**: All endpoints support HTTP caching. Implement ETag-based conditional requests to reduce bandwidth and improve performance.

3. **Error Handling**: Always check response status codes and handle errors gracefully. The API provides structured error responses.

4. **Data Freshness**: Check `metadata.lastUpdated` to display when data was last refreshed. The `metadata.fetchError` field indicates if there was an issue fetching the latest data. Use `metadata.pullHistory` to show a history of data pulls.

5. **Change Tracking**: Use the `/api/closures/change-history` endpoint to monitor when schools change status, are added, or are removed. The `firstSeen` and `lastStatusChange` fields on each school object provide per-school change tracking.

5. **ISD-Level Closures**: Use the `isdStatus` object to quickly identify ISDs where all schools are closed (`allClosed: true`), which can improve UX by showing district-wide closures prominently.

6. **Search Functionality**: The search endpoint performs partial, case-insensitive matching. Consider implementing debouncing for search inputs.

7. **Performance**: For large datasets, consider using the more specific endpoints (`/api/closures/isd/:isdName` or `/api/closures/isd-status`) instead of fetching all data when you only need a subset.

## Support

For issues or questions about the API, please refer to the main project repository or contact the development team.

