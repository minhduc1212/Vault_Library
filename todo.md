# Idea Fix Bugs
 - make the index.html more beautifull: the name, the list has no margin, the header is too big, library in the centre shoud be more focus, keep the style(font, color), fix the homepage :"panels" with the twinkling red dot -> remove the dot, "Your Library" -> "Welcome to my Library", panels -> "Vault Library" [Done]
 - a new page which keep the design of web to choose the comics path in the start, can choose many paths, show all of them, read all of them, cookies to save the paths, can add/remove paths [Done]
 - cause scan all folder to the get img -> create a comic but how to seperate the comics? is it oneshot or the chapter of a series because all im is just a folder with images, no info about the comic -> done -> scan in with the strcuture of folder [Done]
 - when add the comics path, create a comic with the path, the name of the comic is the name of the folder, the cover image is the first image in the folder, and the description is empty, genres is empty, author is empty, save to db [Done]
 - when add 1 comic with db: title, author, description, cover image, genres, path\
 bug: in cookies, when add new path -> get the comics -> save comics in db -> but when delete the path -> not any path in cookies -> cannot out the setup page though still have comic in db (which still can read). So eliminate the func that if no path in cookies, force to go to setup page, force to stay in setup page when there are no comic in db [Done]
 - add button to go to the next chapter and previous chapter, if there is no next chapter, the button will be disabled, if there is no previous chapter, the button will be disabled. Or when scroll to the end of the chapter, automatically go to the next chapter, when scroll to the top of the chapter, automatically go to the previous chapter [Done]
 - add logging [Done]
 - oneshot also has page to introduce the comic, like the series, but only one chapter, so the page will show the title, author, description, cover image, genres and a button to read the comic [Done]
 - back to comic page when click to back in reader [Done]
 - chapter list in reader [Done]

 - reader from many web: mangadex, ...
 - add user, login and permission to add comics, only admin can add comics, other users can only read comics or if user add comics, it means that the comics will be added to the server of admin, and other users can read the comics from the server of admin, but they cannot add comics to their own library, they can only read comics from the server of admin
 - add epub, pdf, ...
 
 
 - 3 mode:  user can clone the project and share the comics to the others 
            or create the server for everybpdy share the comics and save to the server of admin
            or share p2p, it likes a torrent, the peoples who share will create an network to share the comics
 - db for the comics: title, author, description, cover image, tags
 - add defalt cover for the comics that have no cover image