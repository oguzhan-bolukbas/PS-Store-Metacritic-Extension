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
  }
});

// Function to fetch Metacritic scores using chrome.scripting
async function fetchMetacriticScores(metacriticUrl, parsedGameName) {
  try {
    console.log(`Background: Fetching live scores from ${metacriticUrl}`);
    
    // Create a new tab in the background to fetch scores
    const tab = await chrome.tabs.create({ 
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
    
    // Give extra time for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
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
          
          console.log(`Scraped scores - Meta: ${metaScore}, User: ${userScore}`);
          return { metaScore, userScore };
        }
      });
      
      // Close the background tab
      await chrome.tabs.remove(tab.id);
      
      const scores = results[0]?.result;
      
      if (scores && scores.metaScore && scores.userScore) {
        console.log(`Background: Successfully retrieved live scores for ${parsedGameName}:`, scores);
        return scores;
      } else {
        console.log(`Background: No scores found on ${metacriticUrl}`);
        return null;
      }
      
    } catch (scriptError) {
      console.error('Error executing script:', scriptError);
      await chrome.tabs.remove(tab.id);
      return null;
    }
    
  } catch (error) {
    console.error(`Background: Error fetching Metacritic scores:`, error);
    return null;
  }
}
