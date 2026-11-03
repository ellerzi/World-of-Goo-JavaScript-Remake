# World of Goo JavaScript Remake

A JavaScript web remake of the classic physics puzzle game **World of Goo**.

## Notice

To run this remake, you must own a legal copy of *World of Goo*. You will also need:
* Your official game installation files (specifically the `res` and `properties` folders/files).
* An external AES `.bin` file decryptor and a `.binltl` decryptor to extract the game's assets. For `.binltl` files, I reccomend using xowy64's [World of Goo Animation Tool](https://github.com/xowy64/worldofgoo-animtool/releases/tag/v1.0).

---

## How to Set Up and Run

1. **Decrypt the Game Files:** 
   Locate your official *World of Goo* installation files, and copy the files into another folder so your original files stay intact. Then, use your decryption tools to decrypt all `.bin` and `.binltl` files. *It really doesn't matter what program you use to decrypt the files, just make sure they are all decrypted.*

2. **Create a Project Folder:** 
   Create a new local folder on your computer and move all of your newly decrypted game files and assets inside it. Make sure you only import the res and properties folders.

3. **Add the Repository Files:** 
   Download or copy all the files from this repository and place them directly into the folder containing your decrypted game assets. If it asks you to replace anything, let it replace the files.

4. **Run a Local Server:** 
   You **cannot** run this game by simply double-clicking the `index.html` file. You must host it via a local web server. 

   For example, using Python, open your terminal inside that directory and run:
   * **Python 3:**
     ```bash
     python -m http.server 8000
     ```
   * **Python 2:**
     ```bash
     python -m SimpleHTTPServer 8000
     ```

5. **Play:** 
   Open your web browser and navigate to `http://localhost:8000` to start playing.