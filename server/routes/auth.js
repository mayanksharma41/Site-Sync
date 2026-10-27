const express = require('express');
const router = express.Router();
const { auth } = require('../config/firebaseAdmin');
const { verifyToken } = require('../middleware/auth');

router.get('/user', verifyToken, async (req, res) => {
  try {
    const user = await auth.getUser(req.user.uid);
    res.json({ uid: user.uid, email: user.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
