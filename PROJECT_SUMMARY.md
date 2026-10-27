# Quasar - Construction Field Management App

## 🎯 Project Overview

A minimal but realistic Construction Field Management Application built for a 24-hour hackathon. The app enables site engineers to manage daily work, attendance, and materials while providing real-time visibility to owners and managers.

## ✅ Completed Modules

### 1. **Auth Module** ✅
- Firebase Authentication (Email/Password)
- Role-based access control (Owner, Manager, Site Engineer)
- Protected routes with role checking
- User context for global auth state

**Files:**
- `client/src/context/AuthContext.jsx`
- `client/src/modules/auth/Login.jsx`
- `client/src/modules/auth/Signup.jsx`
- `client/src/shared/ProtectedRoute.jsx`

### 2. **Project Module** ✅
- Create and view projects
- Assign users to projects
- Role-based project visibility
  - Owners/Managers: See all projects
  - Engineers: See only assigned projects

**Files:**
- `client/src/modules/projects/Projects.jsx`

### 3. **DPR (Daily Progress Report) Module** ✅
- Create daily progress reports
- Upload photos (online only)
- Offline support with auto-sync
- Project-wise DPR tracking

**Files:**
- `client/src/modules/dpr/DPR.jsx`

**Offline Behavior:**
- DPRs saved to localStorage when offline
- Photos are lost in offline mode (File objects can't be serialized)
- Auto-syncs when connection is restored

### 4. **GPS Attendance Module** ✅
- Punch In/Out with GPS coordinates
- Location capture using browser Geolocation API
- Daily attendance tracking
- Offline support with auto-sync
- Attendance history

**Files:**
- `client/src/modules/attendance/Attendance.jsx`

### 5. **Material Request & Approval Module** ✅
- Engineers can create material requests
- Managers/Owners can approve/reject requests
- Status tracking (Pending, Approved, Rejected)
- Offline support

**Files:**
- `client/src/modules/materials/Materials.jsx`

### 6. **Dashboard Module** ✅
- Project statistics
- DPR charts (last 7 days)
- Attendance charts (last 7 days)
- Material request status (pie chart)
- Role-based data visibility

**Files:**
- `client/src/modules/dashboard/Dashboard.jsx`

## 🏗️ Architecture

### Frontend Structure
```
client/src/
├── app/
│   └── App.jsx                 # Main app with routing
├── modules/
│   ├── auth/                    # Authentication
│   ├── projects/                # Project management
│   ├── dpr/                     # Daily progress reports
│   ├── attendance/              # GPS attendance
│   ├── materials/               # Material requests
│   └── dashboard/               # Dashboard & analytics
├── context/
│   └── AuthContext.jsx          # Global auth state
├── services/
│   └── offlineSync.js           # Offline sync utilities
├── shared/
│   ├── Navbar.jsx               # Navigation bar
│   ├── ProtectedRoute.jsx       # Route protection
│   └── styles.css               # Global styles
└── config/
    └── firebase.js              # Firebase configuration
```

### Backend Structure
```
server/
├── routes/
│   ├── auth.js                  # Auth routes
│   ├── projects.js               # Project routes
│   ├── dpr.js                    # DPR routes
│   ├── attendance.js             # Attendance routes
│   └── materials.js              # Material routes
├── config/
│   └── firebaseAdmin.js          # Firebase Admin SDK
└── server.js                     # Express server
```

## 🔥 Firebase Collections

- `users` - User profiles with roles
- `projects` - Construction projects
- `dprs` - Daily progress reports
- `attendance` - Attendance records
- `materialRequests` - Material requests

## 📱 Features

### Offline Support
- ✅ Firestore offline persistence enabled
- ✅ localStorage queues for offline data
- ✅ Auto-sync when connection restored
- ⚠️ Photos lost in offline mode (use IndexedDB for production)

### Role-Based Access
- **Owner**: Full access to all features
- **Manager**: Can approve/reject material requests, view all projects
- **Site Engineer**: Can create DPRs, mark attendance, request materials

### Mobile-First Design
- Responsive CSS with mobile-first approach
- Touch-friendly buttons and inputs
- Optimized for small screens

## 🚀 Getting Started

See `SETUP.md` for detailed setup instructions.

Quick start:
1. Install dependencies: `npm run install-all`
2. Configure Firebase (see SETUP.md)
3. Start dev server: `npm run dev`

## 📝 Notes for Hackathon Demo

1. **Test Offline Mode**: Use DevTools Network throttling
2. **Multiple Users**: Use different browser tabs/incognito windows
3. **GPS**: Allow location access when testing attendance
4. **Photos**: Upload works only when online
5. **Firebase Rules**: Use test mode for demo (adjust for production)

## 🔧 Tech Stack

- **Frontend**: React 18, React Router, Firebase SDK
- **Backend**: Node.js, Express, Firebase Admin SDK
- **Database**: Firebase Firestore
- **Storage**: Firebase Storage
- **Auth**: Firebase Authentication
- **Charts**: Recharts

## ⚠️ Production Considerations

1. **Security Rules**: Implement proper Firestore/Storage security rules
2. **Offline Photos**: Use IndexedDB instead of localStorage for File objects
3. **Error Handling**: Add more comprehensive error handling
4. **Validation**: Add input validation and sanitization
5. **Performance**: Optimize queries, add pagination
6. **Testing**: Add unit and integration tests
7. **CORS**: Restrict CORS to specific origins

## 📊 Hackathon Deliverables

✅ All 6 required modules implemented
✅ Offline-first architecture
✅ Mobile-responsive UI
✅ Role-based access control
✅ Real-time data sync
✅ Clean, modular code structure
✅ Demo-ready application

---

**Built for Hackathon** 🏆
*Ready to demo in 24 hours!*
