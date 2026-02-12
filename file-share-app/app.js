// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// --- CONFIGURATION ---
// TODO: Replace with your Firebase Project Configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Admin Password for Deletion (Simple Client-Side Check)
const DELETE_PASSWORD = "admin"; 

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const sharesCollection = collection(db, "shares");

// --- UI ELEMENTS ---
const fileUploadArea = document.getElementById('file-upload-area');
const textUploadArea = document.getElementById('text-upload-area');
const fileInput = document.getElementById('fileElement');
const textInput = document.getElementById('textElement');
const uploadBtn = document.getElementById('uploadBtn');
const uploadProgress = document.getElementById('uploadProgress');
const progressBar = uploadProgress.querySelector('.fill');
const feedContainer = document.getElementById('feed');
const dropZone = document.getElementById('drop-zone');

let currentTab = 'file';

// --- FUNCTIONS ---

window.switchTab = (tab) => {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (tab === 'file') {
        fileUploadArea.classList.remove('hidden');
        textUploadArea.classList.add('hidden');
    } else {
        fileUploadArea.classList.add('hidden');
        textUploadArea.classList.remove('hidden');
    }
};

// File Selection
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        dropZone.innerHTML = `<i class="fa-solid fa-check-circle" style="color: #22c55e"></i><p>${fileInput.files[0].name}</p>`;
    }
});

// Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        dropZone.innerHTML = `<i class="fa-solid fa-check-circle" style="color: #22c55e"></i><p>${fileInput.files[0].name}</p>`;
    }
});

// Upload Logic
uploadBtn.addEventListener('click', async () => {
    uploadBtn.disabled = true;
    uploadProgress.classList.remove('hidden');
    progressBar.style.width = '30%';

    try {
        if (currentTab === 'file') {
            const file = fileInput.files[0];
            if (!file) throw new Error("Please select a file.");

            // Upload to Storage
            const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
            progressBar.style.width = '60%';
            await uploadBytes(storageRef, file);
            
            const url = await getDownloadURL(storageRef);
            progressBar.style.width = '90%';

            // Save Metadata to Firestore
            await addDoc(sharesCollection, {
                type: file.type.startsWith('image/') ? 'image' : 'file',
                name: file.name,
                content: url,
                storagePath: storageRef.fullPath,
                timestamp: serverTimestamp()
            });

        } else {
            const text = textInput.value.trim();
            if (!text) throw new Error("Please enter some text.");

            await addDoc(sharesCollection, {
                type: 'text',
                content: text,
                timestamp: serverTimestamp()
            });
        }

        // Reset UI
        progressBar.style.width = '100%';
        setTimeout(() => {
            uploadProgress.classList.add('hidden');
            progressBar.style.width = '0%';
            uploadBtn.disabled = false;
            // Clear inputs
            fileInput.value = '';
            textInput.value = '';
            if (currentTab === 'file') {
                dropZone.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i><p>Drag & Drop or Click to Upload</p><span class="file-types">Supports: PDF, PNG, JPG, GIF</span><input type="file" id="fileElement" accept="image/*,.pdf" hidden>`;
                // Re-bind listener since we overwrote HTML
                document.getElementById('fileElement').addEventListener('change', () => {
                     dropZone.innerHTML = `<i class="fa-solid fa-check-circle" style="color: #22c55e"></i><p>${document.getElementById('fileElement').files[0].name}</p>`;
                });
            }
        }, 500);

    } catch (error) {
        console.error(error);
        alert(error.message);
        uploadBtn.disabled = false;
        uploadProgress.classList.add('hidden');
    }
});

// Real-time Feed
const q = query(sharesCollection, orderBy("timestamp", "desc"));
onSnapshot(q, (snapshot) => {
    feedContainer.innerHTML = ''; // Clear current feed
    
    snapshot.forEach((doc) => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'feed-item glass-panel';
        
        // Date formatting
        const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Just now';

        let contentHtml = '';
        if (data.type === 'image') {
            contentHtml = `<img src="${data.content}" class="feed-image" onclick="window.open('${data.content}', '_blank')">`;
        } else if (data.type === 'file') {
            contentHtml = `
                <a href="${data.content}" target="_blank" class="feed-file">
                    <i class="fa-solid fa-file-pdf fa-2x"></i>
                    <div>
                        <p>${data.name}</p>
                        <small>Click to Download</small>
                    </div>
                </a>`;
        } else {
            contentHtml = `<p class="feed-text">${escapeHtml(data.content)}</p>`;
        }

        card.innerHTML = `
            <div class="feed-header-item">
                <span>${date}</span>
                <button class="delete-btn" onclick="requestDelete('${doc.id}', '${data.storagePath || ''}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="feed-content">
                ${contentHtml}
            </div>
        `;
        feedContainer.appendChild(card);
    });
});

// Security / XSS Prevention
function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// Deletion Logic
let itemToDelete = null;
let storagePathToDelete = null;
const modal = document.getElementById('passwordModal');

window.requestDelete = (id, storagePath) => {
    itemToDelete = id;
    storagePathToDelete = storagePath;
    modal.classList.remove('hidden');
    document.getElementById('deletePassword').value = '';
    document.getElementById('deletePassword').focus();
};

window.closeModal = () => {
    modal.classList.add('hidden');
    itemToDelete = null;
    storagePathToDelete = null;
};

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    const password = document.getElementById('deletePassword').value;
    
    if (password === DELETE_PASSWORD) {
        try {
            // Delete from Firestore
            await deleteDoc(doc(db, "shares", itemToDelete));
            
            // Delete from Storage if needed
            if (storagePathToDelete) {
                const fileRef = ref(storage, storagePathToDelete);
                await deleteObject(fileRef);
            }
            
            closeModal();
        } catch (error) {
            alert("Error deleting: " + error.message);
        }
    } else {
        alert("Incorrect Password!");
    }
});
