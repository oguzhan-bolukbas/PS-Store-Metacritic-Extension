// Background script for PS Store Metacritic Extension
console.log('Background script loaded');

// Cache configuration
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_KEY = 'metacritic_scores_cache';

// Global pending requests tracker to prevent duplicate simultaneous fetches
const pendingRequests = new Map();

// Cache management functions
async function getCache() {
  try {
    const result = await chrome.storage.local.get([CACHE_KEY]);
    return result[CACHE_KEY] || {};
  } catch (error) {
    console.error('Error reading cache:', error);
    return {};
  }
}

async function setCache(cache) {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch (error) {
    console.error('Error writing cache:', error);
  }
}

function isCacheValid(cacheEntry) {
  if (!cacheEntry || !cacheEntry.timestamp) {
    console.log(`🔍 Cache validation: Entry invalid - missing entry or timestamp`, cacheEntry);
    return false;
  }
  const now = Date.now();
  const age = now - cacheEntry.timestamp;
  const isValid = age < CACHE_DURATION;
  const ageHours = Math.round(age / (1000 * 60 * 60) * 10) / 10;
  
  console.log(`🔍 Cache validation: age=${ageHours}h, limit=24h, valid=${isValid}`);
  return isValid;
}

async function cleanupCache() {
  try {
    const cache = await getCache();
    const cleanedCache = {};
    let removedCount = 0;
    
    for (const [gameName, entry] of Object.entries(cache)) {
      if (isCacheValid(entry)) {
        cleanedCache[gameName] = entry;
      } else {
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      await setCache(cleanedCache);
      console.log(`Background: Cleaned up ${removedCount} expired cache entries`);
    }
    
    return cleanedCache;
  } catch (error) {
    console.error('Error cleaning cache:', error);
    return {};
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchMetacriticScores') {
    fetchMetacriticScores(request.gameUrl, request.parsedGameName)
      .then(scores => sendResponse(scores))
      .catch(error => {
        console.error('Error in background script:', error);
        sendResponse(null);
      });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'fetchMultipleScores') {
    // New action for batch processing
    fetchMultipleScores(request.gameRequests)
      .then(results => sendResponse(results))
      .catch(error => {
        console.error('Error in batch background script:', error);
        sendResponse(null);
      });
    return true;
  } else if (request.action === 'clearCache') {
    // Optional: Clear cache manually
    chrome.storage.local.remove([CACHE_KEY])
      .then(() => {
        console.log('Background: Cache cleared');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error clearing cache:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === 'getCacheStats') {
    // Optional: Get cache statistics
    getCache()
      .then(cache => {
        const totalEntries = Object.keys(cache).length;
        const validEntries = Object.values(cache).filter(entry => isCacheValid(entry)).length;
        const expiredEntries = totalEntries - validEntries;
        
        sendResponse({
          totalEntries,
          validEntries,
          expiredEntries,
          cacheSize: JSON.stringify(cache).length
        });
      })
      .catch(error => {
        console.error('Error getting cache stats:', error);
        sendResponse(null);
      });
    return true;
  }
});

// Function to fetch multiple games simultaneously with caching
async function fetchMultipleScores(gameRequests) {
  console.log(`Background: Starting batch fetch for ${gameRequests.length} games`);
  
  const results = {};
  let cache = await cleanupCache(); // Clean expired entries first
  const gamesToFetch = [];
  let cacheHits = 0;
  
  console.log(`🗂️ Current cache contents:`, cache);
  console.log(`🗂️ Cache keys:`, Object.keys(cache));
  
  // Remove duplicates from gameRequests first
  const uniqueGameRequests = [];
  const seenGames = new Set();
  
  for (const gameRequest of gameRequests) {
    if (!seenGames.has(gameRequest.parsedGameName)) {
      uniqueGameRequests.push(gameRequest);
      seenGames.add(gameRequest.parsedGameName);
    } else {
      console.log(`Background: Skipping duplicate request for ${gameRequest.parsedGameName}`);
    }
  }
  
  console.log(`Background: Processing ${uniqueGameRequests.length} unique games (removed ${gameRequests.length - uniqueGameRequests.length} duplicates)`);
  
  // Group variants by base game name (remove numbers/roman numerals for grouping)
  const gameGroups = new Map();
  
  for (const gameRequest of uniqueGameRequests) {
    // Create a base name by removing common sequel patterns
    const baseName = gameRequest.parsedGameName
      .replace(/-(?:ii?i?|iv|v|vi?i?|ix|x|\d+)$/i, '') // Remove sequel suffixes
      .replace(/-(?:remastered|remake|redux|definitive|goty|collection)$/i, ''); // Remove edition suffixes
    
    if (!gameGroups.has(baseName)) {
      gameGroups.set(baseName, []);
    }
    gameGroups.get(baseName).push(gameRequest);
  }
  
  console.log(`🎮 Grouped ${uniqueGameRequests.length} requests into ${gameGroups.size} game groups`);
  
  // Process each group: check if any variant has cached data
  for (const [baseName, variants] of gameGroups) {
    console.log(`🎯 Processing group "${baseName}" with variants: [${variants.map(v => v.parsedGameName).join(', ')}]`);
    
    let foundCachedResult = null;
    let cachedVariantName = null;
    
    // First, check if any variant has valid cached data
    for (const variant of variants) {
      const cachedEntry = cache[variant.parsedGameName];
      console.log(`� Checking cache for ${variant.parsedGameName}:`, cachedEntry);
      
      if (isCacheValid(cachedEntry)) {
        foundCachedResult = {
          metaScore: cachedEntry.metaScore,
          userScore: cachedEntry.userScore
        };
        cachedVariantName = variant.parsedGameName;
        console.log(`� CACHE HIT: Found cached data for ${cachedVariantName}`);
        break;
      }
    }
    
    if (foundCachedResult) {
      // Apply cached result to ALL variants in this group
      for (const variant of variants) {
        results[variant.parsedGameName] = foundCachedResult;
        cacheHits++;
        console.log(`💾 CACHE HIT: Using cached scores from ${cachedVariantName} for ${variant.parsedGameName}: Meta: ${foundCachedResult.metaScore}, User: ${foundCachedResult.userScore}`);
      }
    } else {
      // No cached data found for any variant, need to fetch them
      console.log(`🚫 CACHE MISS: No cached data found for any variant of ${baseName}`);
      for (const variant of variants) {
        console.log(`   Need to fetch fresh data for ${variant.parsedGameName}`);
        gamesToFetch.push(variant);
      }
    }
  }
  
  console.log(`Background: Cache hits: ${cacheHits}/${uniqueGameRequests.length}, fetching ${gamesToFetch.length} games`);
  
  // Second pass: fetch games that need fresh data
  if (gamesToFetch.length > 0) {
    const tabPromises = [];
    
    // Create tabs for games that need fresh data, but check for pending requests first
    const actualGamesToFetch = [];
    
    for (const gameRequest of gamesToFetch) {
      if (pendingRequests.has(gameRequest.parsedGameName)) {
        // Wait for existing request
        console.log(`Background: Waiting for existing request for ${gameRequest.parsedGameName}`);
        try {
          const existingResult = await pendingRequests.get(gameRequest.parsedGameName);
          if (existingResult) {
            results[gameRequest.parsedGameName] = existingResult;
          }
        } catch (error) {
          console.error(`Background: Error waiting for existing request for ${gameRequest.parsedGameName}:`, error);
        }
      } else {
        // Create new request
        actualGamesToFetch.push(gameRequest);
        const tabPromise = createTabAndFetchScore(gameRequest.gameUrl, gameRequest.parsedGameName);
        pendingRequests.set(gameRequest.parsedGameName, tabPromise);
        tabPromises.push(tabPromise);
      }
    }
    
    console.log(`Background: Creating ${actualGamesToFetch.length} new tabs (${gamesToFetch.length - actualGamesToFetch.length} are already pending)`);
    
    if (tabPromises.length > 0) {
      // Wait for all new tabs to complete
      const allResults = await Promise.allSettled(tabPromises);
      
      // Process fresh results and update cache
      const updatedCache = { ...cache };
      
      allResults.forEach((result, index) => {
        const gameRequest = actualGamesToFetch[index];
        
        // Remove from pending requests
        pendingRequests.delete(gameRequest.parsedGameName);
        
        if (result.status === 'fulfilled' && result.value) {
          const scores = result.value;
          results[gameRequest.parsedGameName] = scores;
          
          // Update cache with fresh data
          updatedCache[gameRequest.parsedGameName] = {
            metaScore: scores.metaScore,
            userScore: scores.userScore,
            timestamp: Date.now()
          };
          
          console.log(`Background: Fetched and cached scores for ${gameRequest.parsedGameName}: Meta: ${scores.metaScore}, User: ${scores.userScore}`);
        } else {
          results[gameRequest.parsedGameName] = null;
          console.log(`Background: Failed to get scores for ${gameRequest.parsedGameName}`);
        }
      });
      
      // Save updated cache
      await setCache(updatedCache);
    }
  }
  
  const successCount = Object.keys(results).filter(k => results[k]).length;
  console.log(`Background: Batch fetch completed. Got scores for ${successCount}/${uniqueGameRequests.length} games (${cacheHits} from cache, ${successCount - cacheHits} fresh)`);
  
  // Add results for original duplicates
  const finalResults = {};
  for (const originalRequest of gameRequests) {
    finalResults[originalRequest.parsedGameName] = results[originalRequest.parsedGameName];
  }
  
  return finalResults;
}

// Helper function to create a tab and fetch score
async function createTabAndFetchScore(metacriticUrl, parsedGameName) {
  let tab = null;
  try {
    console.log(`Background: Creating tab for ${parsedGameName}`);
    console.log(`🌐 Opening URL: ${metacriticUrl}`);
    
    // Create a new tab in the background
    tab = await chrome.tabs.create({ 
      url: metacriticUrl, 
      active: false,
      pinned: true 
    });
    
    console.log(`📑 Tab ${tab.id} created for: ${metacriticUrl}`);
    
    // Wait for the page to load completely
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          console.log(`✅ Tab ${tab.id} finished loading: ${metacriticUrl}`);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    // Minimal wait for DOM to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`🔍 Executing score queries on tab ${tab.id} for: ${parsedGameName}`);
    
    // Execute the exact queries you specified in the tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Step 7: Get meta score using your exact query
        const metaScoreElement = document.querySelector('.c-productScoreInfo_scoreNumber span');
        const metaScore = metaScoreElement?.innerText || null;
        
        // Step 8: Get user score using your exact query  
        const userScoreElement = document.querySelector('.c-productScoreInfo_scoreNumber .c-siteReviewScore_background-user span');
        const userScore = userScoreElement?.innerText || null;
        
        return { metaScore, userScore };
      }
    });
    
    // Close the background tab immediately after getting the data
    console.log(`🗑️ Closing tab ${tab.id} for: ${metacriticUrl}`);
    await chrome.tabs.remove(tab.id);
    tab = null; // Mark as closed
    
    const scores = results[0]?.result;
    
    if (scores && scores.metaScore && scores.userScore) {
      console.log(`✅ SUCCESS: Got scores for ${parsedGameName} from ${metacriticUrl}: Meta: ${scores.metaScore}, User: ${scores.userScore}`);
      return scores;
    } else {
      console.log(`❌ NO SCORES: No scores found for ${parsedGameName} from ${metacriticUrl}`);
      console.log(`   Raw result:`, scores);
      return null;
    }
    
  } catch (error) {
    console.error(`Background: Error fetching scores for ${parsedGameName}:`, error);
    if (tab) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (closeError) {
        console.error('Error closing tab:', closeError);
      }
    }
    return null;
  }
}

// Function to fetch Metacritic scores using chrome.scripting (single game - for backward compatibility)
async function fetchMetacriticScores(metacriticUrl, parsedGameName) {
  // Use the batch function for single requests too
  const results = await fetchMultipleScores([{ gameUrl: metacriticUrl, parsedGameName: parsedGameName }]);
  return results[parsedGameName];
}
