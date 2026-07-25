const express = require('express');
const router = express.Router();
const Student = require('../models/Student.cjs');

// Store the active booth session in memory
let activeBoothStudents = [];

// Get the active students in the booth
router.get('/active', async (req, res) => {
  try {
    res.json(activeBoothStudents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update the active students in the booth
router.post('/active', async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!Array.isArray(studentIds)) {
      return res.status(400).json({ error: 'studentIds must be an array' });
    }

    // Fetch the full student objects to return them and store them
    const students = await Student.find({ student_id: { $in: studentIds } });
    
    // Sort them in the order provided
    activeBoothStudents = studentIds.map(id => students.find(s => s.student_id === id)).filter(Boolean);

    res.json(activeBoothStudents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear the booth session
router.post('/clear', async (req, res) => {
  activeBoothStudents = [];
  res.json({ message: 'Session cleared' });
});

module.exports = router;
