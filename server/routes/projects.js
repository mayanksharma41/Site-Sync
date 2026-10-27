const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// Get all projects
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('projects').get();
    const projects = [];
    snapshot.forEach((doc) => {
      projects.push({ id: doc.id, ...doc.data() });
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const { name, location, description, createdBy, assignedUsers } = req.body;
    const projectData = {
      name,
      location,
      description,
      createdBy,
      assignedUsers: assignedUsers || [],
      createdAt: new Date().toISOString(),
      status: 'active'
    };
    const docRef = await db.collection('projects').add(projectData);
    res.json({ id: docRef.id, ...projectData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

