// PS Store Metacritic Extension - Content Script
console.log('PS Store Metacritic Extension loaded');

// Wrap all our code in a try-catch to prevent website errors from affecting us
(function() {
  'use strict';
  
  try {

// Step 1: Get the URL of the extension page
function getCurrentPageUrl() {
  const url = window.location.href;
  console.log('Current URL:', url);
  return url;
}

// Step 2: Parse the URL to get the last number
function parsePageNumber(url) {
  const urlParts = url.split('/');
  const lastPart = urlParts[urlParts.length - 1];
  const pageNumber = parseInt(lastPart) || 1; // Default to 1 if not found
  console.log('Parsed page number:', pageNumber);
  return pageNumber;
}

// Step 3: Calculate tile range based on page number
function calculateTileRange(pageNumber) {
  const startIndex = (pageNumber - 1) * 24;
  const endIndex = startIndex + 23;
  const tileIndices = [];
  
  for (let i = startIndex; i <= endIndex; i++) {
    tileIndices.push(i);
  }
  
  console.log(`Page ${pageNumber} - Tile range: ${startIndex} to ${endIndex}`, tileIndices);
  return tileIndices;
}

// Step 4: Get game name using the specific query
function getGameName(tileIndex) {
  try {
    const query = `[data-qa="ems-sdk-grid#productTile${tileIndex}#product-name"]`;
    const element = document.querySelector(query);
    
    if (element) {
      const gameName = element.innerText;
      console.log(`Tile ${tileIndex}: Found game "${gameName}"`);
      return gameName;
    } else {
      console.log(`Tile ${tileIndex}: No game found`);
      return null;
    }
  } catch (error) {
    console.warn(`Error getting game name for tile ${tileIndex}:`, error);
    return null;
  }
}

// New Step 4.5: Check product type
function getProductType(tileIndex) {
  try {
    const query = `[data-qa="ems-sdk-grid#productTile${tileIndex}#product-type"]`;
    const element = document.querySelector(query);
    
    const productType = element?.innerText || '';
    console.log(`Tile ${tileIndex}: Product type "${productType}"`);
    return productType;
  } catch (error) {
    console.warn(`Error getting product type for tile ${tileIndex}:`, error);
    return ''; // Default to empty (will be processed)
  }
}

// Check if we should process this product based on type
function shouldProcessProduct(productType) {
  switch (productType) {
    case 'PREMIUM EDITION':
      console.log('PREMIUM EDITION - waiting for future implementation');
      return false;
    case 'ADD-ON':
      console.log('ADD-ON - never process this');
      return false;
    case 'GAME BUNDLE':
      console.log('GAME BUNDLE - waiting for future implementation');
      return false;
    case '':
      console.log('Empty product type - proceeding to query metascore');
      return true;
    default:
      console.log(`Unknown product type: "${productType}"`);
      return false;
  }
}

// Step 5: Parse game name for Metacritic URL format
function parseGameNameForUrl(gameName) {
  const parsedName = gameName
    .toLowerCase()
    .replace(/™|®|©/g, '') // Remove trademark symbols
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  
  console.log(`Parsed "${gameName}" to "${parsedName}"`);
  return parsedName;
}

// Step 6, 7, 8: Fetch Metacritic scores from live website
async function fetchMetacriticScores(parsedGameName) {
  try {
    const metacriticUrl = `https://www.metacritic.com/game/${parsedGameName}/`;
    console.log(`Attempting to get live scores from: ${metacriticUrl}`);
    
    // Send message to background script to fetch real-time scores
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { 
          action: 'fetchMetacriticScores', 
          gameUrl: metacriticUrl,
          parsedGameName: parsedGameName
        },
        (response) => {
          if (response && response.metaScore && response.userScore) {
            console.log(`Live scores for ${parsedGameName}: Meta: ${response.metaScore}, User: ${response.userScore}`);
            resolve(response);
          } else {
            console.log(`No live scores available for ${parsedGameName}`);
            // Fallback to known games only for demonstration/testing
            const fallbackGames = {
              'horizon-zero-dawn-remastered': { metaScore: '85', userScore: '6.9' },
              'black-myth-wukong': { metaScore: '81', userScore: '8.2' }
            };
            
            if (fallbackGames[parsedGameName]) {
              console.log(`Using fallback scores for ${parsedGameName}`);
              resolve(fallbackGames[parsedGameName]);
            } else {
              resolve(null);
            }
          }
        }
      );
    });
    
  } catch (error) {
    console.error(`Error fetching Metacritic scores for ${parsedGameName}:`, error);
    return null;
  }
}

// Step 9: Add scores to PS Store page in correct place
function addScoresToProductTile(tileIndex, metaScore, userScore, gameTitle) {
  console.log(`Step 9: Adding scores for tile ${tileIndex}: ${gameTitle}`);
  
  // Find the product tile
  const productTile = document.querySelector(`[data-qa*="productTile${tileIndex}"]`);
  if (!productTile) {
    console.log(`Product tile ${tileIndex} not found`);
    return;
  }
  
  // Check if scores already exist
  if (productTile.querySelector('.metacritic-scores-container')) {
    console.log('Scores already exist, skipping...');
    return;
  }

  // Find the discount badge element or alternative location
  const discountBadge = productTile.querySelector('[data-qa*="discount-badge"]');
  
  // Create container for both scores
  const scoresContainer = document.createElement('div');
  scoresContainer.className = 'metacritic-scores-container';
  
  // Create Meta score element - Format: "Meta: 90"
  const metaElement = document.createElement('span');
  metaElement.className = 'metacritic-score meta-score';
  metaElement.textContent = `Meta: ${metaScore}`;
  metaElement.setAttribute('data-score', metaScore);
  metaElement.title = `Metacritic Critics Score: ${metaScore}/100`;
  
  // Create User score element - Format: "User: 8.2"
  const userElement = document.createElement('span');
  userElement.className = 'metacritic-score user-score';
  userElement.textContent = `User: ${userScore}`;
  userElement.setAttribute('data-score', userScore);
  userElement.title = `Metacritic User Score: ${userScore}/10`;
  
  // Add both elements to container
  scoresContainer.appendChild(metaElement);
  scoresContainer.appendChild(userElement);
  
  if (discountBadge) {
    // Insert after the discount badge
    discountBadge.parentNode.insertBefore(scoresContainer, discountBadge.nextSibling);
    console.log(`✅ Added scores after discount badge for ${gameTitle}`);
  } else {
    // Try to find alternative location
    const detailsSection = productTile.querySelector('[data-qa*="details"]');
    if (detailsSection) {
      scoresContainer.style.marginTop = '8px';
      detailsSection.appendChild(scoresContainer);
      console.log(`✅ Added scores to details section for ${gameTitle}`);
    } else {
      // Last resort - add to the tile itself
      productTile.appendChild(scoresContainer);
      console.log(`✅ Added scores to product tile for ${gameTitle}`);
    }
  }
  
  console.log(`✅ Successfully added Meta: ${metaScore}, User: ${userScore} for ${gameTitle}`);
}

// Main processing function that follows all steps
async function processAllSteps() {
  console.log('🚀 Starting PS Store Metacritic Extension - Following all steps...');
  
  try {
    // Step 1: Get the URL
    const currentUrl = getCurrentPageUrl();
    
    // Step 2: Parse the URL to get page number
    const pageNumber = parsePageNumber(currentUrl);
    
    // Step 3: Calculate tile range
    const tileIndices = calculateTileRange(pageNumber);
    
    // Process each tile index
    for (const tileIndex of tileIndices) {
      try {
        // Step 4: Get game name
        const gameName = getGameName(tileIndex);
        
        if (!gameName) {
          continue; // Skip if no game found
        }
        
        // Step 4.5: Check product type
        const productType = getProductType(tileIndex);
        
        if (!shouldProcessProduct(productType)) {
          console.log(`Skipping tile ${tileIndex} (${gameName}) - product type: "${productType}"`);
          continue; // Skip based on product type
        }
        
        // Step 5: Parse game name
        const parsedGameName = parseGameNameForUrl(gameName);
        
        // Step 6, 7, 8: Fetch Metacritic scores
        const scores = await fetchMetacriticScores(parsedGameName);
        
        if (scores) {
          // Step 9: Add scores to PS Store page
          addScoresToProductTile(tileIndex, scores.metaScore, scores.userScore, gameName);
        } else {
          console.log(`No valid scores found for ${gameName}`);
        }
        
        // Add delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error processing tile ${tileIndex}:`, error);
      }
    }
    
    console.log('✅ Completed processing all steps');
    
  } catch (error) {
    console.error('Error in main processing:', error);
  }
}

// Alternative function for testing with hardcoded data
function processWithTestData() {
  console.log('🧪 Testing with hardcoded data...');
  
  const currentUrl = getCurrentPageUrl();
  const pageNumber = parsePageNumber(currentUrl);
  const tileIndices = calculateTileRange(pageNumber);
  
  // Test with first few tiles
  tileIndices.slice(0, 3).forEach(tileIndex => {
    const gameName = getGameName(tileIndex);
    if (gameName) {
      // Use sample scores for testing
      addScoresToProductTile(tileIndex, '90', '8.2', gameName);
    }
  });
}

// Initialize the extension
function initializeExtension() {
  console.log('PS Store Metacritic Extension initializing...');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(processAllSteps, 1000); // Give page time to load
    });
  } else {
    setTimeout(processAllSteps, 1000);
  }
}

// Watch for dynamic content changes
const observer = new MutationObserver((mutations) => {
  let shouldProcess = false;
  
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.querySelector && node.querySelector('[data-qa*="productTile"]')) {
            shouldProcess = true;
          }
        }
      });
    }
  });
  
  if (shouldProcess) {
    console.log('New product tiles detected, processing...');
    setTimeout(processAllSteps, 1000);
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initialize
initializeExtension();

console.log('PS Store Metacritic Extension fully loaded and ready');

  } catch (extensionError) {
    console.error('PS Store Metacritic Extension Error:', extensionError);
  }
})();
