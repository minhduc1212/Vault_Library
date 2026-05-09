'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    // Thêm dấu '/' ở cuối để ép epub.js load theo chế độ "unzipped API", chỉ gọi các file metadata cần thiết
    const epubUrl = `/img/${dirIndex}/${relPath.split('/').map(encodeURIComponent).join('/')}/`;
    const book = ePub(epubUrl);
    
    try {
        const metadata = await book.loaded.metadata;
        const navigation = await book.loaded.navigation;
        const coverUrl = await book.coverUrl();

        // Update UI
        document.getElementById('epub-title').textContent = metadata.title || 'Unknown Title';
        document.getElementById('epub-author').textContent = metadata.creator || 'Unknown Author';
        
        const descriptionEl = document.getElementById('epub-description');
        if (metadata.description) {
            // metadata.description might contain HTML
            descriptionEl.innerHTML = metadata.description;
            
            // Check if it's too long
            if (descriptionEl.scrollHeight > descriptionEl.clientHeight) {
                document.getElementById('read-more').style.display = 'inline-block';
            }
        } else {
            descriptionEl.textContent = 'No description available.';
        }

        if (coverUrl) {
            const coverWrap = document.getElementById('hero-cover-wrap');
            coverWrap.innerHTML = `<img src="${coverUrl}" alt="Cover">`;
            
            const heroBg = document.getElementById('hero-bg');
            heroBg.style.backgroundImage = `url(${coverUrl})`;
            heroBg.classList.add('loaded');
        }

        // TOC
        const tocGrid = document.getElementById('toc-grid');
        const tocCount = document.getElementById('toc-count');
        const chaptersCount = document.getElementById('epub-chapters-count');
        
        let count = 0;
        const processToc = (items, depth = 0) => {
            items.forEach(item => {
                count++;
                const card = document.createElement('a');
                card.className = 'ch-card';
                // Link to reader with specific chapter if possible
                const encodedPath = relPath.split('/').map(encodeURIComponent).join('/');
                card.href = `/read/${dirIndex}/${encodedPath}?href=${encodeURIComponent(item.href)}`;
                
                card.innerHTML = `
                    <div class="ch-card__info">
                        <div class="ch-card__name">${'— '.repeat(depth)}${item.label}</div>
                    </div>
                    <div class="ch-card__arrow">
                        <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                `;
                tocGrid.appendChild(card);
                
                if (item.subitems && item.subitems.length > 0) {
                    processToc(item.subitems, depth + 1);
                }
            });
        };

        if (navigation.toc) {
            processToc(navigation.toc);
        }

        tocCount.textContent = `${count} Chapters`;
        chaptersCount.textContent = count;

    } catch (e) {
        console.error("Error loading EPUB metadata:", e);
        document.getElementById('epub-title').textContent = "Error loading book";
    }

    // Read more toggle
    document.getElementById('read-more').addEventListener('click', function() {
        const desc = document.getElementById('epub-description');
        desc.classList.toggle('expanded');
        this.textContent = desc.classList.contains('expanded') ? 'Show Less' : 'Read More';
    });
});
