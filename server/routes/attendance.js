const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// Get attendance
router.get('/', async (req, res) => {
  try {
    const { userId, date } = req.query;
    let query = db.collection('attendance');
    
    if (userId) {
      query = query.where('userId', '==', userId);
    }
    if (date) {
      query = query.where('date', '==', date);
    }
    
    const snapshot = await query.get();
    const attendance = [];
    snapshot.forEach((doc) => {
      attendance.push({ id: doc.id, ...doc.data() });
    });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create attendance
router.post('/', async (req, res) => {
  try {
    const attendanceData = {
      ...req.body,
      createdAt: new Date().toISOString(),
      synced: true
    };
    const docRef = await db.collection('attendance').add(attendanceData);
    res.json({ id: docRef.id, ...attendanceData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

