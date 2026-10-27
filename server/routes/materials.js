const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// Get material requests
router.get('/', async (req, res) => {
  try {
    const { userId, status } = req.query;
    let query = db.collection('materialRequests');
    
    if (userId) {
      query = query.where('requestedBy', '==', userId);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    const requests = [];
    snapshot.forEach((doc) => {
      requests.push({ id: doc.id, ...doc.data() });
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create material request
router.post('/', async (req, res) => {
  try {
    const requestData = {
      ...req.body,
      createdAt: new Date().toISOString(),
      synced: true
    };
    const docRef = await db.collection('materialRequests').add(requestData);
    res.json({ id: docRef.id, ...requestData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update material request (approve/reject)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    await db.collection('materialRequests').doc(id).update(updateData);
    const doc = await db.collection('materialRequests').doc(id).get();
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

