// index.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');      // For file system operations
const path = require('path');  // For path manipulation
const https = require('https'); // For downloading files over HTTPS

// Add the stealth plugin to puppeteer-extra
puppeteer.use(StealthPlugin());

/**
 * Generates a short, URL-safe filename from a given caption.
 * It attempts to pick important words, converts them to lowercase,
 * replaces spaces with underscores, and truncates to a maximum of 10 characters.
 *
 * @param {string} caption The input caption string.
 * @returns {string} A URL-safe filename (max 10 characters).
 */
function generateFilenameFromCaption(caption,pagenumber) {
    if (!caption || typeof caption !== 'string') {
        return ''; // Return empty string for invalid input
    }

    // 1. Convert to lowercase and remove non-alphanumeric characters (except spaces)
    //    and replace multiple spaces with a single space.
    let cleanedCaption = caption
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove punctuation and special characters
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim(); // Trim leading/trailing spaces

    if (!cleanedCaption) {
        return ''; // Return empty if caption becomes empty after cleaning
    }

    // Define a simple list of common stop words to filter out
    const stopWords = new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
        'in', 'on', 'at', 'for', 'with', 'of', 'to', 'from', 'by', 'as',
        'it', 'its', 'he', 'she', 'they', 'we', 'you', 'i', 'my', 'your',
        'his', 'her', 'their', 'our', 'this', 'that', 'these', 'those',
        'what', 'where', 'when', 'why', 'how', 'which', 'who', 'whom',
        'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'not', 'no', 'can', 'could', 'will', 'would', 'should', 'may', 'might',
        'about', 'above', 'after', 'again', 'against', 'all', 'any', 'among',
        'around', 'before', 'below', 'between', 'both', 'each', 'few', 'more',
        'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
        'too', 'very', 's', 't', 'just', 'don', 'shouldn', 'now'
    ]);

    // 2. Split into words and filter out stop words
    let words = cleanedCaption.split(' ').filter(word => {
        return word.length > 1 && !stopWords.has(word); // Filter out single-char words and stop words
    });

    // 3. Select important words (prioritize first few non-stop words)
    // We'll take up to the first 3 "important" words to form the base.
    let importantWords = words.slice(0, 3);

    // 4. Join with underscores and truncate
    let filename = importantWords.join('_');

    // 5. Ensure it's no longer than 10 characters
    if (filename.length > 10) {
        // If it's too long, try truncating words or just the whole string
        let truncatedFilename = '';
        for (let i = 0; i < importantWords.length; i++) {
            let nextPart = importantWords[i];
            if (truncatedFilename.length + (truncatedFilename ? 1 : 0) + nextPart.length <= 10) {
                truncatedFilename += (truncatedFilename ? '_' : '') + nextPart;
            } else {
                // If adding the full word makes it too long, try adding a partial word
                let remainingLength = 10 - truncatedFilename.length - (truncatedFilename ? 1 : 0);
                if (remainingLength > 0) {
                    truncatedFilename += (truncatedFilename ? '_' : '') + nextPart.substring(0, remainingLength);
                }
                break; // Stop adding words
            }
        }
        filename = truncatedFilename;
    }

    // Final check to ensure it's URL-safe (only alphanumeric and underscores)
    // This step is mostly redundant if previous steps are correct, but good for robustness.
    filename = filename.replace(/[^a-z0-9_]/g, '')+'_'+pagenumber; // Append page number for uniqueness

    return filename;
}

async function generateViewerHtml(outputPath, teaseTitle,teaseData) {
    const htmlContent = `


<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Gallery Viewer</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #1a1a1a;
            color: #fff;
            font-family: Arial, sans-serif;
            overflow: hidden; /* Prevent scrollbars */
        }

        #gallery-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            justify-content: space-between;
            align-items: center;
        }

        #image-display {
            position: relative;
            width: 100%;
            height: 90%; /* Occupy 90% of viewport height */
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }

        #current-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain; /* Ensure the image fits within the container */
            transition: opacity 0.3s ease-in-out;
        }

        #description-panel {
            width: 100%;
            height: 10%; /* Occupy 10% of viewport height */
            background-color: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 10px;
            box-sizing: border-box;
            text-align: center;
            font-size: 1.1em;
            overflow: auto; /* In case description is very long */
        }

        .nav-arrow {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            border: none;
            padding: 15px 10px;
            cursor: pointer;
            font-size: 2em;
            z-index: 10;
            user-select: none;
            border-radius: 5px;
            transition: background-color 0.3s ease;
        }

        .nav-arrow:hover {
            background-color: rgba(0, 0, 0, 0.8);
        }

        #prev-arrow {
            left: 10px;
        }

        #next-arrow {
            right: 10px;
        }

        #controls {
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 10px;
            z-index: 20;
        }

        #fullscreen-btn, #page-select-dropdown {
            background-color: rgba(0, 0, 0, 0.6);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 5px;
            font-size: 1em;
            transition: background-color 0.3s ease;
        }

        #fullscreen-btn:hover, #page-select-dropdown:hover {
            background-color: rgba(0, 0, 0, 0.9);
        }

        #page-select-dropdown {
            appearance: none; /* Remove default dropdown arrow */
            -webkit-appearance: none;
            -moz-appearance: none;
            padding-right: 30px; /* Space for custom arrow */
            background-image: url('data:image/svg+xml;utf8,<svg fill="%23ffffff" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>');
            background-repeat: no-repeat;
            background-position: right 8px top 50%;
            background-size: 18px;
        }
    </style>
</head>
<body>
    <div id="gallery-container">
        <div id="image-display">
            <img id="current-image" src="" alt="Gallery Image">
            <button id="prev-arrow" class="nav-arrow">&lt;</button>
            <button id="next-arrow" class="nav-arrow">&gt;</button>
            <div id="controls">
                <button id="fullscreen-btn">Fullscreen</button>
                <select id="page-select-dropdown"></select>
            </div>
        </div>
        <div id="description-panel">
            <p id="image-description"></p>
        </div>
    </div>

    <script>
        let galleryData = ${JSON.stringify(teaseData)}; // This will be replaced with actual gallery data
        let currentIndex = 0;
        const currentImage = document.getElementById('current-image');
        const imageDescription = document.getElementById('image-description');
        const prevArrow = document.getElementById('prev-arrow');
        const nextArrow = document.getElementById('next-arrow');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const pageSelectDropdown = document.getElementById('page-select-dropdown');
        const galleryContainer = document.getElementById('gallery-container');


        function updateGallery() {
            if (galleryData.length === 0) {
                currentImage.src = '';
                imageDescription.textContent = 'No images to display.';
                return;
            }

            const item = galleryData[currentIndex];
            currentImage.src = "pics/"+item.imageFilename;
            imageDescription.textContent = item.description;
            // Update URL hash
            window.location.hash = "#" + parseInt(item.pageNumber);
            // Update dropdown selection
            pageSelectDropdown.value = item.pageNumber;
        }

        function navigate(direction) {
            if (galleryData.length === 0) return;

            currentIndex += direction;

            if (currentIndex < 0) {
                currentIndex = galleryData.length - 1;
            } else if (currentIndex >= galleryData.length) {
                currentIndex = 0;
            }
            updateGallery();
        }

        function goToPage(pageNumber) {
            const index = galleryData.findIndex(item => parseInt(item.pageNumber) === pageNumber);
            if (index !== -1) {
                currentIndex = index;
                updateGallery();
            }
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                galleryContainer.requestFullscreen().catch(err => {
alert("Error attempting to enable full-screen mode: " + err.message + " (" + err.name + ")");                });
            } else {
                document.exitFullscreen();
            }
        }

        function initializeGallery() {
            // Populate page selection dropdown
            galleryData.forEach(item => {
                const option = document.createElement('option');
                option.value = item.pageNumber;
                option.textContent = "Page "+item.pageNumber;
                pageSelectDropdown.appendChild(option);
            });

            // Check for hash in URL
            const hashPage = parseInt(window.location.hash.substring(1));
            if (!isNaN(hashPage)) {
                goToPage(hashPage);
            } else {
                updateGallery(); // Load the first image if no hash
            }

            // Event Listeners
            prevArrow.addEventListener('click', () => navigate(-1));
            nextArrow.addEventListener('click', () => navigate(1));
            fullscreenBtn.addEventListener('click', toggleFullscreen);
            pageSelectDropdown.addEventListener('change', (event) => {
                goToPage(parseInt(event.target.value));
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowLeft') {
                    navigate(-1);
                } else if (event.key === 'ArrowRight') {
                    navigate(1);
                } else if (event.key === 'f' || event.key === 'F') {
                    toggleFullscreen();
                }
            });

            window.addEventListener('hashchange', () => {
                const hashPage = parseInt(window.location.hash.substring(1));
                if (!isNaN(hashPage) && parseInt(galleryData[currentIndex].pageNumber) !== hashPage) {
                    goToPage(hashPage);
                }
            });
        }
                initializeGallery();

        // Load data when the script starts
    </script>
</body>
</html>


`;

    try {
        await fs.promises.writeFile(outputPath, htmlContent);
        console.log(`HTML viewer generated: ${outputPath}`);
    } catch (error) {
        console.error(`Error generating HTML viewer:`, error);
    }
}

async function scrapeTeasePages(initialUrl) {
    let browser;
    let currentPageUrl = initialUrl;
    let pageCount = 0;
    const maxHops = 500; // Safety limit to prevent infinite loops

    // Data structure to accumulate all information for this tease
    const teaseScrapeData = {
        title: 'untitled',
        descriptionFile: null, // Will store the full path to the descriptions JSON file
        pages: [] // Array to store page-specific data (url, description, pageNumber, imageUrl, imageFilename, imageNewlyDownloaded)
    };

    // Map to store already downloaded image URLs and their generated filenames for this tease
    // Key: image URL, Value: generated filename (e.g., "Tease_Title#1.jpg")
    const downloadedImagesMap = new Map();

    // Helper function to save current progress to JSON file
    async function saveProgress() {
        if (!teaseScrapeData.descriptionFile) {
            console.warn("Cannot save progress: Description file path not yet determined.");
            return;
        }
        try {
            const dataToSave = JSON.stringify(teaseScrapeData.pages, null, 2);
            await fs.promises.writeFile(teaseScrapeData.descriptionFile, dataToSave);
            console.log(`Progress saved to: ${teaseScrapeData.descriptionFile}`);
            await generateViewerHtml(teaseScrapeData.htmlFile, teaseScrapeData.title, teaseScrapeData.pages);

        } catch (error) {
            console.error(`Error saving progress to ${teaseScrapeData.descriptionFile}:`, error);
        }
    }

    try {
        console.log(`Launching browser with stealth mode...`);
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/555.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/555.36');

        // This loop handles navigating through pages and scraping data
        while (currentPageUrl && pageCount < maxHops) {
            pageCount++;
            console.log(`\n--- Navigating to page ${pageCount}: ${currentPageUrl} ---`);

            let pageDescription = 'No description found.';
            let currentTeaseTitle = 'untitled';
            let imageUrl = null;
            let imageFilename = 'no_image.jpg'; // Default value if image not found or downloaded
            let imageNewlyDownloaded = false; // Flag for this page's image
            let currentUrlAfterNavigation = currentPageUrl;

            try {
                await page.goto(currentPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

                // Cloudflare check and wait
                console.log('Waiting for an additional 1 seconds to let Cloudflare resolve...');
                await new Promise(r => setTimeout(r, 1000));

                const pageTitleCheck = await page.title();
                if (pageTitleCheck.includes('Just a moment...') || pageTitleCheck.includes('Please wait...')) {
                    console.warn("Cloudflare challenge might still be active after initial wait. Waiting longer for navigation...");
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.log("Navigation after Cloudflare didn't occur or timed out:", e.message));
                    await new Promise(r => setTimeout(r, 5000)); // another delay
                }

                currentUrlAfterNavigation = page.url();

                // --- Get title from img alt ---
                try {
                    const imageAttributes = await page.$eval('img.tease_pic', img => ({
                        src: img.src,
                        alt: img.alt
                    })).catch(e => {
                        console.error('Error finding image with class "tease_pic" or its attributes on this page:', e.message);
                        return null;
                    });

                    if (imageAttributes) {
                        imageUrl = imageAttributes.src;
                        currentTeaseTitle = imageAttributes.alt.trim();
                        currentTeaseTitle = currentTeaseTitle.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');

                        if (pageCount === 1) {
                             teaseScrapeData.title = currentTeaseTitle; // Set main tease title once
                        }
                    } else {
                        console.log('Image with class "tease_pic" not found on the current page.');
                        await saveProgress(); // Minor error: save progress
                    }
                } catch (e) {
                    console.warn('An error occurred while trying to get image alt or src on this page:', e.message);
                    await saveProgress(); // Minor error: save progress
                }

                const urlParams = new URLSearchParams(new URL(currentUrlAfterNavigation).search);
                const pageNumber = urlParams.get('p') || '1';

                // --- Get the description for the current page ---
                try {
                    pageDescription = await page.$eval('#tease_content > p.text', el => el.textContent);
                    console.log(`Page ${pageNumber} Description: ${pageDescription.substring(0, 100)}...`);
                } catch (e) {
                    console.warn(`Could not find description at #tease_content > p.text on page ${pageNumber}:`, e.message);
                    await saveProgress(); // Minor error: save progress
                }

                // --- Directory Setup (only on first page for unique naming) ---
                if (pageCount === 1) {
                    const baseDownloadsDir = path.resolve(__dirname, 'downloads');
                    if (!fs.existsSync(baseDownloadsDir)) {
                        fs.mkdirSync(baseDownloadsDir);
                    }

                    let teaseDirName = teaseScrapeData.title;
                    let tempTeaseDir = path.resolve(baseDownloadsDir, teaseDirName);
                    if (fs.existsSync(tempTeaseDir)) {
                        const timestamp = Date.now();
                        teaseDirName = `${teaseScrapeData.title}_${timestamp}`;
                        console.log(`Directory "${teaseScrapeData.title}" already exists. Creating "${teaseDirName}" instead.`);
                    }
                    page._teaseDirectory = path.resolve(baseDownloadsDir, teaseDirName);
                    teaseScrapeData.descriptionFile = path.join(page._teaseDirectory, 'descriptions.json');
                    teaseScrapeData.htmlFile = path.join(page._teaseDirectory, 'viewer.html');

                    // Ensure the 'pics' sub-directory exists within the tease directory
                    const picsDirectory = path.resolve(page._teaseDirectory, 'pics');
                    try {
                        await fs.promises.mkdir(picsDirectory, { recursive: true });
                        console.log(`Ensured pics subdirectory exists: ${picsDirectory}`);
                    } catch (err) {
                        if (err.code !== 'EEXIST') {
                            console.error(`Error creating pics subdirectory ${picsDirectory}: ${err.message}`);
                            throw err;
                        }
                    }

                }

                // Ensure the tease directory exists before attempting to write files
                if (page._teaseDirectory && !fs.existsSync(page._teaseDirectory)) {
                    fs.mkdirSync(page._teaseDirectory);
                    console.log(`Created directory: ${page._teaseDirectory}`);
                }

                // --- Image Download Logic (with duplicate check) ---
                if (imageUrl && page._teaseDirectory) {
                    const imageExtension = path.extname(new URL(imageUrl).pathname);
                    // Generate the filename for this specific page (even if it's a duplicate URL)
                    const potentialFilename = generateFilenameFromCaption(pageDescription, pageNumber) + imageExtension;

                    if (downloadedImagesMap.has(imageUrl)) {
                        imageFilename = downloadedImagesMap.get(imageUrl); // Use the existing filename
                        imageNewlyDownloaded = false;
                        console.log(`Image URL "${imageUrl}" already downloaded as "${imageFilename}". Skipping re-download.`);
                    } else {
                        imageFilename = potentialFilename; // Use the newly generated filename
                        const imagePath = path.resolve(page._teaseDirectory, 'pics', imageFilename);

                        console.log(`Found image URL: ${imageUrl}`);
                        console.log(`Downloading image to: ${imagePath}`);
                        await downloadFile(imageUrl, imagePath);
                        downloadedImagesMap.set(imageUrl, imageFilename); // Store mapping
                        imageNewlyDownloaded = true;
                        console.log(`Image downloaded successfully.`);
                    }
                } else {
                    console.log('No image URL or tease directory found to process image for this page.');
                    await saveProgress(); // Minor error: save progress
                }

                // --- Add current page data to accumulator ---
                teaseScrapeData.pages.push({
                    pageNumber: pageNumber,
                    url: currentUrlAfterNavigation,
                    description: pageDescription,
                    imageUrl: imageUrl,
                    imageFilename: imageFilename,
                    imageNewlyDownloaded: imageNewlyDownloaded
                });

                console.log(`Current URL: ${page.url()}`);
                console.log(`Current Page Title: ${await page.title()}`);

                // --- Look for the next page link ---
                const nextLink = await page.$('a#continue');
                if (nextLink) {
                    const nextHref = await nextLink.evaluate(node => node.getAttribute('href'));
                    currentPageUrl = new URL(nextHref, currentUrlAfterNavigation).href;
                    console.log(`Found next page link: ${currentPageUrl}`);
                } else {
                    console.log('No "Continue" link found. End of tease.');
                    currentPageUrl = null; // Exit loop
                }

            } catch (pageError) {
                console.error(`Major error processing page ${currentPageUrl}:`, pageError);
                await saveProgress(); // Critical error: save what we have
                currentPageUrl = null; // Exit loop on major page error
            }
        } // End of while loop

        if (pageCount >= maxHops) {
            console.warn(`Reached maximum of ${maxHops} pages. Stopping.`);
        }

    } catch (browserError) {
        console.error('An error occurred during browser operation (launch/initial setup):', browserError);
    } finally {
        // Always attempt to save data when the process concludes or errors out
        await saveProgress();
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
}

// Helper function to download a file
function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);
        https.get(url, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Handle redirects
                console.log(`Redirecting to ${response.headers.location}`);
                downloadFile(response.headers.location, destination).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', err => {
            fs.unlink(destination, () => reject(err)); // Delete the file if an error occurs
        });
    });
}


// --- How to get the targetUrl from command line ---
const args = process.argv.slice(2); // Slice to get arguments starting from index 2

if (args.length === 0) {
    console.error('Usage: node index.js <target_url>');
    console.error('Example: node index.js "https://milovana.com/webteases/showtease.php?id=45485&p=1"');
    process.exit(1); // Exit with an error code
}

const targetUrl = args[0];
console.log(`Starting scrape for URL: ${targetUrl}`);

scrapeTeasePages(targetUrl);