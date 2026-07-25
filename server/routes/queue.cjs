const express = require('express');
const router = express.Router();
const Student = require('../models/Student.cjs');

// Get active student
router.get('/active', async (req, res) => {
  try {
    const activeStudent = await Student.findOne({ status: 'active' });
    res.json(activeStudent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set active student
router.post('/active', async (req, res) => {
  try {
    const { studentId } = req.body;
    
    // Deactivate currently active
    await Student.updateMany({ status: 'active' }, { $set: { status: 'completed' } });
    
    // Set new active
    const student = await Student.findOneAndUpdate(
      { student_id: studentId },
      { $set: { status: 'active' } },
      { new: true }
    );
    
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    // Trigger folder creation logic here if needed, or rely on a webhook/agent
    
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder queue
router.post('/reorder', async (req, res) => {
  try {
    const { studentIds } = req.body; // Array of student_ids in new order
    if (!Array.isArray(studentIds)) return res.status(400).json({ error: 'studentIds must be an array' });
    
    const bulkOps = studentIds.map((id, index) => ({
      updateOne: {
        filter: { student_id: id },
        update: { $set: { queuePosition: index } }
      }
    }));
    
    await Student.bulkWrite(bulkOps);
    
    const students = await Student.find().sort({ queuePosition: 1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
