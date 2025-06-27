// PS Store Metacritic Extension - Content Script
console.log('PS Store Metacritic Extension loaded');

// Function to add Metacritic score to a product tile
function addMetacriticScore(productTile, metaScore, userScore, gameTitle) {
  console.log(`Adding scores for: ${gameTitle}`);
  
  // Check if scores already exist
  if (productTile.querySelector('.metacritic-scores-container')) {
    console.log('Scores already exist, skipping...');
    return;
  }

  // Find the discount badge element
  const discountBadge = productTile.querySelector('[data-qa*="discount-badge"]');
  console.log('Discount badge found:', !!discountBadge);
  
  if (discountBadge) {
    // Create container for both scores
    const scoresContainer = document.createElement('div');
    scoresContainer.className = 'metacritic-scores-container';
    
    // Create Meta score element
    const metaElement = document.createElement('span');
    metaElement.className = 'metacritic-score meta-score';
    metaElement.textContent = `Meta: ${metaScore}`;
    metaElement.setAttribute('data-score', metaScore);
    metaElement.title = `Metacritic Critics Score: ${metaScore}/100`;
    
    // Create User score element
    const userElement = document.createElement('span');
    userElement.className = 'metacritic-score user-score';
    userElement.textContent = `User: ${userScore}`;
    userElement.setAttribute('data-score', userScore);
    userElement.title = `Metacritic User Score: ${userScore}/10`;
    
    // Add both elements to container
    scoresContainer.appendChild(metaElement);
    scoresContainer.appendChild(userElement);
    
    // Insert after the discount badge
    discountBadge.parentNode.insertBefore(scoresContainer, discountBadge.nextSibling);
    
    console.log(`✅ Successfully added scores Meta: ${metaScore}/100, User: ${userScore}/10 for ${gameTitle}`);
  } else {
    console.log('❌ No discount badge found, trying alternative insertion...');
    
    // Try to find the details section instead
    const detailsSection = productTile.querySelector('[data-qa*="details"]');
    if (detailsSection) {
      const scoresContainer = document.createElement('div');
      scoresContainer.className = 'metacritic-scores-container';
      scoresContainer.style.marginTop = '8px';
      
      const metaElement = document.createElement('span');
      metaElement.className = 'metacritic-score meta-score';
      metaElement.textContent = `Meta: ${metaScore}`;
      metaElement.setAttribute('data-score', metaScore);
      
      const userElement = document.createElement('span');
      userElement.className = 'metacritic-score user-score';
      userElement.textContent = `User: ${userScore}`;
      userElement.setAttribute('data-score', userScore);
      
      scoresContainer.appendChild(metaElement);
      scoresContainer.appendChild(userElement);
      
      detailsSection.appendChild(scoresContainer);
      console.log(`✅ Added scores to details section for ${gameTitle}`);
    } else {
      console.log('❌ No suitable location found for scores');
    }
  }
}

// Function to extract game name from product tile
function extractGameName(productTile) {
  const nameElement = productTile.querySelector('[data-qa*="product-name"]');
  if (nameElement) {
    return nameElement.textContent.trim();
  }
  return null;
}

// Function to check if this is Black Myth: Wukong and add score
function processProductTiles() {
  console.log('Processing product tiles...');
  const productTiles = document.querySelectorAll('[data-qa*="productTile"]');
  console.log(`Found ${productTiles.length} product tiles`);
  
  productTiles.forEach((tile, index) => {
    const gameName = extractGameName(tile);
    console.log(`Tile ${index}: ${gameName}`);
    
    if (gameName && gameName.includes('Black Myth: Wukong')) {
      console.log(`Found Black Myth: Wukong, adding scores...`);
      // For now, hardcode the scores for Black Myth: Wukong
      addMetacriticScore(tile, '90', '8.2', gameName);
    }
  });
}

// Initial processing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processProductTiles);
} else {
  processProductTiles();
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
    setTimeout(processProductTiles, 100);
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('PS Store Metacritic Extension initialized');
