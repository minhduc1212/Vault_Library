# Vault Library

Vault Library is a personal, visually-rich web application for managing and reading your local collection of comics, manga, and eBooks (EPUB, PDF). Designed for both private use and **easy sharing with friends**, it features a built-in MangaDex integration and an automatic Cloudflare tunnel, allowing you to open your vault to the world with a single click or QR scan.

![Vault Library Preview](img\homepage.png) *(Placeholder: Add a screenshot of your app here)*

## 🚀 Features

-   **Local Library Management**: Scan multiple local folders and automatically organize your comics into Series and One-shots.
-   **Multi-Format Support**:
    -   **Comics/Manga**: Images (JPG, PNG, WebP, etc.) organized in folders.
    -   **EPUB**: Dedicated reader with font and color customization.
    -   **PDF**: Built-in PDF viewer with page and scroll modes.
-   **MangaDex Integration**:
    -   Search for any manga on MangaDex.
    -   Browse popular titles.
    -   Dedicated series homepages with metadata (description, author, etc.).
    -   Read chapters directly from MangaDex servers.
-   **Responsive Reader**:
    -   **Page Mode**: Classic page-by-page reading with click/swipe navigation.
    -   **Scroll Mode**: Continuous vertical scrolling.
    -   **Chapter List**: Quick navigation between chapters.
    -   **Auto-Navigation**: Automatically moves to the next chapter when you reach the end.
-   **Modern UI/UX**:
    -   Clean, minimalist design with a "Vault" aesthetic.
    -   Skeleton loaders for smooth data fetching.
    -   QR Code sharing to quickly open the library on your mobile device.
    -   Setup page for easy folder management.

## 🛠️ Installation

### Prerequisites

-   Python 3.8 or higher
-   `pip` (Python package installer)

### Steps

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/minhduc1212/Vault_Library.git
    cd Vault_Library
    ```

2.  **Set up a Virtual Environment** (Optional but recommended):
    ```bash
    python -m venv .venv
    # On Windows:
    .venv\Scripts\activate
    # On macOS/Linux:
    source .venv/bin/activate
    ```

3.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
    *(Note: If `requirements.txt` is missing, install manually: `pip install flask requests qrcode pillow pycloudflared`)*

4.  **Run the Application**:
    ```bash
    python app.py
    ```
    The app will start at `http://localhost:5000`.

## 📖 How to Use

### 1. Setting up your Local Library
-   When you first open the app, you'll be prompted to go to the **Setup** page (or click the gear icon in the header).
-   Add one or more folder paths where your comics are stored.
-   The app will scan these folders:
    -   Folders containing subfolders are treated as **Series**.
    -   Folders containing only images are treated as **One-shots**.
-   Click "Save and Scan" to populate your library.

### 2. Reading Manga from MangaDex
-   Use the **Search Bar** in the header to find manga by title.
-   Click on a search result to go to its series page.
-   Click "Read from Ch.1" or select a specific chapter from the list.

### 3. Using the Reader
-   **Navigation**:
    -   **Keyboard**: Left/Right arrows for pages, Up/Down for scrolling.
    -   **Mouse**: Click the left/right sides of the page to navigate.
    -   **Touch**: Swipe left/right on mobile devices.
-   **Modes**: Toggle between **Page** and **Scroll** modes using the buttons in the HUD (bottom of the screen).
-   **HUD**: Move your mouse near the top or bottom of the screen to reveal the HUD (Heads-Up Display) for navigation and settings.
-   **Chapter List**: Click the chapter title in the top bar to open a quick-jump menu.

### 4. Reading on Mobile
-   Hover over the **QR Code icon** in the header.
-   Scan the QR code with your phone to open your library instantly (requires a Cloudflare tunnel, which the app attempts to start automatically).

## 🗄️ Project Structure

-   `app.py`: The main Flask backend.
-   `models.py`: Database logic and scanning functionality.
-   `templates/`: HTML templates (Jinja2).
-   `static/`: CSS, JavaScript, and asset files.
    -   `js/reader.js`: The core reading engine.
-   `comics.db`: SQLite database storing your library metadata.

## 🤝 Contributing

Feel free to open issues or submit pull requests to improve the Vault!

## 📄 License

MIT License. See `LICENSE` for details.
