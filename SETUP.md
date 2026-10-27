# Quasar - Setup Instructions

## Quick Start

### 1. Install Dependencies

```bash
npm run install-all
```

### 2. Firebase Configuration

#### Frontend (`client/.env`)
1. Copy `client/.env.example` to `client/.env`
2. In [Firebase Console](https://console.firebase.google.com) → Project settings → Your apps, copy the web config into the `REACT_APP_FIREBASE_*` variables
3. Add Cloudinary `REACT_APP_CLOUDINARY_CLOUD_NAME` and `REACT_APP_CLOUDINARY_UPLOAD_PRESET`

#### Backend (`server/.env`, optional)
1. Copy `server/.env.example` to `server/.env`
2. Firebase Console → Project settings → Service accounts → Generate new private key
3. Map JSON fields into `FIREBASE_*` variables. Put newlines in `FIREBASE_PRIVATE_KEY` as `\n` inside quotes
4. Never commit the JSON key or `server/.env`

### 3. Firebase Setup

#### Enable Authentication
1. Go to Firebase Console > Authentication
2. Enable "Email/Password" sign-in method

#### Create Firestore Database
1. Go to Firebase Console > Firestore Database
2. Click "Create database"
3. Start in **test mode** (for hackathon demo)
4. Choose a location

#### Enable Storage
1. Go to Firebase Console > Storage
2. Click "Get started"
3. Start in **test mode** (for hackathon demo)

#### Firestore Security Rules (for demo)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

#### Storage Security Rules (for demo)
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 4. Start Development

```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Backend: http://localhost:5001

### 5. Create First User

1. Go to http://localhost:3000/signup
2. Create a Worker or Site Engineer account (public signup cannot create Owner or Manager)
3. For Owner/Manager demo accounts, create the user in Firebase Authentication, then set `role` to `owner` or `manager` on that user's document in Firestore `users/{uid}`
4. Login and start creating projects!

## Features Implemented

✅ **Auth Module**
- Email/Password authentication
- Role-based access (Owner, Manager, Site Engineer)
- Protected routes

✅ **Project Module**
- Create and view projects
- Assign users to projects
- Role-based project visibility

✅ **DPR Module**
- Daily progress reports with photos
- Offline support (photos lost in offline mode - use IndexedDB for production)
- Auto-sync when online

✅ **GPS Attendance**
- Punch In/Out with GPS coordinates
- Offline support
- Attendance history

✅ **Material Requests**
- Create material requests
- Manager/Owner approval workflow
- Status tracking

✅ **Dashboard**
- Project statistics
- DPR and attendance charts
- Material request status

## Offline Support

The app uses:
- Firestore offline persistence (enabled in firebase.js)
- localStorage for offline queues
- Auto-sync when connection is restored

**Note**: For production, use IndexedDB instead of localStorage for storing File objects (photos).

## Demo Tips

1. Test offline mode: Open DevTools > Network > Throttle to "Offline"
2. Create DPRs/attendance offline, then go back online to see auto-sync
3. Use different browser tabs to simulate different users
4. Test role-based access by creating users with different roles

## Troubleshooting

- **Firebase errors**: Check that config is correct and services are enabled
- **CORS errors**: Set `CLIENT_ORIGIN` on the backend to your frontend URL in production
- **Offline not working**: Check browser console for errors, ensure Firestore persistence is enabled
