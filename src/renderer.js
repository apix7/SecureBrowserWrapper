// Renderer process script to manage webview loading and errors

document.addEventListener('DOMContentLoaded', () => {
    // Get all webviews
    const duckWebview = document.getElementById('duck-ai-webview');
    const perplexityWebview = document.getElementById('perplexity-webview');
    const grokWebview = document.getElementById('grok-webview');
    const geminiWebview = document.getElementById('gemini-webview');
    
    // Common elements
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');
    const retryButton = document.getElementById('retry-button');
    
    // Create status indicator to show which AI is active
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'status-indicator';
    document.body.appendChild(statusIndicator);
    
    // Current active webview
    let activeWebview = duckWebview;
    let activeWebviewIndex = 0;
    
    // Store last URLs for each webview
    const lastURLs = {
        'duck-ai-webview': duckWebview.src,
        'perplexity-webview': perplexityWebview.src,
        'grok-webview': grokWebview.src,
        'gemini-webview': geminiWebview.src
    };
    
    // Webview names for status display
    const webviewNames = ['Duck AI', 'Perplexity', 'Grok', 'Gemini'];
    
    let isNavigating = false;
    
    // Initially hide error container
    errorContainer.style.display = 'none';
    
    // Show loading indicator initially only for the active webview
    loadingIndicator.style.display = 'flex';
    
    // Store all webviews in an array for easier management
    const webviews = [duckWebview, perplexityWebview, grokWebview, geminiWebview];
    
    // Listen for IPC messages from main process for switching between webviews
    window.electronAPI.onSwitchWebview((event, index) => {
        switchToWebview(index);
    });
    
    // Listen for reload current webview message
    window.electronAPI.onReloadWebview(() => {
        reloadCurrentWebview();
    });
    
    // Function to reload the current webview
    function reloadCurrentWebview() {
        if (activeWebview) {
            loadingIndicator.style.display = 'flex';
            errorContainer.style.display = 'none';
            activeWebview.reload();
            
            // Show a temporary "Reloading" status message
            updateStatusIndicator(`Reloading ${webviewNames[activeWebviewIndex]}...`);
            setTimeout(() => {
                updateStatusIndicator(webviewNames[activeWebviewIndex]);
            }, 2000);
        }
    }
    
    // Function to update the status indicator
    function updateStatusIndicator(text) {
        statusIndicator.textContent = text;
        statusIndicator.style.opacity = '1';
        
        // Fade out after 3 seconds
        clearTimeout(statusIndicator.timeout);
        statusIndicator.timeout = setTimeout(() => {
            statusIndicator.style.opacity = '0.7';
        }, 3000);
    }
    
    // Function to switch to a specific webview
    function switchToWebview(index) {
        if (index < 0 || index >= webviews.length || index === activeWebviewIndex) {
            return;
        }
        
        // Hide the current active webview
        activeWebview.classList.remove('active-webview');
        activeWebview.classList.add('hidden-webview');
        
        // Show the new webview
        activeWebviewIndex = index;
        activeWebview = webviews[index];
        activeWebview.classList.remove('hidden-webview');
        activeWebview.classList.add('active-webview');
        
        // Hide error container when switching
        errorContainer.style.display = 'none';
        
        // Only show loading indicator if the webview is still loading
        if (activeWebview.isLoading()) {
            loadingIndicator.style.display = 'flex';
        } else {
            loadingIndicator.style.display = 'none';
        }
        
        // Update status indicator
        updateStatusIndicator(webviewNames[index]);
        
        // Focus the webview
        activeWebview.focus();
        
        // Apply UI enhancements for the active webview
        applyUIEnhancements(activeWebview);
        
        // Optimize background webviews (lower priority)
        optimizeBackgroundWebviews();
    }
    
    // Optimize performance for background webviews
    function optimizeBackgroundWebviews() {
        webviews.forEach((webview, index) => {
            if (index !== activeWebviewIndex) {
                // Lower the priority of background webviews
                try {
                    webview.setZoomFactor(0.99); // Trick to reduce rendering priority
                    setTimeout(() => {
                        webview.setZoomFactor(1.0); // Restore normal zoom
                    }, 100);
                } catch (e) {
                    console.error('Error optimizing background webview:', e);
                }
            }
        });
    }
    
    // Set up event listeners for all webviews
    webviews.forEach((webview) => {
        // Handle loading events
        webview.addEventListener('did-start-loading', () => {
            if (webview === activeWebview) {
                isNavigating = true;
                loadingIndicator.style.display = 'flex';
                errorContainer.style.display = 'none';
                
                // Set a timeout to show a "taking too long" message if loading takes too much time
                if (window.loadingTimeout) {
                    clearTimeout(window.loadingTimeout);
                }
                
                window.loadingTimeout = setTimeout(() => {
                    if (isNavigating && webview === activeWebview) {
                        document.querySelector('.loading-text').textContent = 'This is taking longer than expected...';
                    }
                }, 10000); // 10 seconds
            }
        });
        
        webview.addEventListener('did-stop-loading', () => {
            if (webview === activeWebview) {
                isNavigating = false;
                loadingIndicator.style.display = 'none';
                if (window.loadingTimeout) {
                    clearTimeout(window.loadingTimeout);
                }
            }
        });
        
        webview.addEventListener('did-finish-load', () => {
            // Store the last URL for this webview
            lastURLs[webview.id] = webview.src;
            
            if (webview === activeWebview) {
                isNavigating = false;
                loadingIndicator.style.display = 'none';
                
                // Apply UI enhancements for this webview
                applyUIEnhancements(webview);
                
                if (window.loadingTimeout) {
                    clearTimeout(window.loadingTimeout);
                }
            }
        });
        
        // Handle page title changes
        webview.addEventListener('page-title-updated', (event) => {
            // Update the page title for the app's window only if this is the active webview
            if (webview === activeWebview) {
                document.title = `AiFrame - ${event.title}`;
            }
        });
        
        // Handle errors
        webview.addEventListener('did-fail-load', (event) => {
            // Don't show errors for canceled requests or when navigating away
            if (event.errorCode === -3 || event.isMainFrame === false) {
                return;
            }
            
            if (webview === activeWebview) {
                isNavigating = false;
                loadingIndicator.style.display = 'none';
                errorContainer.style.display = 'flex';
                
                // Set specific error messages based on error codes
                switch (event.errorCode) {
                    case -2: // Failed to connect (server not reachable)
                        errorMessage.textContent = 'Cannot connect to server. Check your internet connection.';
                        break;
                    case -6: // Connection timeout
                        errorMessage.textContent = 'Connection timed out.';
                        break;
                    case -106: // Internet disconnected
                        errorMessage.textContent = 'No internet connection available.';
                        break;
                    case -501: // Insecure connection
                        errorMessage.textContent = 'Insecure connection detected.';
                        break;
                    default:
                        errorMessage.textContent = `Failed to load: ${event.errorDescription}`;
                }
                
                if (window.loadingTimeout) {
                    clearTimeout(window.loadingTimeout);
                }
            }
        });
        
        // Handle crashed or unresponsive webviews
        webview.addEventListener('crashed', () => {
            if (webview === activeWebview) {
                isNavigating = false;
                loadingIndicator.style.display = 'none';
                errorContainer.style.display = 'flex';
                errorMessage.textContent = 'The page crashed. Please try again.';
                
                if (window.loadingTimeout) {
                    clearTimeout(window.loadingTimeout);
                }
            }
        });
        
        webview.addEventListener('unresponsive', () => {
            if (webview === activeWebview) {
                isNavigating = false;
                loadingIndicator.style.display = 'none';
                errorContainer.style.display = 'flex';
                errorMessage.textContent = 'The page is not responding. Please try again.';
                
                if (window.loadingTimeout) {
                    clearTimeout(window.loadingTimeout);
                }
            }
        });
        
        webview.addEventListener('responsive', () => {
            if (webview === activeWebview) {
                errorContainer.style.display = 'none';
            }
        });
        
        // Performance monitoring
        webview.addEventListener('console-message', (event) => {
            // Filter and log only important console messages
            if (event.level === 2) { // Error level
                console.error(`Webview ${webview.id} console error:`, event.message);
            }
        });
    });
    
    // Handle retry button
    retryButton.addEventListener('click', () => {
        errorContainer.style.display = 'none';
        loadingIndicator.style.display = 'flex';
        activeWebview.src = lastURLs[activeWebview.id];
    });
    
    // Before unload handler to clean up resources
    window.addEventListener('beforeunload', () => {
        if (window.loadingTimeout) {
            clearTimeout(window.loadingTimeout);
        }
        
        // No need to clear data on unload as we want to persist sessions
    });
    
    // Initialize the status indicator with the current active webview
    updateStatusIndicator(webviewNames[activeWebviewIndex]);
    
    // Apply UI enhancements for specific sites
    function applyUIEnhancements(webview) {
        // Only apply site-specific enhancements if needed
        const currentURL = webview.src;
        
        // Safely inject CSS for UI improvements if needed
        try {
            if (currentURL.includes('duck.ai')) {
                // Example: Add custom CSS for duck.ai if needed
                webview.insertCSS(`
                    /* Duck.ai specific CSS fixes/improvements can go here */
                    /* For example: */
                    body { overflow: hidden !important; }
                `);
            } else if (currentURL.includes('perplexity.ai')) {
                // Perplexity specific enhancements
                webview.insertCSS(`
                    /* Perplexity specific CSS fixes/improvements can go here */
                    body { overflow: hidden !important; }
                `);
            } else if (currentURL.includes('grok.com')) {
                // Grok.com specific enhancements
                webview.insertCSS(`
                    /* Grok.com specific CSS fixes/improvements can go here */
                    body { overflow: hidden !important; }
                `);
            } else if (currentURL.includes('gemini.google.com')) {
                // Gemini specific enhancements
                webview.insertCSS(`
                    /* Gemini specific CSS fixes/improvements can go here */
                    body { overflow: hidden !important; }
                `);
            }
        } catch (e) {
            console.error('Error applying UI enhancements:', e);
        }
    }
}); 