# Site-Sync | Construction Site Management Platform

A mobile-first construction site management platform for workforce coordination, attendance tracking, daily progress reporting, and resource management.

<p align="center">
  <a href="https://construction-management-3efb0.web.app/"><strong>Live Demo</strong></a>
  ·
  <a href="https://github.com/mayanksharma41/Site-Sync"><strong>GitHub Repository</strong></a>
</p>

---

## Overview

Site-Sync is a web application designed to centralize construction site operations. It helps construction teams manage projects, track worker attendance, document daily progress, coordinate materials, and maintain expense records through a role-based interface.

The application combines a React frontend with Firebase services and Cloudinary-powered image uploads to support day-to-day construction management workflows.

## Features

- **Authentication and Role-Based Access** — Email/password authentication with distinct roles for Workers, Site Engineers, Managers, and Owners.
- **Project Management** — Organize and monitor construction project information.
- **QR-Based Attendance** — Generate employee identification QR codes and scan them to record attendance.
- **Employee Management** — Register employees and generate identification cards with photos.
- **Daily Progress Reports (DPR)** — Document site progress and attach photographs.
- **Daily Work Logs** — Record work performed at construction sites, with offline support for selected workflows.
- **Material Management** — Manage construction materials and related requests.
- **Stock Tracking** — Maintain stock records and supporting photos.
- **Petty Cash Management** — Record expenses and upload receipt images.
- **Task Management** — Support task-related construction workflows.
- **Tool Management** — Maintain tool records and QR-scanning functionality.
- **Multilingual Interface** — Language selection for supported languages.
- **Responsive UI** — Interface designed for desktop and mobile devices.

## Live Demo

**Application:** https://construction-management-3efb0.web.app/

The application is hosted on Firebase Hosting. Use test accounts and sample data when exploring the public demo. Avoid entering real employee, financial, or other sensitive information.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, JSX, React Hooks |
| Backend | Node.js, Express.js |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Image Uploads | Cloudinary |
| Hosting | Firebase Hosting |
| Version Control | Git, GitHub |
| Deployment Tools | Firebase CLI |

## Architecture

```text
                    Site-Sync
                        |
                 React Frontend
                        |
          +-------------+-------------+
          |             |             |
      Firebase      Cloudinary     Browser
   Authentication   Image Uploads   APIs
          |
     Cloud Firestore

    Express Backend
    Node.js + Express
    Firebase Admin SDK
```

The frontend uses Firebase Authentication and Cloud Firestore for core application functionality. Cloudinary handles supported image uploads, while employee photos are stored as image data in Firestore documents.

The Express backend is included in the repository. Its deployment and integration should be configured according to the backend's actual usage requirements.

## Project Structure

```text
Site-Sync/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── config/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── modules/
│   │   │   ├── attendance/
│   │   │   ├── auth/
│   │   │   ├── bills/
│   │   │   ├── contractors/
│   │   │   ├── dashboard/
│   │   │   ├── employees/
│   │   │   ├── materials/
│   │   │   ├── permits/
│   │   │   ├── pettycash/
│   │   │   ├── projects/
│   │   │   ├── stock/
│   │   │   ├── tasks/
│   │   │   ├── tools/
│   │   │   └── workLogs/
│   │   ├── services/
│   │   ├── translations/
│   │   └── utils/
│   ├── package.json
│   └── .env.example
├── server/
│   ├── config/
│   ├── routes/
│   ├── server.js
│   └── package.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
├── package.json
├── README.md
└── SETUP.md
```

## Getting Started

### Prerequisites

- [Node.js and npm](https://nodejs.org/)
- [Git](https://git-scm.com/)
- A [Firebase](https://firebase.google.com/) project
- A [Cloudinary](https://cloudinary.com/) account for image uploads
- [Firebase CLI](https://firebase.google.com/docs/cli) for deployment

### 1. Clone the repository

```bash
git clone https://github.com/mayanksharma41/Site-Sync.git
cd Site-Sync
```

### 2. Install dependencies

From the project root:

```bash
npm run install-all
```

### 3. Configure Firebase

Create a Firebase project, enable Email/Password authentication, create a Cloud Firestore database, and register a web app.

Create `client/.env` using `client/.env.example` as a template:

```env
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
REACT_APP_FIREBASE_MEASUREMENT_ID=
```

Populate the variables with values from your own Firebase project. The measurement ID is optional if it is not used by your configuration.

### 4. Configure Cloudinary

Create an upload preset with unsigned uploads enabled, as required by the frontend implementation.

Add these variables to `client/.env`:

```env
REACT_APP_CLOUDINARY_CLOUD_NAME=
REACT_APP_CLOUDINARY_UPLOAD_PRESET=
```

These settings support image uploads for DPRs, work logs, petty cash receipts, and stock-related photos.

Never place a Cloudinary API secret or Firebase Admin private key in frontend environment variables.

### 5. Configure the backend (optional)

The repository includes an Express backend using the Firebase Admin SDK. If you intend to run it, configure the required variables in `server/.env` using the example file if available.

```env
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
FIREBASE_CLIENT_ID=
FIREBASE_CLIENT_CERT_URL=
PORT=5000
CLIENT_ORIGIN=http://localhost:3000
NODE_ENV=development
```

Use credentials from your own Firebase project. Never commit `.env` files or service-account credentials.

Refer to `SETUP.md` for additional repository-specific instructions.

### 6. Run locally

From the project root:

```bash
npm run dev
```

Check the terminal output for the actual frontend and backend URLs and ports.

### 7. Build the frontend

```bash
cd client
npm run build
```

The production build is generated in `client/build/`.

## Deployment

The frontend is configured for Firebase Hosting.

Deploy Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Build and deploy the frontend:

```bash
cd client
npm run build
cd ..
firebase deploy --only hosting
```

Authenticate with Firebase CLI and select the intended Firebase project before deploying.

Firebase Storage is not required by the currently implemented image-upload workflows; Cloudinary handles supported uploads. Service usage is subject to the limits and pricing terms of the selected plans.

## Security Considerations

- Never commit `.env` files, API secrets, or Firebase Admin service-account credentials.
- Enforce authentication and role-based access through Firestore security rules.
- Restrict Owner and Manager privileges to trusted administrators.
- Apply appropriate file-type and file-size restrictions to Cloudinary uploads.
- Avoid storing unnecessary personal information or large image payloads in Firestore.
- Use test data in public demonstrations and validate access permissions before handling sensitive information.

## Future Improvements

- Expand multilingual translation coverage.
- Improve offline synchronization and error handling.
- Add automated tests for critical workflows.
- Introduce detailed audit logs and reporting.
- Strengthen role-based authorization and input validation.
- Automate build and deployment workflows using GitHub Actions.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Submit a pull request describing the changes.

## License

No license has been specified yet. Until a license is added, standard copyright restrictions apply to reuse and redistribution.
