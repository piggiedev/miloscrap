# miloscrap

A Node.js scraper for Milovana webteases, downloading images and descriptions for each page and generating a local HTML gallery viewer.

## Features

- Uses Puppeteer with stealth plugin to bypass bot detection.
- Scrapes all pages of a Milovana tease, downloading images and page descriptions.
- Stores results in a uniquely named folder under `downloads/`.
- Generates a `viewer.html` file for easy local browsing of the tease as an image gallery.
- Avoids duplicate image downloads and provides progress saving.

## Requirements

- Node.js (v16+ recommended)
- npm

## Installation

1. Clone this repository.
2. Install dependencies:

    ```sh
    npm install
    ```

## Usage

Run the scraper with a Milovana tease URL:

```sh
node index.js "https://milovana.com/webteases/showtease.php?id=52251"
```