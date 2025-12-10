const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const fuzzball = require('fuzzball');

const url = process.env.CLOSING_DATA_1 || 'https://www.wxyz.com/weather/school-closings-delays';
const matchThreshold = 85;

const normalizeSchoolName = (name) => {
    return name.toLowerCase()
        .replace(/\b(school district|schools|school|public schools|public school district|community schools|area schools|consolidated schools?|intermediate school district)\b/gi, '')
        .replace(/\b(district|no\.?\s*\d+)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

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

const hasMeaningfulOverlap = (sourceName, targetName) => {
    const sourceNormalized = normalizeSchoolName(sourceName);
    const targetNormalized = normalizeSchoolName(targetName);
    
    // Check if school types conflict (e.g., "Public Schools" vs "Christian")
    const sourceType = getSchoolType(sourceName);
    const targetType = getSchoolType(targetName);
    
    // If both have types and they're different, it's likely a false match
    if (sourceType && targetType && sourceType !== targetType) {
        // Exception: if normalized names are very similar and one is just "public" vs no type
        // But if one is clearly a different type (christian, catholic, etc.), reject
        const conflictingTypes = ['christian', 'catholic', 'lutheran', 'charter', 'private', 'montessori', 'academy'];
        const sourceHasConflicting = conflictingTypes.some(t => sourceType.includes(t));
        const targetHasConflicting = conflictingTypes.some(t => targetType.includes(t));
        
        if (sourceHasConflicting || targetHasConflicting) {
            // One is a specific type, require very high similarity to override
            if (fuzzball.ratio(sourceNormalized, targetNormalized) < 95) {
                return false;
            }
        }
    }
    
    // If normalized names are too short, be very strict
    if (sourceNormalized.length < 5 || targetNormalized.length < 5) {
        // For very short names, require exact match or very high similarity
        return sourceNormalized === targetNormalized || 
               fuzzball.ratio(sourceNormalized, targetNormalized) >= 95;
    }
    
    // Check word overlap in normalized names
    const sourceWords = sourceNormalized.split(/\s+/).filter(w => w.length > 2);
    const targetWords = targetNormalized.split(/\s+/).filter(w => w.length > 2);
    
    if (sourceWords.length === 0 || targetWords.length === 0) {
        // If no meaningful words after normalization, require very high similarity
        return fuzzball.ratio(sourceNormalized, targetNormalized) >= 90;
    }
    
    // Count matching words (must be significant words, not just "community", "area", etc.)
    const commonWords = new Set(['community', 'area', 'public', 'school', 'district', 'city', 'township', 'county']);
    const sourceSignificant = sourceWords.filter(w => !commonWords.has(w));
    const targetSignificant = targetWords.filter(w => !commonWords.has(w));
    
    // If no significant words, fall back to full string similarity
    if (sourceSignificant.length === 0 || targetSignificant.length === 0) {
        return fuzzball.ratio(sourceNormalized, targetNormalized) >= 85;
    }
    
    // Count matching significant words
    const matchingWords = sourceSignificant.filter(w => targetSignificant.includes(w));
    
    // Require at least one matching significant word AND good overall similarity
    const hasMatchingWord = matchingWords.length > 0;
    const overallSimilarity = fuzzball.ratio(sourceNormalized, targetNormalized);
    
    // Both conditions must be true: matching word AND high similarity
    return hasMatchingWord && overallSimilarity >= 70;
};

const getBestMatchScore = (sourceName, targetName) => {
    // First, try matching on normalized names (without common suffixes)
    const sourceNormalized = normalizeSchoolName(sourceName);
    const targetNormalized = normalizeSchoolName(targetName);
    
    // Get scores on normalized names
    const normalizedRatio = fuzzball.ratio(sourceNormalized, targetNormalized);
    const normalizedPartial = fuzzball.partial_ratio(sourceNormalized, targetNormalized);
    const normalizedToken = fuzzball.token_sort_ratio(sourceNormalized, targetNormalized);
    const normalizedScore = Math.max(normalizedRatio, normalizedPartial, normalizedToken);
    
    // Also get scores on full names (for cases where full name is important)
    const sourceLower = sourceName.toLowerCase();
    const targetLower = targetName.toLowerCase();
    const fullRatio = fuzzball.ratio(sourceLower, targetLower);
    
    // Use the better of normalized or full match, but prefer normalized
    // If normalized score is good (>= 80), use it
    // Otherwise, use full ratio but be more conservative
    if (normalizedScore >= 80) {
        return normalizedScore;
    } else if (fullRatio >= 90) {
        // Full name match is very good, use it
        return fullRatio;
    } else {
        // Neither is great, return the better one but cap it
        return Math.min(Math.max(normalizedScore, fullRatio), 89);
    }
};

(async () => {
    const response = await axios.get(url, { timeout: 10000 });
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
    let goodMatches = [];
    let questionableMatches = [];

    for (let isd in michiganData.Michigan) {
        for (let county in michiganData.Michigan[isd]) {
            for (const school of michiganData.Michigan[isd][county]) {
                let bestMatch = null;
                let bestScore = 0;

                for (const closure of schoolClosures) {
                    const score = getBestMatchScore(closure.schoolName, school);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = closure.schoolName;
                    }
                }

                if (bestScore >= matchThreshold && hasMeaningfulOverlap(bestMatch, school)) {
                    const normalizedSchool = normalizeSchoolName(school);
                    const normalizedMatch = normalizeSchoolName(bestMatch);
                    const match = {
                        school,
                        match: bestMatch,
                        score: bestScore,
                        normalizedSchool,
                        normalizedMatch,
                        isd,
                        county
                    };
                    
                    // Flag potentially questionable matches (score between 85-90)
                    if (bestScore < 90) {
                        questionableMatches.push(match);
                    } else {
                        goodMatches.push(match);
                    }
                }
            }
        }
    }

    console.log(`✅ HIGH CONFIDENCE MATCHES (score >= 90): ${goodMatches.length}`);
    console.log(`⚠️  QUESTIONABLE MATCHES (score 85-89): ${questionableMatches.length}\n`);
    
    console.log('Sample of HIGH CONFIDENCE matches:\n');
    goodMatches.slice(0, 15).forEach(m => {
        console.log(`  "${m.school}"`);
        console.log(`  ↔ "${m.match}"`);
        console.log(`  Score: ${m.score.toFixed(1)}% | Normalized: "${m.normalizedSchool}" ↔ "${m.normalizedMatch}"`);
        console.log(`  ISD: ${m.isd}\n`);
    });
    
    if (questionableMatches.length > 0) {
        console.log('\n⚠️  QUESTIONABLE MATCHES (review these):\n');
        questionableMatches.slice(0, 15).forEach(m => {
            console.log(`  "${m.school}"`);
            console.log(`  ↔ "${m.match}"`);
            console.log(`  Score: ${m.score.toFixed(1)}% | Normalized: "${m.normalizedSchool}" ↔ "${m.normalizedMatch}"`);
            console.log(`  ISD: ${m.isd}\n`);
        });
    }
})();

