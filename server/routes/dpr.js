const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// Get DPRs
router.get('/', async (req, res) => {
  try {
    const { userId, projectId } = req.query;
    let query = db.collection('dprs');
    
    if (userId) {
      query = query.where('createdBy', '==', userId);
    }
    if (projectId) {
      query = query.where('projectId', '==', projectId);
    }
    
    const snapshot = await query.get();
    const dprs = [];
    snapshot.forEach((doc) => {
      dprs.push({ id: doc.id, ...doc.data() });
    });
    res.json(dprs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create DPR
router.post('/', async (req, res) => {
  try {
    const dprData = {
      ...req.body,
      createdAt: new Date().toISOString(),
      synced: true
    };
    const docRef = await db.collection('dprs').add(dprData);
    res.json({ id: docRef.id, ...dprData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

