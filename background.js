// Background script for PS Store Metacritic Extension
console.log('Background script loaded');

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
  }
});

// Function to fetch multiple games simultaneously
async function fetchMultipleScores(gameRequests) {
  console.log(`Background: Starting batch fetch for ${gameRequests.length} games`);
  
  const results = {};
  const tabPromises = [];
  
  // Create all tabs simultaneously
  for (const gameRequest of gameRequests) {
    const tabPromise = createTabAndFetchScore(gameRequest.gameUrl, gameRequest.parsedGameName);
    tabPromises.push(tabPromise);
  }
  
  // Wait for all tabs to complete
  const allResults = await Promise.allSettled(tabPromises);
  
  // Process results
  allResults.forEach((result, index) => {
    const gameRequest = gameRequests[index];
    if (result.status === 'fulfilled' && result.value) {
      results[gameRequest.parsedGameName] = result.value;
    } else {
      results[gameRequest.parsedGameName] = null;
      console.log(`Background: Failed to get scores for ${gameRequest.parsedGameName}`);
    }
  });
  
  console.log(`Background: Batch fetch completed. Got scores for ${Object.keys(results).filter(k => results[k]).length}/${gameRequests.length} games`);
  return results;
}

// Helper function to create a tab and fetch score
async function createTabAndFetchScore(metacriticUrl, parsedGameName) {
  let tab = null;
  try {
    console.log(`Background: Creating tab for ${parsedGameName}`);
    
    // Create a new tab in the background
    tab = await chrome.tabs.create({ 
      url: metacriticUrl, 
      active: false,
      pinned: true 
    });
    
    // Wait for the page to load completely
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    
    // Minimal wait for DOM to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
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
    await chrome.tabs.remove(tab.id);
    tab = null; // Mark as closed
    
    const scores = results[0]?.result;
    
    if (scores && scores.metaScore && scores.userScore) {
      console.log(`Background: Got scores for ${parsedGameName}: Meta: ${scores.metaScore}, User: ${scores.userScore}`);
      return scores;
    } else {
      console.log(`Background: No scores found for ${parsedGameName}`);
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
