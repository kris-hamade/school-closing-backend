const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const fuzzball = require('fuzzball');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

dotenv.config();

// CORS Configuration
const allowedOrigins = ['http://localhost:5173', 'https://misnowday.com'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET'],
    optionsSuccessStatus: 204
}));

// Use process.env.PORT and process.env.HOST to set the port and host from environment variables
const PORT = process.env.PORT || 3023;
const HOST = process.env.HOST || '0.0.0.0'; // Default to '0.0.0.0' (all interfaces)

app.listen(PORT, HOST, () => {
    console.log(`Server listening on port ${PORT}`);
});

const url = process.env.CLOSING_DATA_1;

// Store enhanced closure data with metadata
let closureData = {
    closures: {},
    metadata: {
        lastUpdated: null,
        dataSource: url || 'unknown',
        totalSchools: 0,
        closedSchools: 0,
        fetchError: null
    },
    isdStatus: {}
};

const fetchClosures = async () => {
    console.log("Fetching closures data...");
    const fetchStartTime = new Date();
    
    try {
        if (!url) {
            throw new Error('CLOSING_DATA_1 environment variable is not set');
        }

        const response = await axios.get(url, {
            timeout: 10000, // 10 second timeout
            validateStatus: (status) => status < 500 // Accept any status < 500
        });

        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: Failed to fetch closure data`);
        }

        const html = response.data;
        const $ = cheerio.load(html);
        let schoolClosures = [];

        $('.closing').each((i, elem) => {
            const schoolName = $(elem).find('.text--primary.js-sort-value').text().trim();
            const closureStatus = $(elem).find('.text--secondary').first().text().trim();
            if (closureStatus.includes('Closed')) {
                schoolClosures.push({ schoolName, closureStatus });
            }
        });

        const michiganData = JSON.parse(fs.readFileSync('states/michigan.json', 'utf8'));
        const matchThreshold = 85; // Lowered from 90 to catch more matches
        let closuresByISD = {};
        let totalSchools = 0;
        let closedSchools = 0;
        let isdStats = {};

        // Helper function to normalize school names by removing common suffixes
        const normalizeSchoolName = (name) => {
            return name.toLowerCase()
                .replace(/\b(school district|schools|school|public schools|public school district|community schools|area schools|consolidated schools?|intermediate school district)\b/gi, '')
                .replace(/\b(district|no\.?\s*\d+)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        // Helper function to extract school type indicators
        const getSchoolType = (name) => {
            const lower = name.toLowerCase();
            const types = [];
            if (lower.includes('christian')) types.push('christian');
            if (lower.includes('catholic')) types.push('catholic');
            if (lower.includes('lutheran')) types.push('lutheran');
            if (lower.includes('public')) types.push('public');
            if (lower.includes('charter')) types.push('charter');
            if (lower.includes('private')) types.push('private');
            if (lower.includes('montessori')) types.push('montessori');
            if (lower.includes('academy') || lower.includes('acdmy')) types.push('academy');
            return types.sort().join(',');
        };

        // Helper function to check if core school names have meaningful overlap
        const hasMeaningfulOverlap = (sourceName, targetName) => {
            const sourceNormalized = normalizeSchoolName(sourceName);
            const targetNormalized = normalizeSchoolName(targetName);

            // Type conflict check: block clear differences unless names are extremely similar
            const sourceType = getSchoolType(sourceName);
            const targetType = getSchoolType(targetName);
            if (sourceType && targetType && sourceType !== targetType) {
                const conflictingTypes = ['christian', 'catholic', 'lutheran', 'charter', 'private', 'montessori', 'academy'];
                const sourceHasConflicting = conflictingTypes.some(t => sourceType.includes(t));
                const targetHasConflicting = conflictingTypes.some(t => targetType.includes(t));
                if (sourceHasConflicting || targetHasConflicting) {
                    // Allow only if names are almost identical
                    if (fuzzball.ratio(sourceNormalized, targetNormalized) < 90) {
                        return false;
                    }
                }
            }

            const normalizedRatio = fuzzball.ratio(sourceNormalized, targetNormalized);

            // For short normalized names, require very high similarity
            if (sourceNormalized.length < 5 || targetNormalized.length < 5) {
                return sourceNormalized === targetNormalized || normalizedRatio >= 90;
            }

            // Word overlap on significant tokens
            const sourceWords = sourceNormalized.split(/\s+/).filter(w => w.length > 2);
            const targetWords = targetNormalized.split(/\s+/).filter(w => w.length > 2);
            const commonWords = new Set([
                'community',
                'area',
                'public',
                'school',
                'district',
                'city',
                'township',
                'county',
                // generic type words that shouldn’t drive a match
                'christian',
                'catholic',
                'lutheran',
                'charter',
                'private',
                'montessori',
                'academy'
            ]);
            const sourceSig = sourceWords.filter(w => !commonWords.has(w));
            const targetSig = targetWords.filter(w => !commonWords.has(w));

            // If no significant words, rely on similarity
            if (sourceSig.length === 0 || targetSig.length === 0) {
                return normalizedRatio >= 95; // almost identical if only generic words
            }

            const hasMatch = sourceSig.some(w => targetSig.includes(w));
            // Require at least one location/significant word match and reasonable similarity
            return hasMatch && normalizedRatio >= 82;
        };

        // Helper function to get best match score using normalized names
        const getBestMatchScore = (sourceName, targetName) => {
            const sourceNormalized = normalizeSchoolName(sourceName);
            const targetNormalized = normalizeSchoolName(targetName);

            const normalizedScore = Math.max(
                fuzzball.ratio(sourceNormalized, targetNormalized),
                fuzzball.partial_ratio(sourceNormalized, targetNormalized),
                fuzzball.token_sort_ratio(sourceNormalized, targetNormalized)
            );

            const fullScore = fuzzball.ratio(sourceName.toLowerCase(), targetName.toLowerCase());

            // Prefer normalized; if full name is clearly better, use it
            return Math.max(normalizedScore, fullScore);
        };

        // Iterate over each school in your .json file
        for (let isd in michiganData.Michigan) {
            if (!isdStats[isd]) {
                isdStats[isd] = { totalCount: 0, closedCount: 0 };
            }

            for (let county in michiganData.Michigan[isd]) {
                for (const school of michiganData.Michigan[isd][county]) {
                    totalSchools++;
                    isdStats[isd].totalCount++;

                    if (!closuresByISD[isd]) closuresByISD[isd] = {};
                    if (!closuresByISD[isd][county]) closuresByISD[isd][county] = {};

                    // Check if the school matches with any in the closed schools list
                    let isClosed = false;
                    let matchScore = 0;
                    let originalStatus = null;
                    let matchedSourceName = null;

                    // Find the best match across all closures
                    for (const closure of schoolClosures) {
                        const score = getBestMatchScore(closure.schoolName, school);
                        // Require both threshold AND meaningful overlap
                        if (score > matchThreshold && score > matchScore && hasMeaningfulOverlap(closure.schoolName, school)) {
                            matchScore = score;
                            isClosed = closure.closureStatus.includes('Closed');
                            originalStatus = closure.closureStatus;
                            matchedSourceName = closure.schoolName;
                            // Don't break - continue to find the best match
                        }
                    }

                    // Only count once after finding the best match
                    if (isClosed) {
                        closedSchools++;
                        isdStats[isd].closedCount++;
                        // Only log matches that are actually closed to reduce noise
                        console.log(`Matched: "${school}" ↔ "${matchedSourceName}" in ${isd}, ${county} - Closed (Match score: ${matchScore.toFixed(1)}%)`);
                    }

                    closuresByISD[isd][county][school] = {
                        closed: isClosed,
                        matchScore: matchScore > 0 ? Math.round(matchScore) : null,
                        originalStatus: originalStatus,
                        matchedSourceName: matchedSourceName, // Add source name for debugging
                        lastChecked: fetchStartTime.toISOString()
                    };
                }
            }
        }

        // Calculate ISD-level closure status
        let isdStatus = {};
        for (let isd in isdStats) {
            const stats = isdStats[isd];
            isdStatus[isd] = {
                allClosed: stats.totalCount > 0 && stats.closedCount === stats.totalCount,
                closedCount: stats.closedCount,
                totalCount: stats.totalCount
            };
        }

        const fetchEndTime = new Date();
        
        // Update closure data with enhanced structure
        closureData = {
            closures: closuresByISD,
            metadata: {
                lastUpdated: fetchEndTime.toISOString(),
                dataSource: url,
                totalSchools: totalSchools,
                closedSchools: closedSchools,
                fetchError: null
            },
            isdStatus: isdStatus
        };

        console.log(`Successfully fetched closures. Total: ${totalSchools}, Closed: ${closedSchools}`);
        return closureData;
    } catch (error) {
        console.error('Error fetching closures:', error.message);
        
        // Preserve existing data but update metadata with error
        closureData.metadata.fetchError = error.message;
        closureData.metadata.lastUpdated = new Date().toISOString();
        
        // Return existing data structure even on error (graceful degradation)
        return closureData;
    }
};

// Helper function to generate ETag from data
const generateETag = (data) => {
    const dataString = JSON.stringify(data);
    return crypto.createHash('md5').update(dataString).digest('hex');
};

// Helper function to set caching headers
const setCacheHeaders = (res, data, maxAge = 60) => {
    const etag = generateETag(data);
    res.setHeader('ETag', `"${etag}"`);
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    res.setHeader('Last-Modified', closureData.metadata.lastUpdated || new Date().toISOString());
};

// Helper function to send structured error response
const sendError = (res, statusCode, message, details = null) => {
    const errorResponse = {
        error: {
            status: statusCode,
            message: message,
            timestamp: new Date().toISOString()
        }
    };
    if (details) {
        errorResponse.error.details = details;
    }
    res.status(statusCode).json(errorResponse);
};

// Fetch closures data initially
const initializeClosures = async () => {
    await fetchClosures();
    console.log("Closures initialized");
};

initializeClosures();

// Periodically check for updates
setInterval(async () => {
    await fetchClosures();
}, 250000); // Every 2 1/2 minutes

// Health check endpoint
app.get('/api/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        data: {
            lastUpdated: closureData.metadata.lastUpdated,
            hasError: closureData.metadata.fetchError !== null,
            error: closureData.metadata.fetchError
        }
    };
    
    const statusCode = closureData.metadata.fetchError ? 503 : 200;
    health.status = closureData.metadata.fetchError ? 'degraded' : 'healthy';
    
    setCacheHeaders(res, health, 30);
    res.status(statusCode).json(health);
});

// Main closures endpoint - returns enhanced structure (backward compatible)
app.get('/api/closures', (req, res) => {
    try {
        // Check for If-None-Match header for ETag validation
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch) {
            const currentETag = generateETag(closureData);
            if (ifNoneMatch === `"${currentETag}"`) {
                return res.status(304).end(); // Not Modified
            }
        }

        setCacheHeaders(res, closureData, 60);
        res.json(closureData);
    } catch (error) {
        console.error('Failed to get closure data:', error);
        sendError(res, 500, 'Internal Server Error', error.message);
    }
});

// Get closures for specific ISD
app.get('/api/closures/isd/:isdName', (req, res) => {
    try {
        const isdName = decodeURIComponent(req.params.isdName);
        
        if (!closureData.closures[isdName]) {
            return sendError(res, 404, 'ISD not found', { isdName: isdName });
        }

        const isdData = {
            isdName: isdName,
            status: closureData.isdStatus[isdName] || null,
            closures: closureData.closures[isdName],
            metadata: {
                lastUpdated: closureData.metadata.lastUpdated
            }
        };

        setCacheHeaders(res, isdData, 60);
        res.json(isdData);
    } catch (error) {
        console.error('Failed to get ISD closure data:', error);
        sendError(res, 500, 'Internal Server Error', error.message);
    }
});

// Search for specific school
app.get('/api/closures/school/:schoolName', (req, res) => {
    try {
        const searchName = decodeURIComponent(req.params.schoolName).toLowerCase();
        const results = [];

        for (let isd in closureData.closures) {
            for (let county in closureData.closures[isd]) {
                for (let school in closureData.closures[isd][county]) {
                    if (school.toLowerCase().includes(searchName)) {
                        results.push({
                            school: school,
                            isd: isd,
                            county: county,
                            ...closureData.closures[isd][county][school]
                        });
                    }
                }
            }
        }

        const response = {
            query: req.params.schoolName,
            results: results,
            count: results.length,
            metadata: {
                lastUpdated: closureData.metadata.lastUpdated
            }
        };

        setCacheHeaders(res, response, 60);
        res.json(response);
    } catch (error) {
        console.error('Failed to search schools:', error);
        sendError(res, 500, 'Internal Server Error', error.message);
    }
});

// Get summary statistics
app.get('/api/closures/summary', (req, res) => {
    try {
        const summary = {
            metadata: closureData.metadata,
            isdStatus: closureData.isdStatus,
            statistics: {
                totalISDs: Object.keys(closureData.isdStatus).length,
                isdsFullyClosed: Object.values(closureData.isdStatus).filter(isd => isd.allClosed).length,
                isdsPartiallyClosed: Object.values(closureData.isdStatus).filter(isd => !isd.allClosed && isd.closedCount > 0).length,
                isdsFullyOpen: Object.values(closureData.isdStatus).filter(isd => isd.closedCount === 0).length
            }
        };

        setCacheHeaders(res, summary, 60);
        res.json(summary);
    } catch (error) {
        console.error('Failed to get summary:', error);
        sendError(res, 500, 'Internal Server Error', error.message);
    }
});

// Get ISD-level closure status only
app.get('/api/closures/isd-status', (req, res) => {
    try {
        const response = {
            isdStatus: closureData.isdStatus,
            metadata: {
                lastUpdated: closureData.metadata.lastUpdated
            }
        };

        setCacheHeaders(res, response, 60);
        res.json(response);
    } catch (error) {
        console.error('Failed to get ISD status:', error);
        sendError(res, 500, 'Internal Server Error', error.message);
    }
});